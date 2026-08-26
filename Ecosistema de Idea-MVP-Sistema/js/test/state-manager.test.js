/**
 * Unit tests for StateManager
 * Tests: quota, private mode, export/import
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateManager, QuotaExceededError } from '../core/state-manager.js';

// Mock localStorage
const createLocalStorageMock = () => {
  const store = {};
  return {
    store,
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i) => Object.keys(store)[i] || null)
  };
};

// Mock IndexedDB
const createIndexedDBMock = () => {
  const stores = {
    files: new Map(),
    webhookQueue: new Map(),
    snapshots: new Map()
  };
  let idCounters = { files: 1, webhookQueue: 1, snapshots: 1 };

  return {
    stores,
    open: vi.fn(() => {
      const db = {
        transaction: vi.fn((storeNames, mode) => {
          const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
          const store = stores[storeName];
          return {
            objectStore: vi.fn(() => ({
              add: vi.fn((data) => {
                const id = idCounters[storeName]++;
                const request = {
                  onsuccess: null,
                  onerror: null,
                  result: id
                };
                setTimeout(() => request.onsuccess?.({ target: { result: id } }), 0);
                store.set(id, { ...data, id });
                return request;
              }),
              get: vi.fn((id) => {
                const request = {
                  onsuccess: null,
                  onerror: null,
                  result: store.get(id) || null
                };
                setTimeout(() => request.onsuccess?.({ target: { result: store.get(id) || null } }), 0);
                return request;
              }),
              getAll: vi.fn(() => {
                const request = {
                  onsuccess: null,
                  onerror: null,
                  result: Array.from(store.values())
                };
                setTimeout(() => request.onsuccess?.({ target: { result: Array.from(store.values()) } }), 0);
                return request;
              }),
              put: vi.fn((data) => {
                const request = { onsuccess: null, onerror: null };
                setTimeout(() => { store.set(data.id, data); request.onsuccess?.({ target: {} }); }, 0);
                return request;
              }),
              delete: vi.fn((id) => {
                const request = { onsuccess: null, onerror: null };
                setTimeout(() => { store.delete(id); request.onsuccess?.({ target: {} }); }, 0);
                return request;
              }),
              clear: vi.fn(() => {
                const request = { onsuccess: null, onerror: null };
                setTimeout(() => { store.clear(); request.onsuccess?.({ target: {} }); }, 0);
                return request;
              }),
              createIndex: vi.fn(),
              index: vi.fn(() => ({
                getAll: vi.fn((value) => {
                  const request = {
                    onsuccess: null,
                    onerror: null,
                    result: Array.from(store.values()).filter(v => v.phaseId === value)
                  };
                  setTimeout(() => request.onsuccess?.({ target: { result: request.result } }), 0);
                  return request;
                })
              }))
            }))
          };
        }),
        objectStoreNames: { contains: vi.fn((name) => stores.hasOwnProperty(name)) },
        createObjectStore: vi.fn()
      };
      const request = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: db
      };
      setTimeout(() => request.onsuccess?.({ target: { result: db } }), 0);
      return request;
    })
  };
};

describe('StateManager - Initialization', () => {
  let localStorageMock;
  let indexedDBMock;
  let originalLocalStorage;
  let originalIndexedDB;
  let originalNavigatorStorage;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    indexedDBMock = createIndexedDBMock();
    
    originalLocalStorage = global.localStorage;
    originalIndexedDB = global.indexedDB;
    originalNavigatorStorage = global.navigator.storage;
    
    global.localStorage = localStorageMock;
    global.indexedDB = indexedDBMock;
    global.navigator.storage = {
      estimate: vi.fn().mockResolvedValue({ usage: 100000, quota: 500000000 })
    };
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
    global.indexedDB = originalIndexedDB;
    global.navigator.storage = originalNavigatorStorage;
    vi.resetModules();
  });

  it('should initialize without errors', async () => {
    const manager = new StateManager();
    await manager.init();
    expect(manager.initialized).toBe(true);
  });

  it('should detect private mode when localStorage fails', async () => {
    localStorageMock.setItem.mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    
    const manager = new StateManager();
    await manager.init();
    expect(manager.privateMode).toBe(true);
  });
});

describe('StateManager - Quota Management', () => {
  let localStorageMock;
  let indexedDBMock;
  let originalLocalStorage;
  let originalIndexedDB;
  let originalNavigatorStorage;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    indexedDBMock = createIndexedDBMock();
    
    originalLocalStorage = global.localStorage;
    originalIndexedDB = global.indexedDB;
    originalNavigatorStorage = global.navigator.storage;
    
    global.localStorage = localStorageMock;
    global.indexedDB = indexedDBMock;
    global.navigator.storage = {
      estimate: vi.fn().mockResolvedValue({ usage: 100000, quota: 500000000 })
    };
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
    global.indexedDB = originalIndexedDB;
    global.navigator.storage = originalNavigatorStorage;
    vi.resetModules();
  });

  it('should check quota and return ok status', async () => {
    const manager = new StateManager();
    await manager.init();
    
    const quota = await manager.checkQuota(0);
    expect(quota.ok).toBe(true);
    expect(quota.percentage).toBeLessThan(80);
  });

  it('should warn at 80% quota', async () => {
    global.navigator.storage.estimate = vi.fn().mockResolvedValue({ 
      usage: 400000000, 
      quota: 500000000 
    });
    
    const manager = new StateManager();
    await manager.init();
    
    const quota = await manager.checkQuota(0);
    expect(quota.warning).toBe(true);
    expect(quota.percentage).toBeGreaterThanOrEqual(80);
  });

  it('should be critical at 95% quota', async () => {
    global.navigator.storage.estimate = vi.fn().mockResolvedValue({ 
      usage: 480000000, 
      quota: 500000000 
    });
    
    const manager = new StateManager();
    await manager.init();
    
    const quota = await manager.checkQuota(0);
    expect(quota.critical).toBe(true);
    expect(quota.percentage).toBeGreaterThanOrEqual(95);
  });

  it('should throw QuotaExceededError when quota exceeded', async () => {
    global.navigator.storage.estimate = vi.fn().mockResolvedValue({ 
      usage: 499900000, 
      quota: 500000000 
    });
    
    const manager = new StateManager();
    await manager.init();
    
    await expect(manager.set('test-key', 'x'.repeat(200000))).rejects.toThrow(QuotaExceededError);
  });
});

describe('StateManager - Export/Import', () => {
  let localStorageMock;
  let indexedDBMock;
  let originalLocalStorage;
  let originalIndexedDB;
  let originalNavigatorStorage;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    indexedDBMock = createIndexedDBMock();
    
    originalLocalStorage = global.localStorage;
    originalIndexedDB = global.indexedDB;
    originalNavigatorStorage = global.navigator.storage;
    
    global.localStorage = localStorageMock;
    global.indexedDB = indexedDBMock;
    global.navigator.storage = {
      estimate: vi.fn().mockResolvedValue({ usage: 100000, quota: 500000000 })
    };
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
    global.indexedDB = originalIndexedDB;
    global.navigator.storage = originalNavigatorStorage;
    vi.resetModules();
  });

  it('should export all data as JSON', async () => {
    const manager = new StateManager();
    await manager.init();
    
    // Add some test data
    await manager.setLocal('form-00-idea', { field1: 'value1' });
    await manager.setLocal('theme', 'dark');
    
    const exportData = await manager.exportAll();
    
    expect(exportData.timestamp).toBeDefined();
    expect(exportData.version).toBe('1.0');
    expect(exportData.phases['form-00-idea']).toEqual({ field1: 'value1' });
    expect(exportData.meta.theme).toBe('dark');
  });

  it('should import all data from JSON', async () => {
    const manager = new StateManager();
    await manager.init();
    
    const importData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      phases: { 'form-01-idd': { field2: 'value2' } },
      meta: { theme: 'light' },
      files: [],
      webhookQueue: [],
      snapshots: []
    };
    
    const result = await manager.importAll(importData);
    
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    
    const imported = await manager.get('form-01-idd');
    expect(imported).toEqual({ field2: 'value2' });
  });

  it('should export Markdown', async () => {
    const manager = new StateManager();
    await manager.init();
    
    await manager.setLocal('form-00-idea', { stimulus: 'problema', nature: 'solucion' });
    
    const md = await manager.exportMD();
    
    expect(md).toContain('# Ecosistema Idea-MVP — Exportación Completa');
    expect(md).toContain('stimulus');
    expect(md).toContain('problema');
  });
});

describe('StateManager - LocalStorage Operations', () => {
  let localStorageMock;
  let indexedDBMock;
  let originalLocalStorage;
  let originalIndexedDB;
  let originalNavigatorStorage;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    indexedDBMock = createIndexedDBMock();
    
    originalLocalStorage = global.localStorage;
    originalIndexedDB = global.indexedDB;
    originalNavigatorStorage = global.navigator.storage;
    
    global.localStorage = localStorageMock;
    global.indexedDB = indexedDBMock;
    global.navigator.storage = {
      estimate: vi.fn().mockResolvedValue({ usage: 100000, quota: 500000000 })
    };
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
    global.indexedDB = originalIndexedDB;
    global.navigator.storage = originalNavigatorStorage;
    vi.resetModules();
  });

  it('should set and get localStorage values', async () => {
    const manager = new StateManager();
    await manager.init();
    
    await manager.setLocal('test-key', { foo: 'bar' });
    const value = manager.getLocal('test-key');
    
    expect(value).toEqual({ foo: 'bar' });
  });

  it('should delete localStorage values', async () => {
    const manager = new StateManager();
    await manager.init();
    
    await manager.setLocal('test-key', { foo: 'bar' });
    manager.deleteLocal('test-key');
    const value = manager.getLocal('test-key');
    
    expect(value).toBeNull();
  });

  it('should clear all data', async () => {
    const manager = new StateManager();
    await manager.init();
    
    await manager.setLocal('key1', 'value1');
    await manager.setLocal('key2', 'value2');
    
    await manager.clear();
    
    expect(manager.getLocal('key1')).toBeNull();
    expect(manager.getLocal('key2')).toBeNull();
  });
});

describe('StateManager - Private Mode Fallback', () => {
  let localStorageMock;
  let indexedDBMock;
  let originalLocalStorage;
  let originalIndexedDB;
  let originalNavigatorStorage;

  beforeEach(() => {
    localStorageMock = createLocalStorageMock();
    localStorageMock.setItem.mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    indexedDBMock = createIndexedDBMock();
    
    originalLocalStorage = global.localStorage;
    originalIndexedDB = global.indexedDB;
    originalNavigatorStorage = global.navigator.storage;
    
    global.localStorage = localStorageMock;
    global.indexedDB = indexedDBMock;
    global.navigator.storage = {
      estimate: vi.fn().mockResolvedValue({ usage: 100000, quota: 500000000 })
    };
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
    global.indexedDB = originalIndexedDB;
    global.navigator.storage = originalNavigatorStorage;
    vi.resetModules();
  });

  it('should use fallback storage in private mode', async () => {
    const manager = new StateManager();
    await manager.init();
    
    expect(manager.privateMode).toBe(true);
    
    await manager.setLocal('test-key', { foo: 'bar' });
    const value = manager.getLocal('test-key');
    
    expect(value).toEqual({ foo: 'bar' });
  });

  it('should work with fallback storage for all operations', async () => {
    const manager = new StateManager();
    await manager.init();
    
    await manager.setLocal('key1', 'value1');
    await manager.setLocal('key2', 'value2');
    
    expect(manager.getLocal('key1')).toBe('value1');
    expect(manager.getLocal('key2')).toBe('value2');
    
    manager.deleteLocal('key1');
    expect(manager.getLocal('key1')).toBeNull();
    expect(manager.getLocal('key2')).toBe('value2');
  });
});