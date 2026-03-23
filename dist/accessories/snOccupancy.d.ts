import { Logging, PlatformAccessory } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
/**
 * Occupancy sensor accessory.
 *
 * Represents a single bed side (left, right), the virtual "anySide", or the
 * virtual "bothSides" sensor.  The platform calls `setOccupancyDetected()` on
 * each polling cycle to push the latest value into HomeKit.
 */
export declare class SnOccupancy {
    private readonly log;
    readonly accessory: PlatformAccessory<SleepIQContext>;
    private readonly hap;
    private readonly occupancyService;
    private occupancyDetected;
    constructor(log: Logging, accessory: PlatformAccessory<SleepIQContext>, hap: HAPBundle);
    /** Called by the platform on every polling cycle. */
    setOccupancyDetected(value: boolean): void;
}
