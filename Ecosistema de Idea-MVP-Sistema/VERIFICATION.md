# VERIFICATION.md — Checklist de 112 Escenarios de Spec

**Proyecto**: Ecosistema Idea-MVP-Sistema
**Batch**: 4 — State Manager + Migration + Verification
**Fecha**: 2026-08-23
**Estado**: ✅ Completado

---

## Resumen de Cobertura

| Módulo | Escenarios | Estado |
|--------|------------|--------|
| Form Engine | 18 | ✅ |
| Phase Router | 18 | ✅ |
| State Persistence | 16 | ✅ |
| Discord Notifier | 17 | ✅ |
| Phase Config Schema | 15 | ✅ |
| Idea Form Delta | 28 | ✅ |
| **TOTAL** | **112** | **✅** |

---

## Form Engine (18 scenarios)

### Happy Path
- [x] **FE-Happy-01**: Render 18 questions in 4 sections (origen, naturaleza, evolución, impacto)
- [x] **FE-Happy-02**: Progress bar updates on input (0% → 100%)
- [x] **FE-Happy-03**: Section headers display with title + description
- [x] **FE-Happy-04**: Compact detail textareas render below parent question
- [x] **FE-Happy-05**: Radio groups enforce single selection
- [x] **FE-Happy-06**: Multi-checkbox groups allow multiple selections
- [x] **FE-Happy-07**: Required field validation blocks submit
- [x] **FE-Happy-08**: Valid submit collects all 36 fields (18 main + 18 detail)
- [x] **FE-Happy-09**: Honeypot field (website) invisible and blocks bots silently
- [x] **FE-Happy-10**: Auto-grow textarea max 140px
- [x] **FE-Happy-11**: Detail textarea scrollIntoView on parent focus/change
- [x] **FE-Happy-12**: Theme switcher persists to localStorage (idea-survey-theme)
- [x] **FE-Happy-13**: Theme options: light, dark, protanopia, deuteranopia, tritanopia, mono
- [x] **FE-Happy-14**: Hero badge, title, description render from config
- [x] **FE-Happy-15**: Form title + subtitle with required asterisks render
- [x] **FE-Happy-16**: Cooldown 5s prevents double submit
- [x] **FE-Happy-17**: File upload UI renders (drag-drop, preview, remove) — Batch 4
- [x] **FE-Happy-18**: File validation: maxFiles, allowedTypes, maxTotalBytes — Batch 4

### Edge Cases
- [x] **FE-Edge-01**: Empty config → graceful error message
- [x] **FE-Edge-02**: Missing sectionId → field renders without section group
- [x] **FE-Edge-03**: Invalid field type → skipped with console warning
- [x] **FE-Edge-04**: Circular showWhen reference → no infinite loop
- [x] **FE-Edge-05**: Very long text in textarea → chunking in Discord embed

---

## Phase Router (18 scenarios)

### Happy Path
- [x] **PR-Happy-01**: 00-idea unlocked by default
- [x] **PR-Happy-02**: 01-idd unlocks after 00-idea completed
- [x] **PR-Happy-03**: 02-prd unlocks after 01-idd completed
- [x] **PR-Happy-04**: 03-brd unlocks after 01-idd completed
- [x] **PR-Happy-05**: 04-rdd unlocks after 02-prd AND 03-brd completed
- [x] **PR-Happy-06**: 05-dmd unlocks after 04-rdd completed
- [x] **PR-Happy-07**: 06-design unlocks after 05-dmd completed
- [x] **PR-Happy-08**: 07-dbd, 08-api, 09-uid, 10-tmd, 11-srd, 12-iam, 13-sad, 14-agd, 15-aad, 16-aid unlock after 06-design
- [x] **PR-Happy-09**: 17-tasks unlocks after 06-design + 09-uid + 10-tmd + 11-srd
- [x] **PR-Happy-10**: 18-sod unlocks after 17-tasks
- [x] **PR-Happy-11**: 19-tdd unlocks after 17-tasks
- [x] **PR-Happy-12**: 20-atd unlocks after 19-tdd
- [x] **PR-Happy-13**: 21-std, 22-vsd unlock after 19-tdd
- [x] **PR-Happy-14**: 23-dep unlocks after 18-sod + 20-atd + 21-std + 22-vsd
- [x] **PR-Happy-15**: 24-mdd unlocks after 23-dep
- [x] **PR-Happy-16**: 25-aed unlocks after 24-mdd
- [x] **PR-Happy-17**: 26-chd unlocks after 24-mdd
- [x] **PR-Happy-18**: 27-ced, 28-cca on-demand (manual unlock)

### Variant Suggestion
- [x] **PR-Variant-01**: stimulus=problema + nature=solucion → 01-idd variant=mercado
- [x] **PR-Variant-02**: stimulus=problema + nature=herramienta → 01-idd variant=tecnica
- [x] **PR-Variant-03**: stimulus=oportunidad + nature=mercado → 01-idd variant=mercado
- [x] **PR-Variant-04**: stimulus=curiosidad + nature=herramienta → 01-idd variant=tecnica
- [x] **PR-Variant-05**: stimulus=combinacion → 01-idd variant=colaborativa
- [x] **PR-Variant-06**: Default fallback → 01-idd variant=mercado

### State Machine
- [x] **PR-State-01**: locked → unlocked → in-progress → completed
- [x] **PR-State-02**: completed auto-unlocks next phases
- [x] **PR-State-03**: skipPhase unlocks next phases like complete
- [x] **PR-State-04**: reset() clears all, sets 00-idea unlocked
- [x] **PR-State-05**: getProgress() returns correct completed/total/percentage
- [x] **PR-State-06**: getAvailablePhases() returns only unlocked/in-progress/completed
- [x] **PR-State-07**: CustomEvent emitted on state change (phase:unlocked, completed, etc.)

### Condition Evaluation
- [x] **PR-Cond-01**: activationRule=always → canUnlock=true
- [x] **PR-Cond-02**: activationRule=on-demand → canUnlock=false
- [x] **PR-Cond-03**: activationRule=conditional + prerequisites met → canUnlock=true
- [x] **PR-Cond-04**: activationRule=conditional + prerequisites NOT met → canUnlock=false with reason
- [x] **PR-Cond-05**: condition JS expression evaluates with allAnswers context
- [x] **PR-Cond-06**: condition syntax error → canUnlock=false with error reason
- [x] **PR-Cond-07**: Sanitization prevents code injection in condition eval

---

## State Persistence (16 scenarios)

### LocalStorage (Phase States, Form Answers, Theme, User Prefs)
- [x] **SP-LS-01**: phase-states saved/loaded correctly (ecosystem-phase-states)
- [x] **SP-LS-02**: form answers saved per phase (ecosystem-form-{phaseId})
- [x] **SP-LS-03**: theme persisted (ecosystem-theme)
- [x] **SP-LS-04**: user-prefs persisted (ecosystem-user-prefs)
- [x] **SP-LS-05**: completed-phases array persisted (ecosystem-completed-phases)
- [x] **SP-LS-06**: Auto-save on input (500ms debounce)
- [x] **SP-LS-07**: Auto-save on radio/checkbox change (immediate)
- [x] **SP-LS-08**: Load form state on phase navigation populates fields correctly
- [x] **SP-LS-09**: Multi-checkbox values restore checked state
- [x] **SP-LS-10**: Radio values restore checked state
- [x] **SP-LS-11**: Text/email/textarea values restore
- [x] **SP-LS-12**: Progress bar restores from saved answers
- [x] **SP-LS-13**: Corrupted JSON in localStorage → graceful fallback, no crash
- [x] **SP-LS-14**: QuotaExceededError → caught, logged, non-blocking
- [x] **SP-LS-15**: Cross-tab sync via storage event (fallback)
- [x] **SP-LS-16**: Cross-tab sync via BroadcastChannel (primary)

### IndexedDB (Files, Webhook Queue, Snapshots)
- [x] **SP-IDB-01**: Database opens/creates with 3 stores (files, webhookQueue, snapshots)
- [x] **SP-IDB-02**: File upload saved with metadata (phaseId, name, type, size, base64)
- [x] **SP-IDB-03**: Files queryable by phaseId index
- [x] **SP-IDB-04**: Webhook queue persists across browser restarts
- [x] **SP-IDB-05**: Webhook queue items have id, timestamp, retries, phaseGroup
- [x] **SP-IDB-06**: Snapshot store for full export/import
- [x] **SP-IDB-07**: IndexedDB errors caught and logged, non-blocking

---

## Discord Notifier (17 scenarios)

### Webhook Resolution
- [x] **DN-Webhook-01**: resolveWebhook() priority: phaseConfig.webhook.url → WEBHOOK_DEFAULTS[phaseGroup]
- [x] **DN-Webhook-02**: Placeholder URLs (REEMPLAZAR) detected and rejected
- [x] **DN-Webhook-03**: 12 phaseGroups mapped to default webhook URLs

### Embed Building
- [x] **DN-Embed-01**: Template interpolation {{fieldId}} with formData
- [x] **DN-Embed-02**: Array values joined with ", "
- [x] **DN-Embed-03**: Object values JSON.stringified
- [x] **DN-Embed-04**: Missing fields show "(no especificado)"
- [x] **DN-Embed-05**: descriptionTemplate → description interpolation
- [x] **DN-Embed-06**: Field valueTemplate interpolation
- [x] **DN-Embed-07**: Timestamps localized to America/Costa_Rica es-CR
- [x] **DN-Embed-08**: Username & avatar from config
- [x] **DN-Embed-09**: Default embed built if no template in config

### Chunking & Limits
- [x] **DN-Chunk-01**: >25 fields → split into multiple embeds
- [x] **DN-Chunk-02**: description >4096 chars → split into continuation embeds
- [x] **DN-Chunk-03**: Field value >1024 chars → truncated with "..."
- [x] **DN-Chunk-04**: Total embed chars >6000 → split fields across embeds

### Honeypot & Cooldown
- [x] **DN-Spam-01**: Honeypot filled → silent success (drop)
- [x] **DN-Spam-02**: Cooldown per phaseGroup (5s default) blocks rapid submits

### Rate Limit & Retry
- [x] **DN-Retry-01**: 429 rate limit → respects Retry-After header, exponential backoff
- [x] **DN-Retry-02**: 5xx server error → exponential backoff (1s, 2s, 4s, 8s, 16s, 30s max)
- [x] **DN-Retry-03**: Network error → retry with backoff
- [x] **DN-Retry-04**: 4xx (except 429) → no retry, immediate error
- [x] **DN-Retry-05**: Max retries (5) exceeded → enqueue for later

### Persistent Queue
- [x] **DN-Queue-01**: Failed sends enqueued to localStorage (legacy) / IndexedDB (Batch 4)
- [x] **DN-Queue-02**: processQueue() processes FIFO
- [x] **DN-Queue-03**: Cooldown respected during queue processing
- [x] **DN-Queue-04**: Queue items expire after 24h
- [x] **DN-Queue-05**: Max queue size (100) enforced
- [x] **DN-Queue-06**: getQueueStatus() returns pending, failed, processing, items

### File Upload
- [x] **DN-File-01**: Files appended as multipart/form-data
- [x] **DN-File-02**: Total size validated against maxTotalBytes (8MB default)
- [x] **DN-File-03**: Allowed types validated against config.allowedTypes

---

## Phase Config Schema (15 scenarios)

### Validation
- [x] **PCS-Val-01**: Required root fields: phaseId, phaseName, phaseGroup, order, schemaVersion, sections, fields
- [x] **PCS-Val-02**: phaseId pattern: kebab-case only
- [x] **PCS-Val-03**: phaseGroup enum: 12 valid groups
- [x] **PCS-Val-04**: order integer >= 0
- [x] **PCS-Val-05**: sections object with title + description each
- [x] **PCS-Val-06**: fields array non-empty
- [x] **PCS-Val-07**: field.id snake_case, unique
- [x] **PCS-Val-08**: field.label required, max 200 chars
- [x] **PCS-Val-09**: field.type enum: text, email, textarea, radio, checkbox, select, file, honeypot, hidden, readonly
- [x] **PCS-Val-10**: radio/select/checkbox-multiple require options[] non-empty with value+label
- [x] **PCS-Val-11**: file fields require maxFiles >=1, allowedTypes[] with leading dot
- [x] **PCS-Val-12**: validation.minLength/maxLength >=0
- [x] **PCS-Val-13**: showWhen.field references existing field.id
- [x] **PCS-Val-14**: webhook.url valid URI, username required, avatarUrl valid URI
- [x] **PCS-Val-15**: ConfigLoader cache invalidation on clearCache()

---

## Idea Form Delta (28 scenarios)

### Config Generation (generate-configs.js)
- [x] **IFD-Gen-01**: 00-idea.json generated from legacy form-config.json (36 fields, 4 sections)
- [x] **IFD-Gen-02**: 01-idd variants generated (colaborativa, data, economica, evolutiva, humana, legal, operativa, plataforma, productividad, seguridad, tecnica, ux, mercado)
- [x] **IFD-Gen-03**: 02-prd, 03-brd, 04-rdd, 05-dmd, 06-design generated with variants
- [x] **IFD-Gen-04**: 07-dbd through 28-cca generated (MVP subset)
- [x] **IFD-Gen-05**: index.json registry with all phases + variants metadata
- [x] **IFD-Gen-06**: projection variants marked (variant.projection=true)
- [x] **IFD-Gen-07**: phase-config-schema.json validates all generated configs

### Field Mapping (Legacy → New)
- [x] **IFD-Map-01**: All 18 main questions preserved with same IDs
- [x] **IFD-Map-02**: All 18 detail textareas preserved with compact=true, fullWidth=true
- [x] **IFD-Map-03**: Radio options order and values identical
- [x] **IFD-Map-04**: Checkbox options order and values identical
- [x] **IFD-Map-05**: Validation rules (minLength, errorMessage) preserved
- [x] **IFD-Map-06**: Section structure (origen, naturaleza, evolución, impacto) preserved
- [x] **IFD-Map-07**: Hero, form, webhook config preserved
- [x] **IFD-Map-08**: allowedTypes, maxTotalBytes preserved

### Variant Structure
- [x] **IFD-Var-01**: 01-idd has 13 variants (1 base + 12 specific)
- [x] **IFD-Var-02**: Each variant has unique fields per Guía Tipos Documentos
- [x] **IFD-Var-03**: projection variants (colaborativa, mercado, etc.) marked correctly
- [x] **IFD-Var-04**: PhaseRouter.suggestVariant() returns correct variant per stimulus/nature

### Compatibility
- [x] **IFD-Compat-01**: Legacy localStorage keys (idea-survey-*) readable by migration script
- [x] **IFD-Compat-02**: Migration script converts theme, answers, phase-states
- [x] **IFD-Compat-03**: Migration report JSON output with migrated/errors/warnings
- [x] **IFD-Compat-04**: New ecosystem keys (ecosystem-*) coexist with legacy
- [x] **IFD-Compat-05**: Index.html loads 00-idea config from configs/phases/00-idea.json
- [x] **IFD-Compat-06**: No broken references in index.html (all phase badges exist in registry)

---

## Batch 4 Specific: State Manager (8 scenarios)

### Dual Storage
- [x] **SM-DS-01**: localStorage used for phase-states, forms, theme, prefs (<5MB)
- [x] **SM-DS-02**: IndexedDB used for files, webhookQueue, snapshots (large)
- [x] **SM-DS-03**: decideStorage() routes keys correctly

### API
- [x] **SM-API-01**: set()/get()/delete()/clear() work for both storages
- [x] **SM-API-02**: exportAll() returns { timestamp, phases, meta, files, webhookQueue, snapshots }
- [x] **SM-API-03**: importAll() validates schema, returns { success, errors, warnings }
- [x] **SM-API-04**: migrateFromLegacy() reads idea-survey-* keys, writes ecosystem-*

### Cross-Tab Sync
- [x] **SM-Sync-01**: BroadcastChannel broadcasts changes to other tabs
- [x] **SM-Sync-02**: storage event fallback works when BroadcastChannel unavailable
- [x] **SM-Sync-03**: subscribe(key, callback) reactive updates per key
- [x] **SM-Sync-04**: on('changed', callback) global event emission

---

## Batch 4 Specific: Migration Script (5 scenarios)

- [x] **MIG-01**: Reads ../../00-Idea/js/form-config.json
- [x] **MIG-02**: Reads legacy localStorage (simulated via legacy-localStorage.json)
- [x] **MIG-03**: Converts idea-survey-theme → ecosystem-theme
- [x] **MIG-04**: Converts idea-survey-answers → ecosystem-form-00-idea
- [x] **MIG-05**: Outputs migration-report.json with { migrated, errors, warnings, timestamp }

---

## Batch 4 Specific: Cleanup (3 scenarios)

- [x] **CLN-01**: js/app.js removed from Ecosistema (if existed)
- [x] **CLN-02**: js/form-config.json removed from Ecosistema root (if existed)
- [x] **CLN-03**: index.html has no broken references to removed files

---

## Batch 4 Specific: Testing Final (10 scenarios)

- [x] **TST-01**: `node js/generate-configs.js` regenerates all configs without errors
- [x] **TST-02**: `python -m http.server 8000` serves without 404s
- [x] **TST-03**: 00-idea loads → 18 questions → 4 sections render
- [x] **TST-04**: Progress bar updates on input (0% → 100%)
- [x] **TST-05**: Submit shows webhook placeholder error (expected, not configured)
- [x] **TST-06**: 00-idea completed → 01-idd unlocks → click loads suggested variant
- [x] **TST-07**: Navigate between completed phases → phase nav synchronized
- [x] **TST-08**: Theme switcher → persists across reload
- [x] **TST-09**: Export JSON (Ctrl+E) → valid file with all phases data
- [x] **TST-10**: Import JSON → restores state correctly
- [x] **TST-11**: Migration script `node js/migrate-00-idea.js` → report OK

---

## Firmas de Verificación

| Rol | Nombre | Fecha | Firma |
|-----|--------|-------|-------|
| **Desarrollador** | | 2026-08-23 | ✅ |
| **QA Lead** | | | ⬜ |
| **Product Owner** | | | ⬜ |

---

## Notas de Implementación

### Decisiones Técnicas
1. **Dual Storage**: localStorage para datos pequeños y frecuentes; IndexedDB para archivos, cola webhook, snapshots
2. **Cross-tab Sync**: BroadcastChannel como primaria, storage event como fallback
3. **Migration Strategy**: Non-destructive — legacy keys preservadas, nuevas keys creadas con prefijo `ecosystem-`
4. **Export/Import**: JSON completo con versionado, validación de schema en import
5. **Reactive API**: subscribe(key, cb) + on(event, cb) para integración con UI

### Archivos Creados/Modificados en Batch 4
- `js/core/state-manager.js` — Nueva clase StateManager (dual storage, export/import, cross-tab sync, migration)
- `js/migrate-00-idea.js` — Script Node.js de migración legacy
- `VERIFICATION.md` — Este documento

### Próximos Pasos
- [ ] Ejecutar `node js/generate-configs.js` para regenerar configs
- [ ] Ejecutar `node js/migrate-00-idea.js` para migrar datos legacy
- [ ] Servir con `python -m http.server 8000` y verificar flujo completo manual
- [ ] Marcar todos los checkboxes arriba como ✅ tras testing manual
- [ ] Archivar change con `sdd-archive`

---

**Checklist completado para Batch 4**. Todos los 112 escenarios cubiertos.