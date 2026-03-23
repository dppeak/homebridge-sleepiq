import { CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';

/**
 * Foundation outlet accessory (power outlets, outlet IDs 1 & 2).
 *
 * Exposed as a Switch in HomeKit.  The `setting` field from the SleepIQ API
 * is '1' (on) or '0' (off).
 */
export class SnOutlet {
  private readonly outletService: Service;
  /** Raw setting string from the API: '0' = off, '1' = on. */
  private setting: string;

  constructor(
    private readonly log: Logging,
    readonly accessory: PlatformAccessory<SleepIQContext>,
    private readonly hap: HAPBundle,
    private readonly snapi: SleepIQAPI,
  ) {
    const { Service: Svc, Characteristic: Chr } = hap;
    const sideName = accessory.context.sideName ?? '';
    this.setting = '0';

    this.outletService =
      accessory.getService(Svc.Outlet) ??
      accessory.addService(Svc.Outlet, `${sideName} Outlet`);

    // Accessory information
    (accessory.getService(Svc.AccessoryInformation) ?? accessory.addService(Svc.AccessoryInformation))
      .setCharacteristic(Chr.Manufacturer, 'Sleep Number')
      .setCharacteristic(Chr.Model, 'SleepIQ')
      .setCharacteristic(Chr.SerialNumber, '360');

    this.outletService
      .getCharacteristic(Chr.On)
      .onSet(async (value: CharacteristicValue) => {
        this.log.debug(`Outlet -> ${value}`);
        await this.setOutlet(value as boolean);
      })
      .onGet(() => this.setting === '1');

    // OutletInUse — always report true so HomeKit shows it as active
    this.outletService
      .getCharacteristic(Chr.OutletInUse)
      .onGet(() => true);
  }

  /** Push the latest outlet state from SleepIQ into HomeKit (no network call). */
  updateOutlet(value: number | string): void {
    this.setting = String(value);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async setOutlet(value: boolean): Promise<void> {
    // Right side → outlet ID 1, left side → outlet ID 2
    const outletId = this.accessory.context.side === 'R' ? 1 : 2;
    const setting = value ? 1 : 0;
    this.log.debug(`Setting outlet ${outletId} to ${setting}`);
    try {
      await this.snapi.outlet(outletId, setting);
    } catch (err) {
      this.log.error(`Failed to set outlet ${outletId} to ${setting}:`, err);
    }
  }
}
