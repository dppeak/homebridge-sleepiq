# Homebridge SleepIQ

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=flat&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://img.shields.io/npm/v/@dppeak/homebridge-sleepiq)](https://www.npmjs.com/package/@dppeak/homebridge-sleepiq)
[![Homebridge](https://img.shields.io/badge/homebridge-%5E1.8.0-blueviolet)](https://homebridge.io)

A [Homebridge](https://homebridge.io) plugin for Sleep Number SleepIQ smart beds. Control your Sleep Number settings and monitor bed occupancy directly from HomeKit and Siri.

> **Fork notice:** This is a community fork of the original [DeeeeLAN/homebridge-sleepiq](https://github.com/DeeeeLAN/homebridge-sleepiq), forked at v4.2.0. It has been rewritten in TypeScript and updated for Homebridge 2.0 / HAP-NodeJS v1 compatibility.

---

## Features

- **Occupancy sensors** — per-side (left/right), plus virtual `anySide` and `bothSides` sensors
- **Sleep Number control** — adjust firmness (5–100, step 5) via a HomeKit dimmer slider
- **Privacy mode** — toggle bed pause mode (stops data transmission to Sleep Number)
- **FlexFit foundation** — head and foot position control (0–100) per side
- **Foundation outlets** — control the power outlets on compatible foundations
- **Foundation lightstrips** — control the under-bed lightstrips on compatible foundations
- **Foot warmers** — four-level control (off / low / med / high) on FlexFit 3 foundations

---

## Installation

### Via Homebridge UI (recommended)

Search for `homebridge-sleepiq` in the Homebridge web UI plugin tab and click Install.

### Via npm

```bash
npm install -g @dppeak/homebridge-sleepiq
```

### From this repository

```bash
npm install -g github:dppeak/homebridge-sleepiq
```

---

## Configuration

Add the platform to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "SleepIQ",
      "name": "SleepIQ",
      "email": "your@email.com",
      "password": "yourpassword"
    }
  ]
}
```

### Configuration options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `email` | string | **required** | Your Sleep Number account email |
| `password` | string | **required** | Your Sleep Number account password |
| `refreshTime` | number | `5` | How often (in seconds) to poll SleepIQ for updates |
| `sendDelay` | number | `2` | Debounce delay (in seconds) before sending a new sleep number to the bed |
| `warmingTimer` | string | `"6h"` | Duration for foot warming. Options: `30m`, `1h`, `2h`, `3h`, `4h`, `5h`, `6h` |
| `enableOccupancySensors` | boolean | `true` | Create occupancy sensors for each side |
| `enableSleepNumberControls` | boolean | `true` | Create sleep number dimmer controls |
| `enablePrivacySwitch` | boolean | `true` | Create privacy/pause mode switch |
| `enableFoundationControls` | boolean | `true` | Create head/foot position controls |
| `enableOutlets` | boolean | `true` | Create foundation outlet switches |
| `enableLightstrips` | boolean | `true` | Create foundation lightstrip controls |
| `enableFootWarmers` | boolean | `true` | Create foot warmer controls |

---

## HomeKit Accessories

The plugin creates the following accessories for each bed:

| Accessory | HomeKit Type | Notes |
|-----------|-------------|-------|
| `bed0privacy` | Switch | Toggles SleepIQ privacy/pause mode |
| `bed0leftSideoccupancy` | Occupancy Sensor | Is left side occupied? |
| `bed0rightSideoccupancy` | Occupancy Sensor | Is right side occupied? |
| `bed0anySideoccupancy` | Occupancy Sensor | Is either side occupied? |
| `bed0bothSidesoccupancy` | Occupancy Sensor | Are both sides occupied? |
| `bed0leftSidenumber` | Lightbulb (brightness) | Left side sleep number (5–100) |
| `bed0rightSidenumber` | Lightbulb (brightness) | Right side sleep number (5–100) |
| `bed0leftSideflex` | Lightbulb ×2 (brightness) | Left side head + foot position (foundation required) |
| `bed0rightSideflex` | Lightbulb ×2 (brightness) | Right side head + foot position (foundation required) |
| `bed0leftSideoutlet` | Outlet | Left foundation outlet (foundation required) |
| `bed0rightSideoutlet` | Outlet | Right foundation outlet (foundation required) |
| `bed0leftSidelightstrip` | Lightbulb | Left under-bed lightstrip (foundation required) |
| `bed0rightSidelightstrip` | Lightbulb | Right under-bed lightstrip (foundation required) |
| `bed0leftSidefootwarmer` | Lightbulb (brightness 0–3) | Left foot warmer level (FlexFit 3 required) |
| `bed0rightSidefootwarmer` | Lightbulb (brightness 0–3) | Right foot warmer level (FlexFit 3 required) |

Foundation accessories are only created if the hardware is detected on your account at startup.

---

## Requirements

- Node.js >= 20.0.0
- Homebridge >= 1.8.0

---

## Building from source

```bash
git clone https://github.com/dppeak/homebridge-sleepiq.git
cd homebridge-sleepiq
npm install
npm run build
```

During development, `npm run watch` will recompile on every file save.

---

## Credits

Originally created by [DeeeeLAN](https://github.com/DeeeeLAN). Forked and maintained by [dppeak](https://github.com/dppeak).

SleepIQ API documentation sourced from:
- https://github.com/technicalpickles/sleepyq
- https://github.com/erichelgeson/sleepiq
- https://github.com/natecj/sleepiq-php
