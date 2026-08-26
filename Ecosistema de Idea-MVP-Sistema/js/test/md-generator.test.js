/**
 * Unit tests for MDGenerator
 * Tests: templates, render, data preparation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MDGenerator } from '../core/md-generator.js';

// Mock StateManager
class MockStateManager {
  constructor() {
    this.data = {
      phases: {},
      meta: {},
      files: [],
      webhookQueue: [],
      snapshots: []
    };
  }

  async exportAll() {
    return {
      timestamp: new Date().toISOString(),
      version: '1.0',
      phases: this.data.phases,
      meta: this.data.meta,
      files: this.data.files,
      webhookQueue: this.data.webhookQueue,
      snapshots: this.data.snapshots
    };
  }

  set(key, value) {
    if (key.startsWith('form-')) {
      this.data.phases[key] = value;
    } else {
      this.data.meta[key] = value;
    }
  }
}

describe('MDGenerator - Templates', () => {
  let generator;
  let stateManager;

  beforeEach(() => {
    stateManager = new MockStateManager();
    generator = new MDGenerator(stateManager);
  });

  it('should have phase template with required placeholders', () => {
    const template = generator.templates.phase;
    expect(template).toContain('{{phaseName}}');
    expect(template).toContain('{{phaseId}}');
    expect(template).toContain('{{variant}}');
    expect(template).toContain('{{completedAt}}');
    expect(template).toContain('{{#each sections}}');
    expect(template).toContain('{{#each fields}}');
    expect(template).toContain('{{label}}');
    expect(template).toContain('{{value}}');
  });

  it('should have consolidated template with required placeholders', () => {
    const template = generator.templates.consolidated;
    expect(template).toContain('{{generatedAt}}');
    expect(template).toContain('{{totalPhases}}');
    expect(template).toContain('{{completedPhases}}');
    expect(template).toContain('{{#each phases}}');
    expect(template).toContain('{{phaseName}}');
    expect(template).toContain('{{variant}}');
    expect(template).toContain('{{slug}}');
    expect(template).toContain('{{totalDuration}}');
    expect(template).toContain('{{themesUsed}}');
    expect(template).toContain('{{totalFiles}}');
    expect(template).toContain('{{totalWebhooks}}');
  });
});

describe('MDGenerator - Render Engine', () => {
  let generator;
  let stateManager;

  beforeEach(() => {
    stateManager = new MockStateManager();
    generator = new MDGenerator(stateManager);
  });

  it('should render simple variables', () => {
    const template = 'Hello {{name}}!';
    const result = generator.render(template, { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('should render nested variables', () => {
    const template = 'User: {{user.name}}';
    const result = generator.render(template, { user: { name: 'John' } });
    expect(result).toBe('User: John');
  });

  it('should handle missing variables gracefully', () => {
    const template = 'Hello {{name}}!';
    const result = generator.render(template, {});
    expect(result).toBe('Hello !');
  });

  it('should render each blocks', () => {
    const template = '{{#each items}}- {{name}}\n{{/each}}';
    const result = generator.render(template, { 
      items: [{ name: 'A' }, { name: 'B' }] 
    });
    expect(result).toBe('- A\n- B\n');
  });

  it('should render nested each blocks', () => {
    const template = '{{#each sections}}## {{title}}\n{{#each fields}}- {{label}}: {{value}}\n{{/each}}{{/each}}';
    const result = generator.render(template, {
      sections: [
        { title: 'Section 1', fields: [{ label: 'Field 1', value: 'Value 1' }] },
        { title: 'Section 2', fields: [{ label: 'Field 2', value: 'Value 2' }] }
      ]
    });
    expect(result).toContain('## Section 1');
    expect(result).toContain('- Field 1: Value 1');
    expect(result).toContain('## Section 2');
    expect(result).toContain('- Field 2: Value 2');
  });

  it('should render if blocks', () => {
    const template = '{{#if show}}Visible{{/if}}';
    expect(generator.render(template, { show: true })).toBe('Visible');
    expect(generator.render(template, { show: false })).toBe('');
    expect(generator.render(template, {})).toBe('');
  });

  it('should handle complex template with multiple constructs', () => {
    const template = `
{{#if hasTitle}}
# {{title}}
{{/if}}
{{#each items}}
- {{name}} ({{value}})
{{/each}}
`;
    const result = generator.render(template, {
      hasTitle: true,
      title: 'Test',
      items: [{ name: 'A', value: 1 }, { name: 'B', value: 2 }]
    });
    expect(result).toContain('# Test');
    expect(result).toContain('- A (1)');
    expect(result).toContain('- B (2)');
  });
});

describe('MDGenerator - Data Preparation', () => {
  let generator;
  let stateManager;

  beforeEach(() => {
    stateManager = new MockStateManager();
    generator = new MDGenerator(stateManager);
  });

  it('should prepare phase data', () => {
    const answers = {
      stimulus: 'problema',
      nature: 'solucion',
      description: 'Test description'
    };
    const meta = {
      completedAt: Date.now(),
      variant: 'mercado',
      duration: 3600000,
      theme: 'dark'
    };

    const data = generator.preparePhaseData('01-idd', 'mercado', answers, meta);

    expect(data.phaseId).toBe('01-idd');
    expect(data.variant).toBe('mercado');
    expect(data.completedAt).toBeDefined();
    expect(data.duration).toBe('1h 0m 0s');
    expect(data.theme).toBe('dark');
    expect(data.sections).toBeDefined();
  });

  it('should prepare consolidated data', async () => {
    stateManager.data.phases = {
      'form-00-idea': { stimulus: 'problema', nature: 'solucion' },
      'form-01-idd': { market: 'B2B', problem: 'Test problem' }
    };
    stateManager.data.meta = {
      'form-00-idea-meta': { 
        variant: 'default', 
        completedAt: Date.now(),
        theme: 'light',
        duration: 1800000
      },
      'form-01-idd-meta': { 
        variant: 'mercado', 
        completedAt: Date.now(),
        theme: 'dark',
        duration: 3600000
      }
    };
    stateManager.data.files = [{ fileName: 'test.pdf' }];
    stateManager.data.webhookQueue = [{ sent: true }, { sent: false }];

    const data = generator.prepareConsolidatedData(await stateManager.exportAll());

    expect(data.totalPhases).toBe(2);
    expect(data.completedPhases).toBe(2);
    expect(data.phases).toHaveLength(2);
    expect(data.themesUsed).toContain('light');
    expect(data.themesUsed).toContain('dark');
    expect(data.totalFiles).toBe(1);
    expect(data.totalWebhooks).toBe(1);
  });

  it('should transform answers to sections', () => {
    const answers = {
      field1: 'value1',
      field2: 'value2'
    };
    const phaseConfig = {
      sections: [
        { id: 'sec1', title: 'Section 1', fields: [{ id: 'field1', label: 'Field 1' }] },
        { id: 'sec2', title: 'Section 2', fields: [{ id: 'field2', label: 'Field 2' }] }
      ]
    };

    const sections = generator.transformAnswersToSections(answers, phaseConfig);

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe('Section 1');
    expect(sections[0].fields[0].label).toBe('Field 1');
    expect(sections[0].fields[0].value).toBe('value1');
  });

  it('should format array values as bullet list', () => {
    const value = ['item1', 'item2', 'item3'];
    const formatted = generator.formatValue(value);
    expect(formatted).toBe('- item1\n- item2\n- item3');
  });

  it('should format object values as JSON', () => {
    const value = { key: 'value', nested: { a: 1 } };
    const formatted = generator.formatValue(value);
    expect(formatted).toContain('```json');
    expect(formatted).toContain('"key": "value"');
    expect(formatted).toContain('"nested": {');
  });

  it('should format duration correctly', () => {
    expect(generator.formatDuration(0)).toBe('N/A');
    expect(generator.formatDuration(1000)).toBe('1s');
    expect(generator.formatDuration(60000)).toBe('1m 0s');
    expect(generator.formatDuration(3600000)).toBe('1h 0m 0s');
    expect(generator.formatDuration(3661000)).toBe('1h 1m 1s');
  });
});

describe('MDGenerator - Phase Config', () => {
  let generator;
  let stateManager;

  beforeEach(() => {
    stateManager = new MockStateManager();
    generator = new MDGenerator(stateManager);
  });

  it('should return null for getPhaseConfig (not implemented)', () => {
    expect(generator.getPhaseConfig('01-idd')).toBeNull();
  });
});