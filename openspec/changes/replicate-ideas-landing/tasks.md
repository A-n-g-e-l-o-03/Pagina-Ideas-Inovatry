# Tasks: Replicate & improve the Ideas landing page

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,400 total (excl. binary logo) |
| 400-line budget risk | High (total) — Low per PR |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 |
| Delivery strategy | force-chained |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Threat matrix: all rows N/A per design — no RED tasks; verification is manual smoke per spec scenario.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Scaffold: HTML + privacy + README + logo | PR 1 (~235) | Smoke: structure, CSP meta, privacy link | `python -m http.server 8000` → localhost (file:// blocks fetch) | Revert PR 1 only; no CSS/JS touched |
| 2 | style.css base + layout | PR 2 (~300) | Smoke: desktop navbar/hero/footer | same server | Revert PR 2; PR 1 intact |
| 3 | style.css components + responsive | PR 3 (~300) | Smoke: mobile viewport, error states | same server | Revert PR 3; PRs 1-2 intact |
| 4 | form-config.json + app.js core | PR 4 (~340) | Smoke: config 404; invalid email; 8MB block | same server | Revert PR 4; HTML/CSS unaffected |
| 5 | app.js embed + submit | PR 5 (~230) | Live webhook 2xx + forced failure | same server + rotated webhook | Revert PR 5; PR 4 still renders form |

## Phase 1: Scaffold & HTML (PR 1)

- [x] 1.1 Download `images/logo.webp` from reference site; fail fast if unreachable
- [x] 1.2 Create `index.html`: `lang="es"`, CSP meta (`script-src 'self' 'unsafe-inline'`; `connect-src 'self' https://discord.com`; Google Fonts), navbar (logo + brand), hero ("Contáctanos", <24h), form container, footer (© 2026 Inovatry Solutions)
- [x] 1.3 Create `privacy.html`: lists name, proponente, sector, timeline, description, email + contact info + "← Volver al formulario"
- [x] 1.4 Update `README.md`: deploy note — rotate webhook, inject real URL at deploy, never commit token
- [x] 1.5 Verify: all assets load from `self`; Spanish copy; logo missing → brand text only, no errors; privacy link opens

## Phase 2: Stylesheet — Base & Layout (PR 2)

- [x] 2.1 Create `css/style.css` (part 1, ~300 lines): reset, variables, typography, navbar, hero, footer
- [x] 2.2 Verify: desktop render shows navbar/hero/form/footer styled per reference

## Phase 3: Stylesheet — Components & Responsive (PR 3)

- [x] 3.1 Extend `css/style.css` (part 2, ~390 lines): form fields, buttons, inline errors, success/error messages, breakpoints
- [x] 3.2 Verify: mobile viewport responsive; error/success styling visible
- [x] 3.3 (amendment) Style privacy page classes in `css/style.css`: .privacy-content, .privacy-section, .back-link, .highlight, .update-date

## Phase 4: Config & Form Core (PR 4)

- [x] 4.1 Create `js/form-config.json`: `webhook` placeholder, `maxTotalBytes: 8388608`, `allowedTypes`, 8 fields (name/proponente min 2, service, budget, message min 10, attachments max 5, email, consent → `privacy.html`)
- [x] 4.2 Create `js/app.js` (part 1): `loadConfig()` — failure shows visible error block, never empty form; `renderForm()`; `validateField()` on blur/change, errors clear when valid; `validateFiles()` type + ≤8MB total
- [x] 4.3 Verify: config 404 → error block; empty required fields → inline errors; `usuario@sin-formato` blocked; 10MB total blocked; `.exe` blocked

## Phase 5: Embed & Submission (PR 5)

- [x] 5.1 Extend `js/app.js` (part 2): honeypot silent drop; 5s cooldown; `buildEmbed()` — labels from config ("Tecnología"/"1-3 meses"), 1024/field + 4096 desc chunking + truncation note, es-CR `Intl.DateTimeFormat('es-CR', {timeZone:'America/Costa_Rica'})` + ISO field
- [x] 5.2 Extend `js/app.js`: `submitForm()` — placeholder/empty webhook → error, no request; 2xx only → "¡Propuesta enviada con éxito!"; 4xx/5xx/network → error, never false success; button disabled in flight
- [x] 5.3 Verify: honeypot filled → silent; 2 submits <5s → blocked; >5s → proceeds; embed shows labels; >4096 desc truncated; live webhook 204 → success; bad URL → error
- [x] 5.4 Verify dead code: grep `js/app.js` for mobile-menu handler, `fieldLabels`, `safeSetInnerHTML` → zero matches