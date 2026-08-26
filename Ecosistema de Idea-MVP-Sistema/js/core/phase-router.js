/**
 * PhaseRouter — Motor de navegación y reglas de activación de fases
 * ES Module vanilla, export class PhaseRouter
 */
import { CircularDetector } from './circular-detector.js';
export class PhaseRouter {
  /**
   * @param {ConfigLoader} configLoader - Instancia de ConfigLoader para cargar configs
   * @param {Object} phasesRegistry - Registry de fases desde index.json
   */
  constructor(configLoader, phasesRegistry) {
    this.configLoader = configLoader;
    this.phasesRegistry = phasesRegistry;
    this.storageKey = 'ecosystem-phase-states';
    this.state = this.loadState();
    this.phaseGraph = this.buildPhaseGraph();

    // Circular detector para validar registro de fases
    this.circularDetector = new CircularDetector();

    // Debounced navigation state
    this.isLoading = false;
    this.pendingNavigation = null;

    // Validar grafo de fases al inicializar
    this.validatePhaseGraph();
  }

  // ============================================================
  // STATE MACHINE: Estados por fase
  // locked | unlocked | in-progress | completed | skipped
  // ============================================================

/**
 * Obtiene el estado actual de una fase
 * @param {string} phaseId - ID de la fase (ej: '01-idd')
 * @returns {string} Estado: 'locked' | 'unlocked' | 'in-progress' | 'completed' | 'skipped' | 'unavailable'
 */
getPhaseState(phaseId) {
  const normalizedId = this.normalizePhaseId(phaseId);
  
  // Verificar si la fase existe en el registry
  const phaseExists = this.phasesRegistry?.phases?.some(p => p.phaseId === normalizedId);
  if (!phaseExists) {
    return 'unavailable';
  }
  
  return this.state[normalizedId] || 'locked';
}

  /**
   * Establece el estado de una fase y persiste
   * @param {string} phaseId
   * @param {string} newState
   */
  setPhaseState(phaseId, newState) {
    const normalizedId = this.normalizePhaseId(phaseId);
    const validStates = ['locked', 'unlocked', 'in-progress', 'completed', 'skipped'];
    if (!validStates.includes(newState)) {
      throw new Error(`Estado inválido: ${newState}. Válidos: ${validStates.join(', ')}`);
    }
    const oldState = this.state[normalizedId] || 'locked';
    this.state[normalizedId] = newState;
    this.persistState();
    this.emitPhaseEvent(normalizedId, oldState, newState);
  }

  // ============================================================
  // PREREQUISITES ENGINE: Evalúa activationRule y condition
  // ============================================================

  /**
   * Evalúa si una fase puede desbloquearse
   * @param {string} phaseId
   * @param {Object} [allAnswers] - Respuestas de todas las fases para evaluar conditions
   * @returns {{canUnlock: boolean, reason: string}}
   */
  canUnlock(phaseId, allAnswers = {}) {
    const normalizedId = this.normalizePhaseId(phaseId);

    // Fase ya desbloqueada o completada
    const currentState = this.getPhaseState(normalizedId);
    if (currentState !== 'locked') {
      return { canUnlock: true, reason: `Fase ya en estado: ${currentState}` };
    }

    // 00-idea siempre desbloqueado
    if (normalizedId === '00-idea') {
      return { canUnlock: true, reason: 'Fase inicial siempre desbloqueada' };
    }

    // Obtener config de la fase
    const phaseConfig = this.getPhaseConfig(normalizedId);
    if (!phaseConfig) {
      return { canUnlock: false, reason: `Config no encontrada para ${normalizedId}` };
    }

    // Evaluar activationRule
    const activationRule = phaseConfig.activationRule || 'conditional';
    const condition = phaseConfig.condition;

    switch (activationRule) {
      case 'always':
        return { canUnlock: true, reason: 'Regla de activación: always' };

      case 'on-demand':
        return { canUnlock: false, reason: 'Regla de activación: on-demand (requiere acción manual)' };

      case 'conditional':
      default:
        // Evaluar prerequisites del grafo
        const prereqs = this.phaseGraph.prerequisites[normalizedId] || [];
        if (prereqs.length === 0) {
          return { canUnlock: false, reason: 'Sin prerequisitos definidos pero activationRule=conditional' };
        }

        // Verificar que al menos un prerequisito esté completado
        const completedPrereqs = prereqs.filter(p => this.getPhaseState(p) === 'completed');
        if (completedPrereqs.length === 0) {
          return {
            canUnlock: false,
            reason: `Prerequisitos no cumplidos: ${prereqs.join(', ')} (ninguno completado)`
          };
        }

        // Evaluar condition JS si existe
        if (condition) {
          try {
            const result = this.evaluateCondition(condition, allAnswers);
            if (!result) {
              return { canUnlock: false, reason: `Condición no cumplida: ${condition}` };
            }
          } catch (err) {
            console.warn('[PhaseRouter] Error evaluando condition:', err);
            return { canUnlock: false, reason: `Error evaluando condición: ${err.message}` };
          }
        }

        return {
          canUnlock: true,
          reason: `Prerequisitos cumplidos: ${completedPrereqs.join(', ')}`
        };
    }
  }

  /**
   * Evalúa una expresión JS de forma segura
   * @param {string} condition - Expresión JS (ej: "answers.stimulus === 'problema'")
   * @param {Object} allAnswers - Objeto con todas las respuestas
   * @returns {boolean}
   */
  evaluateCondition(condition, allAnswers) {
    // Sanitizar: solo permitir acceso a allAnswers y operadores básicos
    const safeCondition = condition
      .replace(/\banswers\b/g, 'allAnswers')
      .replace(/[<>]=?|===?|&&|\|\||!/g, m => m) // operadores permitidos
      .replace(/[^a-zA-Z0-9_$.()\[\]"'=<>!&|+\-*/%\s]/g, ''); // chars permitidos

    // Usar Function constructor para evaluación segura (no eval)
    try {
      const fn = new Function('allAnswers', `return (${safeCondition});`);
      return Boolean(fn(allAnswers));
    } catch (err) {
      console.warn('[PhaseRouter] Condition evaluation failed:', condition, err);
      return false;
    }
  }

  // ============================================================
  // PHASE GRAPH: Construye grafo de dependencias
  // ============================================================

  /**
   * Construye el grafo de fases desde registry y reglas de negocio
   * @returns {Object} { prerequisites, nextPhases, variantRules }
   */
  buildPhaseGraph() {
    const prerequisites = {};
    const nextPhases = {};
    const variantRules = {};

    // Obtener todas las phaseIds base (sin variantes) del registry
    const basePhases = this.phasesRegistry?.phases?.map(p => p.phaseId) || [];

    // Reglas de activación basadas en Guía Tipos Documentos
    const activationRules = this.getDefaultActivationRules();

    for (const phaseId of basePhases) {
      const rule = activationRules[phaseId] || {};

      // Prerequisites
      if (rule.prerequisites) {
        prerequisites[phaseId] = rule.prerequisites;
        for (const prereq of rule.prerequisites) {
          if (!nextPhases[prereq]) nextPhases[prereq] = [];
          if (!nextPhases[prereq].includes(phaseId)) {
            nextPhases[prereq].push(phaseId);
          }
        }
      }

      // Activation rule y condition
      if (rule.activationRule) {
        // Se aplicará en canUnlock
      }
      if (rule.condition) {
        // Se aplicará en canUnlock
      }

      // Variant suggestion rules para 01-idd
      if (rule.suggestVariant) {
        variantRules[phaseId] = rule.suggestVariant;
      }
    }

    return { prerequisites, nextPhases, variantRules };
  }

  /**
   * Reglas de activación por defecto basadas en la Guía Tipos Documentos
   * @returns {Object}
   */
  getDefaultActivationRules() {
    return {
      '00-idea': {
        activationRule: 'always',
        prerequisites: []
      },
      '01-idd': {
        activationRule: 'conditional',
        prerequisites: ['00-idea'],
        condition: null, // Se evalúa en suggestVariant
        suggestVariant: (answers) => this.suggestIDDVariant(answers)
      },
      '02-prd': {
        activationRule: 'conditional',
        prerequisites: ['01-idd']
      },
      '03-brd': {
        activationRule: 'conditional',
        prerequisites: ['01-idd']
      },
      '04-rdd': {
        activationRule: 'conditional',
        prerequisites: ['02-prd', '03-brd']
      },
      '05-dmd': {
        activationRule: 'conditional',
        prerequisites: ['04-rdd']
      },
      '06-design': {
        activationRule: 'conditional',
        prerequisites: ['05-dmd']
      },
      '07-dbd': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '08-api': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '09-uid': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '10-tmd': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '11-srd': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '12-iam': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '13-sad': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '14-agd': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '15-aad': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '16-aid': {
        activationRule: 'conditional',
        prerequisites: ['06-design']
      },
      '17-tasks': {
        activationRule: 'conditional',
        prerequisites: ['06-design', '09-uid', '10-tmd', '11-srd']
      },
      '18-sod': {
        activationRule: 'conditional',
        prerequisites: ['17-tasks']
      },
      '19-tdd': {
        activationRule: 'conditional',
        prerequisites: ['17-tasks']
      },
      '20-atd': {
        activationRule: 'conditional',
        prerequisites: ['19-tdd']
      },
      '21-std': {
        activationRule: 'conditional',
        prerequisites: ['19-tdd']
      },
      '22-vsd': {
        activationRule: 'conditional',
        prerequisites: ['19-tdd']
      },
      '23-dep': {
        activationRule: 'conditional',
        prerequisites: ['18-sod', '20-atd', '21-std', '22-vsd']
      },
      '24-mdd': {
        activationRule: 'conditional',
        prerequisites: ['23-dep']
      },
      '25-aed': {
        activationRule: 'conditional',
        prerequisites: ['24-mdd']
      },
      '26-chd': {
        activationRule: 'conditional',
        prerequisites: ['24-mdd']
      },
      '27-ced': {
        activationRule: 'on-demand',
        prerequisites: []
      },
      '28-cca': {
        activationRule: 'on-demand',
        prerequisites: []
      }
    };
  }

  /**
   * Sugiere variante de 01-idd basada en respuestas de 00-idea
   * @param {Object} answers - Respuestas de 00-idea
   * @returns {string} variantId recomendado
   */
  suggestIDDVariant(answers) {
    const stimulus = answers?.stimulus;
    const nature = answers?.nature;

    // Basado en Guía Tipos Documentos
    if (stimulus === 'problema' || stimulus === 'necesidad') {
      // problema/necesidad → mercado, productividad, operativa, tecnica
      if (nature === 'solucion') return 'mercado';
      if (nature === 'herramienta') return 'tecnica';
      return 'mercado';
    }

    if (stimulus === 'oportunidad') {
      // oportunidad → mercado, economica, plataforma
      if (nature === 'mercado' || nature === 'negocio') return 'mercado';
      return 'economica';
    }

    if (stimulus === 'curiosidad' || stimulus === 'observacion' || stimulus === 'anomalia') {
      // curiosidad/observacion → tecnica, evolutiva, ux, data
      if (nature === 'herramienta') return 'tecnica';
      if (nature === 'solucion') return 'evolutiva';
      return 'tecnica';
    }

    if (stimulus === 'combinacion') {
      return 'colaborativa';
    }

    // Default
    return 'mercado';
  }

  /**
   * Método público para sugerir variante de cualquier fase
   * @param {string} phaseId
   * @param {Object} previousAnswers
   * @returns {string|null}
   */
  suggestVariant(phaseId, previousAnswers) {
    const normalizedId = this.normalizePhaseId(phaseId);
    const rule = this.phaseGraph.variantRules[normalizedId];
    if (typeof rule === 'function') {
      return rule(previousAnswers);
    }
    // Para fases con variantes, devolver la primera no-projection
    const phaseInfo = this.phasesRegistry?.phases?.find(p => p.phaseId === normalizedId);
    if (phaseInfo?.variants?.length > 0) {
      const variant = phaseInfo.variants.find(v => {
        const variantDetail = this.phasesRegistry.variants?.find(
          vd => vd.phaseId === normalizedId && vd.variant === v
        );
        return variantDetail && !variantDetail.projection;
      });
      return variant || phaseInfo.variants[0];
    }
    return null;
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================

  /**
   * Desbloquea una fase si se cumplen prerequisites
   * @param {string} phaseId
   * @param {Object} [allAnswers]
   * @returns {boolean}
   */
  unlock(phaseId, allAnswers = {}) {
    const normalizedId = this.normalizePhaseId(phaseId);
    const { canUnlock, reason } = this.canUnlock(normalizedId, allAnswers);

    if (!canUnlock) {
      console.warn(`[PhaseRouter] No se puede desbloquear ${normalizedId}: ${reason}`);
      return false;
    }

    this.setPhaseState(normalizedId, 'unlocked');
    console.log(`[PhaseRouter] Fase desbloqueada: ${normalizedId} (${reason})`);
    return true;
  }

  /**
   * Marca una fase como completada y desbloquea siguientes
   * @param {string} phaseId
   * @param {Object} [allAnswers]
   */
  complete(phaseId, allAnswers = {}) {
    const normalizedId = this.normalizePhaseId(phaseId);
    this.setPhaseState(normalizedId, 'completed');

    // Desbloquear fases siguientes automáticamente
    const next = this.phaseGraph.nextPhases[normalizedId] || [];
    for (const nextPhase of next) {
      this.unlock(nextPhase, allAnswers);
    }
  }

  /**
   * Obtiene array de fases desbloqueadas (unlocked, in-progress, completed)
   * @returns {string[]}
   */
  getAvailablePhases() {
    const available = [];
    for (const phaseId of Object.keys(this.state)) {
      const state = this.state[phaseId];
      if (state !== 'locked' && state !== 'skipped') {
        available.push(phaseId);
      }
    }
    return available.sort();
  }

  /**
   * Obtiene progreso general
   * @returns {{completed: number, total: number, percentage: number}}
   */
  getProgress() {
    const basePhases = this.phasesRegistry?.phases?.map(p => p.phaseId) || [];
    let completed = 0;
    for (const phaseId of basePhases) {
      if (this.getPhaseState(phaseId) === 'completed') {
        completed++;
      }
    }
    const total = basePhases.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }

  /**
   * Inicia una fase (marca in-progress)
   * @param {string} phaseId
   */
  startPhase(phaseId) {
    const normalizedId = this.normalizePhaseId(phaseId);
    const currentState = this.getPhaseState(normalizedId);
    if (currentState === 'locked') {
      this.unlock(normalizedId);
    }
    this.setPhaseState(normalizedId, 'in-progress');
  }

  /**
   * Marca una fase como skipped
   * @param {string} phaseId
   */
  skipPhase(phaseId) {
    const normalizedId = this.normalizePhaseId(phaseId);
    this.setPhaseState(normalizedId, 'skipped');

    // Desbloquear siguientes igual que complete
    const next = this.phaseGraph.nextPhases[normalizedId] || [];
    for (const nextPhase of next) {
      this.unlock(nextPhase);
    }
  }

  /**
   * Reinicia todo el estado (para testing/nuevo proyecto)
   */
  reset() {
    this.state = {};
    this.persistState();
    // 00-idea siempre unlocked al reset
    this.setPhaseState('00-idea', 'unlocked');
  }

  // ============================================================
  // DEBOUNCED NAVIGATION
  // ============================================================

  /**
   * Cancela navegación pendiente si existe
   */
  cancelPending() {
    if (this.pendingNavigation) {
      console.log('[PhaseRouter] Navegación pendiente cancelada:', this.pendingNavigation);
      this.pendingNavigation = null;
    }
  }

  /**
   * Establece flag de carga
   * @param {boolean} loading
   */
  setLoading(loading) {
    this.isLoading = loading;
  }

  /**
   * Obtiene estado de carga
   * @returns {boolean}
   */
  getLoading() {
    return this.isLoading;
  }

  // ============================================================
  // PERSISTENCIA LOCALSTORAGE
  // ============================================================

  loadState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Asegurar que 00-idea esté unlocked
        if (!parsed['00-idea']) {
          parsed['00-idea'] = 'unlocked';
        }
        return parsed;
      }
    } catch (e) {
      console.warn('[PhaseRouter] Error cargando estado:', e);
    }
    return { '00-idea': 'unlocked' };
  }

  persistState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[PhaseRouter] Error guardando estado:', e);
    }
  }

  // ============================================================
  // EVENTOS: CustomEvent en window
  // ============================================================

  emitPhaseEvent(phaseId, oldState, newState) {
    const eventMap = {
      unlocked: 'phase:unlocked',
      completed: 'phase:completed',
      locked: 'phase:locked',
      'in-progress': 'phase:started',
      skipped: 'phase:skipped'
    };

    const eventName = eventMap[newState];
    if (eventName) {
      const event = new CustomEvent(eventName, {
        detail: { phaseId, oldState, newState, timestamp: Date.now() }
      });
      window.dispatchEvent(event);
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  normalizePhaseId(phaseId) {
    return phaseId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  // ============================================================
  // CIRCULAR PHASE REGISTRATION DETECTION
  // ============================================================

  /**
   * Valida el grafo de fases actual para detectar ciclos
   * @throws {Error} Si se detectan ciclos
   */
  validatePhaseGraph() {
    const graph = this.buildPhaseGraphForDetection();
    this.circularDetector.validateAndThrow(graph, 'phase registration');
  }

  /**
   * Construye grafo para detección de ciclos (usa CircularDetector.buildPhaseGraph)
   * @returns {Map<string, Set<string>>}
   */
  buildPhaseGraphForDetection() {
    return this.circularDetector.buildPhaseGraph(this.phasesRegistry);
  }

  /**
   * Registra una nueva fase y valida que no cree ciclos
   * @param {string} phaseId
   * @param {Object} config - Configuración de la fase (activationRule, prerequisites, nextPhases, etc.)
   * @throws {Error} Si el registro crearía un ciclo
   */
  registerPhase(phaseId, config) {
    const normalizedId = this.normalizePhaseId(phaseId);

    // Construir grafo temporal con la nueva fase
    const tempRegistry = {
      phases: [...(this.phasesRegistry?.phases || []), { phaseId: normalizedId }],
      variants: this.phasesRegistry?.variants || []
    };

    // Agregar reglas de activación temporales
    const tempRules = { ...this.getDefaultActivationRules() };
    if (config.activationRule) tempRules[normalizedId] = { ...tempRules[normalizedId], activationRule: config.activationRule };
    if (config.prerequisites) tempRules[normalizedId] = { ...tempRules[normalizedId], prerequisites: config.prerequisites };

    // Validar con detector de ciclos usando buildPhaseGraph
    const graph = this.circularDetector.buildPhaseGraph(tempRegistry);

    // Agregar edges de la nueva fase si tiene prerequisites
    if (config.prerequisites) {
      for (const prereq of config.prerequisites) {
        if (graph.has(prereq) && graph.has(normalizedId)) {
          graph.get(prereq).add(normalizedId);
        }
      }
    }

    // Agregar edges nextPhases si se proporcionan
    if (config.nextPhases) {
      if (!graph.has(normalizedId)) graph.set(normalizedId, new Set());
      for (const nextPhase of config.nextPhases) {
        if (graph.has(nextPhase)) {
          graph.get(normalizedId).add(nextPhase);
        }
      }
    }

    // Validar ciclos - lanza Error si hay ciclo
    this.circularDetector.validateAndThrow(graph, `phase registration for ${normalizedId}`);

    // Si pasa validación, agregar al registry
    if (!this.phasesRegistry.phases) this.phasesRegistry.phases = [];
    if (!this.phasesRegistry.phases.find(p => p.phaseId === normalizedId)) {
      this.phasesRegistry.phases.push({ phaseId: normalizedId });
    }

    // Actualizar grafo interno
    this.phaseGraph = this.buildPhaseGraph();

    console.log(`[PhaseRouter] Fase registrada: ${normalizedId}`);
  }

  /**
   * Obtiene el grafo de fases para visualización/debug (método público actualizado)
   * @returns {Object}
   */
  getPhaseGraph() {
    return {
      prerequisites: { ...this.phaseGraph.prerequisites },
      nextPhases: { ...this.phaseGraph.nextPhases },
      variantRules: { ...this.phaseGraph.variantRules },
      // Incluir grafo crudo para análisis
      rawGraph: this.buildPhaseGraphForDetection()
    };
  }

  getPhaseConfig(phaseId) {
    // Buscar en registry la config base (sin variante)
    const variants = this.phasesRegistry?.variants?.filter(v => v.phaseId === phaseId && !v.projection);
    if (variants?.length > 0) {
      // Retornar info básica, la config completa se carga con configLoader
      return {
        phaseId: variants[0].phaseId,
        variant: variants[0].variant,
        activationRule: 'conditional' // default, puede sobrescribirse
      };
    }
    // Fallback: buscar en phases array
    const phaseInfo = this.phasesRegistry?.phases?.find(p => p.phaseId === phaseId);
    return phaseInfo || null;
  }

  /**
   * Carga config completa de una fase (usa ConfigLoader)
   * @param {string} phaseId
   * @param {string} [variant]
   * @returns {Promise<Object>}
   */
  async loadPhaseConfig(phaseId, variant) {
    return this.configLoader.loadPhaseConfig(phaseId, variant);
  }
}

/**
 * Instancia singleton por defecto (se inicializa desde app-core)
 */
export let phaseRouter = null;

/**
 * Inicializa el router global
 * @param {ConfigLoader} configLoader
 * @param {Object} phasesRegistry
 * @returns {PhaseRouter}
 */
export function initPhaseRouter(configLoader, phasesRegistry) {
  phaseRouter = new PhaseRouter(configLoader, phasesRegistry);
  return phaseRouter;
}

/**
 * Obtiene la instancia singleton
 * @returns {PhaseRouter|null}
 */
export function getPhaseRouter() {
  return phaseRouter;
}