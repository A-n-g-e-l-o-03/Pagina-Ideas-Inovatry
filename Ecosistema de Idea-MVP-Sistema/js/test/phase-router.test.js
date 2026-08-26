/**
 * Unit tests for PhaseRouter
 * Tests: state machine, circular detection, unavailable state
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhaseRouter } from '../core/phase-router.js';
import { CircularDetector } from '../core/circular-detector.js';

// Mock window.dispatchEvent for PhaseRouter
const mockDispatchEvent = vi.fn();
global.window = {
  ...global.window,
  dispatchEvent: mockDispatchEvent
};

// Mock ConfigLoader
class MockConfigLoader {
  async loadRegistry() {
    return {
      phases: [
        { phaseId: '00-idea', phaseName: 'Idea', order: 0 },
        { phaseId: '01-idd', phaseName: 'IDD', order: 1 },
        { phaseId: '02-prd', phaseName: 'PRD', order: 2 },
        { phaseId: '03-brd', phaseName: 'BRD', order: 3 },
        { phaseId: '04-rdd', phaseName: 'RDD', order: 4 },
        { phaseId: '05-dmd', phaseName: 'DMD', order: 5 },
        { phaseId: '06-design', phaseName: 'Design', order: 6 },
        { phaseId: '07-dbd', phaseName: 'DBD', order: 7 },
        { phaseId: '08-api', phaseName: 'API', order: 8 },
        { phaseId: '09-uid', phaseName: 'UID', order: 9 },
        { phaseId: '10-tmd', phaseName: 'TMD', order: 10 },
        { phaseId: '11-srd', phaseName: 'SRD', order: 11 },
        { phaseId: '12-iam', phaseName: 'IAM', order: 12 },
        { phaseId: '13-sad', phaseName: 'SAD', order: 13 },
        { phaseId: '14-agd', phaseName: 'AGD', order: 14 },
        { phaseId: '15-aad', phaseName: 'AAD', order: 15 },
        { phaseId: '16-aid', phaseName: 'AID', order: 16 },
        { phaseId: '17-tasks', phaseName: 'Tasks', order: 17 },
        { phaseId: '18-sod', phaseName: 'SOD', order: 18 },
        { phaseId: '19-tdd', phaseName: 'TDD', order: 19 },
        { phaseId: '20-atd', phaseName: 'ATD', order: 20 },
        { phaseId: '21-std', phaseName: 'STD', order: 21 },
        { phaseId: '22-vsd', phaseName: 'VSD', order: 22 },
        { phaseId: '23-dep', phaseName: 'DEP', order: 23 },
        { phaseId: '24-mdd', phaseName: 'MDD', order: 24 },
        { phaseId: '25-aed', phaseName: 'AED', order: 25 },
        { phaseId: '26-chd', phaseName: 'CHD', order: 26 },
        { phaseId: '27-ced', phaseName: 'CED', order: 27 },
        { phaseId: '28-cca', phaseName: 'CCA', order: 28 }
      ],
      variants: []
    };
  }

  async loadPhaseConfig(phaseId) {
    return {
      phaseId,
      hero: { title: phaseId.toUpperCase(), description: 'Test', badge: 'Test' },
      form: { title: 'Test Form', subtitle: 'Test' },
      fields: []
    };
  }
}

describe('PhaseRouter - State Machine', () => {
  let router;
  let configLoader;
  let registry;

  beforeEach(async () => {
    configLoader = new MockConfigLoader();
    registry = await configLoader.loadRegistry();
    router = new PhaseRouter(configLoader, registry);
  });

  it('should return unavailable for unknown phase (not in registry)', () => {
    expect(router.getPhaseState('unknown-phase')).toBe('unavailable');
  });

  it('should return unlocked for 00-idea by default', () => {
    expect(router.getPhaseState('00-idea')).toBe('unlocked');
  });

  it('should return locked for other phases by default', () => {
    expect(router.getPhaseState('01-idd')).toBe('locked');
    expect(router.getPhaseState('02-prd')).toBe('locked');
  });

  it('should set and get phase state', () => {
    router.setPhaseState('01-idd', 'in-progress');
    expect(router.getPhaseState('01-idd')).toBe('in-progress');
    
    router.setPhaseState('01-idd', 'completed');
    expect(router.getPhaseState('01-idd')).toBe('completed');
  });

  it('should throw on invalid state', () => {
    expect(() => router.setPhaseState('01-idd', 'invalid')).toThrow('Estado inválido');
  });

  it('should complete phase and unlock next', () => {
    router.setPhaseState('00-idea', 'completed');
    router.complete('00-idea', {});
    
    expect(router.getPhaseState('00-idea')).toBe('completed');
    expect(router.getPhaseState('01-idd')).toBe('unlocked');
  });

  it('should unlock phase when prerequisites met', () => {
    router.setPhaseState('00-idea', 'completed');
    const result = router.unlock('01-idd', {});
    expect(result).toBe(true);
    expect(router.getPhaseState('01-idd')).toBe('unlocked');
  });

  it('should not unlock phase when prerequisites not met', () => {
    const result = router.unlock('01-idd', {});
    expect(result).toBe(false);
    expect(router.getPhaseState('01-idd')).toBe('locked');
  });

  it('should return unavailable for phases not in registry', () => {
    // Phases 07-16, 21-22, 26, 28 are not in registry (they exist but have no config files)
    // Actually they ARE in the registry above, so let's test with a truly unknown phase
    expect(router.getPhaseState('99-unknown')).toBe('unavailable');
  });

  it('should get available phases', () => {
    router.setPhaseState('00-idea', 'completed');
    router.setPhaseState('01-idd', 'in-progress');
    router.setPhaseState('02-prd', 'completed');
    
    const available = router.getAvailablePhases();
    expect(available).toContain('00-idea');
    expect(available).toContain('01-idd');
    expect(available).toContain('02-prd');
    expect(available).not.toContain('03-brd'); // locked
  });

  it('should calculate progress correctly', () => {
    router.setPhaseState('00-idea', 'completed');
    router.setPhaseState('01-idd', 'completed');
    router.setPhaseState('02-prd', 'in-progress');
    
    const progress = router.getProgress();
    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(29); // 00-idea through 28-cca
    expect(progress.percentage).toBe(Math.round(2/29 * 100));
  });
});

describe('PhaseRouter - Circular Detection', () => {
  let detector;

  beforeEach(() => {
    detector = new CircularDetector();
  });

  it('should detect simple cycle A -> B -> A', () => {
    const graph = new Map([
      ['A', new Set(['B'])],
      ['B', new Set(['A'])]
    ]);
    
    const result = detector.detectCycles(graph);
    expect(result.hasCycles).toBe(true);
    expect(result.cycles.length).toBeGreaterThan(0);
    expect(result.cycles[0]).toContain('A');
    expect(result.cycles[0]).toContain('B');
  });

  it('should detect longer cycle A -> B -> C -> A', () => {
    const graph = new Map([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
      ['C', new Set(['A'])]
    ]);
    
    const result = detector.detectCycles(graph);
    expect(result.hasCycles).toBe(true);
    expect(result.cycles[0].length).toBeGreaterThanOrEqual(3);
  });

  it('should not detect cycle in DAG', () => {
    const graph = new Map([
      ['A', new Set(['B', 'C'])],
      ['B', new Set(['D'])],
      ['C', new Set(['D'])],
      ['D', new Set()]
    ]);
    
    const result = detector.detectCycles(graph);
    expect(result.hasCycles).toBe(false);
  });

  it('should validate and throw on cycle', () => {
    const graph = new Map([
      ['A', new Set(['B'])],
      ['B', new Set(['A'])]
    ]);
    
    expect(() => detector.validateAndThrow(graph, 'test')).toThrow('Ciclo detectado');
  });

  it('should build config graph from fields', () => {
    const fields = [
      { id: 'fieldA', showWhen: { field: 'fieldB', equals: 'yes' } },
      { id: 'fieldB', showWhen: { field: 'fieldC', equals: 'yes' } },
      { id: 'fieldC' }
    ];
    
    const graph = detector.buildConfigGraph(fields);
    expect(graph.has('fieldA')).toBe(true);
    expect(graph.get('fieldB')).toContain('fieldA');
    expect(graph.get('fieldC')).toContain('fieldB');
  });

  it('should build phase graph from registry', () => {
    const registry = {
      phases: [
        { phaseId: '00-idea' },
        { phaseId: '01-idd' },
        { phaseId: '02-prd' }
      ],
      variants: []
    };
    
    const graph = detector.buildPhaseGraph(registry);
    expect(graph.has('00-idea')).toBe(true);
    expect(graph.has('01-idd')).toBe(true);
    expect(graph.has('02-prd')).toBe(true);
    // 00-idea -> 01-idd
    expect(graph.get('00-idea')).toContain('01-idd');
    // 01-idd -> 02-prd
    expect(graph.get('01-idd')).toContain('02-prd');
  });
});

describe('PhaseRouter - Condition Evaluation', () => {
  let router;
  let configLoader;
  let registry;

  beforeEach(async () => {
    configLoader = new MockConfigLoader();
    registry = await configLoader.loadRegistry();
    router = new PhaseRouter(configLoader, registry);
  });

  it('should evaluate simple condition', () => {
    const result = router.evaluateCondition('answers.stimulus === "problema"', { stimulus: 'problema' });
    expect(result).toBe(true);
    
    const result2 = router.evaluateCondition('answers.stimulus === "problema"', { stimulus: 'oportunidad' });
    expect(result2).toBe(false);
  });

  it('should handle complex conditions', () => {
    const condition = 'answers.stimulus === "problema" && answers.nature === "solucion"';
    expect(router.evaluateCondition(condition, { stimulus: 'problema', nature: 'solucion' })).toBe(true);
    expect(router.evaluateCondition(condition, { stimulus: 'problema', nature: 'herramienta' })).toBe(false);
  });

  it('should return false on invalid condition', () => {
    const result = router.evaluateCondition('invalid javascript', {});
    expect(result).toBe(false);
  });
});

describe('PhaseRouter - Variant Suggestion', () => {
  let router;
  let configLoader;
  let registry;

  beforeEach(async () => {
    configLoader = new MockConfigLoader();
    registry = await configLoader.loadRegistry();
    router = new PhaseRouter(configLoader, registry);
  });

  it('should suggest mercado for problema/solucion', () => {
    const variant = router.suggestIDDVariant({ stimulus: 'problema', nature: 'solucion' });
    expect(variant).toBe('mercado');
  });

  it('should suggest tecnica for problema/herramienta', () => {
    const variant = router.suggestIDDVariant({ stimulus: 'problema', nature: 'herramienta' });
    expect(variant).toBe('tecnica');
  });

  it('should suggest mercado for oportunidad/mercado', () => {
    const variant = router.suggestIDDVariant({ stimulus: 'oportunidad', nature: 'mercado' });
    expect(variant).toBe('mercado');
  });

  it('should suggest tecnica for curiosidad/herramienta', () => {
    const variant = router.suggestIDDVariant({ stimulus: 'curiosidad', nature: 'herramienta' });
    expect(variant).toBe('tecnica');
  });

  it('should suggest colaborativa for combinacion', () => {
    const variant = router.suggestIDDVariant({ stimulus: 'combinacion', nature: 'solucion' });
    expect(variant).toBe('colaborativa');
  });
});