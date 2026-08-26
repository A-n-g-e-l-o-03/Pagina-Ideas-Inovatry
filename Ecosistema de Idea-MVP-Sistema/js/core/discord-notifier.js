/**
 * DiscordNotifier — Envío robusto a Discord webhook con chunking, rate limit, retry, cola persistente
 * ES Module vanilla, export class DiscordNotifier
 */
export class DiscordNotifier {
  /**
   * @param {Object} options
   * @param {ConfigLoader} options.configLoader - Para resolver webhook por phaseGroup
   * @param {string} [options.honeypotFieldId='website'] - ID del campo honeypot
   * @param {number} [options.cooldownMs=5000] - Cooldown entre envíos por sesión
   * @param {number} [options.maxRetries=5] - Máximo reintentos (429, 5xx, network error)
   * @param {number} [options.maxQueueSize=100] - Tamaño máximo de la cola persistente
   */
  constructor({ configLoader, honeypotFieldId = 'website', cooldownMs = 5000, maxRetries = 5, maxQueueSize = 100 }) {
    this.configLoader = configLoader;
    this.honeypotFieldId = honeypotFieldId;
    this.cooldownMs = cooldownMs;
    this.maxRetries = maxRetries;
    this.maxQueueSize = maxQueueSize;

    // Event emitter para queue changes
    this.listeners = new Map();

    // Límites de Discord
    this.DISCORD_LIMITS = {
      fieldValue: 1024,
      description: 4096,
      maxFields: 25,
      maxEmbeds: 10,
      maxTotalChars: 6000
    };

    // Webhooks por defecto (placeholders) - 12 grupos según spec
    this.WEBHOOK_DEFAULTS = {
      idd: 'https://discord.com/api/webhooks/REEMPLAZAR_IDD',
      rdd: 'https://discord.com/api/webhooks/REEMPLAZAR_RDD',
      diseno: 'https://discord.com/api/webhooks/REEMPLAZAR_DISENO',
      tecnico: 'https://discord.com/api/webhooks/REEMPLAZAR_TECNICO',
      validacion: 'https://discord.com/api/webhooks/REEMPLAZAR_VALIDACION',
      mcp: 'https://discord.com/api/webhooks/REEMPLAZAR_MCP',
      operaciones: 'https://discord.com/api/webhooks/REEMPLAZAR_OPERACIONES',
      marketing: 'https://discord.com/api/webhooks/REEMPLAZAR_MARKETING',
      negocio: 'https://discord.com/api/webhooks/REEMPLAZAR_NEGOCIO',
      legal: 'https://discord.com/api/webhooks/REEMPLAZAR_LEGAL',
      finanzas: 'https://discord.com/api/webhooks/REEMPLAZAR_FINANZAS',
      investigacion: 'https://discord.com/api/webhooks/REEMPLAZAR_INVESTIGACION'
    };

    // Cola persistente en localStorage
    this.queueKey = 'ecosystem-webhook-queue';
    this.lastSubmitByGroup = new Map(); // cooldown por phaseGroup
    this.processingQueue = false;

    // Cargar cola persistente al inicializar
    this.loadQueue();
  }

  // ============================================================
  // EVENT EMITTER (para queue:changed)
  // ============================================================

  /**
   * Suscribe a un evento
   * @param {string} event - Nombre del evento
   * @param {Function} callback - Callback a ejecutar
   * @returns {Function} Función de unsubscribe
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => {
      const subs = this.listeners.get(event);
      if (subs) subs.delete(callback);
    };
  }

  /**
   * Emite un evento a todos los suscriptores
   * @param {string} event - Nombre del evento
   * @param {...any} args - Argumentos para el callback
   */
  emit(event, ...args) {
    const subs = this.listeners.get(event);
    if (subs) {
      subs.forEach(cb => {
        try {
          cb(...args);
        } catch (e) {
          console.warn('[DiscordNotifier] Error en listener:', event, e);
        }
      });
    }
  }

  // ============================================================
  // WEBHOOK RESOLUTION
  // ============================================================

  /**
   * Resuelve la URL del webhook para un phaseGroup
   * Prioridad: config.webhook.url (si existe y no es placeholder) → WEBHOOK_DEFAULTS[phaseGroup]
   * @param {string} phaseGroup
   * @param {Object} [phaseConfig] - Config de fase opcional para override
   * @returns {string|null} URL del webhook o null si no configurado
   */
  resolveWebhook(phaseGroup, phaseConfig = null) {
    // 1. Intentar desde config de fase si se proporciona
    if (phaseConfig?.webhook?.url && !this.isPlaceholder(phaseConfig.webhook.url)) {
      return phaseConfig.webhook.url;
    }

    // 2. Fallback a defaults por grupo
    const defaultUrl = this.WEBHOOK_DEFAULTS[phaseGroup];
    if (defaultUrl && !this.isPlaceholder(defaultUrl)) {
      return defaultUrl;
    }

    return null;
  }

  isPlaceholder(url) {
    return url.includes('REEMPLAZAR') || url.includes('PLACEHOLDER');
  }

  // ============================================================
  // EMBED BUILDER CON TEMPLATE INTERPOLATION
  // ============================================================

  /**
   * Construye embeds interpolando {{fieldId}} con formData
   * @param {Object} config - Config de fase (con webhook.embeds)
   * @param {Object} formData - Datos del formulario { fieldId: value }
   * @returns {Array<Object>} Array de embeds listos para Discord
   */
  buildEmbeds(config, formData) {
    const webhookConfig = config.webhook;
    if (!webhookConfig?.embeds) {
      return this.buildDefaultEmbed(config, formData);
    }

    const embedTemplate = webhookConfig.embeds;
    const embeds = Array.isArray(embedTemplate) ? embedTemplate : [embedTemplate];

    return embeds.map(embed => this.interpolateEmbed(embed, formData, config));
  }

  /**
   * Interpola un template de embed con formData
   */
  interpolateEmbed(embed, formData, config) {
    const result = { ...embed };

    // Interpolar title
    if (result.title) {
      result.title = this.interpolateTemplate(result.title, formData);
    }

    // Interpolar descriptionTemplate → description
    if (result.descriptionTemplate) {
      result.description = this.interpolateTemplate(result.descriptionTemplate, formData);
      delete result.descriptionTemplate;
    } else if (result.description) {
      result.description = this.interpolateTemplate(result.description, formData);
    }

    // Interpolar fields con valueTemplate
    if (Array.isArray(result.fields)) {
      result.fields = result.fields.map(field => {
        const newField = { ...field };
        if (newField.valueTemplate) {
          newField.value = this.interpolateTemplate(newField.valueTemplate, formData);
          delete newField.valueTemplate;
        } else if (newField.value) {
          newField.value = this.interpolateTemplate(newField.value, formData);
        }
        // Truncar field value si excede límite
        if (newField.value && newField.value.length > this.DISCORD_LIMITS.fieldValue) {
          newField.value = newField.value.slice(0, this.DISCORD_LIMITS.fieldValue - 3) + '...';
        }
        return newField;
      });
    }

    // Añadir timestamps localizados (America/Costa_Rica es-CR)
    const now = new Date();
    result.timestamp = now.toISOString();

    // Footer con timestamp es-CR
    const esCr = new Intl.DateTimeFormat('es-CR', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(now);
    result.footer = { text: `Enviado: ${esCr}` };

    // Username y avatar desde config
    if (webhookConfig.username) result.username = webhookConfig.username;
    if (webhookConfig.avatarUrl) result.avatar_url = webhookConfig.avatarUrl;

    return this.chunkEmbedIfNeeded(result);
  }

  /**
   * Interpola {{fieldId}} en template con valores de formData
   * Soporta arrays (se unen con ', ') y objetos (JSON.stringify)
   */
  interpolateTemplate(template, formData) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, fieldId) => {
      const value = formData[fieldId];
      if (value === undefined || value === null || value === '') {
        return '(no especificado)';
      }
      if (Array.isArray(value)) {
        return value.map(v => String(v)).join(', ');
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
  }

  /**
   * Chunking: divide embed si excede límites de Discord
   * - max 25 fields per embed
   * - max 4096 chars description
   * - max 1024 chars per field value
   * - max 6000 total chars per embed
   */
  chunkEmbedIfNeeded(embed) {
    const embeds = [embed];
    let currentEmbed = embed;

    // Verificar y dividir fields si > 25
    if (currentEmbed.fields && currentEmbed.fields.length > this.DISCORD_LIMITS.maxFields) {
      const chunks = this.chunkArray(currentEmbed.fields, this.DISCORD_LIMITS.maxFields);
      embeds.length = 0; // limpiar array original
      chunks.forEach((chunk, i) => {
        const newEmbed = { ...currentEmbed };
        newEmbed.fields = chunk;
        if (i > 0 && newEmbed.title) {
          newEmbed.title = `${newEmbed.title} (${i + 1}/${chunks.length})`;
        }
        embeds.push(newEmbed);
      });
      return embeds;
    }

    // Verificar description length
    if (currentEmbed.description && currentEmbed.description.length > this.DISCORD_LIMITS.description) {
      const desc = currentEmbed.description;
      const chunks = this.chunkText(desc, this.DISCORD_LIMITS.description);
      embeds.length = 0;
      chunks.forEach((chunk, i) => {
        const newEmbed = { ...currentEmbed };
        newEmbed.description = chunk;
        if (i > 0 && newEmbed.title) {
          newEmbed.title = `${newEmbed.title} (continuación ${i + 1})`;
        }
        // Mover fields a partir del segundo embed para no duplicar
        if (i > 0) {
          newEmbed.fields = [];
        }
        embeds.push(newEmbed);
      });
      return embeds;
    }

    // Verificar total chars aproximado
    const totalChars = this.estimateEmbedChars(currentEmbed);
    if (totalChars > this.DISCORD_LIMITS.maxTotalChars && currentEmbed.fields.length > 1) {
      // Dividir fields en múltiples embeds
      const fieldsPerEmbed = Math.ceil(currentEmbed.fields.length * this.DISCORD_LIMITS.maxTotalChars / totalChars);
      const chunks = this.chunkArray(currentEmbed.fields, Math.max(1, fieldsPerEmbed));
      embeds.length = 0;
      chunks.forEach((chunk, i) => {
        const newEmbed = { ...currentEmbed };
        newEmbed.fields = chunk;
        if (i > 0 && newEmbed.title) {
          newEmbed.title = `${newEmbed.title} (${i + 1}/${chunks.length})`;
        }
        if (i > 0) {
          newEmbed.description = '';
        }
        embeds.push(newEmbed);
      });
    }

    return embeds;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  chunkText(text, maxLen) {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLen) {
      chunks.push(text.slice(i, i + maxLen));
    }
    return chunks;
  }

  estimateEmbedChars(embed) {
    let total = 0;
    if (embed.title) total += embed.title.length;
    if (embed.description) total += embed.description.length;
    if (embed.fields) {
      total += embed.fields.reduce((sum, f) => sum + (f.name?.length || 0) + (f.value?.length || 0), 0);
    }
    return total;
  }

  /**
   * Embed por defecto si no hay template en config
   */
  buildDefaultEmbed(config, formData) {
    const now = new Date();
    const esCr = new Intl.DateTimeFormat('es-CR', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(now);

    const fields = [];
    for (const [fieldId, value] of Object.entries(formData)) {
      if (fieldId === this.honeypotFieldId) continue;
      const fieldConfig = config.fields?.find(f => f.id === fieldId);
      const label = fieldConfig?.label || fieldId;
      const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
      if (displayValue.trim()) {
        fields.push({
          name: label,
          value: displayValue.slice(0, this.DISCORD_LIMITS.fieldValue),
          inline: false
        });
      }
    }

    return [{
      title: config.phaseName || config.hero?.title || 'Envío de fase',
      description: `Fase: ${config.phaseId}${config.variant ? ` (${config.variant})` : ''}`,
      fields: fields.slice(0, this.DISCORD_LIMITS.maxFields),
      color: config.webhook?.embeds?.[0]?.color || 5793266,
      timestamp: now.toISOString(),
      footer: { text: `Enviado: ${esCr}` }
    }];
  }

  // ============================================================
  // HONEYPOT + COOLDOWN
  // ============================================================

  /**
   * Verifica si el honeypot está lleno (bot detection)
   */
  checkHoneypot(formData) {
    const value = formData[this.honeypotFieldId];
    return value && String(value).trim() !== '';
  }

  /**
   * Verifica cooldown para un phaseGroup
   */
  checkCooldown(phaseGroup) {
    const lastSubmit = this.lastSubmitByGroup.get(phaseGroup) || 0;
    return Date.now() - lastSubmit < this.cooldownMs;
  }

  /**
   * Registra envío exitoso para cooldown
   */
  recordSubmit(phaseGroup) {
    this.lastSubmitByGroup.set(phaseGroup, Date.now());
  }

  // ============================================================
  // RATE LIMIT + RETRY LOGIC
  // ============================================================

  /**
   * Envía payload a webhook con retry exponencial y rate limit handling
   * @param {string} webhookUrl
   * @param {Object} payload - { username, avatar_url, embeds }
   * @param {File[]} files - Archivos adjuntos opcionales
   * @returns {Promise<{success: boolean, error?: string, status?: number}>}
   */
  async sendWithRetry(webhookUrl, payload, files = []) {
    let attempt = 0;
    let lastError = null;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const result = await this.doSend(webhookUrl, payload, files);

        if (result.success) {
          return { success: true };
        }

        // Si es 429, manejar rate limit
        if (result.status === 429) {
          const retryAfter = result.retryAfter || this.calculateBackoff(attempt);
          console.log(`[DiscordNotifier] Rate limited (429). Waiting ${retryAfter}ms before retry ${attempt}/${this.maxRetries}`);
          await this.sleep(retryAfter);
          lastError = `Rate limited (429). Retry after ${retryAfter}ms`;
          continue;
        }

        // Si es 5xx, reintentar con backoff
        if (result.status >= 500 && result.status < 600) {
          const backoff = this.calculateBackoff(attempt);
          console.log(`[DiscordNotifier] Server error ${result.status}. Backoff ${backoff}ms before retry ${attempt}/${this.maxRetries}`);
          await this.sleep(backoff);
          lastError = `Server error ${result.status}`;
          continue;
        }

        // 4xx (except 429) = error permanente, no reintentar
        return { success: false, error: `HTTP ${result.status}: ${result.error}`, status: result.status };

      } catch (err) {
        // Network error u otro error de fetch
        if (attempt <= this.maxRetries) {
          const backoff = this.calculateBackoff(attempt);
          console.log(`[DiscordNotifier] Network error: ${err.message}. Backoff ${backoff}ms before retry ${attempt}/${this.maxRetries}`);
          await this.sleep(backoff);
          lastError = `Network error: ${err.message}`;
          continue;
        }
        lastError = `Network error after ${this.maxRetries} retries: ${err.message}`;
      }
    }

    return { success: false, error: lastError || 'Max retries exceeded' };
  }

  /**
   * Ejecuta el envío HTTP real
   */
  async doSend(webhookUrl, payload, files) {
    let response;
    if (files.length > 0) {
      const formData = new FormData();
      formData.append('payload_json', JSON.stringify(payload));
      files.forEach((file, i) => {
        formData.append(`files[${i}]`, file, file.name);
      });
      response = await fetch(webhookUrl, { method: 'POST', body: formData });
    } else {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    // Leer headers de rate limit
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const retryAfter = response.headers.get('Retry-After');

    if (!response.ok) {
      let errorText = '';
      try {
        const errJson = await response.json();
        errorText = errJson.message || JSON.stringify(errJson);
      } catch {
        errorText = await response.text();
      }

      return {
        success: false,
        status: response.status,
        error: errorText || response.statusText,
        retryAfter: retryAfter ? parseFloat(retryAfter) * 1000 : null,
        rateLimitRemaining: rateLimitRemaining ? parseInt(rateLimitRemaining, 10) : null
      };
    }

    return { success: true };
  }

  /**
   * Backoff exponencial: 1s, 2s, 4s, 8s, 16s, 30s (max)
   * @param {number} attempt - Número de intento (1-indexed)
   */
  calculateBackoff(attempt) {
    const base = 1000; // 1 segundo base
    const maxBackoff = 30000; // 30 segundos máximo
    const backoff = Math.min(base * Math.pow(2, attempt - 1), maxBackoff);
    // Añadir jitter (±10%)
    const jitter = backoff * 0.1 * (Math.random() * 2 - 1);
    return Math.round(backoff + jitter);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // PERSISTENT QUEUE
  // ============================================================

  /**
   * Carga la cola desde localStorage
   */
  loadQueue() {
    try {
      const saved = localStorage.getItem(this.queueKey);
      if (saved) {
        this.queue = JSON.parse(saved);
        // Filtrar items muy antiguos (> 24h) o corruptos
        const now = Date.now();
        this.queue = this.queue.filter(item => {
          return item.timestamp && (now - item.timestamp) < 24 * 60 * 60 * 1000;
        });
        this.saveQueue();
        console.log(`[DiscordNotifier] Loaded ${this.queue.length} items from persistent queue`);
      } else {
        this.queue = [];
      }
    } catch (e) {
      console.warn('[DiscordNotifier] Failed to load queue:', e);
      this.queue = [];
    }
  }

  /**
   * Guarda la cola en localStorage
   */
  saveQueue() {
    try {
      // Limitar tamaño
      if (this.queue.length > this.maxQueueSize) {
        this.queue = this.queue.slice(-this.maxQueueSize);
      }
      localStorage.setItem(this.queueKey, JSON.stringify(this.queue));
      this.emit('queue:changed', this.getQueueStatus());
    } catch (e) {
      console.warn('[DiscordNotifier] Failed to save queue:', e);
    }
  }

  /**
   * Añade item a la cola persistente
   */
  enqueue(item) {
    const queueItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      retries: 0
    };
    this.queue.push(queueItem);
    this.saveQueue();
    console.log(`[DiscordNotifier] Queued item ${queueItem.id} for ${item.phaseGroup}`);
  }

  /**
   * Procesa la cola pendiente
   * @returns {Promise<{processed: number, succeeded: number, failed: number}>}
   */
  async processQueue() {
    if (this.processingQueue || this.queue.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    this.processingQueue = true;
    let processed = 0, succeeded = 0, failed = 0;

    // Procesar en orden FIFO
    while (this.queue.length > 0) {
      const item = this.queue[0]; // peek
      const webhookUrl = this.resolveWebhook(item.phaseGroup, item.config);

      if (!webhookUrl) {
        console.warn(`[DiscordNotifier] No webhook configured for ${item.phaseGroup}, removing from queue`);
        this.queue.shift();
        this.saveQueue();
        failed++;
        continue;
      }

      // Verificar cooldown
      if (this.checkCooldown(item.phaseGroup)) {
        console.log(`[DiscordNotifier] Cooldown active for ${item.phaseGroup}, stopping queue processing`);
        break;
      }

      const result = await this.sendWithRetry(webhookUrl, item.payload, item.files || []);

      if (result.success) {
        this.queue.shift(); // remover de cola
        this.recordSubmit(item.phaseGroup);
        this.saveQueue();
        succeeded++;
      } else {
        // Incrementar reintentos
        item.retries++;
        if (item.retries >= this.maxRetries) {
          console.error(`[DiscordNotifier] Max retries reached for ${item.id}, moving to failed`);
          this.queue.shift();
          failed++;
        } else {
          // Re-queue para siguiente intento
          console.log(`[DiscordNotifier] Retry ${item.retries}/${this.maxRetries} for ${item.id}`);
        }
        this.saveQueue();
      }
      processed++;
    }

    this.processingQueue = false;
    console.log(`[DiscordNotifier] Queue processing complete: ${succeeded} succeeded, ${failed} failed`);
    return { processed, succeeded, failed };
  }

  /**
   * Estado de la cola
   */
  getQueueStatus() {
    return {
      pending: this.queue.length,
      failed: this.queue.filter(i => i.retries >= this.maxRetries).length,
      processing: this.processingQueue,
      items: this.queue.map(i => ({
        id: i.id,
        phaseGroup: i.phaseGroup,
        timestamp: i.timestamp,
        retries: i.retries
      }))
    };
  }

  /**
   * Reintenta todos los items fallidos
   * @returns {Promise<{processed: number, succeeded: number, failed: number}>}
   */
  async retryAll() {
    const failedItems = this.queue.filter(i => i.retries >= this.maxRetries);
    if (failedItems.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    // Resetear reintentos para permitir reprocesamiento
    failedItems.forEach(item => {
      item.retries = 0;
    });
    this.saveQueue();
    this.emit('queue:changed', this.getQueueStatus());

    return this.processQueue();
  }

  /**
   * Reintenta un item específico por ID
   * @param {string} itemId - ID del item a reintentar
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async retryItem(itemId) {
    const index = this.queue.findIndex(i => i.id === itemId);
    if (index === -1) {
      return { success: false, error: 'Item no encontrado en la cola' };
    }

    const item = this.queue[index];
    // Resetear reintentos
    item.retries = 0;
    this.saveQueue();
    this.emit('queue:changed', this.getQueueStatus());

    // Procesar solo este item
    const webhookUrl = this.resolveWebhook(item.phaseGroup, item.config);
    if (!webhookUrl) {
      return { success: false, error: `Webhook no configurado para ${item.phaseGroup}` };
    }

    const result = await this.sendWithRetry(webhookUrl, item.payload, item.files || []);
    if (result.success) {
      this.queue.splice(index, 1);
      this.recordSubmit(item.phaseGroup);
      this.saveQueue();
      this.emit('queue:changed', this.getQueueStatus());
      return { success: true };
    } else {
      this.saveQueue();
      this.emit('queue:changed', this.getQueueStatus());
      return { success: false, error: result.error };
    }
  }

  /**
   * Limpia la cola (para testing o reset)
   */
  clearQueue() {
    this.queue = [];
    this.saveQueue();
    this.emit('queue:changed', this.getQueueStatus());
  }

  // ============================================================
  // MAIN SEND API
  // ============================================================

  /**
   * Envía formulario a Discord webhook
   * @param {Object} params
   * @param {string} params.phaseId - ID de la fase (ej: '04-rdd')
   * @param {string} [params.variant] - Variante de la fase
   * @param {string} params.phaseGroup - Grupo de fase (idd, rdd, diseno, etc.)
   * @param {Object} params.formData - Datos del formulario { fieldId: value }
   * @param {Object} params.config - Config completa de la fase (para embed template)
   * @param {File[]} [params.files] - Archivos adjuntos opcionales
   * @returns {Promise<{success: boolean, error?: string, queued?: boolean}>}
   */
  async send({ phaseId, variant, phaseGroup, formData, config, files = [] }) {
    // 1. Honeypot check
    if (this.checkHoneypot(formData)) {
      console.log('[DiscordNotifier] Honeypot triggered, silently dropping');
      return { success: true, honeypot: true }; // Silent success para bots
    }

    // 2. Cooldown check
    if (this.checkCooldown(phaseGroup)) {
      const waitMs = this.cooldownMs - (Date.now() - (this.lastSubmitByGroup.get(phaseGroup) || 0));
      return { success: false, error: `Espere ${Math.ceil(waitMs / 1000)} segundos entre envíos`, cooldown: true };
    }

    // 3. Resolver webhook
    const webhookUrl = this.resolveWebhook(phaseGroup, config);
    if (!webhookUrl) {
      return { success: false, error: `Webhook no configurado para grupo: ${phaseGroup}` };
    }

    // 4. Verificar si es placeholder (no configurado en deploy)
    if (this.isPlaceholder(webhookUrl)) {
      return { success: false, error: 'Webhook no configurado (placeholder). Configure la URL en el despliegue.' };
    }

    // 5. Construir payload con embeds
    const embeds = this.buildEmbeds(config, formData);
    const payload = {
      username: config.webhook?.username || config.phaseName || 'Ecosistema Idea MVP',
      avatar_url: config.webhook?.avatarUrl || 'https://inovatrysolutions.com/assets/img/logo.webp',
      embeds
    };

    // 6. Validar tamaño de archivos
    if (files.length > 0) {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const maxSize = config.maxTotalBytes || 8388608; // 8MB default
      if (totalSize > maxSize) {
        return { success: false, error: `Archivos exceden límite de ${maxSize / 1024 / 1024}MB` };
      }
      // Validar tipos permitidos
      const allowedTypes = config.allowedTypes || ['.pdf', '.doc', '.docx', '.txt', '.csv'];
      for (const file of files) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!allowedTypes.includes(ext)) {
          return { success: false, error: `Tipo de archivo no permitido: ${ext}` };
        }
      }
    }

    // 7. Enviar con retry
    const result = await this.sendWithRetry(webhookUrl, payload, files);

    if (result.success) {
      this.recordSubmit(phaseGroup);
      // Procesar cola pendiente después de envío exitoso
      this.processQueue();
      return { success: true };
    }

    // 8. Si falla, encolar para reintento posterior
    this.enqueue({ phaseId, variant, phaseGroup, formData, config, files, payload });
    return { success: false, error: result.error, queued: true };
  }
}

// Export singleton instance getter (para uso global opcional)
let defaultInstance = null;
export function getDiscordNotifier(configLoader) {
  if (!defaultInstance && configLoader) {
    defaultInstance = new DiscordNotifier({ configLoader });
  }
  return defaultInstance;
}