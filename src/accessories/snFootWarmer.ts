import { CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';

/** Maps the SleepIQ heat level string to a 0–3 HomeKit brightness step. */
const TEMP_TO_LEVEL: Record<string, number> = {
  '0': 0,
  '31': 1,
  '57': 2,
  '72': 3,
};

const LEVEL_TO_TEMP: Record<number, string> = {
  0: '0',
  1: '31',
  2: '57',
  3: '72',
};

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
export class SnFootWarmer {
  private readonly warmerService: Service;
  private warmingLevel: number;

  constructor(
    private readonly log: Logging,
    readonly accessory: PlatformAccessory<SleepIQContext>,
    private readonly hap: HAPBundle,
    private readonly snapi: SleepIQAPI,
    /** Duration string passed to the SleepIQ API, e.g. '6h'. */
    private readonly timer: string,
  ) {
    const { Service: Svc, Characteristic: Chr } = hap;
    const sideName = accessory.context.sideName ?? '';
    this.warmingLevel = 0;

    this.warmerService =
      accessory.getService(Svc.Lightbulb) ??
      accessory.addService(Svc.Lightbulb, `${sideName} Foot Warmer`);

    if (!this.warmerService.testCharacteristic(Chr.Brightness)) {
      this.warmerService.addCharacteristic(Chr.Brightness);
    }

    // Accessory information
    (accessory.getService(Svc.AccessoryInformation) ?? accessory.addService(Svc.AccessoryInformation))
      .setCharacteristic(Chr.Manufacturer, 'Sleep Number')
      .setCharacteristic(Chr.Model, 'SleepIQ')
      .setCharacteristic(Chr.SerialNumber, '360');

    this.warmerService
      .getCharacteristic(Chr.Brightness)
      .onSet(async (value: CharacteristicValue) => {
        this.log.debug(`Foot Warmer -> ${value}`);
        await this.setFootWarmer(value as number);
      })
      .onGet(() => this.warmingLevel)
      .setProps({ minValue: 0, maxValue: 3, minStep: 1 });
  }

  /** Push the latest warming level from SleepIQ into HomeKit (no network call). */
  updateFootWarmer(apiTempValue: string | number): void {
    this.warmingLevel = TEMP_TO_LEVEL[String(apiTempValue)] ?? 0;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async setFootWarmer(level: number): Promise<void> {
    const side = this.accessory.context.side ?? 'L';
    const temp = LEVEL_TO_TEMP[level] ?? '0';
    this.log.debug(`Setting foot warmer to temp=${temp} on side=${side} with timer=${this.timer}`);
    try {
      await this.snapi.footWarming(side, temp, this.timer);
    } catch (err) {
      this.log.error(`Failed to set foot warmer on side=${side}:`, err);
    }
  }
}
