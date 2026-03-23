# Change Log

All notable changes to this project will be documented in this file.

---

## v6.0.0 (2025)

> **Community fork** of [DeeeeLAN/homebridge-sleepiq](https://github.com/DeeeeLAN/homebridge-sleepiq) at v4.2.0, maintained by [dppeak](https://github.com/dppeak).

### Breaking Changes

- **Node.js >= 18.20.4 required** (previously >= 0.12.0)
- **Homebridge >= 1.8.0 required** (previously >= 0.2.0)
- Project is now TypeScript — source lives in `src/`, compiled output in `dist/`

### Changed

- Full rewrite in **TypeScript** with strict mode; split into `src/api.ts`, `src/platform.ts`, and `src/accessories/sn*.ts`
- Replaced abandoned `request-promise-native` with **native `fetch`** (Node 18+) — zero runtime dependencies
- Updated for **Homebridge 2.0 / HAP-NodeJS v1** compatibility:
  - Removed all `accessory.reachable` assignments (reachability removed from HAP-NodeJS v1)
  - Replaced `.on('get', callback)` / `.on('set', callback)` with `.onGet()` / `.onSet()`
  - Removed use of removed internal HAP properties (`_associatedHAPAccessory`, `_associatedPlatform`)
  - Fixed `removeMarkedAccessories()` splice bug that prevented stale accessories from ever being removed
- Characteristic handlers now set up in **accessory constructors** (no more `getServices()` pattern)
- **Typed accessory Maps** per class — no internal type casting
- Fixed `sendDelay` not being passed to `SnNumber` in `addAccessories()`
- Removed dead `waitForBedToStopMoving` method from `SnFlex`
- Added `prepare` npm script so the plugin builds automatically on `npm install`
- Added `"files": ["dist"]` to `package.json` so published packages only include compiled output

---

## v4.2.0 (2020-10-16)

### Changes

- Add a "bothSidesOccupied" sensor that will trigger if both sides of the bed are occupied

## v4.1.16 (2020-09-23)

### Bug Fixes

- Fixed right lightstrip and outlet controlling the left side

## v4.1.15 (2020-09-22)

### Bug Fixes

- Fixed bug with outlet and light controls not updating the bed state

## v4.1.14 (2020-09-22)

### Bug Fixes

- Fixed `sideName is not defined` error
- Cleaned up error message output

### API Features

- Added testing switch to simulate foundation devices when unavailable on your account

## v4.1.13 (2020-09-22)

### Bug Fixes

- Fixed outlets and lightstrips not getting created and causing homebridge to restart

## v4.1.12 (2020-09-22)

### Bug Fixes

- Fixed refresh time not working issue (#29)

## v4.1.11 (2020-09-22)

### Bug Fixes

- Fixed bed0privacy cache issues

## v4.1.10 (2020-09-21)

### Bug Fixes

- Fixed `sideName is not defined` bug

## v4.1.9 (2020-09-21)

### Bug Fixes

- Fixed bug with foot warmer causing UUID collision

## v4.1.8 (2020-09-21)

### Bug Fixes

- Fixed bug causing homebridge crash when foundation only has one outlet or lightstrip available

## v4.1.7 (2020-09-21)

### Bug Fixes

- Fixed bug in the outlets, lightstrips, and foot warmer foundation code that was crashing homebridge

## v4.1.6 (2020-09-20)

### Bug Fixes

- Fixed bug in foot-warmer data processor

## v4.1.5 (2020-09-20)

### Bug Fixes

- You no longer need to manually clear cache or remove `bed0privacy` from the cache if updating from pre-v4.0.0

## v4.1.4 (2020-09-19)

### Bug Fixes

- Fixed `updateLightStrip` error that was crashing homebridge

## v4.1.3 (2020-09-19)

### Bug Fixes

- Fixed a bug breaking the outlets, lightstrips, and foot warmer from functioning

## v4.1.2 (2020-09-18)

### Bug Fixes

- Fixed a bug preventing the foot warming service from sending changes to the bed

## v4.1.1 (2020-09-17)

### Note

- If updating causes homebridge to stop running, try removing the `bed0privacy` device from the accessory cache

## v4.1.0 (2020-09-17)

### Changes

- Added initial foot warmer support for FlexFit 3 foundations
- Set a step size for the sleep number slider

## v4.0.1 (2020-09-17)

### Bug Fixes

- Fixed bug in API call for foundation outlets and light strips

## v4.0.0 (2020-09-17)

### Changes

- Added initial support for foundation outlets and light strips

## v3.4.1 - v3.4.17 (2020-09-17)

### Bug Fixes

- Various

### Changes

- Add support for Homebridge UI

## v3.4.0 (2020-09-16)

### Changes

- Add support for having foundations return to flat when the HomeKit lightbulb is turned off
- Debounce the sleep number update request

### Bug Fixes

- Fixes for various promise errors
- Set the minimum sleep number value to 5

## Older

- Refer to GitHub commit history for details.
