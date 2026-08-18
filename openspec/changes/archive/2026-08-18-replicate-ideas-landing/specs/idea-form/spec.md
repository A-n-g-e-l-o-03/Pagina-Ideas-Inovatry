# Idea Form Specification

## Purpose

The idea form is rendered client-side from `js/form-config.json` and collects structured idea submissions. It validates required fields, a format-validated email, attachment limits aligned with Discord's real total cap, and privacy consent — with a visible error state when config loading fails.

## Requirements

### Requirement: Config-Driven Rendering

The form MUST render fields, labels, options, and validation rules from `js/form-config.json`: name (required, min 2), proponente (required, min 2), service select (required), budget select (optional), message (required, min 10), attachments (optional), email (required), and privacy consent checkbox (required).

#### Scenario: Form renders from config

- GIVEN `js/form-config.json` loads successfully
- WHEN the page initializes
- THEN all configured fields render with their config labels and options

#### Scenario: Required vs optional fields

- GIVEN the rendered form
- WHEN a user inspects field constraints
- THEN required fields reject empty values and optional fields accept empty values

### Requirement: Required Email with Format Validation

The email field MUST be required and MUST accept only valid email formats. Invalid or empty emails MUST block submission and show an inline error message.

#### Scenario: Valid email accepted

- GIVEN all other required fields are filled
- WHEN the user enters `usuario@ejemplo.com` in the email field
- THEN no email error is shown and submission proceeds

#### Scenario: Invalid format rejected

- GIVEN the user enters `usuario@sin-formato` in the email field
- WHEN the user submits the form
- THEN submission is blocked and an inline format error is displayed

#### Scenario: Empty email rejected

- GIVEN the email field is left blank
- WHEN the user submits
- THEN submission is blocked with a required-field error

### Requirement: Inline Validation Feedback

The form MUST validate on blur/change and MUST display per-field error messages; errors MUST clear once the field becomes valid.

#### Scenario: Error clears on correction

- GIVEN a name field showing a min-length error
- WHEN the user types a valid name
- THEN the error disappears

### Requirement: Attachment Limit Aligned with Discord

Attachments MUST be optional, restricted to office/image types, and MUST NOT exceed 8MB in TOTAL (Discord's real per-message webhook limit). Oversized or wrongly typed files MUST block submission with an inline error.

#### Scenario: Total size within limit

- GIVEN three allowed-type files totaling 6MB
- WHEN the user submits
- THEN files are accepted and included in the request

#### Scenario: Total size exceeds 8MB

- GIVEN five 2MB files (10MB total), each individually under 8MB
- WHEN the user submits
- THEN submission is blocked with a total-size error

#### Scenario: Disallowed type

- GIVEN a `.exe` attachment
- WHEN the user submits
- THEN submission is blocked with a type error

### Requirement: Config Load Failure Message

If fetching `js/form-config.json` fails, the form area MUST show a visible error message instead of rendering an empty form.

#### Scenario: Config fetch fails

- GIVEN `js/form-config.json` returns 404 or a network error
- WHEN the page initializes
- THEN a user-visible error message replaces the form area
- AND no empty form is rendered

### Requirement: Privacy Consent

The form MUST include a required consent checkbox that links to `privacy.html`; submission MUST be blocked while it is unchecked.

#### Scenario: Consent unchecked blocks submit

- GIVEN the consent checkbox is unchecked
- WHEN the user submits
- THEN submission is blocked with a consent error

#### Scenario: Consent link present

- GIVEN the consent checkbox label
- WHEN a user follows its link
- THEN `privacy.html` opens