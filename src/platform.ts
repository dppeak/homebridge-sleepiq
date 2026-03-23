import {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SleepIQAPI } from './api';
import {
  HAPBundle,
  SleepIQContext,
  SleepIQAccessoryType,
  FamilyStatusResponse,
  FoundationStatusResponse,
  FootWarmingStatusResponse,
  OutletStatusResponse,
  PauseModeResponse,
  ApiError,
} from './types';

import { SnOccupancy } from './accessories/snOccupancy';
import { SnNumber } from './accessories/snNumber';
import { SnFlex } from './accessories/snFlex';
import { SnPrivacy } from './accessories/snPrivacy';
import { SnOutlet } from './accessories/snOutlet';
import { SnLightStrip } from './accessories/snLightStrip';
import { SnFootWarmer } from './accessories/snFootWarmer';

// --- Config shape ---------------------------------------------------------------

interface SleepIQConfig extends PlatformConfig {
  email: string;
  password: string;
  /** Polling interval in seconds (default 5). */
  refreshTime?: number;
  /** Debounce delay in seconds before sending sleep number (default 2). */
  sendDelay?: number;
  /** Foot warming timer string, e.g. '6h' (default '6h'). */
  warmingTimer?: string;
}

// --- Platform ------------------------------------------------------------------

export class SleepIQPlatform implements DynamicPlatformPlugin {
  private readonly hap: HAPBundle;
  private readonly snapi: SleepIQAPI;

  private readonly refreshTime: number;
  private readonly sendDelay: number;
  private readonly warmingTimer: string;

  // Typed accessory maps — keys are always `<bedID><bedSide?><type>`.
  private readonly occupancyAccessories = new Map<string, SnOccupancy>();
  private readonly numberAccessories = new Map<string, SnNumber>();
  private readonly flexAccessories = new Map<string, SnFlex>();
  private readonly privacyAccessories = new Map<string, SnPrivacy>();
  private readonly outletAccessories = new Map<string, SnOutlet>();
  private readonly lightStripAccessories = new Map<string, SnLightStrip>();
  private readonly footWarmerAccessories = new Map<string, SnFootWarmer>();

  /** Accessories loaded from cache that are no longer needed. */
  private readonly staleAccessories: PlatformAccessory<SleepIQContext>[] = [];

  // Foundation capability flags, detected once at startup.
  private hasFoundation = false;
  private hasOutletLeft = false;
  private hasOutletRight = false;
  private hasLightstripLeft = false;
  private hasLightstripRight = false;
  private hasWarmers = false;

  constructor(
    private readonly log: Logging,
    config: PlatformConfig,
    private readonly api: API,
  ) {
    this.hap = {
      Service: api.hap.Service as typeof Service,
      Characteristic: api.hap.Characteristic as typeof Characteristic,
    };

    const cfg = config as SleepIQConfig;

    if (!cfg?.email || !cfg?.password) {
      this.log.warn('Ignoring SleepIQ setup because email or password was not provided.');
      this.snapi = new SleepIQAPI('', '');
      this.refreshTime = 5000;
      this.sendDelay = 2000;
      this.warmingTimer = '6h';
      return;
    }

    this.snapi = new SleepIQAPI(cfg.email, cfg.password);
    this.refreshTime = (cfg.refreshTime ?? 5) * 1000;
    this.sendDelay = (cfg.sendDelay ?? 2) * 1000;
    this.warmingTimer = cfg.warmingTimer ?? '6h';

    this.api.on('didFinishLaunching', () => {
      this.log.debug('API finished launching');
      this.didFinishLaunching().catch(err =>
        this.log.error('Fatal error during launch:', err),
      );
    });
  }

  // --- Homebridge lifecycle ----------------------------------------------------

  configureAccessory(rawAccessory: PlatformAccessory): void {
    const accessory = rawAccessory as PlatformAccessory<SleepIQContext>;
    this.log.debug(`Configuring cached accessory: ${accessory.displayName} (${accessory.UUID})`);

    if (accessory.displayName.endsWith('privacy') && !accessory.context.bedName) {
      this.log.debug(`Stale legacy accessory (no bedName): ${accessory.displayName}. Marking for removal.`);
      accessory.context.type = 'remove';
    }

    if (accessory.displayName.endsWith('Side')) {
      this.log.debug(`Stale legacy accessory (old name): ${accessory.displayName}. Marking for removal.`);
      accessory.context.type = 'remove';
    }

    const allDisplayNames = this.allAccessoryInstances().map(a => a.accessory.displayName);
    if (allDisplayNames.includes(accessory.displayName)) {
      this.log.warn(
        `Duplicate cached accessory: ${accessory.displayName}. ` +
        'Marking for removal. If this persists, clear your accessory cache.',
      );
      accessory.context.type = 'remove';
    }

    if (accessory.context.type === 'remove' || !accessory.context.type) {
      accessory.context.remove = true;
      this.staleAccessories.push(accessory);
      return;
    }

    this.restoreAccessory(accessory);
  }

  // --- Startup -----------------------------------------------------------------

  private async didFinishLaunching(): Promise<void> {
    this.removeMarkedAccessories();
    await this.authenticate();
    if (!this.snapi.key) {
      return;
    }
    await this.addAccessories();
    setInterval(() => this.fetchData(), this.refreshTime);
  }

  private async authenticate(): Promise<void> {
    try {
      this.log.debug('SleepIQ authenticating...');
      await this.snapi.login();
      this.log.debug('SleepIQ authenticated successfully.');
    } catch (err) {
      this.log.error('Failed to authenticate with SleepIQ -- check your email and password.', err);
    }
  }

  // --- Accessory Registration --------------------------------------------------

  private async addAccessories(): Promise<void> {
    try {
      await this.snapi.familyStatus();
    } catch (err) {
      if (this.isSessionExpired(err)) {
        this.log.debug('Session expired during accessory setup -- re-authenticating.');
        await this.authenticate();
        await this.addAccessories();
        return;
      }
      this.handleApiError('familyStatus', err);
      return;
    }

    const familyStatus = this.snapi.json as FamilyStatusResponse;
    if (!familyStatus.beds) {
      this.log.error('No beds found in familyStatus response.');
      return;
    }

    for (const [index, bed] of familyStatus.beds.entries()) {
      const bedName = `bed${index}`;
      const bedID = bed.bedId;

      await this.detectFoundationCapabilities(bedID);

      const privacyKey = `${bedID}privacy`;
      if (!this.privacyAccessories.has(privacyKey)) {
        this.registerAccessory(
          privacyKey,
          `${bedName}privacy`,
          'privacy',
          { sideID: privacyKey, type: 'privacy', bedName },
          acc => new SnPrivacy(this.log, acc, this.hap, this.snapi),
          svc => (this.privacyAccessories.set(privacyKey, svc)),
        );
      } else {
        this.log.debug(`${bedName} privacy already in cache`);
      }

      const sides = this.extractSides(bed);
      for (const [bedside, _sideData] of Object.entries(sides)) {
        const sideName = `${bedName}${bedside}`;
        const sideID = `${bedID}${bedside}`;
        const sideChar = bedside[0].toUpperCase();

        const occKey = `${sideID}occupancy`;
        if (!this.occupancyAccessories.has(occKey)) {
          this.registerOccupancySensor(sideName, sideID, occKey);
        } else {
          this.log.debug(`${sideName} occupancy already in cache`);
        }

        const numKey = `${sideID}number`;
        if (!this.numberAccessories.has(numKey)) {
          this.log.info(`Found BedSide Number Control: ${sideName}`);
          this.registerAccessory(
            numKey,
            `${sideName}number`,
            'number',
            { sideID: numKey, type: 'number', side: sideChar, sideName },
            acc => new SnNumber(this.log, acc, this.hap, this.snapi, this.sendDelay),
            svc => this.numberAccessories.set(numKey, svc),
          );
        } else {
          this.log.debug(`${sideName} number already in cache`);
        }

        if (this.hasFoundation) {
          const flexKey = `${sideID}flex`;
          if (!this.flexAccessories.has(flexKey)) {
            this.log.info(`Found BedSide Flex Foundation: ${sideName}`);
            this.registerAccessory(
              flexKey,
              `${sideName}flex`,
              'flex',
              { sideID: flexKey, type: 'flex', side: sideChar, sideName },
              acc => new SnFlex(this.log, acc, this.hap, this.snapi),
              svc => this.flexAccessories.set(flexKey, svc),
            );
          }

          const hasOutlet = (bedside === 'rightSide' && this.hasOutletRight) ||
                            (bedside === 'leftSide' && this.hasOutletLeft);
          if (hasOutlet) {
            const outletKey = `${sideID}outlet`;
            if (!this.outletAccessories.has(outletKey)) {
              this.log.info(`Found BedSide Outlet: ${sideName}`);
              this.registerAccessory(
                outletKey,
                `${sideName}outlet`,
                'outlet',
                { sideID: outletKey, type: 'outlet', side: sideChar, sideName },
                acc => new SnOutlet(this.log, acc, this.hap, this.snapi),
                svc => this.outletAccessories.set(outletKey, svc),
              );
            }
          }

          const hasStrip = (bedside === 'rightSide' && this.hasLightstripRight) ||
                           (bedside === 'leftSide' && this.hasLightstripLeft);
          if (hasStrip) {
            const stripKey = `${sideID}lightstrip`;
            if (!this.lightStripAccessories.has(stripKey)) {
              this.log.info(`Found BedSide Lightstrip: ${sideName}`);
              this.registerAccessory(
                stripKey,
                `${sideName}lightstrip`,
                'lightstrip',
                { sideID: stripKey, type: 'lightstrip', side: sideChar, sideName },
                acc => new SnLightStrip(this.log, acc, this.hap, this.snapi),
                svc => this.lightStripAccessories.set(stripKey, svc),
              );
            }
          }

          if (this.hasWarmers) {
            const warmerKey = `${sideID}footwarmer`;
            if (!this.footWarmerAccessories.has(warmerKey)) {
              this.log.info(`Found BedSide Foot Warmer: ${sideName}`);
              this.registerAccessory(
                warmerKey,
                `${sideName}footwarmer`,
                'footwarmer',
                { sideID: warmerKey, type: 'footwarmer', side: sideChar, sideName },
                acc => new SnFootWarmer(this.log, acc, this.hap, this.snapi, this.warmingTimer),
                svc => this.footWarmerAccessories.set(warmerKey, svc),
              );
            }
          }
        }
      }

      for (const virtual of ['anySide', 'bothSides'] as const) {
        const vID = `${bedID}${virtual}`;
        const vName = `${bedName}${virtual}`;
        const vKey = `${vID}occupancy`;
        if (!this.occupancyAccessories.has(vKey)) {
          this.registerOccupancySensor(vName, vID, vKey);
        } else {
          this.log.debug(`${vName} occupancy already in cache`);
        }
      }
    }
  }

  // --- Polling -----------------------------------------------------------------

  private async fetchData(): Promise<void> {
    this.log.debug('Polling SleepIQ...');

    try {
      await this.snapi.familyStatus();
    } catch (err) {
      // A thrown 401 means the session expired — re-authenticate and wait for
      // the next interval to retry rather than hammering the API immediately.
      if (this.isSessionExpired(err)) {
        this.log.debug('Session expired during poll -- re-authenticating.');
        await this.authenticate();
        return;
      }
      this.handleApiError('familyStatus poll', err);
      return;
    }

    const status = this.snapi.json as FamilyStatusResponse;

    // A 200 response whose body contains an Error also means session expired.
    if ('Error' in status) {
      const code = (status as unknown as { Error: ApiError }).Error.Code;
      if (code === 50002 || code === 401) {
        this.log.debug('Session expired (body error) -- re-authenticating.');
        await this.authenticate();
      } else {
        this.log.error('Unknown SleepIQ error code during poll:', code);
      }
      return;
    }

    if (!status.beds) {
      this.log.error('No beds in familyStatus response.');
      return;
    }

    for (const bed of status.beds) {
      await this.parseBed(bed.bedId, bed);
    }
  }

  private async parseBed(bedID: string, bed: FamilyStatusResponse['beds'][0]): Promise<void> {
    const privacyKey = `${bedID}privacy`;
    if (!this.privacyAccessories.has(privacyKey)) {
      this.log.info('New bed detected. Re-running accessory registration.');
      await this.addAccessories();
      return;
    }

    this.snapi.bedID = bedID;

    // Privacy
    try {
      await this.snapi.bedPauseMode();
      const pm = this.snapi.json as PauseModeResponse;
      this.log.debug(`Privacy mode: ${pm.pauseMode}`);
      this.privacyAccessories.get(privacyKey)?.updatePrivacy(pm.pauseMode);
    } catch (err) {
      if (this.isSessionExpired(err)) {
        this.log.debug('Session expired fetching pause mode -- will re-auth on next poll.');
        return;
      }
      this.log.error('Failed to retrieve bed pause mode:', err);
    }

    // Foundation
    let foundationData: FoundationStatusResponse | undefined;
    if (this.hasFoundation) {
      try {
        await this.snapi.foundationStatus();
        foundationData = this.snapi.json as FoundationStatusResponse;
      } catch (err) {
        if (!this.isSessionExpired(err)) {
          this.log.error('Failed to fetch foundation status:', err);
        }
      }
    }

    // Foot warming
    let footWarmerData: FootWarmingStatusResponse | undefined;
    if (this.hasWarmers) {
      try {
        await this.snapi.footWarmingStatus();
        footWarmerData = this.snapi.json as FootWarmingStatusResponse;
      } catch (err) {
        if (!this.isSessionExpired(err)) {
          this.log.error('Failed to fetch foot warmer status:', err);
        }
      }
    }

    // Per-side updates
    const sides = this.extractSides(bed);
    let anySideOccupied = false;
    let bothSidesOccupied = true;

    for (const [bedside, sideData] of Object.entries(sides)) {
      const sideID = `${bedID}${bedside}`;

      if (!this.occupancyAccessories.has(`${sideID}occupancy`)) {
        this.log.info('New bed side detected. Re-running accessory registration.');
        await this.addAccessories();
        return;
      }

      const occupied = sideData.isInBed;
      this.log.debug(`Occupancy: ${bedside} = ${occupied}`);
      this.occupancyAccessories.get(`${sideID}occupancy`)?.setOccupancyDetected(occupied);
      anySideOccupied = anySideOccupied || occupied;
      bothSidesOccupied = bothSidesOccupied && occupied;

      this.log.debug(`Sleep number: ${bedside} = ${sideData.sleepNumber}`);
      this.numberAccessories.get(`${sideID}number`)?.updateSleepNumber(sideData.sleepNumber);

      if (this.hasFoundation) {
        if (foundationData) {
          if (bedside === 'leftSide') {
            this.flexAccessories.get(`${sideID}flex`)?.updateFoundation(
              Number(foundationData.fsLeftHeadPosition),
              Number(foundationData.fsLeftFootPosition),
            );
          } else {
            this.flexAccessories.get(`${sideID}flex`)?.updateFoundation(
              Number(foundationData.fsRightHeadPosition),
              Number(foundationData.fsRightFootPosition),
            );
          }
        }

        const hasOutlet = (bedside === 'rightSide' && this.hasOutletRight) ||
                          (bedside === 'leftSide' && this.hasOutletLeft);
        if (hasOutlet) {
          try {
            const outletNum = bedside === 'rightSide' ? '1' : '2';
            await this.snapi.outletStatus(outletNum);
            const od = this.snapi.json as OutletStatusResponse;
            if (!('Error' in od)) {
              this.outletAccessories.get(`${sideID}outlet`)?.updateOutlet(od.setting);
            }
          } catch (err) {
            if (!this.isSessionExpired(err)) {
              this.log.error('Failed to fetch outlet status:', err);
            }
          }
        }

        const hasStrip = (bedside === 'rightSide' && this.hasLightstripRight) ||
                         (bedside === 'leftSide' && this.hasLightstripLeft);
        if (hasStrip) {
          try {
            const stripNum = bedside === 'rightSide' ? '3' : '4';
            await this.snapi.outletStatus(stripNum);
            const ld = this.snapi.json as OutletStatusResponse;
            if (!('Error' in ld)) {
              this.lightStripAccessories.get(`${sideID}lightstrip`)?.updateLightStrip(ld.setting);
            }
          } catch (err) {
            if (!this.isSessionExpired(err)) {
              this.log.error('Failed to fetch lightstrip status:', err);
            }
          }
        }

        if (this.hasWarmers && footWarmerData) {
          const rawTemp = bedside === 'leftSide'
            ? footWarmerData.footWarmingStatusLeft
            : footWarmerData.footWarmingStatusRight;
          this.footWarmerAccessories.get(`${sideID}footwarmer`)?.updateFootWarmer(rawTemp);
        }
      }
    }

    this.occupancyAccessories.get(`${bedID}anySideoccupancy`)?.setOccupancyDetected(anySideOccupied);
    this.occupancyAccessories.get(`${bedID}bothSidesoccupancy`)?.setOccupancyDetected(bothSidesOccupied);
  }

  // --- Accessory Cache Management ----------------------------------------------

  private removeMarkedAccessories(): void {
    const toRemove = this.staleAccessories.filter(a => a.context.remove === true);
    if (toRemove.length > 0) {
      this.log.debug(`Removing ${toRemove.length} stale accessory/accessories from cache.`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRemove);
    }
    this.staleAccessories.splice(0, this.staleAccessories.length,
      ...this.staleAccessories.filter(a => a.context.remove !== true),
    );
  }

  private restoreAccessory(accessory: PlatformAccessory<SleepIQContext>): void {
    const { sideID, type, sideName } = accessory.context;

    switch (type as SleepIQAccessoryType) {
      case 'occupancy':
        this.occupancyAccessories.set(sideID, new SnOccupancy(this.log, accessory, this.hap));
        break;
      case 'number':
        this.numberAccessories.set(sideID, new SnNumber(this.log, accessory, this.hap, this.snapi, this.sendDelay));
        break;
      case 'flex':
        this.flexAccessories.set(sideID, new SnFlex(this.log, accessory, this.hap, this.snapi));
        break;
      case 'outlet':
        this.outletAccessories.set(sideID, new SnOutlet(this.log, accessory, this.hap, this.snapi));
        break;
      case 'lightstrip':
        this.lightStripAccessories.set(sideID, new SnLightStrip(this.log, accessory, this.hap, this.snapi));
        break;
      case 'footwarmer':
        this.footWarmerAccessories.set(sideID, new SnFootWarmer(this.log, accessory, this.hap, this.snapi, this.warmingTimer));
        break;
      case 'privacy':
        this.privacyAccessories.set(sideID, new SnPrivacy(this.log, accessory, this.hap, this.snapi));
        break;
      default:
        this.log.warn(`Unknown cached accessory type '${type}' for ${sideName ?? sideID}. Removing.`);
        accessory.context.remove = true;
        this.staleAccessories.push(accessory);
    }
  }

  // --- Helpers -----------------------------------------------------------------

  private registerAccessory<T>(
    key: string,
    name: string,
    type: SleepIQAccessoryType,
    context: SleepIQContext,
    factory: (acc: PlatformAccessory<SleepIQContext>) => T,
    store: (instance: T) => void,
  ): void {
    const uuid = this.api.hap.uuid.generate(key);
    const acc = new this.api.platformAccessory<SleepIQContext>(name, uuid);
    Object.assign(acc.context, context);
    acc.context.type = type;
    const instance = factory(acc);
    store(instance);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [acc]);
  }

  private registerOccupancySensor(sideName: string, sideID: string, key: string): void {
    this.log.info(`Found BedSide Occupancy Sensor: ${sideName}`);
    this.registerAccessory(
      key,
      `${sideName}occupancy`,
      'occupancy',
      { sideID: key, type: 'occupancy' },
      acc => new SnOccupancy(this.log, acc, this.hap),
      svc => this.occupancyAccessories.set(key, svc),
    );
  }

  /**
   * Probe the bed for optional foundation hardware and set the has* flags.
   * A 401 here means the session expired during startup — we suppress it and
   * schedule a re-auth so the next poll cycle picks up foundation data.
   */
  private async detectFoundationCapabilities(bedID: string): Promise<void> {
    this.snapi.bedID = bedID;

    try {
      await this.snapi.foundationStatus();
      const fs = this.snapi.json as FoundationStatusResponse;
      if ('Error' in fs) {
        const err = (fs as unknown as { Error: ApiError }).Error;
        if (err.Code !== 404) {
          this.log.error('Unexpected foundation status error:', err.Message);
        }
      } else {
        this.hasFoundation = true;
      }
    } catch (err) {
      // Suppress both 404 (no foundation) and 401 (session expired at startup).
      // A 401 here is non-fatal — polling will re-authenticate and the next
      // call to addAccessories() will retry foundation detection.
      this.handleApiError('foundationStatus', err, [404, 401]);
    }

    if (!this.hasFoundation) {
      return;
    }

    for (const outletId of ['1', '2', '3', '4'] as const) {
      try {
        await this.snapi.outletStatus(outletId);
        const os = this.snapi.json as OutletStatusResponse;
        if (!('Error' in os)) {
          if (outletId === '1') { this.hasOutletRight = true; }
          if (outletId === '2') { this.hasOutletLeft = true; }
          if (outletId === '3') { this.hasLightstripRight = true; }
          if (outletId === '4') { this.hasLightstripLeft = true; }
        }
      } catch (err) {
        this.handleApiError(`outletStatus(${outletId})`, err, [404, 401]);
      }
    }

    try {
      await this.snapi.footWarmingStatus();
      const fw = this.snapi.json as FootWarmingStatusResponse;
      if (!('Error' in fw)) {
        this.hasWarmers = true;
      }
    } catch (err) {
      this.handleApiError('footWarmingStatus', err, [404, 401]);
    }
  }

  private extractSides(bed: FamilyStatusResponse['beds'][0]): Record<string, { isInBed: boolean; sleepNumber: number }> {
    const { bedId: _id, status: _s, ...sides } = bed;
    return sides as Record<string, { isInBed: boolean; sleepNumber: number }>;
  }

  private allAccessoryInstances(): Array<{ accessory: PlatformAccessory<SleepIQContext> }> {
    return [
      ...this.occupancyAccessories.values(),
      ...this.numberAccessories.values(),
      ...this.flexAccessories.values(),
      ...this.privacyAccessories.values(),
      ...this.outletAccessories.values(),
      ...this.lightStripAccessories.values(),
      ...this.footWarmerAccessories.values(),
    ];
  }

  /**
   * Returns true if the thrown error is an HTTP 401 (session expired / invalid).
   * The SleepIQ API uses HTTP 401 with body Error.Code 50002 for session expiry.
   */
  private isSessionExpired(err: unknown): boolean {
    try {
      const parsed = JSON.parse(String(err)) as { statusCode: number };
      return parsed.statusCode === 401;
    } catch {
      return false;
    }
  }

  /**
   * Log an API error, suppressing expected status codes (e.g. 404 = not present).
   */
  private handleApiError(context: string, err: unknown, suppressCodes: number[] = []): void {
    try {
      const parsed = JSON.parse(String(err)) as { statusCode: number; body?: string };
      if (suppressCodes.includes(parsed.statusCode)) {
        return;
      }
      this.log.error(`${context} failed (HTTP ${parsed.statusCode}):`, parsed.body ?? err);
    } catch {
      this.log.error(`${context} failed:`, err);
    }
  }
}
