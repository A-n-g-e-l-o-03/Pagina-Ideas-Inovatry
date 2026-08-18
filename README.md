# Pagina-Ideas-Inovatry

Static landing page for idea/project submissions at Inovatry Solutions. The page
replicates the structure of the reference site (ideas.inovatrysolutions.com)
while fixing its verified defects: honest submission outcomes, Discord-aligned
attachment limits, config-derived embed labels, and es-CR timestamps.

## Structure

| File | Purpose |
|------|---------|
| `index.html` | Landing page: navbar, hero, config-driven form container, footer |
| `privacy.html` | Privacy policy listing all collected data (including email) |
| `css/style.css` | Responsive stylesheet (reference-based) |
| `js/form-config.json` | Field definitions, validation limits, webhook placeholder |
| `js/app.js` | Config load, form render, validation, embed builder, submit |
| `images/logo.webp` | Brand logo |

## Deploy note (webhook safety — READ BEFORE DEPLOY)

The form posts submissions to a Discord webhook. The `webhook` key in
`js/form-config.json` is committed as a **placeholder — never a real token**.

- **Rotate the webhook** before deploy: create a fresh Discord webhook URL and
  discard the previous one if it was ever exposed.
- **Inject the real URL at deploy time only** (build step, env substitution, or
  a local override file such as `js/form-config.local.json`, which is ignored
  by git). Never commit a real webhook token — anyone with repo access could
  post to your Discord channel.
- If the webhook key is empty or still the placeholder at runtime, the form
  shows an error and sends **no request**.

## Local development

Serve over HTTP — `file://` blocks `fetch`:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.