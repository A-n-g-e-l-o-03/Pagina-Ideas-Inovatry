/**
 * StateManager — Persistencia avanzada (localStorage + IndexedDB), export/import JSON/MD, cross-tab sync, quota management
 * ES Module vanilla, export class StateManager
 */

const DB_NAME = 'ecosystem-db';
const DB_VERSION = 1;
const LOCAL_STORAGE_PREFIX = 'ecosistema:v1:';

// Quota thresholds
const QUOTA_WARNING_THRESHOLD = 0.8;
const QUOTA_CRITICAL_THRESHOLD = 0.95;

// Private mode detection
let fallbackStorage = new Map();

/**
 * Error personalizado para cuota excedida
 */
export class QuotaExceededError extends Error {
  constructor(message, usage, limit) {
    super(message);
    this.name = 'QuotaExceededError';
    this.usage = usage;
    this.limit = limit;
  }
}

/**
 * Mapeo de claves a estrategia de almacenamiento
 * localStorage: rápido, <5MB, phase states, form answers, theme, user prefs
 * IndexedDB: grande, files, webhook queue, export snapshots
 */
const STORAGE_STRATEGY = {
  // localStorage keys
  'phase-states': 'localStorage',
  'theme': 'localStorage',
  'user-prefs': 'localStorage',
  'form-': 'localStorage',           // prefix para ecosystem-form-*
  'completed-phases': 'localStorage',
  'webhook-queue': 'localStorage',   // legacy compat, will migrate to IDB

  // IndexedDB stores
  'files': 'indexedDB',
  'webhookQueue': 'indexedDB',
  'snapshots': 'indexedDB'
};

/**
 * Determina dónde almacenar una clave
 * @param {string} key
 * @returns {'localStorage' | 'indexedDB'}
 */
function decideStorage(key) {
  if (key.startsWith('form-') || key === 'phase-states' || key === 'theme' ||
      key === 'user-prefs' || key === 'completed-phases' || key === 'webhook-queue') {
    return 'localStorage';
  }
  if (key === 'files' || key === 'webhookQueue' || key === 'snapshots' || key.startsWith('file-')) {
    return 'indexedDB';
  }
  // Default: localStorage for small keys
  return 'localStorage';
}

/**
 * Estima el tamaño en bytes de un valor
 * @param {any} value
 * @returns {number} bytes estimados
 */
function estimateSize(value) {
  try {
    const json = JSON.stringify(value);
    const blob = new Blob([json], { type: 'application/json' });
    return blob.size;
  } catch (e) {
    // Fallback: longitud de string * 2 (aprox UTF-16)
    return JSON.stringify(value).length * 2;
  }
}

/**
 * Detecta si estamos en modo privado (incógnito)
 * El resultado se cachea POR INSTANCIA (no module-level) para que
 * cada StateManager evalúe su propio entorno al inicializar.
 * @param {StateManager} manager - Instancia que solicita la detección
 * @returns {Promise<boolean>}
 */
async function detectPrivateMode(manager) {
  if (manager._privateModeChecked) return manager.privateMode;

  try {
    // Intentar escribir en localStorage
    const testKey = '__private_mode_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);

    // Si navigator.storage está disponible, verificar cuota
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota !== undefined && estimate.usage !== undefined) {
        // En modo privado, la quota suele ser muy baja (< 5MB)
        if (estimate.quota < 5 * 1024 * 1024) {
          manager._privateModeChecked = true;
          return true;
        }
      }
    }

    manager._privateModeChecked = true;
    return false;
  } catch (e) {
    // Error al escribir = modo privado o quota excedida
    manager._privateModeChecked = true;
    return true;
  }
}

export class StateManager {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.subscribers = new Map(); // key -> Set<callback>
    this.broadcastChannel = null;
    this.listeners = new Map();   // event -> Set<callback>
    this.privateMode = false;
    this.fallbackStorage = new Map();
    this.quotaCheckTimer = null;
    this._quotaWarned = false;
    this._quotaCriticalWarned = false;
  }

  /**
   * Inicializa IndexedDB y BroadcastChannel para cross-tab sync
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;

    // 1. Detectar modo privado
    this.privateMode = await detectPrivateMode(this);
    if (this.privateMode) {
      console.warn('[StateManager] Modo privado detectado, usando fallback storage en memoria');
      this.emit('private-mode-detected');
    }

    // 2. IndexedDB (solo si no estamos en modo privado)
    if (!this.privateMode) {
      try {
        this.db = await this.openDatabase();
      } catch (e) {
        console.warn('[StateManager] IndexedDB no disponible, usando solo localStorage:', e);
      }
    }

    // 3. BroadcastChannel para cross-tab sync (solo si no private mode)
    if (!this.privateMode) {
      try {
        this.broadcastChannel = new BroadcastChannel('ecosystem-sync');
        this.broadcastChannel.onmessage = (event) => this.handleBroadcastMessage(event);
      } catch (e) {
        console.warn('[StateManager] BroadcastChannel no disponible, fallback a storage event');
        window.addEventListener('storage', (e) => this.handleStorageEvent(e));
      }
    } else {
      // En modo fallback, no hay BroadcastChannel - solo memoria local
      console.log('[StateManager] Modo fallback: cross-tab sync deshabilitado');
    }

    // 4. Storage event fallback (para tabs sin BroadcastChannel)
    window.addEventListener('storage', (e) => this.handleStorageEvent(e));

    // 5. Iniciar verificación periódica de cuota
    this.startQuotaMonitoring();

    this.initialized = true;
    console.log('[StateManager] Inicializado con dual storage + cross-tab sync + quota management');
  }

  /**
   * Inicia monitoreo periódico de cuota de localStorage
   */
  startQuotaMonitoring() {
    if (this.quotaCheckTimer) clearInterval(this.quotaCheckTimer);

    this.quotaCheckTimer = setInterval(async () => {
      if (this.privateMode) return;

      const quota = await this.checkQuota(0);
      if (quota.warning && !this._quotaWarned) {
        this._quotaWarned = true;
        this.emit('quota:warning', quota);
        this.showQuotaBanner('warning', quota);
      } else if (quota.critical && !this._quotaCriticalWarned) {
        this._quotaCriticalWarned = true;
        this.emit('quota:critical', quota);
        this.showQuotaBanner('critical', quota);
        // Auto-cleanup en critical
        await this.cleanupOldCache();
      } else if (!quota.warning) {
        this._quotaWarned = false;
        this._quotaCriticalWarned = false;
        this.hideQuotaBanner();
      }
    }, 30000); // Cada 30 segundos
  }

  /**
   * Limpia caché antigua automáticamente cuando la cuota es crítica
   * @returns {Promise<number>} bytes liberados
   */
  async cleanupOldCache() {
    let freedBytes = 0;
    const now = Date.now();

    // 1. Limpiar webhook-queue > 24h
    if (!this.privateMode && this.db) {
      try {
        const queue = await this.getAllIndexedDB('webhookQueue');
        const oneDay = 24 * 60 * 60 * 1000;
        for (const item of queue) {
          if (item.timestamp && (now - item.timestamp) > oneDay) {
            const size = estimateSize(item);
            await this.deleteIndexedDB('webhookQueue', item.id);
            freedBytes += size;
          }
        }
      } catch (e) {
        console.warn('[StateManager] Error limpiando webhookQueue:', e);
      }
    }

    // 2. Limpiar ecosystem-form-* de fases completed > 30 días
    if (!this.privateMode) {
      try {
        const keysToDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(LOCAL_STORAGE_PREFIX + 'form-')) {
            const value = localStorage.getItem(key);
            if (value) {
              try {
                const parsed = JSON.parse(value);
                // Verificar si tiene timestamp o metadata de fase completed
                const phaseId = key.replace(LOCAL_STORAGE_PREFIX + 'form-', '');
                const phaseStates = this.getLocal('phase-states', {});
                const phaseState = phaseStates[phaseId];
                
                if (phaseState === 'completed' && parsed._completedAt) {
                  const daysSinceCompleted = (now - parsed._completedAt) / (1000 * 60 * 60 * 24);
                  if (daysSinceCompleted > 30) {
                    keysToDelete.push(key);
                    freedBytes += value.length * 2;
                  }
                }
              } catch (e) {
                // Ignorar parse errors
              }
            }
          }
        }
        keysToDelete.forEach(k => localStorage.removeItem(k));
      } catch (e) {
        console.warn('[StateManager] Error limpiando form data:', e);
      }
    } else {
      // Fallback storage cleanup
      for (const [key, value] of this.fallbackStorage.entries()) {
        if (key.startsWith(LOCAL_STORAGE_PREFIX + 'form-')) {
          try {
            const phaseId = key.replace(LOCAL_STORAGE_PREFIX + 'form-', '');
            const phaseStates = this.getLocal('phase-states', {});
            const phaseState = phaseStates[phaseId];
            
            if (phaseState === 'completed' && value._completedAt) {
              const daysSinceCompleted = (Date.now() - value._completedAt) / (1000 * 60 * 60 * 24);
              if (daysSinceCompleted > 30) {
                this.fallbackStorage.delete(key);
                freedBytes += estimateSize(value);
              }
            }
          } catch (e) {
            // Ignorar
          }
        }
      }
    }

    if (freedBytes > 0) {
      console.log(`[StateManager] Auto-cleanup: freed ${this.formatBytes(freedBytes)}`);
      this.emit('cleanup:done', { freedBytes });
    }

    return freedBytes;
  }

  /**
   * Verifica la cuota de localStorage
   * @param {number} estimatedBytes - Bytes estimados que se van a agregar
   * @returns {Promise<{ok: boolean, usage: number, limit: number, warning: boolean, critical: boolean, percentage: number}>}
   */
  async checkQuota(estimatedBytes = 0) {
    if (this.privateMode) {
      return { ok: true, usage: 0, limit: Infinity, warning: false, critical: false, percentage: 0 };
    }

    try {
      let usage = 0;
      let limit = 5 * 1024 * 1024; // 5MB default estimate

      // Usar navigator.storage.estimate si está disponible
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage !== undefined && estimate.quota !== undefined) {
          usage = estimate.usage;
          limit = estimate.quota;
        }
      } else {
        // Fallback: calcular uso actual de localStorage con nuestro prefijo
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) {
            usage += localStorage.getItem(key).length * 2; // UTF-16 approx
          }
        }
      }

      const projectedUsage = usage + estimatedBytes;
      const usageRatio = projectedUsage / limit;
      const percentage = Math.min(100, Math.round(usageRatio * 100));

      return {
        ok: usageRatio < 1,
        usage: projectedUsage,
        limit,
        warning: usageRatio >= QUOTA_WARNING_THRESHOLD,
        critical: usageRatio >= QUOTA_CRITICAL_THRESHOLD,
        percentage
      };
    } catch (e) {
      console.warn('[StateManager] Error verificando cuota:', e);
      return { ok: true, usage: 0, limit: Infinity, warning: false, critical: false, percentage: 0 };
    }
  }

  /**
   * Estima el tamaño de un valor
   * @param {any} value
   * @returns {number} bytes
   */
  estimateSize(value) {
    return estimateSize(value);
  }

  // ============================================================
  // LOCALSTORAGE WRAPPERS (con fallback para modo privado)
  // ============================================================

  /**
   * Guarda en localStorage con prefijo (o fallback en memoria)
   * @param {string} key
   * @param {any} value
   */
  setLocal(key, value) {
    const fullKey = LOCAL_STORAGE_PREFIX + key;

    if (this.privateMode) {
      this.fallbackStorage.set(fullKey, value);
      this.notifyLocalSubscribers(key, value);
      this.broadcastChange(key, value, 'localStorage');
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(fullKey, serialized);
      this.notifyLocalSubscribers(key, value);
      this.broadcastChange(key, value, 'localStorage');
    } catch (e) {
      // Si falla por quota, activar modo fallback
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('[StateManager] Quota excedida, cambiando a fallback storage');
        this.privateMode = true;
        this.fallbackStorage.set(fullKey, value);
        this.emit('private-mode-detected');
        this.showPrivateModeBanner();
        this.notifyLocalSubscribers(key, value);
        this.broadcastChange(key, value, 'localStorage');
      } else {
        console.warn('[StateManager] Error guardando en localStorage:', key, e);
      }
    }
  }

  /**
   * Lee de localStorage con prefijo (o fallback en memoria)
   * @param {string} key
   * @param {any} defaultValue
   * @returns {any}
   */
  getLocal(key, defaultValue = null) {
    const fullKey = LOCAL_STORAGE_PREFIX + key;

    if (this.privateMode) {
      return this.fallbackStorage.has(fullKey) ? this.fallbackStorage.get(fullKey) : defaultValue;
    }

    try {
      const item = localStorage.getItem(fullKey);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.warn('[StateManager] Error leyendo localStorage:', key, e);
      return defaultValue;
    }
  }

  /**
   * Borra de localStorage (o fallback en memoria)
   * @param {string} key
   */
  deleteLocal(key) {
    const fullKey = LOCAL_STORAGE_PREFIX + key;

    if (this.privateMode) {
      this.fallbackStorage.delete(fullKey);
      this.notifyLocalSubscribers(key, undefined);
      this.broadcastChange(key, undefined, 'localStorage');
      return;
    }

    localStorage.removeItem(fullKey);
    this.notifyLocalSubscribers(key, undefined);
    this.broadcastChange(key, undefined, 'localStorage');
  }

  // ============================================================
  // INDEXEDDB WRAPPERS
  // ============================================================

  /**
   * Guarda en IndexedDB
   * @param {string} storeName - 'files' | 'webhookQueue' | 'snapshots'
   * @param {Object} data
   * @returns {Promise<number>} ID del registro
   */
  async setIndexedDB(storeName, data) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add({ ...data, timestamp: Date.now() });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtiene un registro de IndexedDB por ID
   * @param {string} storeName
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  async getIndexedDB(storeName, id) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtiene todos los registros de un store
   * @param {string} storeName
   * @returns {Promise<Array<Object>>}
   */
  async getAllIndexedDB(storeName) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtiene registros por índice
   * @param {string} storeName
   * @param {string} indexName
   * @param {any} value
   * @returns {Promise<Array<Object>>}
   */
  async getByIndex(storeName, indexName, value) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Actualiza un registro en IndexedDB
   * @param {string} storeName
   * @param {Object} data - debe incluir id
   * @returns {Promise<void>}
   */
  async updateIndexedDB(storeName, data) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Borra un registro de IndexedDB
   * @param {string} storeName
   * @param {number} id
   * @returns {Promise<void>}
   */
  async deleteIndexedDB(storeName, id) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Limpia todo un store de IndexedDB
   * @param {string} storeName
   * @returns {Promise<void>}
   */
  async clearIndexedDB(storeName) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================
  // HIGH-LEVEL API (auto-detecta storage + quota check)
  // ============================================================

  /**
   * Guarda un valor (auto elige storage según la clave)
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    // Verificar cuota antes de guardar
    const estimatedBytes = this.estimateSize(value);
    const quota = await this.checkQuota(estimatedBytes);

    if (!quota.ok) {
      throw new QuotaExceededError(
        `Cuota de almacenamiento excedida. Uso: ${this.formatBytes(quota.usage)}/${this.formatBytes(quota.limit)}`,
        quota.usage,
        quota.limit
      );
    }

    if (quota.warning || quota.critical) {
      this.emit('quota:near-limit', quota);
    }

    const strategy = decideStorage(key);

    if (strategy === 'localStorage') {
      this.setLocal(key, value);
    } else {
      // Para IndexedDB, usamos un store genérico 'keyvalue' o el store específico
      if (key.startsWith('file-')) {
        await this.setIndexedDB('files', { key, ...value });
      } else if (key === 'webhookQueue') {
        await this.clearIndexedDB('webhookQueue');
        for (const item of value) {
          await this.setIndexedDB('webhookQueue', item);
        }
      } else {
        await this.setIndexedDB('snapshots', { key, value });
      }
    }
  }

  /**
   * Obtiene un valor (auto elige storage según la clave)
   * @param {string} key
   * @param {any} defaultValue
   * @returns {Promise<any>}
   */
  async get(key, defaultValue = null) {
    const strategy = decideStorage(key);

    if (strategy === 'localStorage') {
      return this.getLocal(key, defaultValue);
    } else {
      if (key.startsWith('file-')) {
        const results = await this.getByIndex('files', 'phaseId', key.replace('file-', ''));
        return results.length ? results : defaultValue;
      }
      if (key === 'webhookQueue') {
        return await this.getAllIndexedDB('webhookQueue');
      }
      // Buscar en snapshots
      const snapshots = await this.getAllIndexedDB('snapshots');
      const found = snapshots.find(s => s.key === key);
      return found ? found.value : defaultValue;
    }
  }

  /**
   * Borra una clave (ambos storages por si acaso)
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    this.deleteLocal(key);

    if (key.startsWith('file-')) {
      const results = await this.getByIndex('files', 'phaseId', key.replace('file-', ''));
      for (const item of results) {
        await this.deleteIndexedDB('files', item.id);
      }
    }
  }

  /**
   * Limpia TODO (localStorage + IndexedDB + fallback)
   * @returns {Promise<void>}
   */
  async clear() {
    // localStorage: borrar todas las keys con prefijo
    if (!this.privateMode) {
      const keysToDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(k => localStorage.removeItem(k));
    }

    // Fallback storage
    this.fallbackStorage.clear();

    // IndexedDB: limpiar todos los stores
    if (this.db) {
      await this.clearIndexedDB('files');
      await this.clearIndexedDB('webhookQueue');
      await this.clearIndexedDB('snapshots');
    }

    // Notificar
    this.broadcastChange('*', null, 'clear');
    console.log('[StateManager] Estado completo limpiado');
  }

  /**
   * Limpia una fase específica
   * @param {string} phaseId
   * @returns {Promise<void>}
   */
  async clearPhase(phaseId) {
    const formKey = `form-${phaseId}`;
    this.deleteLocal(formKey);

    // Limpiar archivos de la fase
    if (this.db) {
      const files = await this.getByIndex('files', 'phaseId', phaseId);
      for (const file of files) {
        await this.deleteIndexedDB('files', file.id);
      }
    }

    this.broadcastChange(formKey, null, 'delete');
    console.log(`[StateManager] Fase limpiada: ${phaseId}`);
  }

  // ============================================================
  // EXPORT / IMPORT
  // ============================================================

  /**
   * Exporta TODO el estado como JSON (formato original)
   * @returns {Promise<Object>}
   */
  async exportAll() {
    const exportData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      phases: {},
      meta: {},
      files: [],
      webhookQueue: [],
      snapshots: []
    };

    // 1. Recopilar todas las claves localStorage con prefijo
    if (!this.privateMode) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) {
          const cleanKey = key.slice(LOCAL_STORAGE_PREFIX.length);
          try {
            const value = JSON.parse(localStorage.getItem(key));
            if (cleanKey.startsWith('form-')) {
              exportData.phases[cleanKey] = value;
            } else {
              exportData.meta[cleanKey] = value;
            }
          } catch (e) {
            console.warn('[StateManager] Error parseando export:', key, e);
          }
        }
      }
    } else {
      // Fallback storage
      for (const [key, value] of this.fallbackStorage.entries()) {
        const cleanKey = key.slice(LOCAL_STORAGE_PREFIX.length);
        if (cleanKey.startsWith('form-')) {
          exportData.phases[cleanKey] = value;
        } else {
          exportData.meta[cleanKey] = value;
        }
      }
    }

    // 2. Recopilar IndexedDB
    if (this.db) {
      exportData.files = await this.getAllIndexedDB('files');
      exportData.webhookQueue = await this.getAllIndexedDB('webhookQueue');
      exportData.snapshots = await this.getAllIndexedDB('snapshots');
    }

    return exportData;
  }

  /**
   * Exporta TODO el estado como Markdown (para documentación)
   * @returns {Promise<string>}
   */
  async exportMD() {
    const data = await this.exportAll();
    const lines = [];

    lines.push('# Ecosistema Idea-MVP — Exportación Completa');
    lines.push('');
    lines.push(`**Fecha:** ${new Date(data.timestamp).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}`);
    lines.push(`**Versión:** ${data.version}`);
    lines.push('');

    // Meta
    if (Object.keys(data.meta).length > 0) {
      lines.push('## Metadatos');
      lines.push('');
      for (const [key, value] of Object.entries(data.meta)) {
        lines.push(`### ${key}`);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(value, null, 2));
        lines.push('```');
        lines.push('');
      }
    }

    // Fases
    if (Object.keys(data.phases).length > 0) {
      lines.push('## Fases Completadas');
      lines.push('');

      for (const [phaseKey, phaseData] of Object.entries(data.phases)) {
        const phaseId = phaseKey.replace('form-', '');
        lines.push(`### ${phaseId.toUpperCase()}`);
        lines.push('');

        if (phaseData && typeof phaseData === 'object') {
          for (const [fieldId, value] of Object.entries(phaseData)) {
            lines.push(`#### ${fieldId}`);
            lines.push('');

            if (Array.isArray(value)) {
              lines.push(value.map(v => `- ${v}`).join('\n'));
            } else if (typeof value === 'object' && value !== null) {
              lines.push('```json');
              lines.push(JSON.stringify(value, null, 2));
              lines.push('```');
            } else {
              lines.push(String(value));
            }
            lines.push('');
          }
        }
      }
    }

    // Archivos
    if (data.files.length > 0) {
      lines.push('## Archivos Adjuntos');
      lines.push('');
      for (const file of data.files) {
        lines.push(`- **${file.fileName}** (${file.fileType}, ${this.formatBytes(file.fileSize)}) — Fase: ${file.phaseId}`);
      }
      lines.push('');
    }

    // Webhook Queue
    if (data.webhookQueue.length > 0) {
      lines.push('## Cola de Webhooks');
      lines.push('');
      for (const item of data.webhookQueue) {
        lines.push(`- ID: ${item.id}, Fase: ${item.phaseGroup}, Reintentos: ${item.retries || 0}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Importa estado desde JSON (valida schema antes de importar)
   * @param {Object} jsonData
   * @returns {Promise<{success: boolean, errors: string[], warnings: string[]}>}
   */
  async importAll(jsonData) {
    const errors = [];
    const warnings = [];

    // Validar estructura básica
    if (!jsonData || typeof jsonData !== 'object') {
      errors.push('Datos de importación inválidos: no es un objeto');
      return { success: false, errors, warnings };
    }

    if (!jsonData.timestamp || !jsonData.version) {
      warnings.push('Formato de exportación antiguo, intentando importar anyway');
    }

    // Verificar cuota antes de importar
    const estimatedBytes = this.estimateSize(jsonData);
    const quota = await this.checkQuota(estimatedBytes);
    if (!quota.ok) {
      errors.push('Cuota insuficiente para importar los datos');
      return { success: false, errors, warnings };
    }

    // 1. Importar meta (localStorage)
    if (jsonData.meta && typeof jsonData.meta === 'object') {
      for (const [key, value] of Object.entries(jsonData.meta)) {
        try {
          this.setLocal(key, value);
        } catch (e) {
          errors.push(`Error importando meta.${key}: ${e.message}`);
        }
      }
    }

    // 2. Importar phases (localStorage)
    if (jsonData.phases && typeof jsonData.phases === 'object') {
      for (const [key, value] of Object.entries(jsonData.phases)) {
        try {
          this.setLocal(key, value);
        } catch (e) {
          errors.push(`Error importando phase.${key}: ${e.message}`);
        }
      }
    }

    // 3. Importar IndexedDB (files, webhookQueue, snapshots)
    if (this.db) {
      if (Array.isArray(jsonData.files)) {
        await this.clearIndexedDB('files');
        for (const file of jsonData.files) {
          try {
            await this.setIndexedDB('files', file);
          } catch (e) {
            warnings.push(`Error importando file ${file.id}: ${e.message}`);
          }
        }
      }

      if (Array.isArray(jsonData.webhookQueue)) {
        await this.clearIndexedDB('webhookQueue');
        for (const item of jsonData.webhookQueue) {
          try {
            await this.setIndexedDB('webhookQueue', item);
          } catch (e) {
            warnings.push(`Error importando webhook queue item ${item.id}: ${e.message}`);
          }
        }
      }

      if (Array.isArray(jsonData.snapshots)) {
        await this.clearIndexedDB('snapshots');
        for (const snap of jsonData.snapshots) {
          try {
            await this.setIndexedDB('snapshots', snap);
          } catch (e) {
            warnings.push(`Error importando snapshot ${snap.id}: ${e.message}`);
          }
        }
      }
    }

    // Notificar cambios
    this.broadcastChange('*', jsonData, 'import');

    return {
      success: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Importa desde Markdown (parsea y convierte a JSON)
   * @param {string} mdContent
   * @returns {Promise<{success: boolean, errors: string[], warnings: string[]}>}
   */
  async importMD(mdContent) {
    // Parser simple de MD a JSON
    // Busca bloques de código JSON y los reconstruye
    const errors = [];
    const warnings = [];

    try {
      // Extraer metadatos y fases del MD
      const jsonBlocks = mdContent.match(/```json\n([\s\S]*?)\n```/g) || [];

      if (jsonBlocks.length === 0) {
        errors.push('No se encontraron bloques JSON válidos en el Markdown');
        return { success: false, errors, warnings };
      }

      // Reconstruir objeto similar a exportAll
      const reconstructed = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        phases: {},
        meta: {},
        files: [],
        webhookQueue: [],
        snapshots: []
      };

      // Heurística: primer bloque = meta, siguientes = phases
      let blockIndex = 0;
      for (const block of jsonBlocks) {
        const jsonStr = block.replace(/```json\n/, '').replace(/\n```/, '');
        try {
          const parsed = JSON.parse(jsonStr);
          if (blockIndex === 0) {
            reconstructed.meta = parsed;
          } else {
            // Asumir que es una fase
            const phaseKey = `form-phase-${blockIndex}`;
            reconstructed.phases[phaseKey] = parsed;
          }
          blockIndex++;
        } catch (e) {
          warnings.push(`Bloque JSON inválido ignorado: ${e.message}`);
        }
      }

      return await this.importAll(reconstructed);
    } catch (e) {
      errors.push(`Error parseando Markdown: ${e.message}`);
      return { success: false, errors, warnings };
    }
  }

  // ============================================================
  // MIGRATION FROM LEGACY (00-Idea)
  // ============================================================

  /**
   * Migra datos legacy del 00-Idea (keys idea-survey-*) al nuevo formato
   * @returns {Promise<{migrated: number, errors: string[], warnings: string[]}>}
   */
  async migrateFromLegacy() {
    const errors = [];
    const warnings = [];
    let migrated = 0;

    // Buscar keys legacy en localStorage
    const legacyKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('idea-survey-')) {
        legacyKeys.push(key);
      }
    }

    if (legacyKeys.length === 0) {
      warnings.push('No se encontraron datos legacy (idea-survey-*)');
      return { migrated: 0, errors, warnings };
    }

    console.log(`[StateManager] Encontradas ${legacyKeys.length} keys legacy para migrar`);

    // 1. Migrar theme
    const legacyTheme = localStorage.getItem('idea-survey-theme');
    if (legacyTheme) {
      this.setLocal('theme', legacyTheme);
      migrated++;
    }

    // 2. Migrar form answers (idea-survey-answers -> ecosystem-form-00-idea)
    const legacyAnswers = localStorage.getItem('idea-survey-answers');
    if (legacyAnswers) {
      try {
        const parsed = JSON.parse(legacyAnswers);
        this.setLocal('form-00-idea', parsed);
        migrated++;
      } catch (e) {
        errors.push(`Error migrando respuestas legacy: ${e.message}`);
      }
    }

    // 3. Migrar phase states si existe
    const legacyPhaseStates = localStorage.getItem('idea-survey-phase-states');
    if (legacyPhaseStates) {
      try {
        const parsed = JSON.parse(legacyPhaseStates);
        this.setLocal('phase-states', parsed);
        migrated++;
      } catch (e) {
        errors.push(`Error migrando phase states legacy: ${e.message}`);
      }
    }

    // 4. Limpiar keys legacy (opcional - comentado por seguridad)
    // legacyKeys.forEach(key => localStorage.removeItem(key));

    warnings.push(`Migradas ${migrated} keys legacy. Keys originales preservadas por seguridad.`);
    console.log('[StateManager] Migración legacy completada:', { migrated, errors, warnings });

    return { migrated, errors, warnings };
  }

  // ============================================================
  // CROSS-TAB SYNC MEJORADO
  // ============================================================

  /**
   * Maneja mensajes de BroadcastChannel
   * @param {MessageEvent} event
   */
  handleBroadcastMessage(event) {
    const { key, value, source, type } = event.data || {};
    if (!key || source === this.getInstanceId()) return; // Ignorar propios mensajes

    console.log('[StateManager] Cross-tab sync recibido:', key, type);

    if (type === 'clear' || key === '*') {
      this.notifyAllSubscribers();
      return;
    }

    if (type === 'import') {
      this.notifyAllSubscribers();
      return;
    }

    // Notificar suscriptores locales (key-specific)
    this.notifyLocalSubscribers(key, value);

    // Notificar listeners globales 'changed'
    this.emit('changed', { key, value, type, source, timestamp: Date.now() });
  }

  /**
   * Maneja storage event (fallback para tabs sin BroadcastChannel)
   * @param {StorageEvent} event
   */
  handleStorageEvent(event) {
    if (!event.key || !event.key.startsWith(LOCAL_STORAGE_PREFIX)) return;

    const key = event.key.slice(LOCAL_STORAGE_PREFIX.length);
    const newValue = event.newValue ? JSON.parse(event.newValue) : undefined;

    console.log('[StateManager] Storage event:', key);

    this.notifyLocalSubscribers(key, newValue);
    this.emit('changed', { key, value: newValue, type: 'storage', source: 'storage-event', timestamp: Date.now() });
  }

  /**
   * Envía cambio a otras tabs via BroadcastChannel
   * @param {string} key
   * @param {any} value
   * @param {string} type
   */
  broadcastChange(key, value, type = 'set') {
    if (!this.broadcastChannel) return;

    try {
      this.broadcastChannel.postMessage({
        key,
        value,
        type,
        source: this.getInstanceId(),
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn('[StateManager] Error broadcast:', e);
    }
  }

  /**
   * ID único de esta instancia para evitar eco
   * @returns {string}
   */
  getInstanceId() {
    if (!this._instanceId) {
      this._instanceId = 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    }
    return this._instanceId;
  }

  // ============================================================
  // REACTIVE SUBSCRIPTIONS (MEJORADO)
  // ============================================================

  /**
   * Suscribe a cambios en una clave específica (reactivo)
   * @param {string} key
   * @param {Function} callback - callback(newValue, oldValue)
   * @returns {Function} unsubscribe
   */
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key).add(callback);

    // Devolver función de unsubscribe
    return () => {
      const subs = this.subscribers.get(key);
      if (subs) subs.delete(callback);
    };
  }

  /**
   * Notifica suscriptores de una clave
   * @param {string} key
   * @param {any} newValue
   */
  notifyLocalSubscribers(key, newValue) {
    const subs = this.subscribers.get(key);
    if (subs) {
      subs.forEach(cb => {
        try {
          cb(newValue);
        } catch (e) {
          console.warn('[StateManager] Error en subscriber:', key, e);
        }
      });
    }

    // También notificar wildcard subscribers
    const wildcard = this.subscribers.get('*');
    if (wildcard) {
      wildcard.forEach(cb => {
        try {
          cb(key, newValue);
        } catch (e) {
          console.warn('[StateManager] Error en wildcard subscriber:', e);
        }
      });
    }
  }

  /**
   * Notifica a todos los suscriptores (para reload completo)
   */
  notifyAllSubscribers() {
    this.notifyLocalSubscribers('*', null);
  }

  /**
   * Event emitter genérico (para 'changed' event y otros)
   * @param {string} eventName
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);

    return () => {
      const subs = this.listeners.get(eventName);
      if (subs) subs.delete(callback);
    };
  }

  /**
   * Emite evento a listeners
   * @param {string} eventName
   * @param {...any} args
   */
  emit(eventName, ...args) {
    const subs = this.listeners.get(eventName);
    if (subs) {
      subs.forEach(cb => {
        try {
          cb(...args);
        } catch (e) {
          console.warn('[StateManager] Error en event listener:', eventName, e);
        }
      });
    }
  }

  // ============================================================
  // PRIVATE MODE BANNER
  // ============================================================

  /**
   * Muestra banner de aviso para modo privado
   */
  showPrivateModeBanner() {
    if (typeof document === 'undefined') return;

    // Evitar duplicados
    if (document.getElementById('privateModeBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'privateModeBanner';
    banner.className = 'private-banner';
    banner.innerHTML = `
      <span class="private-banner-text">⚠ Modo privado detectado. Los datos no persisten al cerrar la pestaña.</span>
      <button type="button" class="private-banner-dismiss" aria-label="Descartar">×</button>
    `;

    const dismissBtn = banner.querySelector('.private-banner-dismiss');
    dismissBtn.addEventListener('click', () => banner.remove());

    // Insertar después del navbar
    const navbar = document.querySelector('.navbar');
    if (navbar && navbar.nextSibling) {
      navbar.parentNode.insertBefore(banner, navbar.nextSibling);
    } else if (document.body.firstChild) {
      document.body.insertBefore(banner, document.body.firstChild);
    } else {
      document.body.appendChild(banner);
    }
  }

  // ============================================================
  // QUOTA BANNER
  // ============================================================

  /**
   * Muestra banner de aviso de cuota
   */
  showQuotaBanner(level, quota) {
    if (typeof document === 'undefined') return;

    this.hideQuotaBanner();

    const banner = document.createElement('div');
    banner.id = 'quota-banner';
    const isCritical = level === 'critical';
    banner.style.cssText = `
      position: fixed;
      top: ${document.getElementById('privateModeBanner') ? '56px' : '0'};
      left: 0;
      right: 0;
      background: ${isCritical ? '#fef2f2' : '#fffbeb'};
      color: ${isCritical ? '#991b1b' : '#92400e'};
      padding: 12px 20px;
      text-align: center;
      font-size: 14px;
      z-index: 9999;
      border-bottom: 1px solid ${isCritical ? '#fecaca' : '#fde68a'};
    `;
    const percent = Math.round(quota.usage / quota.limit * 100);
    banner.innerHTML = `
      <strong>${isCritical ? '¡Cuota crítica!' : 'Cuota de almacenamiento alta'}: </strong>
      Usando ${percent}% (${this.formatBytes(quota.usage)} / ${this.formatBytes(quota.limit)}).
      <button onclick="this.parentElement.remove()" style="margin-left:16px;padding:4px 12px;background:inherit;color:inherit;border:1px solid currentColor;border-radius:4px;cursor:pointer;">Cerrar</button>
      ${isCritical ? ' <button onclick="window.EcosystemApp?.exportAllData?.()" style="margin-left:8px;padding:4px 12px;background:inherit;color:inherit;border:1px solid currentColor;border-radius:4px;cursor:pointer;">Exportar y limpiar</button>' : ''}
    `;

    if (document.body.firstChild) {
      document.body.insertBefore(banner, document.body.firstChild);
    } else {
      document.body.appendChild(banner);
    }
  }

  /**
   * Oculta banner de cuota
   */
  hideQuotaBanner() {
    const banner = document.getElementById('quota-banner');
    if (banner) banner.remove();
  }

  /**
   * Formatea bytes a string legible
   */
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /**
   * Abre/crea la base de datos IndexedDB
   * @returns {Promise<IDBDatabase>}
   */
  openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store para archivos subidos
        if (!db.objectStoreNames.contains('files')) {
          const fileStore = db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
          fileStore.createIndex('phaseId', 'phaseId', { unique: false });
          fileStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Store para cola de webhook (persistente, sobrevive a reinicios)
        if (!db.objectStoreNames.contains('webhookQueue')) {
          const queueStore = db.createObjectStore('webhookQueue', { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('phaseGroup', 'phaseGroup', { unique: false });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
          queueStore.createIndex('retries', 'retries', { unique: false });
        }

        // Store para snapshots de exportación completa
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapStore = db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
          snapStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================
  // CONVENIENCE METHODS
  // ============================================================

  /**
   * Obtiene estado de una fase (phase + answers)
   * @param {string} phaseId
   * @returns {Promise<Object>} { phaseState, formData }
   */
  async getPhaseState(phaseId) {
    const phaseStates = this.getLocal('phase-states', { '00-idea': 'unlocked' });
    const formData = this.getLocal(`form-${phaseId}`, {});

    return {
      phaseState: phaseStates[phaseId] || 'locked',
      formData
    };
  }

  /**
   * Guarda estado de fase y formulario
   * @param {string} phaseId
   * @param {Object} data - { phaseState?, formData? }
   */
  async setPhaseState(phaseId, data) {
    if (data.phaseState !== undefined) {
      const states = this.getLocal('phase-states', { '00-idea': 'unlocked' });
      states[phaseId] = data.phaseState;
      this.setLocal('phase-states', states);
    }

    if (data.formData !== undefined) {
      this.setLocal(`form-${phaseId}`, data.formData);
    }
  }

  /**
   * Guarda archivo subido en IndexedDB
   * @param {string} phaseId
   * @param {File} file
   * @param {Object} metadata
   * @returns {Promise<number>} file ID
   */
  async saveFile(phaseId, file, metadata = {}) {
    return this.setIndexedDB('files', {
      phaseId,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      lastModified: file.lastModified,
      data: await this.fileToBase64(file),
      metadata
    });
  }

  /**
   * Convierte File a base64 para almacenar en IndexedDB
   * @param {File} file
   * @returns {Promise<string>}
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Obtiene archivos de una fase
   * @param {string} phaseId
   * @returns {Promise<Array<Object>>}
   */
  async getFiles(phaseId) {
    return this.getByIndex('files', 'phaseId', phaseId);
  }

  /**
   * Elimina archivo
   * @param {number} fileId
   * @returns {Promise<void>}
   */
  async deleteFile(fileId) {
    await this.deleteIndexedDB('files', fileId);
  }

  /**
   * Obtiene estado de la cola de webhook
   * @returns {Promise<Array<Object>>}
   */
  async getWebhookQueue() {
    return this.getAllIndexedDB('webhookQueue');
  }

  /**
   * Añade a cola de webhook
   * @param {Object} item
   * @returns {Promise<number>}
   */
  async enqueueWebhook(item) {
    return this.setIndexedDB('webhookQueue', item);
  }

  /**
   * Actualiza item de cola de webhook
   * @param {Object} item - debe tener id
   * @returns {Promise<void>}
   */
  async updateWebhookQueue(item) {
    await this.updateIndexedDB('webhookQueue', item);
  }

  /**
   * Elimina de cola de webhook
   * @param {number} id
   * @returns {Promise<void>}
   */
  async dequeueWebhook(id) {
    await this.deleteIndexedDB('webhookQueue', id);
  }
}

// Export singleton instance getter
let defaultInstance = null;
export function getStateManager() {
  if (!defaultInstance) {
    defaultInstance = new StateManager();
  }
  return defaultInstance;
}

export default StateManager;