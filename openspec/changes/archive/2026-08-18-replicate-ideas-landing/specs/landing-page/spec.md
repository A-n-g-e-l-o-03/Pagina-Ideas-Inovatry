# Landing Page Specification

## Purpose

The landing page is a single-page static site (plain HTML/CSS/JS, no framework) that mirrors the proven structure of ideas.inovatrysolutions.com while fixing its verified defects. It renders the hero, the config-driven idea form, and links the privacy policy — all in Spanish.

## Requirements

### Requirement: Static Structure and Spanish-Only Copy

The site MUST ship as `index.html`, `css/style.css`, `js/app.js`, `js/form-config.json`, `images/logo.webp`, and `privacy.html`. All user-facing copy MUST be Spanish (`lang="es"`). The page MUST include the hero ("Contáctanos", <24h reply promise), navbar (logo + brand), form section, and footer (© 2026 Inovatry Solutions).

#### Scenario: Page loads full structure

- GIVEN a browser requests `index.html`
- WHEN the page renders
- THEN all assets (CSS, JS, config, logo) load from `self`
- AND all visible copy is Spanish

#### Scenario: Logo asset unavailable

- GIVEN `images/logo.webp` fails to load
- WHEN the navbar renders
- THEN the brand text still displays and no script errors occur

### Requirement: Content Security Policy

`index.html` MUST include a CSP meta tag restricting `script-src` to `'self' 'unsafe-inline'` and `connect-src` to `'self' https://discord.com`, and MUST allow Google Fonts stylesheets and fonts.

#### Scenario: CSP directives enforced

- GIVEN the page is loaded in a browser
- WHEN the CSP meta tag is inspected
- THEN `script-src 'self' 'unsafe-inline'` and `connect-src 'self' https://discord.com` are present
- AND the page's scripts and webhook fetch are not blocked

### Requirement: Privacy Page

`privacy.html` MUST exist and list all collected data — including the email field — plus contact info and a "← Volver al formulario" link back to the form.

#### Scenario: Privacy page reachable and accurate

- GIVEN the consent checkbox links to `privacy.html`
- WHEN a user opens the link
- THEN the page lists name, proponente, sector, timeline, description, and email as collected data
- AND a link returns to the form

### Requirement: No Dead Code

`js/app.js` MUST NOT contain handlers, maps, or helpers for elements or features that do not exist in the markup (mobile menu logic, `fieldLabels`, `safeSetInnerHTML`).

#### Scenario: Dead code absence

- GIVEN a static review of `js/app.js`
- WHEN searching for mobile menu handlers, `fieldLabels`, or `safeSetInnerHTML`
- THEN no references exist