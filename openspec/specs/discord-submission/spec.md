# Discord Submission Specification

## Purpose

The submission flow posts validated form data to a Discord webhook, builds embeds with config-derived labels, surfaces real failures (never false success), and applies spam mitigations. Pure client-side; no proxy.

## Requirements

### Requirement: Configurable Webhook URL

The webhook URL MUST be read from the `webhook` key in `js/form-config.json`. The committed value MUST be a placeholder — never a real token. The real URL MUST be injected at deploy time only. Submission with an empty or placeholder webhook MUST show an error and MUST NOT send a request to a placeholder endpoint.

#### Scenario: Placeholder in repo

- GIVEN a fresh checkout of the repo
- WHEN `js/form-config.json` is inspected
- THEN the `webhook` value is a placeholder, not a real Discord token

#### Scenario: Unconfigured webhook

- GIVEN the `webhook` key is empty or still the placeholder
- WHEN a user submits
- THEN an error message is shown and no request is sent

### Requirement: Honest Submission Outcome

The submission MUST report success ONLY when Discord responds 2xx. HTTP errors (4xx/5xx) and network failures MUST show a user-visible error; success MUST NEVER be displayed on failure.

#### Scenario: Successful post

- GIVEN valid form data and a configured webhook
- WHEN Discord responds 204
- THEN the user sees "¡Propuesta enviada con éxito!"

#### Scenario: Discord rejects the post

- GIVEN a configured webhook
- WHEN Discord responds 4xx or 5xx
- THEN an error message is shown and the success message is NOT displayed

#### Scenario: Network failure

- GIVEN no network connectivity
- WHEN the user submits
- THEN an error message is shown and the success message is NOT displayed

### Requirement: Embed Labels from Config

Embed field names and values MUST be derived from the config's option labels (e.g. "Tecnología", "1-3 meses"), never from raw option values ("tech", "1-3"). Embeds MUST respect Discord limits — 1024 chars/field, 4096 chars description, 25 fields — with chunking and a truncation note when needed.

#### Scenario: Labels shown in embed

- GIVEN a user selects service "Tecnología" and budget "1-3 meses"
- WHEN the embed is built
- THEN field values display the labels, not "tech" / "1-3"

#### Scenario: Long description truncated

- GIVEN a message longer than 4096 chars
- WHEN the embed is built
- THEN the description is chunked/truncated with a visible truncation note

### Requirement: Spam Mitigations

The form MUST include a hidden honeypot field: if filled, the submission MUST be silently dropped (no request, no feedback). A 5-second cooldown MUST block repeated submissions from the same page session.

#### Scenario: Honeypot triggers

- GIVEN a bot fills the hidden honeypot field
- WHEN the form is submitted
- THEN no request is sent and no success/error feedback is shown

#### Scenario: Cooldown blocks repeat

- GIVEN a submission within the last 5 seconds
- WHEN the user submits again
- THEN the second submission is blocked

#### Scenario: Cooldown expires

- GIVEN more than 5 seconds since the last submission
- WHEN the user submits
- THEN the submission proceeds normally

### Requirement: Localized Timestamps

Submission timestamps MUST be formatted in the `America/Costa_Rica` timezone with es-CR locale, and the embed MUST include an ISO timestamp.

#### Scenario: es-CR timestamp in embed

- GIVEN a submission at a known UTC instant
- WHEN the embed is built
- THEN the displayed timestamp is es-CR formatted in America/Costa_Rica
- AND an ISO timestamp is included for Discord