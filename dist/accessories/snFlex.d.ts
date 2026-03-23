import { Logging, PlatformAccessory } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';
/**
 * Flex foundation accessory (head and foot position control).
 *
 * Each side of the foundation exposes two Lightbulb services — one for the
 * head actuator and one for the foot actuator — so that the Brightness slider
 * maps to position (0–100).
 */
export declare class SnFlex {
    private readonly log;
    readonly accessory: PlatformAccessory<SleepIQContext>;
    private readonly hap;
    private readonly snapi;
    private readonly headService;
    private readonly footService;
    private headPosition;
    private footPosition;
    constructor(log: Logging, accessory: PlatformAccessory<SleepIQContext>, hap: HAPBundle, snapi: SleepIQAPI);
    /** Push the latest foundation positions from SleepIQ into HomeKit (no network call). */
    updateFoundation(head: number, foot: number): void;
    private sendPosition;
}
