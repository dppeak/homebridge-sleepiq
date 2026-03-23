import { Logging, PlatformAccessory } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';
/**
 * Foundation outlet accessory (power outlets, outlet IDs 1 & 2).
 *
 * Exposed as a Switch in HomeKit.  The `setting` field from the SleepIQ API
 * is '1' (on) or '0' (off).
 */
export declare class SnOutlet {
    private readonly log;
    readonly accessory: PlatformAccessory<SleepIQContext>;
    private readonly hap;
    private readonly snapi;
    private readonly outletService;
    /** Raw setting string from the API: '0' = off, '1' = on. */
    private setting;
    constructor(log: Logging, accessory: PlatformAccessory<SleepIQContext>, hap: HAPBundle, snapi: SleepIQAPI);
    /** Push the latest outlet state from SleepIQ into HomeKit (no network call). */
    updateOutlet(value: number | string): void;
    private setOutlet;
}
