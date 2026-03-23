import { Logging, PlatformAccessory } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';
/**
 * Foundation under-bed lightstrip accessory (outlet IDs 3 & 4).
 *
 * Exposed as a Lightbulb in HomeKit (on/off only — no brightness).
 * The `setting` field from the SleepIQ API is '1' (on) or '0' (off).
 */
export declare class SnLightStrip {
    private readonly log;
    readonly accessory: PlatformAccessory<SleepIQContext>;
    private readonly hap;
    private readonly snapi;
    private readonly lightService;
    /** Raw setting string from the API: '0' = off, '1' = on. */
    private setting;
    constructor(log: Logging, accessory: PlatformAccessory<SleepIQContext>, hap: HAPBundle, snapi: SleepIQAPI);
    /** Push the latest lightstrip state from SleepIQ into HomeKit (no network call). */
    updateLightStrip(value: number | string): void;
    private setLightStrip;
}
