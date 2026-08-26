/* app-core — Entry point: config load, FormEngine init, hash routing, phase navigation, Discord notifier, MD generation */
'use strict';

import { FormEngine } from './form-engine.js';
import { ConfigLoader } from './config-loader.js';
import { PhaseRouter, initPhaseRouter } from './phase-router.js';
import { DiscordNotifier } from './discord-notifier.js';
import { FeatureFlag } from './feature-flag.js';
import { ThemeManager } from './theme-manager.js';
import { StateManager, getStateManager } from './state-manager.js';
import { MDGenerator } from './md-generator.js';
import { CircularDetector } from './circular-detector.js';

// ======== State ========
const state = {
  engine: null,
  configLoader: null,
  phaseRouter: null,
  notifier: null,
  stateManager: null,
  themeManager: null,
  featureFlag: null,
  circularDetector: null,
  mdGenerator: null,
  currentPhase: '00-idea',
  currentVariant: null,
  phasesRegistry: null,
  autoSaveTimer: null,
  retryPanelInitialized: false,
  phaseStartTime: Date.now()
};

// ======== DOM Helpers ========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ======== Phase Navigation (using PhaseRouter) ========
function updatePhaseNav(activePhase) {
  // Demo mode: show all phases as unlocked/clickable
  const demoMode = state.featureFlag?.isEnabled('demo-unlock-all') ?? false;

  $$('.phase-badge').forEach((badge) => {
    const phase = badge.dataset.phase;
    badge.classList.remove('active', 'completed', 'locked', 'in-progress', 'skipped', 'unavailable');
    badge.removeAttribute('aria-current');
    badge.disabled = false;
    badge.removeAttribute('title');

    if (!state.phaseRouter) return;

    const phaseState = state.phaseRouter.getPhaseState(phase);

    if (phase === activePhase) {
      badge.classList.add('active');
      badge.setAttribute('aria-current', 'true');
    } else if (phaseState === 'completed') {
      badge.classList.add('completed');
    } else if (phaseState === 'in-progress') {
      badge.classList.add('in-progress');
    } else if (phaseState === 'skipped') {
      badge.classList.add('skipped');
    } else if (phaseState === 'locked') {
      if (demoMode) {
        // En modo demo: mostrar como desbloqueado y clickeable
      } else {
        badge.classList.add('locked');
        badge.disabled = true;
      }
    } else if (phaseState === 'unavailable') {
      badge.classList.add('unavailable');
      badge.disabled = true;
      badge.title = 'Fase no disponible aún';
    }
    // unlocked phases are clickable without extra class
  });
}

async function markPhaseCompleted(phase) {
  if (!state.phaseRouter) return;
  state.phaseRouter.complete(phase);
  
  // Update StateManager
  if (state.stateManager) {
    await state.stateManager.setPhaseState(phase, { 
      phaseState: 'completed', 
      formData: {} // Could include final form data if needed
    });
  }
  
  updatePhaseNav(state.currentPhase);
}

async function getPhaseState(phase) {
  if (!state.stateManager) return null;
  return await state.stateManager.getPhaseState(phase);
}

// ======== Hash Routing ========
function parseHash() {
  const hash = location.hash.slice(1); // remove #
  if (!hash) return { phase: '00-idea', variant: null };
  const params = new URLSearchParams(hash);
  return {
    phase: params.get('phase') || '00-idea',
    variant: params.get('variant') || null
  };
}

function setHash(phase, variant) {
  const params = new URLSearchParams();
  params.set('phase', phase);
  if (variant) params.set('variant', variant);
  location.hash = params.toString();
}

function onHashChange() {
  const { phase, variant } = parseHash();
  if (phase !== state.currentPhase || variant !== state.currentVariant) {
    loadPhase(phase, variant);
  }
}

// ======== Config & Engine ========
async function loadPhase(phase, variant) {
  // Debounced navigation: if already loading, queue the navigation
  if (state.phaseRouter?.getLoading?.()) {
    state.phaseRouter.pendingNavigation = { phase, variant };
    return;
  }

  // Check dirty state BEFORE navigating (if there's a current engine)
  if (state.engine && state.currentPhase !== phase) {
    const canNavigate = await state.engine.checkDirtyBeforeNavigation();
    if (!canNavigate) {
      // Usuario canceló - revertir hash sin procesar navegación pendiente
      setHash(state.currentPhase, state.currentVariant);
      return;
    }
  }

  // Set loading flag on PhaseRouter
  state.phaseRouter?.setLoading?.(true);

  // Reset phase start time for MD generation
  state.phaseStartTime = Date.now();

  if (!state.configLoader) {
    state.configLoader = new ConfigLoader();
    state.phasesRegistry = await state.configLoader.loadRegistry();
    // Initialize PhaseRouter
    state.phaseRouter = initPhaseRouter(state.configLoader, state.phasesRegistry);

    // Initialize DiscordNotifier
    state.notifier = new DiscordNotifier({ configLoader: state.configLoader });

    // NOTE: Event listeners for phase nav are registered once in init()
  }

  // Validate phase exists in registry
  const phaseExists = state.phasesRegistry?.phases?.some(p => p.phaseId === phase);
  if (!phaseExists) {
    console.warn('Phase not found:', phase, '- falling back to 00-idea');
    state.phaseRouter?.setLoading?.(false);
    processPendingNavigation();
    setHash('00-idea', null);
    return;
  }

  // Check if unlocked via PhaseRouter (with all answers for condition evaluation)
  if (!state.phaseRouter) {
    state.phaseRouter?.setLoading?.(false);
    processPendingNavigation();
    return;
  }
  // Demo mode: bypass phase gating
  if (state.featureFlag.isEnabled('demo-unlock-all')) {
    console.log('[Demo mode] Bypassing phase lock for:', phase);
  } else {
    const allAnswers = collectAllAnswers();
    const { canUnlock, reason } = state.phaseRouter.canUnlock(phase, allAnswers);
    if (!canUnlock && phase !== '00-idea') {
      console.warn('Phase locked:', phase, '-', reason);
      // Show reason in UI
      showPhaseLockedReason(phase, reason);
      state.phaseRouter?.setLoading?.(false);
      processPendingNavigation();
      setHash(state.currentPhase, state.currentVariant);
      return;
    }
  }

  // Load config
  let config;
  try {
    config = await state.configLoader.loadPhaseConfig(phase, variant);
  } catch (err) {
    console.error('Failed to load phase config:', err);
    state.phaseRouter?.setLoading?.(false);
    processPendingNavigation();
    showGlobalError('No se pudo cargar la configuración de la fase: ' + phase);
    return;
  }

  // Destroy previous engine
  if (state.engine) {
    // FormEngine doesn't have explicit destroy, but we replace the form
  }

  // Create new engine
  state.engine = new FormEngine(config);
  state.engine.render();
  wireEngineSubmit(state.engine);
  state.currentPhase = phase;
  state.currentVariant = variant;

  // Reset dirty tracker for new phase
  state.engine.resetDirtyTracker();

  // Mark phase as in-progress
  state.phaseRouter.startPhase(phase);

  // Update phase nav
  updatePhaseNav(phase);

  // Update hero badge with phase info
  updateHeroBadge(phase, variant, config);

  // Load saved form state for this phase
  await loadFormState();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Clear loading flag and process any pending navigation
  state.phaseRouter?.setLoading?.(false);
  processPendingNavigation();
}

/**
 * Procesa navegación pendiente si existe
 */
function processPendingNavigation() {
  if (state.phaseRouter?.pendingNavigation) {
    const next = state.phaseRouter.pendingNavigation;
    state.phaseRouter.pendingNavigation = null;
    // Usar requestAnimationFrame para permitir que el ciclo de evento actual termine
    requestAnimationFrame(() => loadPhase(next.phase, next.variant));
  }
}

function updateHeroBadge(phase, variant, config) {
  const badge = $('#heroBadge');
  const title = $('#heroTitle');
  const desc = $('#heroDesc');
  if (badge && config.hero) {
    badge.textContent = variant ? `${config.hero.badge || ''} — ${variant}` : (config.hero.badge || '');
  }
  if (title && config.hero) title.textContent = config.hero.title;
  if (desc && config.hero) desc.textContent = config.hero.description;
}

function showPhaseLockedReason(phase, reason) {
  // Show a toast/message to the user explaining why the phase is locked
  const msg = $('#formMessage');
  if (msg) {
    msg.textContent = `Fase bloqueada: ${reason}`;
    msg.className = 'form-message error';
    msg.style.display = 'block';
  }
}

function showGlobalError(msg) {
  const container = $('.form-container');
  if (!container) return;
  container.innerHTML = `
    <div class="form-message error" style="display:block; text-align:center; padding:40px;">
      <h3>Error</h3>
      <p>${msg}</p>
      <button class="btn-submit" onclick="location.hash='#phase=00-idea'">Volver al inicio</button>
    </div>
  `;
}

// ======== Phase Nav Click Handlers ========
function initPhaseNav() {
  $$('.phase-badge').forEach((badge) => {
    badge.addEventListener('click', () => {
      const phase = badge.dataset.phase;
      if (phase && phase !== state.currentPhase) {
        // Demo mode: bypass phase gating
        if (!state.featureFlag.isEnabled('demo-unlock-all')) {
          // Check if unlocked before navigating
          if (state.phaseRouter) {
            const allAnswers = collectAllAnswers();
            const { canUnlock } = state.phaseRouter.canUnlock(phase, allAnswers);
            if (!canUnlock && phase !== '00-idea') {
              console.warn('Phase locked:', phase);
              return;
            }
          }
        }
        setHash(phase, null);
      }
    });
  });
}

// ======== Collect All Answers (for phase gating conditions) ========
async function collectAllAnswers() {
  const allAnswers = {};
  if (!state.stateManager) return allAnswers;
  
  try {
    // Get all form-* keys from StateManager
    const exportData = await state.stateManager.exportAll();
    if (exportData.phases) {
      for (const [phaseKey, phaseData] of Object.entries(exportData.phases)) {
        if (phaseData && typeof phaseData === 'object') {
          Object.assign(allAnswers, phaseData);
        }
      }
    }
  } catch (e) {
    console.warn('Failed to collect all answers from StateManager:', e);
    // Fallback to localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ecosistema:v1:form-')) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          Object.assign(allAnswers, data);
        } catch (e) {
          console.warn('Failed to parse form data for', key);
        }
      }
    }
  }
  return allAnswers;
}

// ======== Global Form State Persistence (via StateManager) ========
async function saveFormState() {
  if (!state.engine || !state.stateManager) return;
  try {
    const data = state.engine.collectData();
    const phaseId = state.currentPhase;
    
    // Save form data
    await state.stateManager.set(`form-${phaseId}`, data);
    
    // Save meta with variant, timestamp, version
    await state.stateManager.set(`form-${phaseId}-meta`, {
      variant: state.currentVariant,
      completedAt: Date.now(),
      version: 1
    });
    
    // Also update phase state to in-progress
    await state.stateManager.setPhaseState(phaseId, { phaseState: 'in-progress', formData: data });
  } catch (e) { console.warn('Failed to save form state via StateManager:', e); }
}

async function loadFormState() {
  if (!state.engine || !state.stateManager) return;
  try {
    const phaseId = state.currentPhase;
    const data = await state.stateManager.get(`form-${phaseId}`, {});
    const meta = await state.stateManager.get(`form-${phaseId}-meta`, {});
    
    // Validate version compatibility
    if (meta.version && meta.version > 1) {
      console.warn(`Form state version ${meta.version} may not be compatible`);
    }
    
    if (data && Object.keys(data).length > 0) {
      // Populate form fields
      Object.entries(data).forEach(([fieldId, value]) => {
        const field = state.engine.config.fields.find(f => f.id === fieldId);
        if (!field) return;
        if (state.engine.isMultiCheckbox(field)) {
          value.forEach(v => {
            const cb = document.querySelector(`.option-${fieldId}[value="${v}"]`);
            if (cb) cb.checked = true;
          });
        } else if (field.type === 'radio') {
          const radio = document.querySelector(`input[name="${fieldId}"][value="${value}"]`);
          if (radio) radio.checked = true;
        } else {
          const control = state.engine.el('field-' + fieldId);
          if (control) control.value = value;
        }
      });
      state.engine.updateProgress();
    }
  } catch (e) { console.warn('Failed to load form state via StateManager:', e); }
}

// ======== Retry UI (Discord Queue) ========
function initRetryUI() {
  if (state.retryPanelInitialized) return;
  
  const retryPanel = $('#retryPanel');
  const retryToggle = $('.retry-toggle');
  const retryList = $('#retryList');
  const retryBadge = $('#retryBadge');
  
  if (!retryPanel || !retryToggle || !retryList || !retryBadge) {
    console.warn('[Ecosistema] Retry UI elements not found in DOM');
    return;
  }
  
  // Toggle list visibility
  retryToggle.addEventListener('click', () => {
    const expanded = retryToggle.getAttribute('aria-expanded') === 'true';
    retryToggle.setAttribute('aria-expanded', !expanded);
    retryList.hidden = expanded;
  });
  
  // Subscribe to DiscordNotifier queue changes
  if (state.notifier) {
    state.notifier.on('queue:changed', (status) => updateRetryUI(status));
    // Initial update
    updateRetryUI(state.notifier.getQueueStatus());
  }
  
  state.retryPanelInitialized = true;
}

function updateRetryUI(status) {
  const retryPanel = $('#retryPanel');
  const retryBadge = $('#retryBadge');
  const retryList = $('#retryList');
  
  if (!retryPanel || !retryBadge || !retryList) return;
  
  const failedCount = status?.failed || 0;
  
  if (failedCount > 0) {
    retryPanel.hidden = false;
    retryBadge.textContent = failedCount;
    
    // Build list items
    const failedItems = status?.items?.filter(i => i.retries >= 5) || [];
    retryList.innerHTML = failedItems.map(item => `
      <li class="retry-item">
        <div class="retry-item-header">
          <span class="retry-item-phase">${item.phaseGroup?.toUpperCase() || 'Unknown'}</span>
          <span class="retry-item-time">${new Date(item.timestamp).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <span class="retry-item-error">Reintentos agotados (${item.retries})</span>
        <button type="button" class="retry-btn" data-item-id="${item.id}">Reintentar</button>
      </li>
    `).join('');
    
    // Add click handlers for retry buttons
    retryList.querySelectorAll('.retry-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.itemId;
        btn.disabled = true;
        btn.textContent = 'Reintentando...';
        if (state.notifier) {
          const result = await state.notifier.retryItem(itemId);
          if (result.success) {
            btn.textContent = '¡Enviado!';
            setTimeout(() => updateRetryUI(state.notifier.getQueueStatus()), 1000);
          } else {
            btn.disabled = false;
            btn.textContent = 'Error: ' + (result.error || 'Desconocido');
          }
        }
      });
    });
  } else {
    retryPanel.hidden = true;
    retryBadge.textContent = '0';
    retryList.innerHTML = '';
    retryList.hidden = true;
    const retryToggle = $('.retry-toggle');
    if (retryToggle) retryToggle.setAttribute('aria-expanded', 'false');
  }
}

// ======== Consolidated MD Button ========
function initConsolidatedMDButton() {
  const btn = $('#generateConsolidatedMD');
  if (!btn) return;

  // Verificar si hay fases completadas
  const updateButtonState = () => {
    if (!state.phaseRouter) {
      btn.disabled = true;
      return;
    }
    const progress = state.phaseRouter.getProgress();
    btn.disabled = progress.completed === 0;
  };

  // Actualizar estado inicial
  updateButtonState();

  // Escuchar cambios de fase para actualizar botón
  window.addEventListener('phase:completed', updateButtonState);
  window.addEventListener('phase:unlocked', updateButtonState);

  // Click handler
  btn.addEventListener('click', async () => {
    if (btn.disabled || !state.mdGenerator) return;
    
    btn.classList.add('is-loading');
    try {
      await state.mdGenerator.generateConsolidatedMD();
    } catch (err) {
      console.error('[Ecosistema] Error generando MD consolidado:', err);
      alert('Error al generar MD consolidado: ' + err.message);
    } finally {
      btn.classList.remove('is-loading');
    }
  });
}

// ======== StateManager Subscriptions (Auto-save + Cross-tab sync) ========
function setupStateManagerSubscriptions() {
  if (!state.stateManager) return;

  // Subscribe to form-* keys for auto-save (debounced)
  let debounceTimer = null;
  const unsubscribe = state.stateManager.subscribe('form-*', (key, newValue) => {
    // This fires when OTHER tabs change the data - update UI
    console.log('[StateManager] Cross-tab sync received for:', key);
    // If it's the current phase, reload the form
    if (key === `form-${state.currentPhase}` && newValue && state.engine) {
      loadFormState();
    }
  });

  // Also set up local auto-save on input (replaces initAutoSave)
  document.addEventListener('input', (e) => {
    if (e.target.matches('input, select, textarea')) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => saveFormState(), 500);
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('input[type="radio"], input[type="checkbox"]')) {
      saveFormState();
    }
  });

  // Listen for quota warnings
  state.stateManager.on('quota:warning', (quota) => {
    console.warn('[StateManager] Quota warning:', quota.percentage + '%');
  });
  state.stateManager.on('quota:critical', (quota) => {
    console.error('[StateManager] Quota critical:', quota.percentage + '%');
  });
  state.stateManager.on('cleanup:done', (data) => {
    console.log('[StateManager] Cleanup freed:', data.freedBytes);
  });

  // Store unsubscribe for cleanup if needed
  state.stateManager._formUnsubscribe = unsubscribe;
}

// ======== Discord Notifier Integration ========
async function handleFormSubmit(formData) {
  if (!state.notifier || !state.engine) return { success: false, error: 'Not initialized' };

  const config = state.engine.config;
  const phaseGroup = config.phaseGroup;
  const phaseId = config.phaseId;
  const variant = state.currentVariant;

  // Send to Discord
  const result = await state.notifier.send({
    phaseId,
    variant,
    phaseGroup,
    formData,
    config,
    files: [] // File upload handled separately in Batch 4
  });

  if (result.success) {
    // Mark phase as completed in PhaseRouter
    const allAnswers = collectAllAnswers();
    allAnswers[phaseId] = formData;
    state.phaseRouter.complete(phaseId, allAnswers);
    updatePhaseNav(state.currentPhase);
  }

  return result;
}

// ======== Export / Import (via StateManager) ========
async function exportAllData() {
  if (!state.stateManager) {
    console.warn('[Ecosistema] StateManager no inicializado');
    return;
  }
  try {
    const exportData = await state.stateManager.exportAll();
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecosistema-idea-mvp-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { console.error('Export failed:', e); }
}

async function importAllData(json) {
  if (!state.stateManager) {
    console.warn('[Ecosistema] StateManager no inicializado');
    return { success: false, error: 'StateManager not initialized' };
  }
  try {
    const result = await state.stateManager.importAll(json);
    if (result.success) {
      // Reload current phase if it was imported
      await loadFormState();
    }
    return result;
  } catch (e) { 
    console.error('Import failed:', e); 
    return { success: false, error: e.message };
  }
}

// ======== Legacy Fallback ========
function loadLegacy() {
  const container = $('.form-container');
  if (container) {
    container.innerHTML = `
      <div class="form-message warning" style="display:block; text-align:center; padding:40px;">
        <h3>Modo Legacy</h3>
        <p>El nuevo motor está deshabilitado. Cargando versión anterior...</p>
        <div style="display:flex; gap:12px; justify-content:center; margin-top:16px;">
          <button class="btn-submit" onclick="try{localStorage.setItem('ECOSISTEMA_NEW_ENGINE','true');}catch(e){}; location.reload()">Reactivar nuevo motor</button>
          <button class="btn-submit" style="background:transparent; border:1px solid currentColor;" onclick="location.reload()">Recargar</button>
        </div>
      </div>
    `;
  }
  // Siempre renderizar toggles para poder salir del deadlock
  try { initFeatureFlagUI(true); } catch (e) { console.warn('initFeatureFlagUI in legacy failed', e); }
  console.warn('[Ecosistema] Legacy mode - use Reactivar para volver');
}

// ======== Export MD ========
async function exportAllDataMD() {
  if (!state.stateManager) {
    console.warn('[Ecosistema] StateManager no inicializado');
    return;
  }
  try {
    const mdContent = await state.stateManager.exportMD();
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecosistema-idea-mvp-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('MD Export failed:', e);
  }
}

// ======== Feature Flag UI (footer) ========
function initFeatureFlagUI(force) {
  // Oculto por pedido: no mostrar toggles en footer (se mantiene lógica por detrás)
  return;
  // En legacy también renderiza al menos el toggle de nuevo motor para salir del deadlock
  if (!force && !state.featureFlag.isEnabled('new-engine')) return;

  const footer = document.querySelector('.footer');
  if (!footer) return;

  // Crear contenedor de feature flags
  const flagsContainer = document.createElement('div');
  flagsContainer.id = 'featureFlags';
  flagsContainer.className = 'feature-flags';
  flagsContainer.innerHTML = `
    <label><input type="checkbox" id="flag-new-engine" checked> Nuevo motor</label>
    <label><input type="checkbox" id="flag-md-generation"> Generación MD</label>
    <label><input type="checkbox" id="flag-file-upload"> Subida archivos</label>
    <label><input type="checkbox" id="flag-high-contrast"> Alto contraste</label>
    <label class="demo-flag"><input type="checkbox" id="flag-demo-unlock-all"> 🔓 Modo demo (desbloquear todo)</label>
  `;

  // Insertar antes del copyright
  const copyright = footer.querySelector('p');
  if (copyright) {
    footer.insertBefore(flagsContainer, copyright);
  } else {
    footer.appendChild(flagsContainer);
  }

  // Sincronizar estado inicial
  $('#flag-new-engine').checked = state.featureFlag.isEnabled('new-engine');
  $('#flag-md-generation').checked = state.featureFlag.isEnabled('md-generation');
  $('#flag-file-upload').checked = state.featureFlag.isEnabled('file-upload');
  $('#flag-high-contrast').checked = state.featureFlag.isEnabled('high-contrast');
  $('#flag-demo-unlock-all').checked = state.featureFlag.isEnabled('demo-unlock-all');

  // Event listeners para cambios
  const flagCheckboxes = {
    'new-engine': '#flag-new-engine',
    'md-generation': '#flag-md-generation',
    'file-upload': '#flag-file-upload',
    'high-contrast': '#flag-high-contrast',
    'demo-unlock-all': '#flag-demo-unlock-all'
  };

  Object.entries(flagCheckboxes).forEach(([flagName, selector]) => {
    const checkbox = $(selector);
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        const newValue = e.target.checked;
        state.featureFlag.setFlag(flagName, newValue);
        console.log(`[FeatureFlag] ${flagName} = ${newValue}`);

        // Si cambia new-engine, recargar página
        if (flagName === 'new-engine') {
          if (!newValue) {
            // Deshabilitado -> mostrar mensaje y recargar
            setTimeout(() => location.reload(), 500);
          } else {
            // Habilitado -> recargar para activar motor
            location.reload();
          }
        }
        // Demo mode: actualizar badges al instante
        if (flagName === 'demo-unlock-all') {
          updatePhaseNav(state.currentPhase);
        }
      });
    }
  });

  // Escuchar cambios desde otras pestañas
  window.addEventListener('feature-flag:change', (e) => {
    const { flag, value } = e.detail;
    const checkbox = $(flagCheckboxes[flag]);
    if (checkbox && checkbox.checked !== value) {
      checkbox.checked = value;
      if (flag === 'new-engine') {
        location.reload();
      }
      if (flag === 'demo-unlock-all') {
        updatePhaseNav(state.currentPhase);
      }
    }
  });
}

// ======== Engine Submit Wiring (DiscordNotifier integration) ========
/**
 * Conecta el submit del formulario con handleFormSubmit (cola Discord).
 * Debe llamarse después de cada engine.render().
 * @param {FormEngine} engine
 */
function wireEngineSubmit(engine) {
  const form = engine.el('contactForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (engine.honeypotFilled()) return;
    const msg = engine.el('formMessage');
    msg.textContent = '';
    msg.className = 'form-message';
    if (engine.cooldownActive()) {
      engine.showMessage('Espera unos segundos antes de volver a enviar.', 'error');
      return;
    }
    if (engine.validateAll()) {
      engine.showMessage('Revisa los campos marcados en rojo.', 'error');
      return;
    }
    const btn = engine.el('submitBtn');
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      const data = engine.collectData();
      const result = await handleFormSubmit(data);
      if (result.success) {
        engine.state.lastSubmitAt = Date.now();
        engine.el('contactForm').reset();
        engine.showMessage('¡Gracias! Tu respuesta se envió correctamente.', 'success');
        engine.updateProgress();
      } else if (result.queued) {
        engine.showMessage('Sin conexión. Tu respuesta se guardó en cola y se enviará automáticamente.', 'warning');
      } else {
        engine.showMessage('No se pudo enviar: ' + (result.error || 'Error desconocido'), 'error');
      }
    } catch (err) {
      engine.showMessage('Error inesperado: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });
}

// ======== Init ========
async function init() {
  // 1. Inicializar FeatureFlag PRIMERO (antes de todo)
  state.featureFlag = new FeatureFlag();

  // 2. Verificar si el nuevo motor está habilitado
  if (!state.featureFlag.isEnabled('new-engine')) {
    console.log('[Ecosistema] Feature flag "new-engine" deshabilitado, cargando legacy...');
    loadLegacy();
    return;
  }

  // 3. Inicializar ThemeManager y StateManager
  state.themeManager = new ThemeManager();
  state.stateManager = getStateManager();
  await state.stateManager.init();

  // 4. Escuchar evento de modo privado para mostrar banner
  state.stateManager.on('private-mode-detected', () => {
    console.log('[Ecosistema] Modo privado detectado - banner mostrado por StateManager');
  });

  // 5. CircularDetector (para validación futura)
  state.circularDetector = new CircularDetector();

  // 6. Inicializar MDGenerator
  state.mdGenerator = new MDGenerator(state.stateManager);

  // 7. Listener para generación automática de MD al completar fase
  window.addEventListener('phase:completed', async (e) => {
    if (!state.featureFlag.isEnabled('md-generation')) return;
    const { phaseId, variant } = e.detail;
    if (!phaseId) return;
    
    // Obtener respuestas de la fase completada
    const answers = await state.stateManager.get(`form-${phaseId}`, {});
    const meta = await state.stateManager.get(`form-${phaseId}-meta`, {});
    
    await state.mdGenerator.generatePhaseMD(phaseId, variant || meta.variant || 'default', answers, {
      theme: state.themeManager.getCurrent(),
      duration: Date.now() - state.phaseStartTime,
      userAgent: navigator.userAgent,
      completedAt: meta.completedAt || Date.now()
    });
  });

  // 8. Load phase registry
  try {
    state.configLoader = new ConfigLoader();
    state.phasesRegistry = await state.configLoader.loadRegistry();
    state.phaseRouter = initPhaseRouter(state.configLoader, state.phasesRegistry);

    // Initialize DiscordNotifier
    state.notifier = new DiscordNotifier({ configLoader: state.configLoader });

    // Listen for phase events to update nav (registered once here, NOT in loadPhase)
    window.addEventListener('phase:unlocked', () => updatePhaseNav(state.currentPhase));
    window.addEventListener('phase:completed', () => updatePhaseNav(state.currentPhase));
    window.addEventListener('phase:locked', () => updatePhaseNav(state.currentPhase));
    window.addEventListener('phase:started', () => updatePhaseNav(state.currentPhase));
    window.addEventListener('phase:skipped', () => updatePhaseNav(state.currentPhase));
  } catch (err) {
    console.error('Failed to load registry:', err);
    showGlobalError('No se pudo cargar el registro de fases.');
    return;
  }

  // 7. Inicializar Feature Flag UI en footer
  initFeatureFlagUI();

  // 8. Initialize Retry UI (Discord Queue)
  initRetryUI();

  // 9. Initialize Consolidated MD Button
  initConsolidatedMDButton();

  // 10. Set up StateManager auto-save subscriptions
  setupStateManagerSubscriptions();

  // Initial load from hash
  const { phase, variant } = parseHash();
  await loadPhase(phase, variant);

  // Event listeners
  window.addEventListener('hashchange', onHashChange);
  initPhaseNav();

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + E = export
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      exportAllData();
    }
    // Ctrl/Cmd + Shift + E = export MD
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      exportAllDataMD();
    }
  });

  console.log('[Ecosistema Idea-MVP] Inicializado - Fase:', state.currentPhase);
}

// Start
init();

// Expose for debugging
window.EcosystemApp = {
  getState: () => ({ ...state }),
  exportAllData,
  exportAllDataMD,
  markPhaseCompleted,
  loadPhase: (p, v) => setHash(p, v),
  getPhaseRouter: () => state.phaseRouter,
  getNotifier: () => state.notifier,
  getStateManager: () => state.stateManager,
  getThemeManager: () => state.themeManager,
  getFeatureFlag: () => state.featureFlag,
  getCircularDetector: () => state.circularDetector,
  getMDGenerator: () => state.mdGenerator,
  collectAllAnswers,
  saveFormState,
  loadFormState
};
