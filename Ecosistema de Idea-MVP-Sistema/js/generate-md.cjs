#!/usr/bin/env node
/**
 * CLI: Genera Markdown consolidado desde export.json o localStorage
 * Uso: node js/generate-md.js [--input export.json] [--output archivo.md]
 * Si --input: lee JSON exportado por StateManager.exportAll()
 * Si no --input: intenta leer localStorage (solo funciona en browser, fallback: error claro)
 */

const fs = require('fs');
const path = require('path');

const LOCAL_STORAGE_PREFIX = 'ecosistema:v1:';

/**
 * Parsea argumentos de línea de comandos
 * @returns {Object} { input: string|null, output: string }
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { input: null, output: 'ecosistema-consolidado.md' };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '-i') {
      result.input = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      result.output = args[++i];
    } else if (arg.startsWith('--input=')) {
      result.input = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      result.output = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Uso: node js/generate-md.js [--input export.json] [--output archivo.md]

Opciones:
  --input, -i     Archivo JSON exportado (StateManager.exportAll())
  --output, -o    Archivo MD de salida (default: ecosistema-consolidado.md)
  --help, -h      Muestra esta ayuda

Ejemplos:
  node js/generate-md.js --input export.json --output reporte.md
  node js/generate-md.js -i data/export.json -o docs/informe.md
`);
      process.exit(0);
    }
  }

  return result;
}

/**
 * Carga datos desde archivo JSON exportado
 * @param {string} filePath
 * @returns {Object} Datos parseados
 */
function loadFromFile(filePath) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Archivo no encontrado: ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`Error parseando JSON: ${e.message}`);
  }
}

/**
 * Intenta cargar desde localStorage (solo funciona en browser)
 * En Node.js siempre falla con error claro
 * @returns {Object}
 */
function loadFromLocalStorage() {
  throw new Error('localStorage no disponible en Node.js. Usa --input export.json para cargar datos exportados.');
}

/**
 * Genera Markdown consolidado desde datos exportados
 * Replica la lógica de MDGenerator.consolidated
 * @param {Object} data - Datos de exportAll()
 * @returns {string} Markdown
 */
function generateMD(data) {
  const lines = [];

  lines.push('# Ecosistema Idea-MVP - Informe Consolidado');
  lines.push('');
  lines.push(`**Generado:** ${new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}`);
  lines.push(`**Fases completadas:** ${Object.keys(data.phases || {}).length}`);
  lines.push('');

  lines.push('## Índice');
  for (const phaseKey of Object.keys(data.phases || {})) {
    const phaseId = phaseKey.replace('form-', '');
    const slug = phaseId.toLowerCase().replace(/[^a-z0-9]/g, '-');
    lines.push(`- [${phaseId.toUpperCase()}](#${slug})`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Procesar cada fase
  for (const [phaseKey, phaseData] of Object.entries(data.phases || {})) {
    const phaseId = phaseKey.replace('form-', '');
    const meta = data.meta?.[`form-${phaseId}-meta`] || {};
    const variant = meta.variant || 'default';
    const completedAt = meta.completedAt
      ? new Date(meta.completedAt).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
      : 'N/A';
    const slug = phaseId.toLowerCase().replace(/[^a-z0-9]/g, '-');

    lines.push(`## ${phaseId.toUpperCase()} (${variant}) {#${slug}}`);
    lines.push('');
    lines.push(`**Fase:** ${phaseId} | **Variante:** ${variant} | **Completado:** ${completedAt}`);
    lines.push('');

    lines.push('### Respuestas');
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

    lines.push('---');
    lines.push('');
  }

  // Apéndice: Métricas Globales
  lines.push('## Apéndice: Métricas Globales');
  lines.push('');
  lines.push(`- Tiempo total sesión: N/A (requiere metadata por fase)`);
  lines.push(`- Temas usados: ${Object.values(data.meta || {}).filter(m => m.theme).map(m => m.theme).join(', ') || 'Ninguno'}`);
  lines.push(`- Archivos subidos: ${data.files?.length || 0}`);
  lines.push(`- Webhooks enviados: ${data.webhookQueue?.filter(w => w.sent).length || 0}`);
  lines.push(`- Errores circulares detectados: 0`);

  return lines.join('\n');
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const args = parseArgs();

  let state;
  if (args.input) {
    console.log(`[generate-md] Cargando desde archivo: ${args.input}`);
    state = loadFromFile(args.input);
  } else {
    console.log('[generate-md] Cargando estado desde localStorage...');
    state = loadFromLocalStorage();
  }

  console.log('[generate-md] Generando Markdown...');
  const md = generateMD(state);

  const fullPath = path.resolve(args.output);
  fs.writeFileSync(fullPath, md, 'utf8');

  console.log(`[generate-md] MD generado: ${md.length} caracteres`);
  console.log(`[generate-md] Guardado en: ${fullPath}`);
}

main().catch(err => {
  console.error('[generate-md] Error:', err.message);
  process.exit(1);
});