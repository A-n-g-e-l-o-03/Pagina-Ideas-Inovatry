/**
 * Unit tests for FormEngine
 * Tests: evaluateShowWhen, isFieldRequired, file validation, dirty tracking
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FormEngine } from '../core/form-engine.js';

// Helper to create minimal config
function createTestConfig(fields = [], sections = {}) {
  return {
    hero: { title: 'Test', description: 'Test', badge: 'Test' },
    form: { title: 'Test Form', subtitle: 'Test' },
    fields,
    sections,
    webhook: { url: 'https://discord.com/api/webhooks/test' },
    maxTotalBytes: 8 * 1024 * 1024,
    allowedTypes: ['.pdf', '.txt']
  };
}

// Helper to create FormEngine instance
function createEngine(config) {
  const engine = new FormEngine(config);
  // Mock DOM elements needed by FormEngine
  document.body.innerHTML = `
    <div class="form-container">
      <div id="formMessage" class="form-message"></div>
      <h2 class="form-title"></h2>
      <p class="form-subtitle"></p>
      <div class="progress-wrap">
        <div class="progress-track" id="progressBar" role="progressbar">
          <div class="progress-fill" id="progressFill"></div>
        </div>
        <span class="progress-label" id="progressLabel">0%</span>
      </div>
      <form id="contactForm" novalidate>
        <div class="form-grid" id="formGrid"></div>
        <div class="submit-wrapper">
          <button type="submit" class="btn-submit" id="submitBtn"><span class="btn-text">Enviar</span></button>
        </div>
      </form>
    </div>
    <nav class="phase-nav" id="phaseNav"></nav>
  `;
  engine.render();
  return engine;
}

describe('FormEngine - evaluateShowWhen', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine(createTestConfig());
  });

  it('should return true when no showWhen', () => {
    const field = { id: 'test', showWhen: null };
    expect(engine.evaluateShowWhen(field, {})).toBe(true);
  });

  it('should return true for equals operator (new format)', () => {
    const field = { 
      id: 'test', 
      showWhen: { operator: 'equals', field: 'trigger', value: 'yes' } 
    };
    expect(engine.evaluateShowWhen(field, { trigger: 'yes' })).toBe(true);
    expect(engine.evaluateShowWhen(field, { trigger: 'no' })).toBe(false);
    expect(engine.evaluateShowWhen(field, { trigger: '' })).toBe(false);
    expect(engine.evaluateShowWhen(field, {})).toBe(false);
  });

  it('should return true for in operator (new format)', () => {
    const field = { 
      id: 'test', 
      showWhen: { operator: 'in', field: 'type', value: ['a', 'b', 'c'] } 
    };
    expect(engine.evaluateShowWhen(field, { type: 'a' })).toBe(true);
    expect(engine.evaluateShowWhen(field, { type: 'b' })).toBe(true);
    expect(engine.evaluateShowWhen(field, { type: 'd' })).toBe(false);
    expect(engine.evaluateShowWhen(field, { type: '' })).toBe(false);
  });

  it('should return true for not operator (new format)', () => {
    const field = { 
      id: 'test', 
      showWhen: { operator: 'not', field: 'trigger', value: 'disabled' } 
    };
    expect(engine.evaluateShowWhen(field, { trigger: 'enabled' })).toBe(true);
    expect(engine.evaluateShowWhen(field, { trigger: 'disabled' })).toBe(false);
    expect(engine.evaluateShowWhen(field, { trigger: '' })).toBe(false);
  });

  it('should support legacy equals format', () => {
    const field = { 
      id: 'test', 
      showWhen: { field: 'trigger', equals: 'yes' } 
    };
    expect(engine.evaluateShowWhen(field, { trigger: 'yes' })).toBe(true);
    expect(engine.evaluateShowWhen(field, { trigger: 'no' })).toBe(false);
  });

  it('should support legacy in format', () => {
    const field = { 
      id: 'test', 
      showWhen: { field: 'type', in: ['a', 'b'] } 
    };
    expect(engine.evaluateShowWhen(field, { type: 'a' })).toBe(true);
    expect(engine.evaluateShowWhen(field, { type: 'c' })).toBe(false);
  });

  it('should support legacy not format', () => {
    const field = { 
      id: 'test', 
      showWhen: { field: 'trigger', not: 'disabled' } 
    };
    expect(engine.evaluateShowWhen(field, { trigger: 'enabled' })).toBe(true);
    expect(engine.evaluateShowWhen(field, { trigger: 'disabled' })).toBe(false);
  });

  it('should handle array values for equals', () => {
    const field = { 
      id: 'test', 
      showWhen: { operator: 'equals', field: 'tags', value: ['a', 'b'] } 
    };
    expect(engine.evaluateShowWhen(field, { tags: ['a', 'b'] })).toBe(true);
    expect(engine.evaluateShowWhen(field, { tags: ['a'] })).toBe(false);
  });
});

describe('FormEngine - isFieldRequired', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine(createTestConfig());
  });

  it('should return boolean for simple required', () => {
    expect(engine.isFieldRequired({ required: true }, {})).toBe(true);
    expect(engine.isFieldRequired({ required: false }, {})).toBe(false);
    expect(engine.isFieldRequired({ required: undefined }, {})).toBe(false);
    expect(engine.isFieldRequired({}, {})).toBe(false);
  });

  it('should evaluate conditional required with operator (new format)', () => {
    const field = { 
      required: { operator: 'equals', field: 'traceability', value: 'B' } 
    };
    expect(engine.isFieldRequired(field, { traceability: 'B' })).toBe(true);
    expect(engine.isFieldRequired(field, { traceability: 'A' })).toBe(false);
  });

  it('should evaluate conditional required with in operator', () => {
    const field = { 
      required: { operator: 'in', field: 'nature', value: ['solucion', 'herramienta'] } 
    };
    expect(engine.isFieldRequired(field, { nature: 'solucion' })).toBe(true);
    expect(engine.isFieldRequired(field, { nature: 'herramienta' })).toBe(true);
    expect(engine.isFieldRequired(field, { nature: 'otro' })).toBe(false);
  });

  it('should evaluate conditional required with not operator', () => {
    const field = { 
      required: { operator: 'not', field: 'complexity', value: 'muy-simple' } 
    };
    expect(engine.isFieldRequired(field, { complexity: 'compleja' })).toBe(true);
    expect(engine.isFieldRequired(field, { complexity: 'muy-simple' })).toBe(false);
  });

  it('should support legacy when format', () => {
    const field = { 
      required: { when: { field: 'traceability', equals: 'B' } } 
    };
    expect(engine.isFieldRequired(field, { traceability: 'B' })).toBe(true);
    expect(engine.isFieldRequired(field, { traceability: 'A' })).toBe(false);
  });
});

describe('FormEngine - File Validation', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine(createTestConfig());
  });

  it('should validate allowed file types', () => {
    const pdfFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    const txtFile = new File(['content'], 'test.txt', { type: 'text/plain' });
    const exeFile = new File(['content'], 'test.exe', { type: 'application/x-msdownload' });

    expect(engine.allowedTypes.some(t => pdfFile.name.endsWith(t))).toBe(true);
    expect(engine.allowedTypes.some(t => txtFile.name.endsWith(t))).toBe(true);
    expect(engine.allowedTypes.some(t => exeFile.name.endsWith(t))).toBe(false);
  });

  it('should validate total file size limit', () => {
    const smallFile = new File(['x'.repeat(1000)], 'small.pdf', { type: 'application/pdf' });
    const largeFile = new File(['x'.repeat(10 * 1024 * 1024)], 'large.pdf', { type: 'application/pdf' });

    engine.state.files = [smallFile];
    expect(engine.state.files.reduce((sum, f) => sum + f.size, 0)).toBeLessThan(engine.maxTotalBytes);

    engine.state.files = [largeFile];
    expect(engine.state.files.reduce((sum, f) => sum + f.size, 0)).toBeGreaterThan(engine.maxTotalBytes);
  });
});

describe('FormEngine - DirtyTracker Integration', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine(createTestConfig([
      { id: 'field1', type: 'text', label: 'Field 1' },
      { id: 'field2', type: 'email', label: 'Field 2' }
    ]));
  });

  it('should track dirty fields on input', () => {
    const input = engine.el('field-field1');
    input.value = 'test value';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    expect(engine.dirtyTracker.hasUnsavedChanges()).toBe(true);
    expect(engine.dirtyTracker.getDirtyFields()).toContain('field1');
  });

  it('should mark field clean when value matches snapshot', () => {
    const input = engine.el('field-field1');
    input.value = 'test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    expect(engine.dirtyTracker.isFieldDirty('field1')).toBe(true);
    
    // Reset to original value
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    expect(engine.dirtyTracker.isFieldDirty('field1')).toBe(false);
  });

  it('should reset dirty tracker', () => {
    const input = engine.el('field-field1');
    input.value = 'test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    engine.dirtyTracker.reset();
    
    expect(engine.dirtyTracker.hasUnsavedChanges()).toBe(false);
    expect(engine.dirtyTracker.getDirtyFields()).toHaveLength(0);
  });
});

describe('FormEngine - normalizeShowWhen', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine(createTestConfig());
  });

  it('should normalize new format', () => {
    const sw = { operator: 'equals', field: 'test', value: 'yes' };
    const normalized = engine.normalizeShowWhen(sw);
    expect(normalized).toEqual({ operator: 'equals', field: 'test', value: 'yes' });
  });

  it('should normalize legacy equals', () => {
    const sw = { field: 'test', equals: 'yes' };
    const normalized = engine.normalizeShowWhen(sw);
    expect(normalized).toEqual({ operator: 'equals', field: 'test', value: 'yes' });
  });

  it('should normalize legacy in', () => {
    const sw = { field: 'test', in: ['a', 'b'] };
    const normalized = engine.normalizeShowWhen(sw);
    expect(normalized).toEqual({ operator: 'in', field: 'test', value: ['a', 'b'] });
  });

  it('should normalize legacy not', () => {
    const sw = { field: 'test', not: 'no' };
    const normalized = engine.normalizeShowWhen(sw);
    expect(normalized).toEqual({ operator: 'not', field: 'test', value: 'no' });
  });

  it('should return null for invalid config', () => {
    expect(engine.normalizeShowWhen({})).toBeNull();
    expect(engine.normalizeShowWhen({ field: 'test' })).toBeNull();
    expect(engine.normalizeShowWhen(null)).toBeNull();
  });
});