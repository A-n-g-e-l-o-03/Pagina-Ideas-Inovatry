# Proposal: Replicate and improve the Ideas landing page

## Intent

Replicate ideas.inovatrysolutions.com as an improved static site in this repo. The reference promises a <24h reply but collects no contact info, exposes its Discord webhook in public JSON, and shows success even on failed submissions. Rebuild keeps the proven structure and fixes all 7 verified defects to yield actionable leads.

## Scope

### In Scope
- Full static rebuild (`index.html`, `css/style.css`, `js/app.js`, `js/form-config.json`, `images/logo.webp`, `privacy.html`): Spanish only, CSP meta, es-CR timestamps, Google Fonts
- Config-driven form rendering; REQUIRED format-validated email (phone out of scope)
- Discord webhook: configurable URL, placeholder committed, rotation documented as manual ops step, NO serverless proxy (pure static); honeypot + 5s cooldown
- Defect fixes: real failure surfaced; embed labels from config; 8MB total attachment cap; dead code removed (fieldLabels, mobile menu, safeSetInnerHTML); load-error on config fetch failure

### Out of Scope
- Phone field, i18n, serverless proxy, Turnstile, automated tests, live deployment

## Capabilities

### New Capabilities
- `landing-page`: static structure, styling, CSP, privacy page, logo asset
- `idea-form`: config-driven rendering, validation (email/fields/attachments), load-error state
- `discord-submission`: webhook post, embed labels, failure surfacing, spam mitigations

### Modified Capabilities
None — first change (`openspec/specs/` empty)

## Approach

Mirrors the reference structure: `form-config.json` holds fields/options/labels; `app.js` renders the form and derives embed labels from the same config (fixes defect 4). Submit flow: validate → cooldown/honeypot → post webhook → honest status to user. Real webhook injected at deploy.

## Assumptions (session decisions)

- Automatic execution; openspec store; force-chained PRs (stacked-to-main), 400-line budget
- Spanish only; static-only; defects fixed, not mirrored; same structure as reference

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `index.html` | New | Scaffold, CSP, hero, form |
| `css/style.css` | New | Full stylesheet (~600 lines) |
| `js/app.js` | New | Form, validation, embed, post (~450 lines) |
| `js/form-config.json` | New | Field defs + webhook placeholder |
| `images/logo.webp` | New | Binary, from reference |
| `privacy.html` | New | Policy incl. email collection |
| `openspec/specs/` | Modified | New specs merged on archive |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Leaked webhook token; rotation needs live-site coordination | High | Rotate before deploy; placeholder only in repo |
| No automated tests; regression risk | Med | Manual smoke + live Discord post check |
| CSS+JS exceed 400-line review budget | High | Chained PRs: scaffold+HTML → CSS → JS+config |
| `logo.webp` binary from reference | Low | Download early; fail fast if unreachable |

## Rollback Plan

Pre-deploy: remove site files / revert merged PRs; reference stays live. Post-deploy: fall back to reference; rotate webhook again if the new site misbehaves.

## Dependencies

- Discord webhook (rotated; real URL supplied at deploy, never committed)
- Google Fonts CDN; `images/logo.webp` from reference

## Success Criteria

- [ ] All 7 verified defects fixed in rebuilt files
- [ ] Smoke passes: form renders; email required+validated; embed shows labels; 8MB total cap; load error; no dead code
- [ ] Live Discord post succeeds; forced webhook failure shows an error (no false success)
- [ ] Each chained PR slice ≤400 changed lines, stacked to main
- [ ] No real webhook token in any commit
