import { CharacteristicValue, Logging, PlatformAccessory, Service } from 'homebridge';
import { HAPBundle, SleepIQContext } from '../types';
import { SleepIQAPI } from '../api';

/**
 * Flex foundation accessory (head and foot position control).
 *
 * Each side of the foundation exposes two Lightbulb services — one for the
 * head actuator and one for the foot actuator — so that the Brightness slider
 * maps to position (0–100).
 */
export class SnFlex {
  private readonly headService: Service;
  private readonly footService: Service;
  private headPosition: number;
  private footPosition: number;

  constructor(
    private readonly log: Logging,
    readonly accessory: PlatformAccessory<SleepIQContext>,
    private readonly hap: HAPBundle,
    private readonly snapi: SleepIQAPI,
  ) {
    const { Service: Svc, Characteristic: Chr } = hap;
    const sideName = accessory.context.sideName ?? '';
    this.headPosition = 0;
    this.footPosition = 0;

    this.headService =
      accessory.getServiceById(Svc.Lightbulb, 'head') ??
      accessory.addService(Svc.Lightbulb, `${sideName} Flex Head`, 'head');

    this.footService =
      accessory.getServiceById(Svc.Lightbulb, 'foot') ??
      accessory.addService(Svc.Lightbulb, `${sideName} Flex Foot`, 'foot');

    for (const svc of [this.headService, this.footService]) {
      if (!svc.testCharacteristic(Chr.Brightness)) {
        svc.addCharacteristic(Chr.Brightness);
      }
    }

    // Accessory information
    (accessory.getService(Svc.AccessoryInformation) ?? accessory.addService(Svc.AccessoryInformation))
      .setCharacteristic(Chr.Manufacturer, 'Sleep Number')
      .setCharacteristic(Chr.Model, 'SleepIQ')
      .setCharacteristic(Chr.SerialNumber, '360');

    // Head position
    this.headService
      .getCharacteristic(Chr.Brightness)
      .onSet((value: CharacteristicValue) => {
        this.log.debug(`Foundation Head -> ${value}`);
        this.sendPosition('H', value as number);
      })
      .onGet(() => this.headPosition);

    this.headService
      .getCharacteristic(Chr.On)
      .onSet((value: CharacteristicValue) => {
        this.log.debug(`Foundation Head On -> ${value}`);
        this.sendPosition('H', value as number);
      });

    // Foot position
    this.footService
      .getCharacteristic(Chr.Brightness)
      .onSet((value: CharacteristicValue) => {
        this.log.debug(`Foundation Foot -> ${value}`);
        this.sendPosition('F', value as number);
      })
      .onGet(() => this.footPosition);

    this.footService
      .getCharacteristic(Chr.On)
      .onSet((value: CharacteristicValue) => {
        this.log.debug(`Foundation Foot On -> ${value}`);
        this.sendPosition('F', value as number);
      });
  }

  /** Push the latest foundation positions from SleepIQ into HomeKit (no network call). */
  updateFoundation(head: number, foot: number): void {
    this.headPosition = head;
    this.footPosition = foot;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private sendPosition(actuator: 'H' | 'F', value: number): void {
    const side = this.accessory.context.side ?? 'L';
    this.log.debug(`Setting foundation actuator=${actuator} to ${value} on side=${side}`);
    this.snapi.adjust(side, actuator, value).catch((err: unknown) => {
      this.log.error(`Failed to set foundation actuator=${actuator} to ${value} on side=${side}:`, err);
    });
  }
}
