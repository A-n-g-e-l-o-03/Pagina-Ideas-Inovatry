#!/usr/bin/env node
/**
 * migrate-00-idea.js — Script de migración datos 00-Idea legacy → nuevo formato
 *
 * Uso: node js/migrate-00-idea.js
 *
 * Lee:
 * - ../../00-Idea/js/form-config.json (config legacy)
 * - localStorage del usuario (simulado via archivo o keys idea-survey-*)
 *
 * Convierte:
 * - Keys planas idea-survey-* → ecosystem-form-00-idea + ecosystem-phase-states
 *
 * Output: migration-report.json con { migrated, errors, warnings, timestamp }
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURACIÓN DE RUTAS
// ============================================================
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const LEGACY_DIR = path.join(PROJECT_ROOT, '00-Idea');
const LEGACY_CONFIG = path.join(LEGACY_DIR, 'js', 'form-config.json');
const LEGACY_INDEX = path.join(LEGACY_DIR, 'index.html');
const ECOSYSTEM_DIR = path.join(PROJECT_ROOT, 'Ecosistema de Idea-MVP-Sistema');
const REPORT_FILE = path.join(ECOSYSTEM_DIR, 'migration-report.json');

// Keys legacy esperadas en localStorage del usuario
const LEGACY_KEYS = [
  'idea-survey-theme',
  'idea-survey-answers',
  'idea-survey-phase-states',
  'idea-survey-files' // si existía
];

// ============================================================
// UTILIDADES
// ============================================================

function log(...args) {
  console.log('[Migrate]', new Date().toISOString(), ...args);
}

function logError(...args) {
  console.error('[Migrate ERROR]', new Date().toISOString(), ...args);
}

function logWarn(...args) {
  console.warn('[Migrate WARN]', new Date().toISOString(), ...args);
}

/**
 * Simula localStorage leyendo desde un archivo JSON (para Node.js)
 * En producción real, esto se ejecutaría en el navegador del usuario
 */
class MockLocalStorage {
  constructor() {
    this.store = new Map();
    this.loadFromFile();
  }

  loadFromFile() {
    const storageFile = path.join(ECOSYSTEM_DIR, 'legacy-localStorage.json');
    if (fs.existsSync(storageFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(storageFile, 'utf-8'));
        for (const [k, v] of Object.entries(data)) {
          this.store.set(k, v);
        }
        log(`Cargado localStorage simulado desde ${storageFile} (${this.store.size} keys)`);
      } catch (e) {
        logWarn('No se pudo cargar localStorage simulado:', e.message);
      }
    } else {
      log('No existe legacy-localStorage.json, se usará localStorage vacío');
    }
  }

  saveToFile() {
    const storageFile = path.join(ECOSYSTEM_DIR, 'legacy-localStorage.json');
    const data = Object.fromEntries(this.store);
    fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
    log(`Guardado localStorage simulado en ${storageFile}`);
  }

  getItem(key) {
    return this.store.get(key) || null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    return Array.from(this.store.keys())[index] || null;
  }

  clear() {
    this.store.clear();
  }

  // Para debugging: obtener todas las keys legacy
  getLegacyKeys() {
    return Array.from(this.store.keys()).filter(k => k.startsWith('idea-survey-'));
  }

  // Obtener todas las keys nuevas
  getNewKeys() {
    return Array.from(this.store.keys()).filter(k => k.startsWith('ecosystem-'));
  }
}

// ============================================================
// MAPEO DE CAMPOS LEGACY → NUEVO FORMATO
// ============================================================

/**
 * Los campos del 00-Idea legacy coinciden con el nuevo ecosystem-form-00-idea
 * porque la config nueva se generó a partir de la legacy.
 * Solo necesitamos renames de keys de localStorage.
 */
const FIELD_MAPPING = {
  // Los field IDs son idénticos, solo cambian las keys de storage
  // Mapeo directo 1:1
  direct: [
    'place', 'detail_place',
    'time', 'detail_time',
    'activity', 'detail_activity',
    'stimulus', 'detail_stimulus',
    'influences', 'detail_influences',
    'emotion', 'detail_emotion',
    'originality', 'detail_originality',
    'nature', 'detail_nature',
    'complexity', 'detail_complexity',
    'age', 'detail_age',
    'current_state', 'detail_current_state',
    'validated_with', 'detail_validated_with',
    'major_challenge', 'detail_major_challenge',
    'scale', 'detail_scale',
    'risks', 'detail_risks',
    'business_potential', 'detail_business_potential',
    'summary'
  ]
};

// ============================================================
// FUNCIONES DE MIGRACIÓN
// ============================================================

/**
 * Migra theme
 */
function migrateTheme(localStorage) {
  const legacyTheme = localStorage.getItem('idea-survey-theme');
  if (legacyTheme) {
    const validThemes = ['light', 'dark', 'protanopia', 'deuteranopia', 'tritanopia', 'mono'];
    const theme = validThemes.includes(legacyTheme) ? legacyTheme : 'light';
    localStorage.setItem('ecosystem-theme', theme);
    log(`Theme migrado: ${legacyTheme} → ${theme}`);
    return { migrated: 1, key: 'theme' };
  }
  return { migrated: 0 };
}

/**
 * Migra respuestas del formulario
 */
function migrateFormAnswers(localStorage) {
  const legacyAnswers = localStorage.getItem('idea-survey-answers');
  if (!legacyAnswers) {
    logWarn('No se encontró idea-survey-answers');
    return { migrated: 0 };
  }

  try {
    const parsed = JSON.parse(legacyAnswers);

    // Validar que tiene estructura esperada
    const expectedFields = FIELD_MAPPING.direct;
    const foundFields = Object.keys(parsed);
    const missingFields = expectedFields.filter(f => !(f in parsed));
    const extraFields = foundFields.filter(f => !expectedFields.includes(f));

    if (missingFields.length > 0) {
      logWarn(`Campos esperados faltantes en legacy: ${missingFields.join(', ')}`);
    }
    if (extraFields.length > 0) {
      logWarn(`Campos extra en legacy (se conservarán): ${extraFields.join(', ')}`);
    }

    // Guardar en nuevo formato
    localStorage.setItem('ecosystem-form-00-idea', JSON.stringify(parsed));

    log(`Respuestas migradas: ${foundFields.length} campos`);
    return {
      migrated: 1,
      key: 'form-00-idea',
      fieldsCount: foundFields.length,
      missingFields,
      extraFields
    };
  } catch (e) {
    logError('Error parseando idea-survey-answers:', e.message);
    return { migrated: 0, error: e.message };
  }
}

/**
 * Migra phase states
 */
function migratePhaseStates(localStorage) {
  const legacyPhaseStates = localStorage.getItem('idea-survey-phase-states');
  if (!legacyPhaseStates) {
    log('No se encontró idea-survey-phase-states, creando default');
    const defaultStates = { '00-idea': 'completed' }; // Asumimos que 00-idea se completó
    localStorage.setItem('ecosystem-phase-states', JSON.stringify(defaultStates));
    return { migrated: 1, key: 'phase-states', note: 'created default' };
  }

  try {
    const parsed = JSON.parse(legacyPhaseStates);

    // Normalizar: 00-idea debe estar completed si tiene respuestas
    const hasAnswers = localStorage.getItem('idea-survey-answers');
    if (hasAnswers && (!parsed['00-idea'] || parsed['00-idea'] === 'locked')) {
      parsed['00-idea'] = 'completed';
      log('Normalizado: 00-idea → completed (tenía respuestas)');
    }

    // Asegurar que 00-idea esté al menos unlocked
    if (!parsed['00-idea']) {
      parsed['00-idea'] = 'unlocked';
    }

    localStorage.setItem('ecosystem-phase-states', JSON.stringify(parsed));
    log(`Phase states migrados: ${Object.keys(parsed).join(', ')}`);
    return { migrated: 1, key: 'phase-states', states: parsed };
  } catch (e) {
    logError('Error parseando idea-survey-phase-states:', e.message);
    return { migrated: 0, error: e.message };
  }
}

/**
 * Migra archivos si existen (legacy no tenía, pero por completitud)
 */
function migrateFiles(localStorage) {
  const legacyFiles = localStorage.getItem('idea-survey-files');
  if (legacyFiles) {
    try {
      const parsed = JSON.parse(legacyFiles);
      // En el nuevo formato, los archivos van a IndexedDB, no localStorage
      // Aquí solo logeamos para el reporte
      log(`Archivos legacy encontrados: ${parsed.length} (requieren migración manual a IndexedDB)`);
      return { migrated: 0, key: 'files', note: 'require manual migration to IndexedDB', count: parsed.length };
    } catch (e) {
      logError('Error parseando idea-survey-files:', e.message);
      return { migrated: 0, error: e.message };
    }
  }
  return { migrated: 0, key: 'files' };
}

/**
 * Crea completed-phases array basado en phase-states
 */
function createCompletedPhases(localStorage) {
  const phaseStatesStr = localStorage.getItem('ecosystem-phase-states');
  if (!phaseStatesStr) return { migrated: 0 };

  try {
    const phaseStates = JSON.parse(phaseStatesStr);
    const completed = Object.entries(phaseStates)
      .filter(([, state]) => state === 'completed')
      .map(([phase]) => phase);

    if (completed.length > 0) {
      localStorage.setItem('ecosystem-completed-phases', JSON.stringify(completed));
      log(`Completed phases creado: ${completed.join(', ')}`);
      return { migrated: 1, key: 'completed-phases', phases: completed };
    }
    return { migrated: 0, key: 'completed-phases' };
  } catch (e) {
    logError('Error creando completed-phases:', e.message);
    return { migrated: 0, error: e.message };
  }
}

/**
 * Valida la config legacy contra el schema nuevo (basic check)
 */
function validateLegacyConfig() {
  if (!fs.existsSync(LEGACY_CONFIG)) {
    return { valid: false, error: `No existe ${LEGACY_CONFIG}` };
  }

  try {
    const config = JSON.parse(fs.readFileSync(LEGACY_CONFIG, 'utf-8'));

    // Checks básicos
    const required = ['hero', 'form', 'sections', 'fields', 'webhook'];
    const missing = required.filter(r => !(r in config));
    if (missing.length > 0) {
      return { valid: false, error: `Config legacy incompleta, faltan: ${missing.join(', ')}` };
    }

    if (!Array.isArray(config.fields) || config.fields.length !== 33) {
      return { valid: false, error: `Se esperaban 33 campos, encontrados ${config.fields?.length || 0}` };
    }

    log(`Config legacy validada: ${config.fields.length} campos, ${Object.keys(config.sections).length} secciones`);
    return { valid: true, fieldCount: config.fields.length, sectionCount: Object.keys(config.sections).length };
  } catch (e) {
    return { valid: false, error: `Error leyendo config legacy: ${e.message}` };
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log('=== INICIANDO MIGRACIÓN 00-IDEA → ECOSISTEMA ===');

  const report = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    migrated: 0,
    errors: [],
    warnings: [],
    details: {}
  };

  // 1. Validar config legacy
  const configValidation = validateLegacyConfig();
  if (!configValidation.valid) {
    report.errors.push(configValidation.error);
    logError('Validación de config falló:', configValidation.error);
  } else {
    report.details.configValidation = configValidation;
  }

  // 2. Inicializar mock localStorage
  const localStorage = new MockLocalStorage();

  // 3. Verificar qué keys legacy existen
  const legacyKeysFound = localStorage.getLegacyKeys();
  log(`Keys legacy encontradas: ${legacyKeysFound.join(', ') || 'ninguna'}`);
  report.details.legacyKeysFound = legacyKeysFound;

  if (legacyKeysFound.length === 0) {
    report.warnings.push('No se encontraron datos legacy en localStorage simulado');
    logWarn('No hay datos legacy para migrar. ¿Ejecutaste la encuesta 00-Idea en el navegador?');
  }

  // 4. Ejecutar migraciones
  const results = [];

  results.push(migrateTheme(localStorage));
  results.push(migrateFormAnswers(localStorage));
  results.push(migratePhaseStates(localStorage));
  results.push(migrateFiles(localStorage));
  results.push(createCompletedPhases(localStorage));

  // 5. Contar migrados y recopilar errores/warnings
  for (const r of results) {
    report.migrated += r.migrated || 0;
    if (r.error) report.errors.push(`${r.key}: ${r.error}`);
    if (r.missingFields?.length) report.warnings.push(`Campos faltantes en ${r.key}: ${r.missingFields.join(', ')}`);
    if (r.extraFields?.length) report.warnings.push(`Campos extra en ${r.key}: ${r.extraFields.join(', ')}`);
    if (r.note) report.warnings.push(`${r.key}: ${r.note}`);
    report.details[r.key] = r;
  }

  // 6. Guardar localStorage actualizado (simulado)
  localStorage.saveToFile();

  // 7. Verificar keys nuevas creadas
  const newKeys = localStorage.getNewKeys();
  log(`Keys nuevas creadas: ${newKeys.join(', ')}`);
  report.details.newKeysCreated = newKeys;

  // 8. Guardar reporte
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  log(`Reporte guardado en ${REPORT_FILE}`);

  // 9. Resumen final
  console.log('\n=== RESUMEN MIGRACIÓN ===');
  console.log(`Migrados: ${report.migrated} items`);
  console.log(`Errores: ${report.errors.length}`);
  console.log(`Warnings: ${report.warnings.length}`);
  console.log(`Keys nuevas: ${newKeys.join(', ')}`);

  if (report.errors.length > 0) {
    console.log('\nERRORES:');
    report.errors.forEach(e => console.log(`  - ${e}`));
    process.exitCode = 1;
  }

  if (report.warnings.length > 0) {
    console.log('\nWARNINGS:');
    report.warnings.forEach(w => console.log(`  - ${w}`));
  }

  log('=== MIGRACIÓN COMPLETADA ===');
  return report;
}

// Ejecutar si es script principal
if (require.main === module) {
  main().catch(err => {
    logError('Error fatal:', err);
    process.exit(1);
  });
}

module.exports = { main, MockLocalStorage, migrateTheme, migrateFormAnswers, migratePhaseStates, migrateFiles, createCompletedPhases };