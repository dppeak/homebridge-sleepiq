# Change Log

All notable changes to this project will be documented in this file.

---

## v6.0.9 (2026-03-23)

### Bug Fixes

- **Fixed intermittent 401 errors where a retry immediately after re-authentication still failed.** The Sleep Number API appears to have a brief propagation delay between when a new session key is issued and when it becomes usable. The first retry was arriving before the session was fully active on their servers.
- Added a 500ms delay between re-authentication and the retry to allow the session to become active
- Increased maximum retry attempts from 1 to 2, so if the first retry still catches a transitional 401 the client re-authenticates and tries once more
- Retry log now includes the attempt number (e.g. `attempt 1/2`) for easier diagnosis

---

## v6.0.8 (2026-03-23)

### Bug Fixes

- Fixed intermittent 401 failures when polling and a HomeKit write fired simultaneously. All API requests are now serialized through a single promise queue so only one HTTP request is in-flight at a time

---

## v6.0.7 (2026-03-23)

### Bug Fixes

- Fixed race condition where `platform.ts` called `authenticate()` concurrently with the API layer's own reauth, causing one to invalidate the other's fresh session key. Session recovery is now handled exclusively by the API layer

---

## v6.0.6 (2026-03-23)

### Changes

- Added Homebridge logger to `SleepIQAPI` for visible reauth diagnostics at info level

---

## v6.0.5 (2026-03-23)

### Bug Fixes

- Fixed 401 retry rebuilding the URL with a stale `_k` session key captured at call time

---

## v6.0.4 (2026-03-23)

### Bug Fixes

- Fixed write operations silently failing when the session expires

---

## v6.0.3 (2026-03-23)

### New Features

- Per-feature enable/disable toggles in the Homebridge UI config form

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
