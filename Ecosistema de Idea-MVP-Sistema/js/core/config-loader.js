import { CircularDetector } from './circular-detector.js';

/**
 * ConfigLoader — Carga, cachea y valida configuraciones de fases
 * ES Module vanilla, sin dependencias externas
 */
export class ConfigLoader {
  constructor() {
    this.cache = new Map();
    this.schema = null;
    // Resolve paths relative to THIS script (js/core/) using import.meta.url
    // so fetch() works regardless of where the server root is.
    // NOTE: two levels up (js/core/ -> ecosystem root), not one.
    const scriptDir = new URL('.', import.meta.url).href;
    const ecosystemRoot = new URL('../..', scriptDir).href;
    this.schemaUrl = ecosystemRoot + 'js/core/phase-config-schema.json';
    this.baseConfigUrl = ecosystemRoot + 'configs/phases/';
    this.circularDetector = new CircularDetector();
  }

  /**
   * Carga el schema JSON una sola vez
   */
  async loadSchema() {
    if (this.schema) return this.schema;
    try {
      const res = await fetch(this.schemaUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} loading schema`);
      this.schema = await res.json();
      return this.schema;
    } catch (err) {
      console.error('[ConfigLoader] Failed to load schema:', err);
      throw new Error('No se pudo cargar el schema de validación');
    }
  }

  /**
   * Valida un objeto de configuración contra el schema
   * Implementación ligera sin AJV (vanilla)
   */
  validate(config) {
    const errors = [];
    const schema = this.schema;

    if (!schema) {
      errors.push('Schema no cargado');
      return { valid: false, errors };
    }

    // Validar campos requeridos del objeto raíz
    const requiredRoot = ['phaseId', 'phaseName', 'phaseGroup', 'order', 'schemaVersion', 'sections', 'fields'];
    for (const field of requiredRoot) {
      if (!(field in config)) {
        errors.push(`Campo requerido faltante: ${field}`);
      }
    }

    // Validar phaseId pattern
    if (config.phaseId && !/^[a-z0-9-]+$/.test(config.phaseId)) {
      errors.push('phaseId debe ser kebab-case (solo minúsculas, números y guiones)');
    }

    // Validar phaseGroup enum
    const validGroups = ['idd', 'rdd', 'mvp', 'validacion', 'investigacion', 'diseno', 'tecnico', 'negocio', 'marketing', 'legal', 'operaciones', 'finanzas'];
    if (config.phaseGroup && !validGroups.includes(config.phaseGroup)) {
      errors.push(`phaseGroup inválido: ${config.phaseGroup}`);
    }

    // Validar order
    if (typeof config.order !== 'number' || config.order < 0) {
      errors.push('order debe ser un número entero >= 0');
    }

    // Validar sections
    if (config.sections && typeof config.sections === 'object') {
      for (const [sectionId, section] of Object.entries(config.sections)) {
        if (!section.title || !section.description) {
          errors.push(`Sección ${sectionId}: faltan title o description`);
        }
      }
    } else {
      errors.push('sections debe ser un objeto');
    }

    // Validar fields array
    if (!Array.isArray(config.fields) || config.fields.length === 0) {
      errors.push('fields debe ser un array no vacío');
    } else {
      const fieldIds = new Set();
      const sectionIds = new Set(Object.keys(config.sections || {}));

      for (let i = 0; i < config.fields.length; i++) {
        const field = config.fields[i];
        const prefix = `fields[${i}]`;

        // id requerido
        if (!field.id || !/^[a-z][a-z0-9_]*$/.test(field.id)) {
          errors.push(`${prefix}.id: requerido, snake_case`);
        } else if (fieldIds.has(field.id)) {
          errors.push(`${prefix}.id: duplicado ${field.id}`);
        } else {
          fieldIds.add(field.id);
        }

        // label requerido
        if (!field.label || field.label.length > 200) {
          errors.push(`${prefix}.label: requerido, máx 200 chars`);
        }

        // type requerido y enum
        const validTypes = ['text', 'email', 'textarea', 'radio', 'checkbox', 'select', 'file', 'honeypot', 'hidden', 'readonly'];
        if (!validTypes.includes(field.type)) {
          errors.push(`${prefix}.type: inválido (${field.type})`);
        }

        // sectionId si existe debe estar en sections
        if (field.sectionId && !sectionIds.has(field.sectionId)) {
          errors.push(`${prefix}.sectionId: no existe en sections (${field.sectionId})`);
        }

        // Validaciones por tipo
        if (['radio', 'select'].includes(field.type) || (field.type === 'checkbox' && field.multiple)) {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            errors.push(`${prefix}: type ${field.type} requiere options[] no vacío`);
          } else {
            for (let j = 0; j < field.options.length; j++) {
              const opt = field.options[j];
              // Los placeholders deshabilitados (value vacío, ej: "Selecciona...") son válidos
              const isPlaceholder = opt.disabled === true && opt.value === '';
              if (!isPlaceholder && (!opt.value || !opt.label)) {
                errors.push(`${prefix}.options[${j}]: requiere value y label`);
              }
            }
          }
        }

        if (field.type === 'file') {
          if (typeof field.maxFiles !== 'number' || field.maxFiles < 1) {
            errors.push(`${prefix}.maxFiles: requerido, entero >= 1`);
          }
          if (!Array.isArray(field.allowedTypes) || field.allowedTypes.length === 0) {
            errors.push(`${prefix}.allowedTypes: requerido, array no vacío`);
          } else {
            for (const ext of field.allowedTypes) {
              if (!/^\..+/.test(ext)) {
                errors.push(`${prefix}.allowedTypes: extensión inválida "${ext}" (debe empezar con .)`);
              }
            }
          }
        }

        // validación de validation object
        if (field.validation) {
          if (typeof field.validation.minLength === 'number' && field.validation.minLength < 0) {
            errors.push(`${prefix}.validation.minLength: >= 0`);
          }
          if (typeof field.validation.maxLength === 'number' && field.validation.maxLength < 0) {
            errors.push(`${prefix}.validation.maxLength: >= 0`);
          }
        }

        // showWhen - validar referencia a campo existente
        if (field.showWhen) {
          const sw = field.showWhen;
          if (sw.field && !fieldIds.has(sw.field)) {
            errors.push(`${prefix}.showWhen.field: referencia a campo inexistente "${sw.field}"`);
          }
        }
      }
    }

    // Validar webhook
    if (config.webhook) {
      if (!config.webhook.url || !/^https?:\/\//.test(config.webhook.url)) {
        errors.push('webhook.url: requerida, URI válida');
      }
      if (!config.webhook.username) {
        errors.push('webhook.username: requerido');
      }
      if (!config.webhook.avatarUrl || !/^https?:\/\//.test(config.webhook.avatarUrl)) {
        errors.push('webhook.avatarUrl: requerido, URI válida');
      }
    }

    // Validar showWhen para detectar ciclos en configuración individual
    if (Array.isArray(config.fields) && config.fields.length > 0) {
      const graph = this.circularDetector.buildConfigGraph(config.fields);
      const { hasCycles, cycles } = this.circularDetector.detectCycles(graph);
      if (hasCycles) {
        errors.push(`Dependencias circulares detectadas en showWhen: ${cycles.map(c => c.join(' → ')).join('; ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Carga una configuración de fase por ID
   * Usa cache en memoria (Map)
   */
  async load(phaseId) {
    // Normalizar phaseId
    const normalizedId = phaseId.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Verificar cache
    if (this.cache.has(normalizedId)) {
      return this.cache.get(normalizedId);
    }

    // Cargar schema si no está cargado
    if (!this.schema) {
      await this.loadSchema();
    }

    // Fetch config
    const url = `${this.baseConfigUrl}${normalizedId}.json`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} loading ${normalizedId}`);
      }
      const config = await res.json();

      // Validar
      const validation = this.validate(config);
      if (!validation.valid) {
        throw new Error(`Config inválida para ${normalizedId}: ${validation.errors.join('; ')}`);
      }

      // Cachear
      this.cache.set(normalizedId, config);
      return config;
    } catch (err) {
      console.error(`[ConfigLoader] Error loading ${normalizedId}:`, err);
      throw new Error(`No se pudo cargar la configuración de ${normalizedId}: ${err.message}`);
    }
  }

  /**
   * Obtiene el schema cargado
   */
  getSchema() {
    return this.schema;
  }

  /**
   * Limpia el cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Precarga múltiples configs
   */
  async preload(phaseIds) {
    await Promise.all(phaseIds.map(id => this.load(id)));
  }

  /**
   * Carga el registry de fases (index.json con metadatos de todas las fases)
   * Detecta phaseId duplicados y phaseId+variant duplicados en variants
   */
  async loadRegistry() {
    const url = `${this.baseConfigUrl}index.json`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        // Si no existe index.json, construir registry escaneando archivos conocidos
        return this.buildDefaultRegistry();
      }
      const registry = await res.json();

      // Detectar phaseId duplicados en phases
      if (registry.phases && Array.isArray(registry.phases)) {
        const phaseIds = new Set();
        const duplicates = [];
        for (const phase of registry.phases) {
          if (phaseIds.has(phase.phaseId)) {
            duplicates.push(phase.phaseId);
          } else {
            phaseIds.add(phase.phaseId);
          }
        }
        if (duplicates.length > 0) {
          throw new Error(`Phase IDs duplicados en registry.phases: ${duplicates.join(', ')}`);
        }
      }

      // Detectar phaseId+variant duplicados en variants
      if (registry.variants && Array.isArray(registry.variants)) {
        const variantKeys = new Set();
        const duplicates = [];
        for (const variant of registry.variants) {
          const key = `${variant.phaseId}::${variant.variant}`;
          if (variantKeys.has(key)) {
            duplicates.push(key);
          } else {
            variantKeys.add(key);
          }
        }
        if (duplicates.length > 0) {
          throw new Error(`Phase ID + Variant duplicados en registry.variants: ${duplicates.join(', ')}`);
        }
      }

      // Detectar ciclos en el grafo de fases del registry
      const graph = this.circularDetector.buildPhaseGraph(registry);
      const { hasCycles, cycles } = this.circularDetector.detectCycles(graph);
      if (hasCycles) {
        console.warn(`[ConfigLoader] Ciclos detectados en registry: ${cycles.map(c => c.join(' → ')).join('; ')}`);
      }

      return registry;
    } catch (err) {
      console.warn('[ConfigLoader] No registry index.json, using default:', err);
      return this.buildDefaultRegistry();
    }
  }

  /**
   * Carga config de fase con variante opcional
   */
  async loadPhaseConfig(phaseId, variant) {
    // Para MVP: variant se ignora, se carga la config base
    // Futuro: si variant existe, buscar phaseId-variant.json
    return this.load(phaseId);
  }

  /**
   * Registry por defecto para fases conocidas
   * Formato compatible con index.json: { phases: [{ phaseId, ... }] }
   */
  buildDefaultRegistry() {
    const phases = [
      { phaseId: '00-idea', phaseName: 'Encuesta de Génesis', phaseGroup: 'idd', order: 0 },
      { phaseId: '01-idd', phaseName: 'Idea Design Document', phaseGroup: 'idd', order: 1 },
      { phaseId: '02-prd', phaseName: 'Product Requirements', phaseGroup: 'rdd', order: 2 },
      { phaseId: '03-brd', phaseName: 'Business Requirements', phaseGroup: 'rdd', order: 3 },
      { phaseId: '04-rdd', phaseName: 'Requirements Design', phaseGroup: 'rdd', order: 4 },
      { phaseId: '05-dmd', phaseName: 'Domain Model', phaseGroup: 'diseno', order: 5 },
      { phaseId: '06-design', phaseName: 'Technical Design', phaseGroup: 'diseno', order: 6 },
      { phaseId: '17-tasks', phaseName: 'Task Planning', phaseGroup: 'mvp', order: 17 },
      { phaseId: '18-sod', phaseName: 'Orchestration', phaseGroup: 'mvp', order: 18 },
      { phaseId: '19-tdd', phaseName: 'TDD Implementation', phaseGroup: 'mvp', order: 19 },
      { phaseId: '20-atd', phaseName: 'Acceptance Tests', phaseGroup: 'validacion', order: 20 },
      { phaseId: '23-dep', phaseName: 'Deployment', phaseGroup: 'operaciones', order: 23 },
      { phaseId: '24-mdd', phaseName: 'Monitoring', phaseGroup: 'operaciones', order: 24 },
      { phaseId: '25-aed', phaseName: 'Architecture Evolution', phaseGroup: 'tecnico', order: 25 },
      { phaseId: '27-ced', phaseName: 'Cognitive Explanation', phaseGroup: 'marketing', order: 27 }
    ];
    return { version: '1.0', phases };
  }
}

/**
 * Instancia singleton por defecto
 */
export const configLoader = new ConfigLoader();