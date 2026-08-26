/**
 * CircularDetector — Detección de ciclos en grafos de dependencias
 * ES Module vanilla, export class CircularDetector
 */
export class CircularDetector {
  constructor() {
    this.colors = new Map(); // nodeId -> 'white' | 'gray' | 'black'
    this.parent = new Map(); // nodeId -> parentId
    this.cycles = []; // array de ciclos encontrados
  }

  /**
   * Detecta ciclos en un grafo dirigido
   * @param {Map<string, Set<string>>} graph - Mapa de nodo -> Set de dependencias
   * @returns {{ hasCycles: boolean, cycles: string[][] }}
   */
  detectCycles(graph) {
    this.colors.clear();
    this.parent.clear();
    this.cycles = [];

    // Inicializar todos los nodos como 'white' (no visitados)
    for (const nodeId of graph.keys()) {
      this.colors.set(nodeId, 'white');
    }

    // DFS desde cada nodo no visitado
    for (const nodeId of graph.keys()) {
      if (this.colors.get(nodeId) === 'white') {
        this.dfs(nodeId, graph);
      }
    }

    return {
      hasCycles: this.cycles.length > 0,
      cycles: this.cycles
    };
  }

  /**
   * DFS con 3 colores para detección de ciclos
   * white = no visitado, gray = visitando (en stack), black = visitado completamente
   * @param {string} nodeId
   * @param {Map<string, Set<string>>} graph
   */
  dfs(nodeId, graph) {
    this.colors.set(nodeId, 'gray'); // Entrando al nodo

    const dependencies = graph.get(nodeId) || new Set();

    for (const depId of dependencies) {
      // Solo considerar dependencias que están en el grafo
      if (!this.colors.has(depId)) continue;

      const depColor = this.colors.get(depId);

      if (depColor === 'white') {
        this.parent.set(depId, nodeId);
        this.dfs(depId, graph);
      } else if (depColor === 'gray') {
        // ¡Ciclo detectado! Reconstruir el ciclo
        const cycle = this.reconstructCycle(nodeId, depId);
        this.cycles.push(cycle);
      }
      // Si es 'black', ya fue procesado completamente, no hay ciclo
    }

    this.colors.set(nodeId, 'black'); // Saliendo del nodo
  }

  /**
   * Reconstruye el camino del ciclo desde nodeId hasta depId
   * @param {string} nodeId - Nodo actual (desde donde se encontró el back-edge)
   * @param {string} depId - Nodo destino del back-edge (ya en stack)
   * @returns {string[]} Ciclo como array de nodeIds
   */
  reconstructCycle(nodeId, depId) {
    const cycle = [depId];
    let current = nodeId;

    while (current !== depId && current !== undefined) {
      cycle.unshift(current);
      current = this.parent.get(current);
    }

    // Cerrar el ciclo
    cycle.push(depId);
    return cycle;
  }

  /**
   * Construye grafo de configuración desde array de campos
   * Extrae edges de field.showWhen.field
   * @param {Array<Object>} configs - Array de configuraciones de campos
   * @returns {Map<string, Set<string>>} Grafo fieldId -> Set<fieldId>
   */
  buildConfigGraph(configs) {
    const graph = new Map();

    // Inicializar nodos
    for (const field of configs) {
      if (field.id) {
        graph.set(field.id, new Set());
      }
    }

    // Agregar edges desde showWhen
    for (const field of configs) {
      if (field.showWhen && field.showWhen.field) {
        const from = field.showWhen.field;
        const to = field.id;

        if (graph.has(from) && graph.has(to)) {
          graph.get(from).add(to);
        }
      }
    }

    return graph;
  }

  /**
   * Construye grafo de fases desde registry
   * Extrae edges de phase.nextPhases + prerequisites
   * @param {Object} registry - Registry de fases con phases[] y variants[]
   * @returns {Map<string, Set<string>>} Grafo phaseId -> Set<phaseId>
   */
  buildPhaseGraph(registry) {
    const graph = new Map();

    // Obtener todas las phaseIds base (sin variantes)
    const basePhases = registry?.phases?.map(p => p.phaseId) || [];

    // Inicializar nodos
    for (const phaseId of basePhases) {
      graph.set(phaseId, new Set());
    }

    // Reglas de activación por defecto (del PhaseRouter)
    const activationRules = this.getDefaultActivationRules();

    for (const phaseId of basePhases) {
      const rule = activationRules[phaseId] || {};

      // Prerequisites -> edges: prereq -> phaseId
      if (rule.prerequisites) {
        for (const prereq of rule.prerequisites) {
          if (graph.has(prereq) && graph.has(phaseId)) {
            graph.get(prereq).add(phaseId);
          }
        }
      }

      // nextPhases (si existe en registry)
      const phaseInfo = registry?.phases?.find(p => p.phaseId === phaseId);
      if (phaseInfo?.nextPhases) {
        for (const nextPhase of phaseInfo.nextPhases) {
          if (graph.has(phaseId) && graph.has(nextPhase)) {
            graph.get(phaseId).add(nextPhase);
          }
        }
      }
    }

    return graph;
  }

  /**
   * Reglas de activación por defecto (copia de PhaseRouter para consistencia)
   * @returns {Object}
   */
  getDefaultActivationRules() {
    return {
      '00-idea': { activationRule: 'always', prerequisites: [] },
      '01-idd': { activationRule: 'conditional', prerequisites: ['00-idea'] },
      '02-prd': { activationRule: 'conditional', prerequisites: ['01-idd'] },
      '03-brd': { activationRule: 'conditional', prerequisites: ['01-idd'] },
      '04-rdd': { activationRule: 'conditional', prerequisites: ['02-prd', '03-brd'] },
      '05-dmd': { activationRule: 'conditional', prerequisites: ['04-rdd'] },
      '06-design': { activationRule: 'conditional', prerequisites: ['05-dmd'] },
      '07-dbd': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '08-api': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '09-uid': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '10-tmd': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '11-srd': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '12-iam': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '13-sad': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '14-agd': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '15-aad': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '16-aid': { activationRule: 'conditional', prerequisites: ['06-design'] },
      '17-tasks': { activationRule: 'conditional', prerequisites: ['06-design', '09-uid', '10-tmd', '11-srd'] },
      '18-sod': { activationRule: 'conditional', prerequisites: ['17-tasks'] },
      '19-tdd': { activationRule: 'conditional', prerequisites: ['17-tasks'] },
      '20-atd': { activationRule: 'conditional', prerequisites: ['19-tdd'] },
      '21-std': { activationRule: 'conditional', prerequisites: ['19-tdd'] },
      '22-vsd': { activationRule: 'conditional', prerequisites: ['19-tdd'] },
      '23-dep': { activationRule: 'conditional', prerequisites: ['18-sod', '20-atd', '21-std', '22-vsd'] },
      '24-mdd': { activationRule: 'conditional', prerequisites: ['23-dep'] },
      '25-aed': { activationRule: 'conditional', prerequisites: ['24-mdd'] },
      '26-chd': { activationRule: 'conditional', prerequisites: ['24-mdd'] },
      '27-ced': { activationRule: 'on-demand', prerequisites: [] },
      '28-cca': { activationRule: 'on-demand', prerequisites: [] }
    };
  }

  /**
   * Valida un grafo y lanza error si hay ciclos con mensaje descriptivo
   * @param {Map<string, Set<string>>} graph
   * @param {string} context - Contexto para el mensaje de error (ej: 'phase registration', 'field config')
   * @throws {Error} Si se detectan ciclos
   */
  validateAndThrow(graph, context = 'graph') {
    const { hasCycles, cycles } = this.detectCycles(graph);

    if (hasCycles) {
      const cycleDescriptions = cycles.map(cycle => cycle.join(' → ')).join('; ');
      throw new Error(
        `Ciclo detectado en ${context}: ${cycleDescriptions}. ` +
        `Esto causaría bucles infinitos en la evaluación de dependencias.`
      );
    }
  }
}

export default CircularDetector;