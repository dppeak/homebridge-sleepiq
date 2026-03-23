import { Logging, PlatformAccessory } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';
/**
 * Privacy mode (Pause) switch accessory.
 *
 * When enabled, the bed stops transmitting sleep data to Sleep Number's
 * servers.  Exposed as a plain Switch in HomeKit.
 */
export declare class SnPrivacy {
    private readonly log;
    readonly accessory: PlatformAccessory<SleepIQContext>;
    private readonly hap;
    private readonly snapi;
    private readonly privacyService;
    /** 'on' | 'off' — matches the SleepIQ API string. */
    private privacy;
    constructor(log: Logging, accessory: PlatformAccessory<SleepIQContext>, hap: HAPBundle, snapi: SleepIQAPI);
    /** Push the latest privacy mode from SleepIQ into HomeKit (no network call). */
    updatePrivacy(value: 'on' | 'off'): void;
    private setPrivacy;
}
