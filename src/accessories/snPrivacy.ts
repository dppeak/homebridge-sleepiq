import { CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';

/**
 * Privacy mode (Pause) switch accessory.
 *
 * When enabled, the bed stops transmitting sleep data to Sleep Number's
 * servers.  Exposed as a plain Switch in HomeKit.
 */
export class SnPrivacy {
  private readonly privacyService: Service;
  /** 'on' | 'off' — matches the SleepIQ API string. */
  private privacy: 'on' | 'off';

  constructor(
    private readonly log: Logging,
    readonly accessory: PlatformAccessory<SleepIQContext>,
    private readonly hap: HAPBundle,
    private readonly snapi: SleepIQAPI,
  ) {
    const { Service: Svc, Characteristic: Chr } = hap;
    this.privacy = 'off';

    this.privacyService =
      accessory.getService(Svc.Switch) ??
      accessory.addService(Svc.Switch, `${accessory.context.bedName ?? ''} Privacy`);

    // Accessory information
    (accessory.getService(Svc.AccessoryInformation) ?? accessory.addService(Svc.AccessoryInformation))
      .setCharacteristic(Chr.Manufacturer, 'Sleep Number')
      .setCharacteristic(Chr.Model, 'SleepIQ')
      .setCharacteristic(Chr.SerialNumber, '360');

    this.privacyService
      .getCharacteristic(Chr.On)
      .onSet(async (value: CharacteristicValue) => {
        this.log.debug(`Privacy -> ${value}`);
        await this.setPrivacy(value as boolean);
      })
      .onGet(() => this.privacy === 'on');
  }

  /** Push the latest privacy mode from SleepIQ into HomeKit (no network call). */
  updatePrivacy(value: 'on' | 'off'): void {
    this.privacy = value;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async setPrivacy(value: boolean): Promise<void> {
    const mode: 'on' | 'off' = value ? 'on' : 'off';
    try {
      await this.snapi.setBedPauseMode(mode);
    } catch (err) {
      this.log.error(`Failed to set privacy mode to ${mode}:`, err);
    }
  }
}
