import { Logging, PlatformAccessory } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';
/**
 * Foot warmer accessory.
 *
 * Exposed as a Lightbulb in HomeKit where the Brightness slider represents
 * the warming level:
 *   - 0 = off
 *   - 1 = low  (31 in SleepIQ API)
 *   - 2 = med  (57)
 *   - 3 = high (72)
 */
export declare class SnFootWarmer {
    private readonly log;
    readonly accessory: PlatformAccessory<SleepIQContext>;
    private readonly hap;
    private readonly snapi;
    /** Duration string passed to the SleepIQ API, e.g. '6h'. */
    private readonly timer;
    private readonly warmerService;
    private warmingLevel;
    constructor(log: Logging, accessory: PlatformAccessory<SleepIQContext>, hap: HAPBundle, snapi: SleepIQAPI, 
    /** Duration string passed to the SleepIQ API, e.g. '6h'. */
    timer: string);
    /** Push the latest warming level from SleepIQ into HomeKit (no network call). */
    updateFootWarmer(apiTempValue: string | number): void;
    private setFootWarmer;
}
