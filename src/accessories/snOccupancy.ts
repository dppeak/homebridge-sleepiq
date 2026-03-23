import { CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';

/**
 * Occupancy sensor accessory.
 *
 * Represents a single bed side (left, right), the virtual "anySide", or the
 * virtual "bothSides" sensor.  The platform calls `setOccupancyDetected()` on
 * each polling cycle to push the latest value into HomeKit.
 */
export class SnOccupancy {
  private readonly occupancyService: Service;
  private occupancyDetected: CharacteristicValue;

  constructor(
    private readonly log: Logging,
    readonly accessory: PlatformAccessory<SleepIQContext>,
    private readonly hap: HAPBundle,
  ) {
    const { Service: Svc, Characteristic: Chr } = hap;

    this.occupancyDetected = Chr.OccupancyDetected.OCCUPANCY_NOT_DETECTED;

    // Restore from cache or create fresh
    this.occupancyService =
      accessory.getService(Svc.OccupancySensor) ??
      accessory.addService(Svc.OccupancySensor);

    // Accessory information
    (accessory.getService(Svc.AccessoryInformation) ?? accessory.addService(Svc.AccessoryInformation))
      .setCharacteristic(Chr.Manufacturer, 'Sleep Number')
      .setCharacteristic(Chr.Model, 'SleepIQ')
      .setCharacteristic(Chr.SerialNumber, '360');

    // Characteristic handler — return in-memory value synchronously
    this.occupancyService
      .getCharacteristic(Chr.OccupancyDetected)
      .onGet(() => this.occupancyDetected);
  }

  /** Called by the platform on every polling cycle. */
  setOccupancyDetected(value: boolean): void {
    const { Characteristic: Chr } = this.hap;
    this.occupancyDetected = value
      ? Chr.OccupancyDetected.OCCUPANCY_DETECTED
      : Chr.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    this.occupancyService.setCharacteristic(Chr.OccupancyDetected, this.occupancyDetected);
  }
}
