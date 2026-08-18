# Exploration: replicate-ideas-landing

Date: 2026-08-18
Mode: openspec
Reference: https://ideas.inovatrysolutions.com/ (fetched and verified live: index.html, css/style.css, js/app.js, js/form-config.json, privacy.html)

## Current State

### Reference site (verified, not assumed)
Single-page static landing, Spanish-only (`lang="es"`), no framework, no build:
- **Structure**: `index.html` + `css/style.css` + `js/app.js` + `js/form-config.json` + `images/logo.webp` + `privacy.html`
- **index.html**: navbar (logo + brand only — mobile menu code in JS is DEAD, no menuToggle/navLinks elements exist), hero ("Contáctanos" / responds <24h), form section with dynamic message box, footer (© 2026 Inovatry Solutions). CSP meta present: `script-src 'self' 'unsafe-inline'`; `connect-src 'self' https://discord.com`; Google Fonts (Roboto, Montserrat, Raleway).
- **form-config.json**: 7 fields — name (req, min 2), proponente (req, min 2), service select (Tecnología/Salud/Finanzas/Educación/Comercio/Otro, req), budget select (1-3/3-6/6-12/12+ months, optional), message textarea (req, min 10), attachments file (8MB each, max 5, office+image types, optional), privacy checkbox (req, links privacy.html). **Webhook URL is embedded in this public JSON.**
- **app.js**: fetch config → dynamic form build; validation on blur/change with error spans; 5s submit cooldown; XSS sanitization (textContent + tag allowlist); Discord embed builder respecting limits (1024/field, 4096 desc, 25 fields, chunking with truncation note); multipart FormData when files attached; timestamp formatted in `America/Costa_Rica` (es-CR) + ISO embed timestamp; embed uses username "Inovatry Solutions" and main-site logo avatar/thumbnail/footer icon.
- **privacy.html**: full page on the ideas subdomain — sector-opportunity cards, privacy policy (name/proponente/sector/tiempo/descripción only), contact info (`soporte.ti@inovatrysolutions.com`, +506 6345 5593), "← Volver al formulario" links.

### Verified defects / gaps in the reference (decision inputs for the rebuild)
1. **No contact field** (email/phone) anywhere in the form — yet the hero promises "te responderemos en menos de 24 horas" and the privacy policy claims the proponente name is enough to "contactarte". Leads are effectively unfollowable. Business-critical.
2. **Webhook URL exposed** in `js/form-config.json` — anyone can scrape it and spam the Discord channel (no captcha/honeypot exists).
3. **False-success bug**: `sendToDiscord()` catches its own errors and does NOT rethrow, so the submit handler's `.then()` always fires → users see "¡Propuesta enviada con éxito!" even when Discord rejected the post (4xx/5xx).
4. **Embed shows raw option values** (`tech`, `1-3`) instead of labels (`Tecnología`, `1-3 meses`) — the `fieldLabels` map exists but is unused.
5. **Attachment limits mismatch**: validation allows 5 × 8MB, but Discord webhook attachment limit is 8MB TOTAL per message → multi/large-file submissions fail server-side (and user still sees success, per #3).
6. **Dead code**: `safeSetInnerHTML`, `fieldLabels`, mobile menu logic (elements don't exist in HTML).
7. **Config fetch failure**: if `form-config.json` 404s, the form renders empty with no user-facing error.

### Target repo state
- Git repo, remote `https://github.com/A-n-g-e-l-o-03/Pagina-Ideas-Inovatry.git`, clean tree, 3 commits (init, SDD context init).
- `openspec/config.yaml`: plain static HTML/CSS/JS, no build, no tests (manual browser smoke + live Discord post check for verify), strict_tdd false, rules mandate rollback plan + framework-free design.
- `openspec/specs/` and `openspec/changes/archive/` empty (only .gitkeep). No code, no .codegraph index. README one-liner only.
- This is the FIRST change in the SDD pipeline.

## Affected Areas (target repo, once built)
- `index.html` — landing page replicating the reference (new file)
- `css/style.css` — full stylesheet (~600 lines in reference; drives the 400-line PR-budget risk)
- `js/app.js` — form build, validation, embed builder, webhook post (new file, ~450 lines)
- `js/form-config.json` — field definitions + webhook section (new file; webhook decision lands here or moves out)
- `images/logo.webp` — binary asset to download from reference
- `privacy.html` — replicate or rewrite (must mention email field if added)
- `openspec/specs/` — main spec will receive the merged delta on archive

## Approaches

### Decision 1 — File structure: same structure vs. single file
1. **Same structure (index/css/js/json/images)** — mirror the reference layout
   - Pros: faithful replication; easy diff vs. reference; config-driven form stays maintainable; matches CSP `'self'` resource model; future field edits without touching JS
   - Cons: more files; config fetch is an extra failure point; slightly more deploy surface
   - Effort: Medium
2. **Single-file (index.html with inline CSS/JS)** — one self-contained artifact
   - Pros: trivial deployment (drop one file anywhere); zero fetch failure modes
   - Cons: deviates from reference; CSS+JS inline bloats one file; form becomes hardcoded or JSON-inline; worse for review/diff
   - Effort: Low
3. **RECOMMENDED: same structure** — fidelity is the point of "replicate", and the structure is already proven in production. Mitigate the config-fetch failure with a user-visible error message.

### Decision 2 — Form rendering: config-driven vs. hardcoded
1. **Keep config-driven (`form-config.json`)** — as reference
   - Pros: matches reference; field/label/option edits without touching JS; copy centralized (future i18n hook); embed labels can be derived from config
   - Cons: indirection; needs the load-failure fallback
   - Effort: Low
2. **Hardcode form in HTML** — static markup
   - Pros: no fetch, always renders, simpler runtime
   - Cons: diverges from reference architecture; every field change touches HTML + JS embed builder; option labels duplicated in embed mapping
   - Effort: Low
3. **RECOMMENDED: keep config-driven** + add a graceful failure message and derive Discord labels from the config (fixes defect #4 without the unused fieldLabels map).

### Decision 3 — Webhook: exposed vs. proxied vs. configurable
Key reality: with any client-side post, the webhook URL is ALWAYS visible in the browser network tab. "Hiding" it in a static file only stops casual scraping. Real protection = server-side forwarding. The live webhook is already public, so rotation is required regardless.
1. **Client-side, same approach (URL in JSON)** — current state
   - Pros: zero infra, works on any static host
   - Cons: URL publicly scrapeable; spam with no mitigation; must rotate anyway
   - Effort: Low
2. **Client-side + abuse mitigations (honeypot, longer cooldown, Cloudflare Turnstile)** — static-friendly
   - Pros: still zero backend; blocks bot spam effectively; cheap
   - Cons: URL still visible to a determined human; channel still spoofable; Turnstile adds a dependency (framework-free rule needs an exception)
   - Effort: Low-Med
3. **Serverless proxy (Cloudflare Worker / Netlify/Vercel function)** — form posts to our endpoint, secret lives server-side, server validates + forwards to Discord
   - Pros: webhook never exposed; server-side validation/rate limiting; can enforce the 8MB total limit before forwarding; enables larger file caps via proxy re-upload; fixes false-success semantics (real response status to client)
   - Cons: breaks pure-static hosting (needs a function host + account); CSP `connect-src` must add the proxy origin; more moving parts; deployment beyond drop-in static files
   - Effort: Medium-High
4. **RECOMMENDED: rotate the webhook, then** — if a function host is available (or acceptable), use the proxy (best protection + fixes limits); if the site MUST stay purely static, use option 2 (honeypot + Turnstile) and treat the channel as a public inbox. This is the one decision that genuinely needs a user call: hosting constraints decide it.

### Decision 4 — Contact field(s)
1. **Add required email** — the core improvement
   - Pros: makes the <24h promise real; matches standard lead-gen practice; fixes the privacy-policy claim; low effort (config entry + validation + embed field + privacy.html line)
   - Cons: deviates from reference (intentional); privacy.html must be updated; one more required field = slight friction
   - Effort: Low
2. **Add email + phone** — both optional/email required
   - Pros: more contact channels for follow-up
   - Cons: more friction, more personal data (privacy scope grows), embed fields multiply
   - Effort: Low
3. **Keep as-is (no contact field)**
   - Pros: pixel-perfect parity
   - Cons: the landing cannot convert into actionable leads — defeats the page's purpose
   - Effort: None
4. **RECOMMENDED: required email (format-validated)**, phone omitted for v1. Update privacy.html to list email as collected data. This is the "improved rebuild" half of "replicate".

### Decision 5 — i18n
1. **Spanish only** (as reference)
   - Pros: matches audience (CR company, es-CR timestamp, all Spanish copy); zero infra; config-driven copy already localizes in one file later if needed
   - Cons: none for v1
   - Effort: Low
2. **Add i18n (es/en)**
   - Pros: reach
   - Cons: no evidence of need; adds complexity to a static site; persona scope rules say artifacts stay English unless requested — but the SITE itself is user-facing Spanish copy, so this is a product decision, not an artifact-language one
   - Effort: Med
3. **RECOMMENDED: Spanish only** for v1; keep copy in `form-config.json` so a future i18n pass is contained.

## Recommendation
Build an **improved rebuild** with the same structure and config-driven rendering as the reference, plus: (1) required email field (+ privacy.html update), (2) rotated webhook with the security approach chosen by the user (proxy if any function host exists, else static + honeypot/Turnstile), (3) fixes for the verified defects — false-success error swallowing, option-value vs. label mapping, 8MB-total attachment cap aligned with Discord's limit, dead-code removal, config-load failure message. Spanish only. Treat pixel parity as the baseline and defect fixes as the "mejoras" (improvements) the repo name promises.

## Risks
- **Webhook already leaked** — the live site's token is public; spam is possible today. Rotation is mandatory regardless of approach and must be coordinated (the new site's channel vs. live site's channel).
- **No test infrastructure** — verify phase is manual smoke only (per config.yaml); regression risk while rewriting ~450-line app.js.
- **PR budget** — reference CSS (~600 lines) + app.js (~450 lines) likely exceed the 400-line review budget → sdd-tasks must forecast chaining (e.g., scaffold/HTML → CSS → JS+config).
- **Binary asset** — `images/logo.webp` must be downloaded from the reference; licensing/branding is internal so low risk, but it's a required file.
- **Framework-free rule** — Turnstile or a function host would need explicit approval per config.yaml design rules ("framework-free unless a dependency is explicitly approved").

## Open Questions for the User (proposal phase must resolve)
1. Webhook: rotate + serverless proxy (requires hosting account) OR keep static client-side with spam mitigations? Same Discord channel or a new one for the new site?
2. Email: required or optional? Phone included?
3. Behavior parity: fix the reference defects (recommended) or mirror behavior byte-for-byte?
4. Deployment target for the new site (decides proxy feasibility and whether structure can stay identical)?

## Ready for Proposal
Yes — exploration complete with verified reference state, concrete defect list, and per-decision recommendations. The proposal phase must surface the webhook and contact-field decisions to the user before spec writing.
