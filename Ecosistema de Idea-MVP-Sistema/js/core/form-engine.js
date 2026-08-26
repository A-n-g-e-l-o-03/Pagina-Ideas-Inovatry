/* FormEngine — motor de renderizado y validación de formularios config-driven */
'use strict';

import { CircularDetector } from './circular-detector.js';
import { FeatureFlag } from './feature-flag.js';
import { ThemeManager } from './theme-manager.js';
import { DirtyTracker } from './dirty-tracker.js';
import { DirtyConfirmModal } from './dirty-confirm-modal.js';

export class FormEngine {
  constructor(config) {
    this.config = config;
    this.state = {
      answers: {},
      files: [],
      lastSubmitAt: 0,
      currentTheme: 'light'
    };
    this.COOLDOWN_MS = 5000;
    this.EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    this.DISCORD_LIMITS = { fieldValue: 1024, description: 4096, maxFields: 25 };
    this.WEBHOOK_PLACEHOLDER = 'REEMPLAZAR_AL_DEPLOYAR';

    // Nuevos módulos core
    this.circularDetector = new CircularDetector();
    this.featureFlag = new FeatureFlag();
    this.themeManager = new ThemeManager();

    // Dirty tracking & confirm modal
    this.dirtyTracker = new DirtyTracker();
    this.dirtyModal = new DirtyConfirmModal();

    // File upload config
    this.maxTotalBytes = this.config.maxTotalBytes || 8 * 1024 * 1024; // 8MB default
    this.allowedTypes = this.config.allowedTypes || ['.pdf', '.doc', '.docx', '.txt', '.csv'];

    // Validar config para ciclos en showWhen
    this.validateConfigCircularDependencies();

    // Setup beforeunload y navigation guards
    this.setupNavigationGuards();
  }

  /**
   * Valida la configuración para detectar dependencias circulares en showWhen
   * Muestra banner de error si se detectan ciclos, pero permite renderizar
   */
  validateConfigCircularDependencies() {
    if (!this.config?.fields || !Array.isArray(this.config.fields)) return;

    const graph = this.circularDetector.buildConfigGraph(this.config.fields);
    const { hasCycles, cycles } = this.circularDetector.detectCycles(graph);

    if (hasCycles) {
      // Mostrar banner de error no dismissible
      this.showCircularError(cycles);
      console.error('[FormEngine] Ciclos detectados en configuración de campos:', cycles.map(c => c.join(' → ')).join('; '));
      // No lanzar error - permitir que el formulario se renderice con el banner visible
    }
  }

  /**
   * Muestra banner de error para dependencias circulares (no dismissible)
   * @param {string[][]} cycles - Array de ciclos, ej: [['A','B','A'], ['C','D','E','C']]
   */
  showCircularError(cycles) {
    // Remover banner existente si hay
    const existing = document.querySelector('.circular-error-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'circular-error-banner';
    banner.setAttribute('role', 'alert');

    const cycleDescriptions = cycles.map(cycle => {
      const path = cycle.join(' → ');
      return `<code>${path}</code>`;
    }).join(' y ');

    banner.innerHTML = `
      <span class="circular-error-icon">⚠</span>
      <span class="circular-error-text">Dependencia circular detectada: ${cycleDescriptions}. Corrige la configuración de showWhen.</span>
    `;

    // Insertar al principio del form-container
    const container = document.querySelector('.form-container');
    if (container) {
      container.insertBefore(banner, container.firstChild);
    }
  }

  /**
   * Configura guards de navegación (beforeunload, hashchange)
   * Previene pérdida accidental de datos
   */
  setupNavigationGuards() {
    // beforeunload: mostrar confirmación si hay cambios sin guardar
    window.addEventListener('beforeunload', (e) => {
      if (this.dirtyTracker.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = ''; // Requerido para algunos navegadores
        // Nota: beforeunload no permite mostrar modal personalizado,
        // pero el usuario verá el diálogo nativo del navegador
      }
    });

    // hashchange: interceptar navegación entre fases
    window.addEventListener('hashchange', async (e) => {
      if (!this.dirtyTracker.hasUnsavedChanges()) return;

      const dirtyCount = this.dirtyTracker.getDirtyCount();
      const confirm = await this.dirtyModal.show(dirtyCount);
      
      if (!confirm) {
        // Usuario canceló - revertir hash
        window.history.back();
      }
      // Si confirma, permitir navegación (el dirtyTracker se resetea en loadPhase)
    });
  }

  /**
   * Verifica si hay cambios sin guardar antes de navegar
   * Debe llamarse ANTES de cambiar de fase
   * @returns {Promise<boolean>} true = permitir navegación, false = cancelar
   */
  async checkDirtyBeforeNavigation() {
    if (!this.dirtyTracker.hasUnsavedChanges()) return true;

    const dirtyCount = this.dirtyTracker.getDirtyCount();
    const confirm = await this.dirtyModal.show(dirtyCount);
    return confirm;
  }

  /**
   * Resetea el dirty tracker (llamar al cargar nueva fase)
   */
  resetDirtyTracker() {
    this.dirtyTracker.reset();
  }

  // ======== Element Helpers ========
  el(id) { return document.getElementById(id); }

  showMessage(text, kind) {
    const msg = this.el('formMessage');
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'form-message ' + kind;
  }

  showFieldError(fieldId, text) {
    const group = this.el('group-' + fieldId);
    if (!group) return;
    let err = group.querySelector('.error-message');
    if (!err) {
      err = document.createElement('div');
      err.className = 'error-message';
      group.appendChild(err);
    }
    err.textContent = text;
  }

  clearFieldError(fieldId) {
    const group = this.el('group-' + fieldId);
    if (!group) return;
    const err = group.querySelector('.error-message');
    if (err) err.remove();
  }

  // ======== Value Extractors ========
  checkboxValues(field) {
    const checks = document.querySelectorAll('.option-' + field.id + ':checked');
    return Array.prototype.map.call(checks, (c) => c.value);
  }

  checkboxAnyChecked(field) {
    return document.querySelector('.option-' + field.id + ':checked') !== null;
  }

  radioValue(field) {
    const checked = document.querySelector('input[name="' + field.id + '"]:checked');
    return checked ? checked.value : '';
  }

  isMultiCheckbox(field) {
    return field.type === 'checkbox' && field.options && field.options.length > 0;
  }

  isCompact(field) {
    return field.compact === true;
  }

  // ======== Section & Progress ========
  createSectionHeader(sec) {
    const header = document.createElement('div');
    header.className = 'section-header';
    const h = document.createElement('h2');
    h.textContent = sec.title;
    header.appendChild(h);
    if (sec.description) {
      const p = document.createElement('p');
      p.textContent = sec.description;
      header.appendChild(p);
    }
    // Per-section progress bar
    const progress = document.createElement('div');
    progress.className = 'section-progress';
    progress.innerHTML = `
      <div class="section-progress-fill"></div>
      <span class="section-progress-label">0%</span>
    `;
    progress.dataset.sectionId = sec.id || '';
    header.appendChild(progress);
    return header;
  }

  countAnswered() {
    const allAnswers = this.collectData();
    let answered = 0;
    let total = 0;
    this.config.fields.forEach((field) => {
      if (field.type === 'honeypot' || field.type === 'file' || this.isCompact(field)) return;
      
      // Only count fields that are visible (pass showWhen) and required
      if (!this.evaluateShowWhen(field, allAnswers)) return;
      if (!this.isFieldRequired(field, allAnswers)) return;
      
      total++;
      if (this.isMultiCheckbox(field)) {
        if (this.checkboxAnyChecked(field)) answered++;
        return;
      }
      if (field.type === 'radio') {
        if (this.radioValue(field)) answered++;
        return;
      }
      const control = this.el('field-' + field.id);
      if (control && String(control.value).trim()) answered++;
    });
    return { answered, total };
  }

  autoGrowTextarea(ta) {
    const max = 140;
    ta.style.height = 'auto';
    const h = Math.min(ta.scrollHeight, max);
    ta.style.height = h + 'px';
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  }

  updateProgress() {
    const fill = this.el('progressFill');
    if (!fill) return;
    const { answered, total } = this.countAnswered();
    const pct = total ? Math.round(answered / total * 100) : 0;
    fill.style.width = pct + '%';
    const label = this.el('progressLabel');
    if (label) label.textContent = pct + '%';
    const bar = this.el('progressBar');
    if (bar) bar.setAttribute('aria-valuenow', String(pct));

    // Update per-section progress
    this.updateSectionProgress();
  }

  updateSectionProgress() {
    const allAnswers = this.collectData();
    const sectionGroups = document.querySelectorAll('.section-group');
    sectionGroups.forEach((group) => {
      const header = group.querySelector('.section-header');
      if (!header) return;
      const progressBar = header.querySelector('.section-progress');
      if (!progressBar) return;

      const sectionId = progressBar.dataset.sectionId;
      if (!sectionId) return;

      // Count required fields in this section (excluding compact, honeypot, file)
      // Only count fields that are visible and conditionally required
      const fieldsInSection = this.config.fields.filter((f) =>
        f.sectionId === sectionId &&
        f.type !== 'honeypot' &&
        f.type !== 'file' &&
        !this.isCompact(f) &&
        this.evaluateShowWhen(f, allAnswers) &&
        this.isFieldRequired(f, allAnswers)
      );

      if (fieldsInSection.length === 0) {
        progressBar.querySelector('.section-progress-fill').style.width = '100%';
        progressBar.querySelector('.section-progress-label').textContent = '100%';
        return;
      }

      let answered = 0;
      fieldsInSection.forEach((field) => {
        if (this.isMultiCheckbox(field)) {
          if (this.checkboxAnyChecked(field)) answered++;
        } else if (field.type === 'radio') {
          if (this.radioValue(field)) answered++;
        } else {
          const control = this.el('field-' + field.id);
          if (control && String(control.value).trim()) answered++;
        }
      });

      const pct = Math.round(answered / fieldsInSection.length * 100);
      progressBar.querySelector('.section-progress-fill').style.width = pct + '%';
      progressBar.querySelector('.section-progress-label').textContent = pct + '%';
    });
  }

  // ======== Conditional Fields (showWhen) ========
  /**
   * Evalúa si un campo debe mostrarse basado en showWhen
   * Soporta dos formatos:
   * - Nuevo: { operator: "equals"|"in"|"not", field: "campo", value: ... }
   * - Legacy: { field: "campo", equals: ..., in: [...], not: ... }
   * @param {Object} field - Configuración del campo
   * @param {Object} allAnswers - Respuestas actuales
   * @returns {boolean}
   */
  evaluateShowWhen(field, allAnswers) {
    const sw = field.showWhen;
    if (!sw) return true;

    // Normalizar a formato nuevo
    const normalized = this.normalizeShowWhen(sw);
    if (!normalized) return true;

    const { operator, field: depField, value } = normalized;
    const depValue = allAnswers[depField];
    
    if (depValue === undefined || depValue === null || depValue === '') return false;

    switch (operator) {
      case 'equals':
        // Comparación profunda para arrays (ej: checkboxes múltiples)
        if (Array.isArray(depValue) && Array.isArray(value)) {
          return depValue.length === value.length && depValue.every((v) => value.includes(v));
        }
        return depValue === value;
      case 'in':
        return Array.isArray(value) && value.includes(depValue);
      case 'not':
        return depValue !== value;
      default:
        return true;
    }
  }

  /**
   * Normaliza showWhen al nuevo formato { operator, field, value }
   * @param {Object} sw - showWhen config (legacy o nuevo)
   * @returns {Object|null} Normalizado o null si inválido
   */
  normalizeShowWhen(sw) {
    if (!sw || typeof sw !== 'object') return null;

    // Ya está en formato nuevo
    if (sw.operator && sw.field && sw.value !== undefined) {
      return { operator: sw.operator, field: sw.field, value: sw.value };
    }

    // Formato legacy: { field, equals|in|not }
    if (sw.field) {
      if (sw.equals !== undefined) {
        return { operator: 'equals', field: sw.field, value: sw.equals };
      }
      if (Array.isArray(sw.in)) {
        return { operator: 'in', field: sw.field, value: sw.in };
      }
      if (sw.not !== undefined) {
        return { operator: 'not', field: sw.field, value: sw.not };
      }
    }

    return null;
  }

  /**
   * Evalúa si un campo es requerido basado en su configuración `required`
   * Soporta:
   * - Boolean simple: true/false
   * - Nuevo: { operator: "equals"|"in"|"not", field: "campo", value: ... }
   * - Legacy condicional: { when: { field, equals|in|not } }
   * @param {Object} field - Configuración del campo
   * @param {Object} allAnswers - Respuestas actuales
   * @returns {boolean}
   */
  isFieldRequired(field, allAnswers) {
    const required = field.required;
    
    // Boolean simple
    if (typeof required === 'boolean') {
      return required;
    }
    
    // Nuevo formato con operator
    if (required && typeof required === 'object' && required.operator) {
      const normalized = this.normalizeShowWhen(required);
      if (normalized) {
        return this.evaluateShowWhen({ showWhen: normalized }, allAnswers);
      }
    }
    
    // Legacy: { when: {...} }
    if (required && typeof required === 'object' && required.when) {
      return this.evaluateShowWhen({ showWhen: required.when }, allAnswers);
    }
    
    // Default: no requerido si no se especifica
    return false;
  }

  /**
   * Actualiza visibilidad de campos condicionales
   */
  updateConditionalVisibility() {
    const allAnswers = this.collectData();
    this.config.fields.forEach((field) => {
      const group = this.el('group-' + field.id);
      if (!group) return;

      const shouldShow = this.evaluateShowWhen(field, allAnswers);
      const wasHidden = group.hasAttribute('hidden');

      if (shouldShow) {
        if (wasHidden) {
          group.removeAttribute('hidden');
          group.classList.remove('fade-out');
          group.classList.add('fade-in');
          group.setAttribute('aria-hidden', 'false');
        }
      } else {
        if (!wasHidden) {
          group.classList.remove('fade-in');
          group.classList.add('fade-out');
          // Esperar a que termine la animación antes de ocultar
          setTimeout(() => {
            if (group.classList.contains('fade-out')) {
              group.setAttribute('hidden', '');
              group.setAttribute('aria-hidden', 'true');
            }
          }, 200);
        }
      }

      // Update conditional required asterisk
      const hasConditionalRequired = field.required && typeof field.required === 'object' && field.required.when;
      if (hasConditionalRequired) {
        const isRequired = this.isFieldRequired(field, allAnswers);
        const star = group.querySelector('label .required[data-conditional="true"]');
        if (star) {
          star.hidden = !isRequired;
        }
      }
    });
  }

  // ======== Render ========
  render() {
    this.applyStrings();
    this.renderForm();
    // Usar ThemeManager en lugar del theme switcher interno
    this.themeManager.initThemeSwitcherUI();
  }

  applyStrings() {
    const hero = this.config.hero;
    const form = this.config.form;
    const h1 = document.querySelector('.hero h1');
    if (h1 && hero) h1.textContent = hero.title;
    const heroP = document.querySelector('.hero p');
    if (heroP && hero) heroP.textContent = hero.description;
    const heroBadge = this.el('heroBadge');
    if (heroBadge && hero && hero.badge) heroBadge.textContent = hero.badge;
    const title = document.querySelector('.form-title');
    if (title && form) title.textContent = form.title;
    const subtitle = document.querySelector('.form-subtitle');
    if (!subtitle || !form) return;
    subtitle.textContent = '';
    form.subtitle.split('*').forEach((part, i) => {
      if (i > 0) {
        const star = document.createElement('span');
        star.className = 'required';
        star.textContent = '*';
        subtitle.appendChild(star);
      }
      if (part) subtitle.appendChild(document.createTextNode(part));
    });
  }

  renderForm() {
    const grid = document.querySelector('.form-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let currentSection = null;
    let sectionGroup = null;

    const appendToGrid = (child) => {
      if (sectionGroup) sectionGroup.appendChild(child);
      else grid.appendChild(child);
    };

    let i = 0;
    while (i < this.config.fields.length) {
      const field = this.config.fields[i];
      if (this.isCompact(field)) {
        const group = this.createFieldGroup(field);
        // Evaluar showWhen para campos compact
        const allAnswers = this.collectData();
        if (!this.evaluateShowWhen(field, allAnswers)) {
          group.setAttribute('hidden', '');
          group.setAttribute('aria-hidden', 'true');
        }
        appendToGrid(group);
        i++;
        continue;
      }
      if (!field.sectionId && sectionGroup) {
        sectionGroup = null;
      }
      if (field.sectionId && field.sectionId !== currentSection) {
        currentSection = field.sectionId;
        sectionGroup = document.createElement('div');
        sectionGroup.className = 'section-group';
        grid.appendChild(sectionGroup);
        const sec = this.config.sections && this.config.sections[field.sectionId];
        if (sec) sectionGroup.appendChild(this.createSectionHeader({ ...sec, id: field.sectionId }));
      }
      const card = document.createElement('div');
      card.className = 'question-card';
      const fieldGroup = this.createFieldGroup(field);
      // Evaluar showWhen
      const allAnswers = this.collectData();
      if (!this.evaluateShowWhen(field, allAnswers)) {
        fieldGroup.setAttribute('hidden', '');
        fieldGroup.setAttribute('aria-hidden', 'true');
      }
      card.appendChild(fieldGroup);
      i++;
      if (i < this.config.fields.length && this.isCompact(this.config.fields[i])) {
        const compactGroup = this.createFieldGroup(this.config.fields[i]);
        if (!this.evaluateShowWhen(this.config.fields[i], allAnswers)) {
          compactGroup.setAttribute('hidden', '');
          compactGroup.setAttribute('aria-hidden', 'true');
        }
        card.appendChild(compactGroup);
        i++;
      }
      appendToGrid(card);
    }

    // Detail textarea scrollIntoView on focus/change
    const cards = grid.querySelectorAll('.question-card');
    for (let c = 0; c < cards.length; c++) {
      const card = cards[c];
      const detail = card.querySelector('.form-group--detail');
      if (!detail) continue;
      const controls = card.querySelectorAll('select, input[type="text"], input[type="email"], input[type="checkbox"], input[type="radio"]');
      for (let j = 0; j < controls.length; j++) {
        const evt = (controls[j].type === 'checkbox' || controls[j].type === 'radio') ? 'change' : 'focus';
        controls[j].addEventListener(evt, () => {
          setTimeout(() => {
            detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 120);
        });
      }
    }

    // Progress & auto-grow listeners + conditional visibility
    grid.querySelectorAll('input, select, textarea').forEach((ctl) => {
      ctl.addEventListener('input', () => {
        this.updateProgress();
        if (ctl.tagName === 'TEXTAREA') this.autoGrowTextarea(ctl);
        this.updateConditionalVisibility();
      });
      ctl.addEventListener('change', () => {
        this.updateProgress();
        this.updateConditionalVisibility();
      });
    });
    this.updateProgress();

    // File upload zone events
    this.setupFileUploadZones();

    // NOTE: Submit handler is attached by app-core.js prototype override
    // (handles Discord queue integration). Do NOT attach handleSubmit here.
  }

  setupFileUploadZones() {
    document.querySelectorAll('.file-upload-zone').forEach((zone) => {
      const input = zone.querySelector('.file-input-hidden');
      if (!input) return;

      ['dragenter', 'dragover'].forEach((ev) => {
        zone.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          zone.classList.add('dragover');
        });
      });
      zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('dragover');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
          this.handleFileSelect(e.dataTransfer.files, input.id.replace('field-', ''));
        }
      });
      zone.addEventListener('click', (e) => {
        if (e.target === zone || e.target.closest('.file-upload-zone')) {
          input.click();
        }
      });
      input.addEventListener('change', () => {
        if (input.files.length) {
          this.handleFileSelect(input.files, input.id.replace('field-', ''));
          input.value = '';
        }
      });
    });
  }

  createFieldGroup(field) {
    const group = document.createElement('div');
    group.className = 'form-group';
    if (this.isCompact(field)) group.className += ' form-group--detail';
    if (field.fullWidth) group.className += ' full-width';
    group.id = 'group-' + field.id;

    if (field.type === 'honeypot') {
      group.style.position = 'absolute';
      group.style.left = '-9999px';
      group.style.width = '0';
      group.style.height = '0';
      group.style.overflow = 'hidden';
      group.setAttribute('aria-hidden', 'true');
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'field-' + field.id;
      input.name = field.id;
      input.tabIndex = -1;
      input.autocomplete = 'off';
      input.setAttribute('aria-hidden', 'true');
      input.style.display = 'none';
      group.appendChild(input);
      return group;
    }

    const label = document.createElement('label');
    label.htmlFor = field.type === 'radio' ? 'field-' + field.id + '-0' : 'field-' + field.id;
    // Support HTML in labels (e.g., privacy consent link)
    if (field.label && field.label.includes('<')) {
      label.innerHTML = field.label;
    } else {
      label.textContent = field.label;
    }
    
    // Add required asterisk - for conditional required, we'll update it dynamically
    const hasStaticRequired = typeof field.required === 'boolean' && field.required;
    const hasConditionalRequired = field.required && typeof field.required === 'object' && field.required.when;
    if (hasStaticRequired) {
      label.appendChild(document.createTextNode(' '));
      const star = document.createElement('span');
      star.className = 'required';
      star.textContent = '*';
      star.dataset.conditional = 'false';
      label.appendChild(star);
    } else if (hasConditionalRequired) {
      // Placeholder for conditional required - will be shown/hidden dynamically
      label.appendChild(document.createTextNode(' '));
      const star = document.createElement('span');
      star.className = 'required';
      star.textContent = '*';
      star.dataset.conditional = 'true';
      star.hidden = true;
      label.appendChild(star);
    }
    group.appendChild(label);

    let control = null;
    let appended = false;

    if (field.type === 'radio') {
      const wrap = document.createElement('div');
      wrap.className = 'radio-group';
      (field.options || []).forEach((opt, idx) => {
        if (opt.disabled) return;
        const rWrap = document.createElement('label');
        rWrap.className = 'radio-option';
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = field.id;
        r.value = opt.value;
        r.className = 'option-' + field.id;
        r.id = 'field-' + field.id + '-' + idx;
        if (opt.selected) r.checked = true;
        const txt = document.createElement('span');
        txt.textContent = opt.label;
        rWrap.appendChild(r);
        rWrap.appendChild(txt);
        wrap.appendChild(rWrap);
        r.addEventListener('change', () => {
          const msg = this.validateField(field, this.radioValue(field));
          if (msg) this.showFieldError(field.id, msg);
          else this.clearFieldError(field.id);
          this.updateConditionalVisibility();
        });
      });
      group.appendChild(wrap);
      appended = true;
    } else if (field.type === 'select') {
      control = document.createElement('select');
      control.id = 'field-' + field.id;
      control.name = field.id;
      (field.options || []).forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.disabled) option.disabled = true;
        if (opt.selected) option.selected = true;
        control.appendChild(option);
      });
    } else if (field.type === 'textarea') {
      control = document.createElement('textarea');
      control.id = 'field-' + field.id;
      control.name = field.id;
      control.rows = this.isCompact(field) ? 3 : 5;
      if (field.placeholder) control.placeholder = field.placeholder;
    } else if (field.type === 'checkbox') {
      const wrap = document.createElement('div');
      wrap.className = 'checkbox-group';
      if (this.isMultiCheckbox(field)) {
        (field.options || []).forEach((opt, idx) => {
          const cbWrap = document.createElement('label');
          cbWrap.className = 'checkbox-option';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.name = field.id;
          cb.value = opt.value;
          cb.className = 'option-' + field.id;
          cb.id = 'field-' + field.id + '-' + idx;
          const txt = document.createElement('span');
          txt.textContent = opt.label;
          cbWrap.appendChild(cb);
          cbWrap.appendChild(txt);
          wrap.appendChild(cbWrap);
          cb.addEventListener('change', () => {
            const msg = this.validateField(field, this.checkboxAnyChecked(field));
            if (msg) this.showFieldError(field.id, msg);
            else this.clearFieldError(field.id);
            this.updateConditionalVisibility();
          });
        });
      } else {
        control = document.createElement('input');
        control.type = 'checkbox';
        control.id = 'field-' + field.id;
        control.name = field.id;
        // Si el label contiene HTML (ej: link a política de privacidad), el label
        // principal ya lo renderizó con innerHTML — no duplicar como texto plano.
        if (!(field.label && field.label.includes('<'))) {
          const checkLabel = document.createElement('label');
          checkLabel.htmlFor = 'field-' + field.id;
          checkLabel.appendChild(document.createTextNode(field.label + ' '));
          wrap.appendChild(checkLabel);
        }
        wrap.appendChild(control);
      }
      group.appendChild(wrap);
      appended = true;
    } else if (field.type === 'file') {
      group.appendChild(this.createFileUI(field));
      return group;
    } else {
      control = document.createElement('input');
      control.type = field.type === 'email' ? 'email' : 'text';
      control.id = 'field-' + field.id;
      control.name = field.id;
      if (field.placeholder) control.placeholder = field.placeholder;
      if (field.autocomplete) control.autocomplete = field.autocomplete;
    }

    if (!appended && control) {
      group.appendChild(control);
      this.wireValidation(field, control);
    }
    return group;
  }

  wireValidation(field, control) {
    // Guardar snapshot inicial para comparación
    const initialValue = control.type === 'checkbox' ? control.checked : control.value;
    this.dirtyTracker.saveSnapshot(field.id, initialValue);

    const run = () => {
      const value = control.type === 'checkbox' ? control.checked : control.value;
      
      // Dirty tracking: comparar con snapshot
      const snapshot = this.dirtyTracker.getSnapshot(field.id);
      const isDirty = String(value) !== String(snapshot);
      
      if (isDirty) {
        this.dirtyTracker.markDirty(field.id);
      } else {
        this.dirtyTracker.markClean(field.id);
      }

      const msg = this.validateField(field, value);
      if (msg) this.showFieldError(field.id, msg);
      else this.clearFieldError(field.id);
    };
    const events = control.type === 'checkbox' || control.tagName === 'SELECT' ? ['change'] : ['blur', 'input'];
    events.forEach((ev) => control.addEventListener(ev, run));
  }

  validateField(field, value) {
    const allAnswers = this.collectData();
    const isRequired = this.isFieldRequired(field, allAnswers);
    
    if (field.type === 'checkbox') {
      if (isRequired && !value) return (field.validation && field.validation.errorMessage) || 'Debes seleccionar una opción.';
      return null;
    }
    const v = String(value).trim();
    if (isRequired && !v) return field.validation ? field.validation.errorMessage : 'Este campo es obligatorio.';
    if (!v) return null;
    if (field.type === 'email' && !this.EMAIL_RE.test(v)) return field.validation?.formatMessage;
    if (field.validation && field.validation.minLength != null && v.length < field.validation.minLength) {
      return field.validation.errorMessage;
    }
    if (field.validation && field.validation.maxLength != null && v.length > field.validation.maxLength) {
      return field.validation.errorMessage;
    }
    return null;
  }

  validateAll() {
    const allAnswers = this.collectData();
    let firstInvalid = null;
    this.config.fields.forEach((field) => {
      if (field.type === 'honeypot' || this.isCompact(field)) return;
      
      // Check if field is conditionally required before validating
      const isRequired = this.isFieldRequired(field, allAnswers);
      if (!isRequired && field.type !== 'file') {
        // Still validate format if field has value (e.g., email format)
        // But don't require it
      }
      
      let value;
      if (this.isMultiCheckbox(field)) {
        value = this.checkboxAnyChecked(field);
      } else if (field.type === 'radio') {
        value = this.radioValue(field);
      } else {
        const control = this.el('field-' + field.id);
        if (!control) return;
        value = field.type === 'checkbox' ? control.checked : control.value;
      }
      
      // For non-required fields, only validate format if they have a value
      const msg = this.validateField(field, value);
      if (msg) {
        this.showFieldError(field.id, msg);
        firstInvalid = firstInvalid || this.el('group-' + field.id);
      } else {
        this.clearFieldError(field.id);
      }
    });
    // File validation
    if (!this.validateFiles()) {
      firstInvalid = firstInvalid || document.querySelector('.file-upload-wrapper');
    }
    if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return !!firstInvalid;
  }

  // ======== File Upload ========
  createFileUI(field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'file-upload-wrapper';

    const zone = document.createElement('div');
    zone.className = 'file-upload-zone';
    zone.innerHTML = `
      <svg class="file-upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <p class="file-upload-text">Arrastra archivos aquí o haz clic para seleccionar</p>
      <p class="file-upload-hint">Tipos permitidos: ${this.allowedTypes.join(', ')} · Máx. ${this.formatBytes(this.maxTotalBytes)} total</p>
    `;

    const input = document.createElement('input');
    input.type = 'file';
    input.className = 'file-input-hidden';
    input.id = 'field-' + field.id;
    input.name = field.id;
    input.multiple = true;
    input.accept = this.allowedTypes.join(',');

    const list = document.createElement('ul');
    list.className = 'file-list';
    list.id = 'file-list-' + field.id;

    zone.appendChild(input);
    wrapper.appendChild(zone);
    wrapper.appendChild(list);

    return wrapper;
  }

  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Valida y procesa archivos seleccionados
   * @param {FileList} fileList
   * @param {string} fieldId
   */
  async handleFileSelect(fileList, fieldId) {
    const files = Array.from(fileList);
    const listEl = this.el('file-list-' + fieldId);
    if (!listEl) return;

    for (const file of files) {
      // Validar tipo
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!this.allowedTypes.includes(ext)) {
        this.showMessage(`Tipo de archivo no permitido: ${file.name}. Tipos válidos: ${this.allowedTypes.join(', ')}`, 'error');
        continue;
      }

      // Validar tamaño total
      const currentTotal = this.state.files.reduce((sum, f) => sum + f.size, 0);
      if (currentTotal + file.size > this.maxTotalBytes) {
        this.showMessage(`Superado el límite de ${this.formatBytes(this.maxTotalBytes)} total. ${file.name} no se agregó.`, 'error');
        continue;
      }

      // Guardar en StateManager (IndexedDB)
      try {
        const fileId = await this.saveFileToState(file, fieldId);
        this.state.files.push({ ...file, id: fileId, fieldId });
        this.renderFileList(fieldId);
      } catch (e) {
        console.error('Error guardando archivo:', e);
        this.showMessage('Error al guardar el archivo: ' + file.name, 'error');
      }
    }
  }

  /**
   * Guarda archivo en StateManager y retorna ID
   * @param {File} file
   * @param {string} fieldId
   * @returns {Promise<number>}
   */
  async saveFileToState(file, fieldId) {
    // Usar StateManager global si está disponible (expuesto via EcosystemApp), sino fallback
    const stateManager = window.EcosystemApp?.getStateManager?.();
    if (stateManager) {
      return await stateManager.saveFile(fieldId, file);
    }
    // Fallback: guardar en estado local con ID temporal
    const tempId = Date.now() + Math.random();
    this.state.files.push({ ...file, id: tempId, fieldId, data: await this.fileToBase64(file) });
    return tempId;
  }

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Elimina un archivo del estado y UI
   * @param {number|string} fileId
   * @param {string} fieldId
   */
  async removeFile(fileId, fieldId) {
    // Eliminar de StateManager
    const stateManager = window.EcosystemApp?.getStateManager?.();
    if (stateManager && typeof fileId === 'number') {
      try {
        await stateManager.deleteFile(fileId);
      } catch (e) {
        console.warn('Error borrando de IndexedDB:', e);
      }
    }

    // Eliminar del estado local
    this.state.files = this.state.files.filter((f) => f.id !== fileId);
    this.renderFileList(fieldId);
  }

  /**
   * Re-renderiza la lista de archivos con previews
   * @param {string} fieldId
   */
  renderFileList(fieldId) {
    const listEl = this.el('file-list-' + fieldId);
    if (!listEl) return;

    const fieldFiles = this.state.files.filter((f) => f.fieldId === fieldId);
    listEl.innerHTML = '';

    fieldFiles.forEach((file) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.dataset.fileId = file.id;

      const isImage = file.type.startsWith('image/');
      const preview = isImage
        ? `<img src="${URL.createObjectURL(file)}" alt="${file.name}" class="file-preview" style="width:32px;height:32px;object-fit:cover;border-radius:4px;">`
        : `<span class="file-icon" aria-hidden="true">📄</span>`;

      li.innerHTML = `
        ${preview}
        <div class="file-item-info">
          <span class="file-item-name">${file.name}</span>
          <span class="file-item-size">${this.formatBytes(file.size)} · ${file.type || 'desconocido'}</span>
        </div>
        <div class="file-upload-progress" style="display:none;">
          <div class="file-upload-progress-fill"></div>
        </div>
        <button type="button" class="file-item-remove" aria-label="Eliminar ${file.name}" title="Eliminar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;

      const removeBtn = li.querySelector('.file-item-remove');
      removeBtn.addEventListener('click', () => this.removeFile(file.id, fieldId));

      listEl.appendChild(li);
    });
  }

  /**
   * Valida todos los archivos antes de submit
   * @returns {boolean}
   */
  validateFiles() {
    const totalSize = this.state.files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > this.maxTotalBytes) {
      this.showMessage(`El tamaño total de archivos (${this.formatBytes(totalSize)}) supera el límite de ${this.formatBytes(this.maxTotalBytes)}`, 'error');
      return false;
    }

    for (const file of this.state.files) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!this.allowedTypes.includes(ext)) {
        this.showMessage(`Archivo no permitido: ${file.name}`, 'error');
        return false;
      }
    }
    return true;
  }

  // ======== Discord Embed Builder ========
  chunkText(text, max) {
    const parts = [];
    for (let i = 0; i < text.length; i += max) parts.push(text.slice(i, i + max));
    return parts;
  }

  optionLabel(field, value) {
    const opt = (field.options || []).find((o) => o.value === value);
    return opt ? opt.label : value;
  }

  collectData() {
    const data = {};
    this.config.fields.forEach((field) => {
      if (field.type === 'honeypot' || field.type === 'file') return;
      if (this.isMultiCheckbox(field)) {
        data[field.id] = this.checkboxValues(field);
        return;
      }
      if (field.type === 'radio') {
        data[field.id] = this.radioValue(field);
        return;
      }
      const control = this.el('field-' + field.id);
      if (!control) return;
      data[field.id] = field.type === 'checkbox' ? control.checked : control.value;
    });
    return data;
  }

  buildEmbed(data) {
    const now = new Date();
    const esCr = new Intl.DateTimeFormat('es-CR', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(now);

    const fields = [
      { name: 'Enviado', value: esCr, inline: false },
      { name: 'Enviado (ISO)', value: now.toISOString(), inline: false }
    ];

    let description = String(data.summary || '').trim();

    this.config.fields.forEach((field) => {
      if (field.type === 'honeypot' || field.type === 'file') return;
      if (field.id === 'summary') return;

      let value;
      if (this.isMultiCheckbox(field)) {
        value = Array.isArray(data[field.id]) && data[field.id].length
          ? data[field.id].map((v) => this.optionLabel(field, v)).join(', ')
          : '';
      } else if (field.type === 'checkbox') {
        value = data[field.id] ? 'Sí' : '';
      } else if (field.type === 'select' || field.type === 'radio') {
        value = String(data[field.id] || '').trim();
        if (value) value = this.optionLabel(field, value);
      } else if (field.type === 'textarea') {
        value = String(data[field.id] || '').trim();
      } else {
        value = String(data[field.id] || '').trim();
      }

      if (!value) return;

      const label = field.label;
      const parts = this.chunkText(value, this.DISCORD_LIMITS.fieldValue);
      for (let i = 0; i < parts.length && fields.length < this.DISCORD_LIMITS.maxFields; i++) {
        fields.push({
          name: parts.length > 1 ? label + ' (' + (i + 1) + '/' + parts.length + ')' : label,
          value: parts[i],
          inline: false
        });
      }
    });

    if (description.length > this.DISCORD_LIMITS.description) {
      const rest = description.slice(this.DISCORD_LIMITS.description);
      description = description.slice(0, this.DISCORD_LIMITS.description);
      const parts = this.chunkText(rest, this.DISCORD_LIMITS.fieldValue);
      let shown = 0;
      for (let i = 0; i < parts.length && fields.length < this.DISCORD_LIMITS.maxFields; i++) {
        fields.push({ name: 'Resumen (cont. ' + (i + 1) + ')', value: parts[i], inline: false });
        shown += parts[i].length;
      }
      const omitted = rest.length - shown;
      if (omitted > 0) {
        const last = fields[fields.length - 1];
        const note = '\n… (' + omitted + ' caracteres omitidos)';
        if (last) last.value = last.value.slice(0, this.DISCORD_LIMITS.fieldValue - note.length) + note;
      }
    }

    return {
      title: this.config.hero?.title || 'Encuesta',
      description: description,
      fields: fields
    };
  }

  // ======== Submit ========
  honeypotFilled() {
    const hp = this.el('field-website');
    return hp ? hp.value.trim() !== '' : false;
  }

  cooldownActive() {
    return Date.now() - this.state.lastSubmitAt < this.COOLDOWN_MS;
  }

  webhookConfigured() {
    const url = this.config.webhook?.url;
    return !!url && url.indexOf(this.WEBHOOK_PLACEHOLDER) === -1;
  }

  postWithFiles(url, payload) {
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify(payload));
    this.state.files.forEach((file, i) => fd.append('files[' + i + ']', file, file.name));
    return fetch(url, { method: 'POST', body: fd });
  }

  async submitForm() {
    if (!this.webhookConfigured()) {
      this.showMessage('El formulario aún no está configurado para recibir envíos. Inténtalo más tarde.', 'error');
      return;
    }
    const btn = this.el('submitBtn');
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      const data = this.collectData();
      const payload = {
        username: this.config.webhook.username,
        avatar_url: this.config.webhook.avatarUrl,
        embeds: [this.buildEmbed(data)]
      };
      const res = this.state.files.length
        ? await this.postWithFiles(this.config.webhook.url, payload)
        : await fetch(this.config.webhook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.state.lastSubmitAt = Date.now();
      this.el('contactForm').reset();
      this.state.files = [];
      // Clear file lists
      document.querySelectorAll('.file-list').forEach((list) => list.innerHTML = '');
      this.showMessage('¡Gracias! Tu respuesta se guardó correctamente.', 'success');
      this.updateProgress();
    } catch (err) {
      this.showMessage('No se pudo enviar. Intenta de nuevo.', 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }

  handleSubmit(event) {
    event.preventDefault();
    if (this.honeypotFilled()) return;
    const msg = this.el('formMessage');
    msg.textContent = '';
    msg.className = 'form-message';
    if (this.cooldownActive()) {
      this.showMessage('Espera unos segundos antes de volver a enviar.', 'error');
      return;
    }
    if (this.validateAll()) {
      this.showMessage('Revisa los campos marcados en rojo.', 'error');
      return;
    }
    this.submitForm();
  }

  /**
   * Verifica si una feature está habilitada
   * @param {string} flagName
   * @returns {boolean}
   */
  isFeatureEnabled(flagName) {
    return this.featureFlag.isEnabled(flagName);
  }

  // ======== Theme Switcher (DEPRECADO - usar ThemeManager) ========
  /**
   * @deprecated Usar this.themeManager.initThemeSwitcherUI() en su lugar
   */
  initThemeSwitcher() {
    console.warn('[FormEngine] initThemeSwitcher() está deprecado, usar ThemeManager');
    this.themeManager.initThemeSwitcherUI();
  }
}

export default FormEngine;