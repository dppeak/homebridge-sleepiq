# Change Log

All notable changes to this project will be documented in this file.

---

## v6.1.1 (2026-03-23)

### Bug Fixes

- **Fixed the root cause of all session expiry issues: cookies were being replaced instead of merged.**

  The original plugin used `request-promise-native` with `jar: true`, which maintains a cookie jar that merges cookies from every response. Our rewrite managed cookies manually but replaced the entire cookie string on each response. If the login set three session cookies (A, B, C) and a subsequent API response refreshed only cookie A, cookies B and C were silently discarded — causing the session to break almost immediately after the first successful poll.

  `_storeCookies()` now maintains a `Map<name, value>` cookie jar. New cookies from each response are merged in (existing entries updated, no cookie is ever dropped), exactly matching `jar: true` behaviour. With correct cookie management, sessions should remain valid for their full lifetime without frequent re-authentication.

---

## v6.1.0 (2026-03-23)

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
