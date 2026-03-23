"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnLightStrip = void 0;
/**
 * Foundation under-bed lightstrip accessory (outlet IDs 3 & 4).
 *
 * Exposed as a Lightbulb in HomeKit (on/off only — no brightness).
 * The `setting` field from the SleepIQ API is '1' (on) or '0' (off).
 */
class SnLightStrip {
    log;
    accessory;
    hap;
    snapi;
    lightService;
    /** Raw setting string from the API: '0' = off, '1' = on. */
    setting;
    constructor(log, accessory, hap, snapi) {
        this.log = log;
        this.accessory = accessory;
        this.hap = hap;
        this.snapi = snapi;
        const { Service: Svc, Characteristic: Chr } = hap;
        const sideName = accessory.context.sideName ?? '';
        this.setting = '0';
        this.lightService =
            accessory.getService(Svc.Lightbulb) ??
                accessory.addService(Svc.Lightbulb, `${sideName} Lightstrip`);
        // Accessory information
        (accessory.getService(Svc.AccessoryInformation) ?? accessory.addService(Svc.AccessoryInformation))
            .setCharacteristic(Chr.Manufacturer, 'Sleep Number')
            .setCharacteristic(Chr.Model, 'SleepIQ')
            .setCharacteristic(Chr.SerialNumber, '360');
        this.lightService
            .getCharacteristic(Chr.On)
            .onSet(async (value) => {
            this.log.debug(`LightStrip -> ${value}`);
            await this.setLightStrip(value);
        })
            .onGet(() => this.setting === '1');
    }
    /** Push the latest lightstrip state from SleepIQ into HomeKit (no network call). */
    updateLightStrip(value) {
        this.setting = String(value);
    }
    // ─── Private ──────────────────────────────────────────────────────────────
    async setLightStrip(value) {
        // Right side → outlet ID 3, left side → outlet ID 4
        const outletId = this.accessory.context.side === 'R' ? 3 : 4;
        const setting = value ? 1 : 0;
        this.log.debug(`Setting lightstrip outlet ${outletId} to ${setting}`);
        try {
            await this.snapi.outlet(outletId, setting);
        }
        catch (err) {
            this.log.error(`Failed to set lightstrip outlet ${outletId} to ${setting}:`, err);
        }
    }
}
exports.SnLightStrip = SnLightStrip;
