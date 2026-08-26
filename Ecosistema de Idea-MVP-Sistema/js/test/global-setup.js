// Global setup for vitest - runs once before all tests
import { beforeAll } from 'vitest';

beforeAll(() => {
  // Ensure window is globally available
  if (typeof global.window === 'undefined') {
    global.window = global;
  }
  
  // Ensure document is globally available
  if (typeof global.document === 'undefined') {
    global.document = {
      createElement: () => ({}),
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      body: { appendChild: () => {}, insertBefore: () => {}, firstChild: null },
      head: { appendChild: () => {} },
      documentElement: { setAttribute: () => {} }
    };
  }
  
  // Ensure navigator is available
  if (typeof global.navigator === 'undefined') {
    global.navigator = {
      storage: { estimate: () => Promise.resolve({ usage: 100000, quota: 5000000 }) }
    };
  }
  
  // Ensure localStorage is available
  if (typeof global.localStorage === 'undefined') {
    const store = {};
    global.localStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => { store[key] = value.toString(); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      get length() { return Object.keys(store).length; },
      key: (i) => Object.keys(store)[i] || null
    };
  }
  
  // Ensure sessionStorage is available
  if (typeof global.sessionStorage === 'undefined') {
    const store = {};
    global.sessionStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => { store[key] = value.toString(); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    };
  }
  
  // Ensure indexedDB is available
  if (typeof global.indexedDB === 'undefined') {
    global.indexedDB = {
      open: () => ({
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: {
          transaction: () => ({
            objectStore: () => ({
              add: () => ({ onsuccess: null, onerror: null, result: 1 }),
              get: () => ({ onsuccess: null, onerror: null, result: null }),
              getAll: () => ({ onsuccess: null, onerror: null, result: [] }),
              put: () => ({ onsuccess: null, onerror: null }),
              delete: () => ({ onsuccess: null, onerror: null }),
              clear: () => ({ onsuccess: null, onerror: null }),
              createIndex: () => {},
              index: () => ({ getAll: () => ({ onsuccess: null, onerror: null, result: [] }) })
            })
          }),
          createObjectStore: () => {},
          objectStoreNames: { contains: () => false }
        }
      })
    };
  }
  
  // Ensure matchMedia is available
  if (typeof global.matchMedia === 'undefined') {
    global.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true
    });
  }
  
  // Ensure BroadcastChannel is available
  if (typeof global.BroadcastChannel === 'undefined') {
    global.BroadcastChannel = () => ({
      postMessage: () => {},
      onmessage: null,
      close: () => {}
    });
  }
  
  // Ensure URL.createObjectURL is available
  if (typeof global.URL === 'undefined') {
    global.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
  } else if (typeof global.URL.createObjectURL === 'undefined') {
    global.URL.createObjectURL = () => 'blob:mock';
  }
  
  // Ensure FileReader is available
  if (typeof global.FileReader === 'undefined') {
    global.FileReader = function() {
      this.readAsDataURL = () => {};
      this.onload = null;
      this.onerror = null;
      this.result = 'data:mock';
    };
  }
  
  // Ensure Blob is available
  if (typeof global.Blob === 'undefined') {
    global.Blob = function(content, options) {
      this.size = JSON.stringify(content).length;
      this.type = options?.type || 'application/json';
      this.text = () => Promise.resolve(JSON.stringify(content));
    };
  }
  
  // Ensure File is available
  if (typeof global.File === 'undefined') {
    global.File = function(content, name, options) {
      this.name = name;
      this.type = options?.type || '';
      this.size = content.length;
    };
  }
  
  // Ensure crypto.randomUUID is available
  if (typeof global.crypto === 'undefined') {
    global.crypto = {
      randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      })
    };
  }
  
  console.log('[Global Setup] Test environment initialized');
});