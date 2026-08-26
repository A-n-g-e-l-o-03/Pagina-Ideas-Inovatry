/**
 * MDGenerator — Generación de Markdown por fase y consolidado
 * ES Module vanilla, export class MDGenerator
 */
export class MDGenerator {
  /**
   * @param {StateManager} stateManager - Instancia del StateManager para persistir y leer datos
   */
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.templates = {
      phase: this.getPhaseTemplate(),
      consolidated: this.getConsolidatedTemplate()
    };
  }

  // ============================================================
  // TEMPLATES
  // ============================================================

  /**
   * Template para una fase individual
   * @returns {string}
   */
  getPhaseTemplate() {
    return `---
title: "{{phaseName}}"
phaseId: "{{phaseId}}"
variant: "{{variant}}"
completedAt: "{{completedAt}}"
version: 1
---

# {{phaseName}}

**Fase:** {{phaseId}} | **Variante:** {{variant}} | **Completado:** {{completedAt}}

## Respuestas

{{#each sections}}
### {{title}}
{{#each fields}}
**{{label}}** {{#if required}}*{{/if}}
{{value}}
{{/each}}
{{/each}}

## Metadatos
- Tiempo total: {{duration}}
- Tema activo: {{theme}}
- Usuario: {{userAgent}}
`;
  }

  /**
   * Template para informe consolidado
   * @returns {string}
   */
  getConsolidatedTemplate() {
    return `---
title: "Ecosistema Idea-MVP - Informe Consolidado"
generatedAt: "{{generatedAt}}"
totalPhases: {{totalPhases}}
completedPhases: {{completedPhases}}
---

# Ecosistema Idea-MVP - Informe Consolidado

**Generado:** {{generatedAt}}  
**Fases completadas:** {{completedPhases}} de {{totalPhases}}

## Índice
{{#each phases}}
- [{{phaseName}} ({{variant}})](#{{slug}})
{{/each}}

---

{{#each phases}}
## {{phaseName}} ({{variant}}) {#{{slug}}}

**Fase:** {{phaseId}} | **Variante:** {{variant}} | **Completado:** {{completedAt}}

### Respuestas
{{#each sections}}
#### {{title}}
{{#each fields}}
**{{label}}** {{#if required}}*{{/if}}
{{value}}
{{/each}}
{{/each}}

---

{{/each}}

## Apéndice: Métricas Globales
- Tiempo total sesión: {{totalDuration}}
- Temas usados: {{themesUsed}}
- Archivos subidos: {{totalFiles}}
- Webhooks enviados: {{totalWebhooks}}
- Errores circulares detectados: {{circularErrors}}
`;
  }

  // ============================================================
  // RENDER ENGINE (Handlebars-style simple regex replace)
  // ============================================================

  /**
   * Renderiza un template con datos usando sintaxis Handlebars simplificada
   * Soporta: {{key}}, {{#each array}}...{{/each}}, {{#if condition}}...{{/if}}
   * Maneja bloques anidados correctamente procesando de adentro hacia afuera
   * @param {string} template - Template string
   * @param {Object} data - Datos para renderizar
   * @returns {string} Template renderizado
   */
  render(template, data) {
    return this.renderRecursive(template, data);
  }

  /**
   * Renderiza recursivamente manejando anidamiento
   * @param {string} template
   * @param {Object} data
   * @returns {string}
   */
  renderRecursive(template, data) {
    let result = template;

    // Procesar each blocks (manejando anidamiento con función que encuentra pares correspondientes)
    result = this.processEachBlocks(result, data);

    // Procesar if blocks
    result = this.processIfBlocks(result, data);

    // Reemplazar variables simples
    result = this.renderVariables(result, data);

    return result;
  }

  /**
   * Procesa bloques {{#each array}}...{{/each}} manejando anidamiento correctamente
   * @param {string} template
   * @param {Object} data
   * @returns {string}
   */
  processEachBlocks(template, data) {
    // Función recursiva que encuentra y procesa el primer each sin procesar
    const processEach = (tmpl, ctx) => {
      const regex = /\{\{#each\s+(\w+)\}\}/g;
      let match;
      const replacements = [];

      while ((match = regex.exec(tmpl)) !== null) {
        const arrayKey = match[1];
        const startPos = match.index;
        const array = this.getNestedValue(ctx, arrayKey);
        
        if (!Array.isArray(array)) {
          // Si no es array, buscar el cierre y reemplazar con vacío
          let depth = 1;
          let pos = regex.lastIndex;
          while (pos < tmpl.length && depth > 0) {
            const nextEach = tmpl.indexOf('{{#each ', pos);
            const nextEnd = tmpl.indexOf('{{/each}}', pos);
            if (nextEach !== -1 && (nextEnd === -1 || nextEach < nextEnd)) {
              depth++;
              pos = nextEach + 8;
            } else if (nextEnd !== -1) {
              depth--;
              if (depth === 0) {
                replacements.push({ start: startPos, end: nextEnd + '{{/each}}'.length, replacement: '' });
                break;
              }
              pos = nextEnd + '{{/each}}'.length;
            } else {
              break;
            }
          }
          continue;
        }

        // Encontrar el {{/each}} correspondiente (manejando anidamiento)
        let depth = 1;
        let pos = regex.lastIndex;
        let endPos = -1;
        
        while (pos < tmpl.length && depth > 0) {
          const nextEach = tmpl.indexOf('{{#each ', pos);
          const nextEnd = tmpl.indexOf('{{/each}}', pos);
          
          if (nextEach !== -1 && (nextEnd === -1 || nextEach < nextEnd)) {
            depth++;
            pos = nextEach + 8;
          } else if (nextEnd !== -1) {
            depth--;
            if (depth === 0) {
              endPos = nextEnd;
              break;
            }
            pos = nextEnd + '{{/each}}'.length;
          } else {
            break;
          }
        }

        if (endPos === -1) break;

        const blockContent = tmpl.slice(regex.lastIndex, endPos);
        
        // Procesar contenido del bloque recursivamente para cada item
        const renderedItems = array.map(item => {
          let itemResult = blockContent;
          itemResult = this.processEachBlocks(itemResult, item);
          itemResult = this.processIfBlocks(itemResult, item);
          itemResult = this.renderVariables(itemResult, item);
          return itemResult;
        }).join('');

        replacements.push({ 
          start: startPos, 
          end: endPos + '{{/each}}'.length, 
          replacement: renderedItems 
        });
      }

      // Aplicar reemplazos de atrás hacia adelante para no afectar índices
      replacements.sort((a, b) => b.start - a.start);
      let output = tmpl;
      for (const r of replacements) {
        output = output.slice(0, r.start) + r.replacement + output.slice(r.end);
      }

      return output;
    };

    return processEach(template, data);
  }

  /**
   * Procesa bloques {{#if condition}}...{{/if}}
   * @param {string} template
   * @param {Object} data
   * @returns {string}
   */
  processIfBlocks(template, data) {
    const regex = /\{\{#if\s+(\w+)\}\}/g;
    let match;
    let output = template;
    const replacements = [];

    while ((match = regex.exec(template)) !== null) {
      const conditionKey = match[1];
      const startPos = match.index;
      const value = this.getNestedValue(data, conditionKey);

      // Encontrar {{/if}} correspondiente
      let depth = 1;
      let pos = regex.lastIndex;
      let endPos = -1;
      
      while (pos < template.length && depth > 0) {
        const nextIf = template.indexOf('{{#if ', pos);
        const nextEnd = template.indexOf('{{/if}}', pos);
        
        if (nextIf !== -1 && (nextEnd === -1 || nextIf < nextEnd)) {
          depth++;
          pos = nextIf + 6;
        } else if (nextEnd !== -1) {
          depth--;
          if (depth === 0) {
            endPos = nextEnd;
            break;
          }
          pos = nextEnd + '{{/if}}'.length;
        } else {
          break;
        }
      }

      if (endPos === -1) break;

      const blockContent = template.slice(regex.lastIndex, endPos);
      
      // Procesar contenido recursivamente
      let processedContent = this.processEachBlocks(blockContent, data);
      processedContent = this.processIfBlocks(processedContent, data);
      processedContent = this.renderVariables(processedContent, data);
      
      const replacement = value ? processedContent : '';
      
      replacements.push({ 
        start: startPos, 
        end: endPos + '{{/if}}'.length, 
        replacement 
      });
    }

    // Aplicar reemplazos
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) {
      output = output.slice(0, r.start) + r.replacement + output.slice(r.end);
    }

    return output;
  }

  /**
   * Reemplaza variables simples {{key}} con valores del objeto data
   * Soporta notación de punto para objetos anidados (ej: {{user.name}})
   * @param {string} template
   * @param {Object} data
   * @returns {string}
   */
  renderVariables(template, data) {
    // Regex que permite puntos en la key para acceso anidado
    return template.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
      const value = this.getNestedValue(data, key);
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  /**
   * Obtiene valor anidado usando notación de punto (ej: 'user.name')
   * @param {Object} obj
   * @param {string} path
   * @returns {any}
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ============================================================
  // DATA PREPARATION
  // ============================================================

  /**
   * Prepara datos para template de fase
   * @param {string} phaseId
   * @param {string} variant
   * @param {Object} answers - Respuestas del formulario
   * @param {Object} meta - Metadatos adicionales
   * @returns {Object}
   */
  preparePhaseData(phaseId, variant, answers, meta = {}) {
    const phaseConfig = this.getPhaseConfig(phaseId);
    const phaseName = phaseConfig?.phaseName || phaseId.toUpperCase();
    const completedAt = new Date(meta.completedAt || Date.now()).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
    
    // Transformar respuestas en secciones/campos
    const sections = this.transformAnswersToSections(answers, phaseConfig);
    
    return {
      phaseName,
      phaseId,
      variant: variant || 'default',
      completedAt,
      duration: meta.duration ? this.formatDuration(meta.duration) : 'N/A',
      theme: meta.theme || 'light',
      userAgent: meta.userAgent || navigator.userAgent,
      sections
    };
  }

  /**
   * Prepara datos para template consolidado
   * @param {Object} exportData - Datos exportados del StateManager
   * @returns {Object}
   */
  prepareConsolidatedData(exportData) {
    const phases = [];
    let totalDuration = 0;
    const themesUsed = new Set();
    let totalFiles = 0;
    let totalWebhooks = 0;
    let circularErrors = 0;

    // Procesar cada fase completada
    for (const [phaseKey, phaseData] of Object.entries(exportData.phases || {})) {
      const phaseId = phaseKey.replace('form-', '');
      const meta = exportData.meta?.[`form-${phaseId}-meta`] || {};
      
      if (meta.completedAt) {
        const phaseConfig = this.getPhaseConfig(phaseId);
        const phaseName = phaseConfig?.phaseName || phaseId.toUpperCase();
        const variant = meta.variant || 'default';
        const completedAt = new Date(meta.completedAt).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
        const slug = phaseId.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        const sections = this.transformAnswersToSections(phaseData, phaseConfig);
        
        phases.push({
          phaseName,
          phaseId,
          variant,
          completedAt,
          slug,
          sections
        });

        if (meta.duration) totalDuration += meta.duration;
        if (meta.theme) themesUsed.add(meta.theme);
      }
    }

    // Contar archivos y webhooks
    if (exportData.files) totalFiles = exportData.files.length;
    if (exportData.webhookQueue) totalWebhooks = exportData.webhookQueue.filter(w => w.sent).length;

    const generatedAt = new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });

    return {
      generatedAt,
      totalPhases: phases.length,
      completedPhases: phases.length,
      phases,
      totalDuration: this.formatDuration(totalDuration),
      themesUsed: Array.from(themesUsed).join(', ') || 'Ninguno',
      totalFiles,
      totalWebhooks,
      circularErrors
    };
  }

  /**
   * Transforma respuestas planas en estructura de secciones/campos
   * @param {Object} answers
   * @param {Object} phaseConfig
   * @returns {Array}
   */
  transformAnswersToSections(answers, phaseConfig) {
    const sections = [];
    
    if (!phaseConfig?.sections) {
      // Fallback: agrupar por prefijo o poner todo en una sección
      return [{
        title: 'Respuestas',
        fields: Object.entries(answers || {}).map(([id, value]) => ({
          label: id,
          required: false,
          value: this.formatValue(value)
        }))
      }];
    }

    for (const section of phaseConfig.sections) {
      const fields = [];
      for (const field of section.fields || []) {
        const value = answers?.[field.id];
        if (value !== undefined && value !== null && value !== '') {
          fields.push({
            label: field.label || field.id,
            required: field.required || false,
            value: this.formatValue(value)
          });
        }
      }
      if (fields.length > 0) {
        sections.push({
          title: section.title || section.id,
          fields
        });
      }
    }
    return sections;
  }

  /**
   * Formatea un valor para display en MD
   * @param {any} value
   * @returns {string}
   */
  formatValue(value) {
    if (Array.isArray(value)) {
      return value.map(v => `- ${v}`).join('\n');
    }
    if (typeof value === 'object' && value !== null) {
      return '\n```json\n' + JSON.stringify(value, null, 2) + '\n```\n';
    }
    return String(value);
  }

  /**
   * Formatea duración en ms a string legible
   * @param {number} ms
   * @returns {string}
   */
  formatDuration(ms) {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Obtiene config de fase desde registry (busca en configs/phases/)
   * @param {string} phaseId
   * @returns {Object|null}
   */
  getPhaseConfig(phaseId) {
    // Intentar obtener de localStorage cache o configs
    // Por ahora retornamos null y se usará el fallback en preparePhaseData
    // En producción esto podría cargar desde config-loader
    return null;
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Genera MD de una fase específica
   * @param {string} phaseId
   * @param {string} variant
   * @param {Object} answers
   * @param {Object} meta
   * @returns {Promise<string>} Markdown generado
   */
  async generatePhaseMD(phaseId, variant, answers, meta = {}) {
    const data = this.preparePhaseData(phaseId, variant, answers, meta);
    const md = this.render(this.templates.phase, data);
    
    // Guardar en StateManager
    await this.stateManager.set(`md-${phaseId}-${variant}`, { 
      md, 
      generatedAt: Date.now(),
      phaseId,
      variant
    });
    
    // Descargar
    this.downloadMD(md, `${phaseId}-${variant}.md`);
    
    return md;
  }

  /**
   * Genera MD consolidado de todas las fases
   * @returns {Promise<string>} Markdown consolidado
   */
  async generateConsolidatedMD() {
    const exportData = await this.stateManager.exportAll();
    const data = this.prepareConsolidatedData(exportData);
    const md = this.render(this.templates.consolidated, data);
    
    // Guardar en StateManager
    await this.stateManager.set('md-consolidated', { 
      md, 
      generatedAt: Date.now() 
    });
    
    // Descargar
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    this.downloadMD(md, `ecosistema-idea-mvp-consolidado-${timestamp}.md`);
    
    return md;
  }

  /**
   * Descarga contenido como archivo MD
   * @param {string} content
   * @param {string} filename
   */
  downloadMD(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export default MDGenerator;