"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnNumber = void 0;
/**
 * Sleep Number control accessory.
 *
 * Exposed as a Lightbulb in HomeKit so that the sleep number (0–100, step 5)
 * maps naturally to the Brightness slider.  The On/Off characteristic is
 * locked to "on" so the slider is always accessible.
 *
 * Changes are debounced by `sendDelay` milliseconds so that dragging the
 * slider doesn't flood the bed with requests.
 */
class SnNumber {
    log;
    accessory;
    hap;
    snapi;
    sendDelay;
    numberService;
    sleepNumber;
    debounceTimer = null;
    constructor(log, accessory, hap, snapi, sendDelay) {
        this.log = log;
        this.accessory = accessory;
        this.hap = hap;
        this.snapi = snapi;
        this.sendDelay = sendDelay;
        const { Service: Svc, Characteristic: Chr } = hap;
        const sideName = accessory.context.sideName ?? '';
        this.sleepNumber = 50;
        this.numberService =
            accessory.getService(Svc.Lightbulb) ??
                accessory.addService(Svc.Lightbulb, `${sideName} Number`);
        // Ensure Brightness characteristic exists
        if (!this.numberService.testCharacteristic(Chr.Brightness)) {
            this.numberService.addCharacteristic(Chr.Brightness);
        }
        // Keep the "light" permanently on so the brightness slider stays accessible
        this.numberService.setCharacteristic(Chr.On, true);
        // Accessory information
        (accessory.getService(Svc.AccessoryInformation) ?? accessory.addService(Svc.AccessoryInformation))
            .setCharacteristic(Chr.Manufacturer, 'Sleep Number')
            .setCharacteristic(Chr.Model, 'SleepIQ')
            .setCharacteristic(Chr.SerialNumber, '360');
        // Brightness = sleep number
        this.numberService
            .getCharacteristic(Chr.Brightness)
            .onSet((value) => {
            this.log.debug(`Sleep Number -> ${value}`);
            this.debouncedSet(value);
        })
            .onGet(() => this.sleepNumber)
            .setProps({ minValue: 5, maxValue: 100, minStep: 5 });
        // Re-lock the switch if HomeKit ever flips it off
        this.numberService
            .getCharacteristic(Chr.On)
            .onSet((value) => {
            if (!value) {
                setTimeout(() => this.numberService.setCharacteristic(Chr.On, true), 250);
            }
        });
    }
    /** Push the latest sleep number from SleepIQ into HomeKit (no network call). */
    updateSleepNumber(value) {
        this.sleepNumber = value;
    }
    // ─── Private ──────────────────────────────────────────────────────────────
    debouncedSet(value) {
        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.sendSleepNumber(value);
        }, this.sendDelay);
    }
    sendSleepNumber(value) {
        const side = this.accessory.context.side ?? 'L';
        this.log.debug(`Setting sleep number=${value} on side=${side}`);
        this.snapi.sleepNumber(side, value).catch((err) => {
            this.log.error(`Failed to set sleep number=${value} on side=${side}:`, err);
        });
    }
}
exports.SnNumber = SnNumber;
