# Change Log

All notable changes to this project will be documented in this file.

---

## v6.0.7 (2026-03-23)

### Bug Fixes

- **Fixed the root cause of persistent 401 errors on outlet/write operations.** The platform had two separate session-recovery code paths that were racing with each other:
  - `SleepIQAPI._request()` would detect a 401, call `_reauth()`, get a fresh key, then retry
  - Simultaneously, `platform.fetchData()` would also detect the 401 and call `authenticate()` → `login()`, which issued a second login request that invalidated the key `_reauth()` had just obtained
  - The retry then fired with a revoked key and failed with 401 again
- Removed all session-expiry handling from `platform.ts`. Session recovery is now handled exclusively by `SleepIQAPI._request()` via its automatic reauth+retry. The platform calls `authenticate()` only once at startup
- `platform.ts` now suppresses 401 errors in `handleApiError()` during polling (they are already handled at the API layer and do not need to be logged)

---

## v6.0.6 (2026-03-23)

### Changes

- Added Homebridge logger to `SleepIQAPI` via `setLogger()` so re-authentication events appear in the Homebridge log at info level
- Added info logging when re-authentication is triggered, succeeds, or fails
- Added info log when a request is retried after re-authentication

---

## v6.0.5 (2026-03-23)

### Bug Fixes

- Fixed 401 retry introduced in v6.0.4 not actually working: the retry was rebuilding the URL with the stale `_k` session key captured at call time
- `_k` is now injected automatically by `_buildURL()` at request build time so retries always use the freshly updated session key

---

## v6.0.4 (2026-03-23)

### Bug Fixes

- Fixed write operations (outlet on/off, sleep number, foot warmer, foundation position) silently failing when the session expires
- Added concurrency guard so multiple simultaneous 401s share a single re-authentication call

---

## v6.0.3 (2026-03-23)

### New Features

- Per-feature enable/disable toggles in the Homebridge UI config form
- All toggles default to `true` so existing installs are unaffected
- Disabling a feature removes cached accessories from HomeKit on restart
- Polling skips API calls for disabled features

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
- Fixed session expiry during startup preventing foundation accessories from being created
- Fixed build script and TypeScript lib configuration

---

## v6.0.0 (2026-03-23)

> **Community fork** of [DeeeeLAN/homebridge-sleepiq](https://github.com/DeeeeLAN/homebridge-sleepiq) at v4.2.0, maintained by [dppeak](https://github.com/dppeak).

- Full TypeScript rewrite
- Native `fetch` replaces `request-promise-native`
- Homebridge 2.0 / HAP-NodeJS v1 compatibility

---

## v4.2.0 (2020-10-16)

- Add a "bothSidesOccupied" sensor

## Older

- Refer to GitHub commit history for details.
