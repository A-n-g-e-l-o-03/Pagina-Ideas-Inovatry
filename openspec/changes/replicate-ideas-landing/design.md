# Design: Replicate and improve the Ideas landing page

## Technical Approach

Greenfield static rebuild mirroring the reference structure (`index.html`, `css/style.css`, `js/app.js`, `js/form-config.json`, `images/logo.webp`, `privacy.html`). `app.js` fetches the config, renders the form from field definitions, validates on blur/change, and posts a Discord embed built from the SAME config labels — fixing all 7 verified defects. Framework-free, Spanish only, CSP meta, es-CR timestamps. Delivered as three stacked PRs to respect the 400-line review budget.

## Architecture Decisions

| # | Decision | Options (tradeoffs) | Choice |
|---|---|---|---|
| D1 | JS layout | ES modules (needs server/CORS) vs single `app.js` (matches reference, any static host) | Single `app.js`, sections: config → render → validate → files → embed → submit |
| D2 | Rendering | Hardcoded HTML (embed labels duplicated) vs config-driven (single source of truth) | Config-driven; fetch failure renders visible error, never empty form |
| D3 | Webhook | Serverless proxy (blocked — pure static) vs static + mitigations (URL visible; rotation required) | `webhook` key in config; placeholder committed, real URL at deploy; honeypot + 5s cooldown |
| D4 | Success semantics | Reference's swallowed catch (false success) vs check `res.ok` | Only 2xx shows success; 4xx/5xx/network show error |
| D5 | Attachments | Per-file 8MB (reference bug) vs 8MB TOTAL (Discord real limit) | Sum sizes; block over total inline |
| D6 | Embed labels | Raw values (`tech`) vs config labels (`Tecnología`) | Label lookup from same config; 1024/field, 4096 desc, 25 fields; chunk + truncation note |
| D7 | Timestamps | UTC vs es-CR | `Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica' })` + ISO embed field |
| D8 | Dead code | Reference shipped unused maps/handlers | None: no mobile menu, no `fieldLabels`, no `safeSetInnerHTML` |

## Data Flow

```
index.html ──▶ app.js ──fetch──▶ form-config.json   (failure → visible error)
                                    │
render form ◀── field defs (type, label, required, options)
                                    │
submit: honeypot? → silent drop · cooldown 5s? → block · validate → errors?
                                    │
build embed (config labels) + FormData (files ≤ 8MB total)
                                    │
fetch(webhook, POST) → res.ok (2xx) → success msg  |  else → error msg
```

## File Changes

| File | Action | Description |
|---|---|---|
| `index.html` | Create | Scaffold: CSP meta, navbar (logo + brand), hero ("Contáctanos", <24h), form section, footer; `lang="es"`; Google Fonts |
| `css/style.css` | Create | Full responsive stylesheet (~600 lines, reference-based) |
| `js/form-config.json` | Create | Field defs + webhook placeholder |
| `js/app.js` | Create | Config load, form builder, validation, file checks, embed builder, submit (~450 lines) |
| `images/logo.webp` | Create | Binary from reference (download early, fail fast) |
| `privacy.html` | Create | Policy listing email as collected data + "← Volver al formulario" |
| `README.md` | Modify | Deploy note: rotate webhook, inject real URL |
| `openspec/changes/replicate-ideas-landing/design.md` | Create | This document |

## Interfaces / Contracts

`js/form-config.json` schema (fields render from it; embed labels derive from it):

| Key | Type | Purpose |
|---|---|---|
| `webhook` | string | Placeholder only; real URL injected at deploy |
| `maxTotalBytes` | number | `8388608` — 8MB total cap |
| `allowedTypes` | string[] | Office + image extensions |
| `fields` | array | 8 defs: `{name, type, label, required, min?, maxFiles?, href?, options?: [{value, label}]}` — name/proponente text (min 2), service/budget select, message textarea (min 10), attachments file (max 5), email (required, format-validated), consent checkbox (links `privacy.html`) |

`app.js` modules (plain functions, no imports): `loadConfig()`; `renderForm(config)`; `validateField(field, value)` → error|null; `validateFiles(files, config)` (type + ≤8MB total); `buildEmbed(data, config)` (label lookup, chunking, truncation note, es-CR + ISO timestamps); `submitForm()` (honeypot drop → cooldown → validate → post → status; button disabled in flight).

Edge handling: config fetch fail → error block replaces form; placeholder/empty webhook → error, no request; honeypot filled → silent return; 5s repeat → blocked; oversized/wrong-type files → inline error; non-2xx/network → error, success never shown.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Manual smoke (verify) | All spec scenarios | Browser checklist per scenario; no runner (config.yaml) |
| Live check | Webhook post + forced failure | Real rotated webhook → success; bad URL → error, no false success |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Static assets only; PR slicing is a delivery strategy, not application behavior.

## Migration / Rollout

No data migration. Deploy: download `logo.webp` early; rotate webhook (ops step); inject real URL at deploy — never committed. Rollback: revert merged PRs; reference site stays live.

## Open Questions

- [ ] Webhook rotation coordinated with live-site owner before deploy (ops, not code)