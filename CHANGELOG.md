# Change Log

All notable changes to this project will be documented in this file.

---

## v6.0.13 (2026-03-23)

### Bug Fixes

- Fixed `config.schema.json` failing Homebridge schema validation: `required` must be an array at the object level (`"required": ["email", "password"]`), not a boolean property on individual fields. Removed `"required": true/false` from all individual property definitions.

---

## v6.0.12 (2026-03-23)

### Changes

- Updated Node.js engine requirement from `>=18.20.4` to `>=20.0.0` — Node 18 reached end of life in April 2025. Node v20, v22, and v24 are supported.

---

## v6.0.11 (2026-03-23)

### Bug Fixes

- Fixed the root cause of all session expiry issues: cookies were being replaced instead of merged on each API response, causing sessions to break almost immediately after the first successful poll. Cookie management now matches the `jar: true` behaviour of the original plugin.

---

## v6.0.10 (2026-03-23)

### Bug Fixes

- Added proactive session refresh timer (every 45 seconds) to keep session alive before expiry
- Reduced reactive retry attempts and increased retry delay

---

## v6.0.9 (2026-03-23)

### Bug Fixes

- Added 500ms delay between re-authentication and retry
- Increased maximum retry attempts to 2

---

## v6.0.8 (2026-03-23)

### Bug Fixes

- Serialized all API requests through a single promise queue

---

## v6.0.7 (2026-03-23)

### Bug Fixes

- Removed platform-level session recovery that raced with API-layer reauth

---

## v6.0.6 (2026-03-23)

### Changes

- Added Homebridge logger to SleepIQAPI for visible reauth diagnostics

---

## v6.0.5 (2026-03-23)

### Bug Fixes

- Fixed 401 retry using stale `_k` session key

---

## v6.0.4 (2026-03-23)

### Bug Fixes

- Fixed write operations silently failing on session expiry

---

## v6.0.3 (2026-03-23)

### New Features

- Per-feature enable/disable toggles in Homebridge UI config form

---

## v6.0.2 (2026-03-23)

### New Features

- Added `config.schema.json` for Homebridge UI config form

### Bug Fixes

- Fixed config field name `delay` → `sendDelay`

---

## v6.0.1 (2026-03-23)

### Bug Fixes

- Fixed session expiry not triggering re-authentication during polling
- Fixed build script and TypeScript lib configuration

---

## v6.0.0 (2026-03-23)

> **Community fork** of [DeeeeLAN/homebridge-sleepiq](https://github.com/DeeeeLAN/homebridge-sleepiq) at v4.2.0, maintained by [dppeak](https://github.com/dppeak).

- Full TypeScript rewrite with native `fetch` and Homebridge 2.0 compatibility

---

## v4.2.0 and earlier

- Refer to GitHub commit history for details.
