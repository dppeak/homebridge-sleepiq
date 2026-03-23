# Change Log

All notable changes to this project will be documented in this file.

---

## v6.0.8 (2026-03-23)

### Bug Fixes

- **Fixed intermittent 401 failures on outlet and write operations when the polling cycle and a HomeKit action fire at the same time.** The root cause: after a reauth both the poll and the write retried simultaneously with the same fresh session key. The Sleep Number API appeared to reject one of the two concurrent requests using the same key, causing the second to 401 even though reauth had just succeeded.
- All public API methods are now serialized through a single promise queue so only one HTTP request (including any reauth+retry) is in-flight at a time. A HomeKit action that arrives while a poll is running will wait for the poll to finish before executing, ensuring the session key is stable for each request.

---

## v6.0.7 (2026-03-23)

### Bug Fixes

- Fixed the race condition where `platform.ts` was calling `authenticate()` concurrently with `SleepIQAPI._request()`'s own reauth, causing one to invalidate the other's fresh session key
- Session recovery is now handled exclusively by the API layer; the platform calls `login()` only once at startup

---

## v6.0.6 (2026-03-23)

### Changes

- Added Homebridge logger to `SleepIQAPI` for visible reauth diagnostics at info level

---

## v6.0.5 (2026-03-23)

### Bug Fixes

- Fixed 401 retry rebuilding the URL with a stale `_k` session key
- `_k` is now injected automatically at request build time

---

## v6.0.4 (2026-03-23)

### Bug Fixes

- Fixed write operations silently failing when the session expires
- Added concurrency guard for simultaneous 401s

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
- Fixed session expiry during startup preventing foundation accessories from being created
- Fixed build script and TypeScript lib configuration

---

## v6.0.0 (2026-03-23)

> **Community fork** of [DeeeeLAN/homebridge-sleepiq](https://github.com/DeeeeLAN/homebridge-sleepiq) at v4.2.0, maintained by [dppeak](https://github.com/dppeak).

- Full TypeScript rewrite with native `fetch` and Homebridge 2.0 compatibility

---

## v4.2.0 and earlier

- Refer to GitHub commit history for details.
