// Test setup for vitest with happy-dom - runs before each test file
import { beforeEach, afterEach, vi } from 'vitest';

// Ensure global window, document, navigator exist BEFORE any module imports
if (typeof global.window === 'undefined') {
  global.window = global;
}
if (typeof global.document === 'undefined') {
  global.document = {
    createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, removeChild: () => {}, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, removeEventListener: () => {}, classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} }, dataset: {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    body: { innerHTML: '', appendChild: () => {}, insertBefore: () => {}, firstChild: null, querySelector: () => null },
    head: { innerHTML: '', appendChild: () => {} },
    documentElement: { setAttribute: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}
if (typeof global.navigator === 'undefined') {
  global.navigator = {
    storage: { estimate: vi.fn().mockResolvedValue({ usage: 100000, quota: 500000000 }) },
    userAgent: 'test-agent'
  };
}

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] || null
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock sessionStorage
Object.defineProperty(global, 'sessionStorage', {
  value: localStorageMock,
  writable: true
});

// Mock matchMedia
Object.defineProperty(global.window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// Mock navigator.storage
Object.defineProperty(global.navigator, 'storage', {
  writable: true,
  value: {
    estimate: vi.fn().mockResolvedValue({ usage: 100000, quota: 500000000 })
  }
});

// Mock BroadcastChannel
global.BroadcastChannel = vi.fn().mockImplementation(() => ({
  postMessage: vi.fn(),
  onmessage: null,
  close: vi.fn()
}));

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    })
  }
});

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock FileReader
global.FileReader = vi.fn().mockImplementation(() => ({
  readAsDataURL: vi.fn(),
  onload: null,
  onerror: null,
  result: 'data:mock'
}));

// NOTE: Blob and File are NOT mocked here.
// happy-dom already provides spec-compliant Blob/File implementations
// (including correct .size computation from blob parts).
// Overriding them with mocks breaks file-size validation tests
// (e.g. size returning array length instead of byte size).

// Mock IndexedDB (simplified)
global.indexedDB = {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          add: vi.fn(),
          get: vi.fn(),
          getAll: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
          clear: vi.fn(),
          createIndex: vi.fn(),
          index: vi.fn(() => ({ getAll: vi.fn() }))
        }))
      })),
      createObjectStore: vi.fn(),
      objectStoreNames: { contains: vi.fn(() => false) }
    }
  }))
};

// Reset DOM before each test
beforeEach(() => {
  if (global.document) {
    global.document.body.innerHTML = '';
    global.document.head.innerHTML = '';
  }
  localStorageMock.clear();
  vi.clearAllMocks();
});

// Clean up after each test
afterEach(() => {
  vi.resetModules();
});

console.log('[Test Setup] happy-dom environment configured');