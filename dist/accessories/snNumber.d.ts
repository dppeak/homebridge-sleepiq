import { Logging, PlatformAccessory } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';
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
export declare class SnNumber {
    private readonly log;
    readonly accessory: PlatformAccessory<SleepIQContext>;
    private readonly hap;
    private readonly snapi;
    private readonly sendDelay;
    private readonly numberService;
    private sleepNumber;
    private debounceTimer;
    constructor(log: Logging, accessory: PlatformAccessory<SleepIQContext>, hap: HAPBundle, snapi: SleepIQAPI, sendDelay: number);
    /** Push the latest sleep number from SleepIQ into HomeKit (no network call). */
    updateSleepNumber(value: number): void;
    private debouncedSet;
    private sendSleepNumber;
}
