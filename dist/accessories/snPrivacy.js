"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnPrivacy = void 0;
/**
 * Privacy mode (Pause) switch accessory.
 *
 * When enabled, the bed stops transmitting sleep data to Sleep Number's
 * servers.  Exposed as a plain Switch in HomeKit.
 */
class SnPrivacy {
    log;
    accessory;
    hap;
    snapi;
    privacyService;
    /** 'on' | 'off' — matches the SleepIQ API string. */
    privacy;
    constructor(log, accessory, hap, snapi) {
        this.log = log;
        this.accessory = accessory;
        this.hap = hap;
        this.snapi = snapi;
        const { Service: Svc, Characteristic: Chr } = hap;
        this.privacy = 'off';
        this.privacyService =
            accessory.getService(Svc.Switch) ??
                accessory.addService(Svc.Switch, `${accessory.context.bedName ?? ''} Privacy`);
        // Accessory information
        (accessory.getService(Svc.AccessoryInformation) ?? accessory.addService(Svc.AccessoryInformation))
            .setCharacteristic(Chr.Manufacturer, 'Sleep Number')
            .setCharacteristic(Chr.Model, 'SleepIQ')
            .setCharacteristic(Chr.SerialNumber, '360');
        this.privacyService
            .getCharacteristic(Chr.On)
            .onSet(async (value) => {
            this.log.debug(`Privacy -> ${value}`);
            await this.setPrivacy(value);
        })
            .onGet(() => this.privacy === 'on');
    }
    /** Push the latest privacy mode from SleepIQ into HomeKit (no network call). */
    updatePrivacy(value) {
        this.privacy = value;
    }
    // ─── Private ──────────────────────────────────────────────────────────────
    async setPrivacy(value) {
        const mode = value ? 'on' : 'off';
        try {
            await this.snapi.setBedPauseMode(mode);
        }
        catch (err) {
            this.log.error(`Failed to set privacy mode to ${mode}:`, err);
        }
    }
}
exports.SnPrivacy = SnPrivacy;
