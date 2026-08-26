/**
 * FeatureFlag — Sistema de feature flags para ecosistema-idea-mvp
 * ES Module vanilla, export class FeatureFlag
 * Lee: localStorage.ECOSISTEMA_NEW_ENGINE, .env (build-time), window.ECOSISTEMA_NEW_ENGINE
 * Default: true (nuevo motor)
 */
export class FeatureFlag {
  constructor() {
    this.flags = new Map();
    this.initialized = false;
    this.loadFlags();
  }

  /**
   * Carga flags desde múltiples fuentes con prioridad:
   * 1. window.ECOSISTEMA_NEW_ENGINE (runtime override)
   * 2. localStorage.ECOSISTEMA_NEW_ENGINE (persistido por usuario)
   * 3. import.meta.env.ECOSISTEMA_NEW_ENGINE (build-time, Vite) / process.env (Node)
   * 4. Default: true
   */
  loadFlags() {
    // Flag principal: new-engine
    const newEngineValue = this.resolveFlagValue('new-engine', 'ECOSISTEMA_NEW_ENGINE', true);
    this.flags.set('new-engine', newEngineValue);

    // Flags adicionales — en Netlify van todos activos (aunque UI oculta)
    const additionalFlags = [
      { name: 'md-generation', env: 'ECOSISTEMA_MD_GENERATION', default: true },
      { name: 'high-contrast', env: 'ECOSISTEMA_HIGH_CONTRAST', default: true },
      { name: 'file-upload', env: 'ECOSISTEMA_FILE_UPLOAD', default: true },
      { name: 'demo-unlock-all', env: 'ECOSISTEMA_DEMO_UNLOCK_ALL', default: true }
    ];

    for (const flag of additionalFlags) {
      const value = this.resolveFlagValue(flag.name, flag.env, flag.default);
      this.flags.set(flag.name, value);
    }

    // Upgrade: si el usuario tenía "false" guardado con el default viejo, en Netlify queremos true
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      const isNetlify = host.includes('netlify') || host.includes('netlify.app') || host === '';
      const forceTrue = ['md-generation', 'file-upload', 'high-contrast', 'demo-unlock-all'];
      for (const fname of forceTrue) {
        const sk = `ECOSISTEMA_${fname.toUpperCase().replace(/-/g, '_')}`;
        const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(sk) : null;
        // En Netlify o si el flag estaba en false por default viejo, forzar a true
        if (stored === 'false' && (isNetlify || this.flags.get(fname) === true)) {
          this.flags.set(fname, true);
          try { localStorage.setItem(sk, 'true'); } catch(e) {}
        }
      }
      // Asegurar que new-engine siempre quede true (no más deadlock)
      const newEngineStored = typeof localStorage !== 'undefined' ? localStorage.getItem('ECOSISTEMA_NEW_ENGINE') : null;
      if (newEngineStored === 'false') {
        this.flags.set('new-engine', true);
        try { localStorage.setItem('ECOSISTEMA_NEW_ENGINE', 'true'); } catch(e) {}
      }
    } catch(e) {}

    this.initialized = true;
  }

  /**
   * Resuelve el valor de un flag desde las fuentes en orden de prioridad
   * @param {string} flagName - Nombre interno del flag
   * @param {string} envVar - Nombre de la variable de entorno
   * @param {boolean} defaultValue - Valor por defecto
   * @returns {boolean}
   */
  resolveFlagValue(flagName, envVar, defaultValue) {
    // 1. Runtime override via window (highest priority)
    const windowKey = `ECOSISTEMA_${flagName.toUpperCase().replace(/-/g, '_')}`;
    if (typeof window !== 'undefined' && window[windowKey] !== undefined) {
      return this.parseBoolean(window[windowKey]);
    }

    // 2. localStorage (user preference)
    const storageKey = `ECOSISTEMA_${flagName.toUpperCase().replace(/-/g, '_')}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        return this.parseBoolean(stored);
      }
    } catch (e) {
      // Ignorar errores de localStorage (private mode, quota, etc.)
    }

    // 3. Build-time env (Vite: import.meta.env, Node: process.env)
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[envVar] !== undefined) {
      return this.parseBoolean(import.meta.env[envVar]);
    }

    // 4. Default
    return defaultValue;
  }

  /**
   * Parsea un valor a boolean de forma flexible
   * @param {any} value
   * @returns {boolean}
   */
  parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
    }
    return Boolean(value);
  }

  /**
   * Verifica si un flag está habilitado
   * @param {string} flagName - Nombre del flag (ej: 'new-engine', 'md-generation')
   * @returns {boolean}
   */
  isEnabled(flagName) {
    if (!this.initialized) this.loadFlags();
    return this.flags.get(flagName) ?? false;
  }

  /**
   * Alias para isEnabled
   * @param {string} flagName
   * @returns {boolean}
   */
  get(flagName) {
    return this.isEnabled(flagName);
  }

  /**
   * Establece un flag y persiste en localStorage
   * @param {string} flagName
   * @param {boolean} value
   */
  setFlag(flagName, value) {
    const normalizedName = flagName.toLowerCase();
    const storageKey = `ECOSISTEMA_${normalizedName.toUpperCase().replace(/-/g, '_')}`;

    this.flags.set(normalizedName, Boolean(value));

    try {
      localStorage.setItem(storageKey, String(Boolean(value)));
    } catch (e) {
      console.warn('[FeatureFlag] No se pudo persistir en localStorage:', e);
    }

    // Disparar evento para notificar cambios
    window.dispatchEvent(new CustomEvent('feature-flag:change', {
      detail: { flag: normalizedName, value: Boolean(value) }
    }));

    // Ejecutar callbacks onChange
    this.changeListeners?.get(normalizedName)?.forEach(cb => cb(Boolean(value)));
  }

  /**
   * Suscribe a cambios de un flag específico
   * @param {string} flagName
   * @param {Function} callback - callback(newValue)
   * @returns {Function} unsubscribe
   */
  onChange(flagName, callback) {
    this.changeListeners = this.changeListeners || new Map();
    const normalizedName = flagName.toLowerCase();
    const listeners = this.changeListeners.get(normalizedName) || new Set();
    listeners.add(callback);
    this.changeListeners.set(normalizedName, listeners);
    return () => listeners.delete(callback);
  }

  /**
   * Obtiene todos los flags como objeto plano
   * @returns {Object}
   */
  getAllFlags() {
    if (!this.initialized) this.loadFlags();
    const result = {};
    for (const [key, value] of this.flags.entries()) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Resetea todos los flags a sus valores por defecto
   */
  resetToDefaults() {
    const defaults = {
      'new-engine': true,
      'md-generation': false,
      'high-contrast': false,
      'file-upload': false,
      'demo-unlock-all': false
    };

    for (const [key, value] of Object.entries(defaults)) {
      this.setFlag(key, value);
    }
  }

  /**
   * Verifica si el nuevo motor está habilitado (shortcut)
   * @returns {boolean}
   */
  isNewEngineEnabled() {
    return this.isEnabled('new-engine');
  }
}

/**
 * Instancia singleton por defecto
 */
export const featureFlag = new FeatureFlag();

export default FeatureFlag;