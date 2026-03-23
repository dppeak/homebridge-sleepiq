# Change Log

All notable changes to this project will be documented in this file.

---

## v6.1.0 (2026-03-23)

### Bug Fixes

- **Dramatically reduced login frequency.** The Sleep Number API issues sessions with a ~60 second TTL. Previous versions reactively re-authenticated on every poll cycle (once per minute), causing 60+ logins per hour which risked IP rate-limiting by Sleep Number's servers.
- Added a **proactive session refresh timer** that re-authenticates every 45 seconds, before the session expires. Polls and HomeKit actions now run against a always-fresh session and never encounter a 401 in normal operation.
- Reduced `MAX_AUTH_RETRIES` from 2 back to 1 — reactive retries are now a safety net for edge cases only, not the primary session recovery path.
- Increased retry delay from 500ms to 1000ms for better resilience on the rare occasions a reactive retry is needed.

---

## v6.0.9 (2026-03-23)

### Bug Fixes

- Added 500ms delay between re-authentication and retry for session propagation
- Increased maximum retry attempts to 2

---

## v6.0.8 (2026-03-23)

### Bug Fixes

- Serialized all API requests through a single queue to prevent concurrent reauth races

---

## v6.0.7 (2026-03-23)

### Bug Fixes

- Removed platform-level session recovery that was racing with API-layer reauth

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
