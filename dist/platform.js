"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SleepIQPlatform = void 0;
const settings_1 = require("./settings");
const api_1 = require("./api");
const snOccupancy_1 = require("./accessories/snOccupancy");
const snNumber_1 = require("./accessories/snNumber");
const snFlex_1 = require("./accessories/snFlex");
const snPrivacy_1 = require("./accessories/snPrivacy");
const snOutlet_1 = require("./accessories/snOutlet");
const snLightStrip_1 = require("./accessories/snLightStrip");
const snFootWarmer_1 = require("./accessories/snFootWarmer");
// ─── Platform ─────────────────────────────────────────────────────────────────
class SleepIQPlatform {
    log;
    api;
    hap;
    snapi;
    refreshTime;
    sendDelay;
    warmingTimer;
    // Typed accessory maps — keys are always `<bedID><bedSide?><type>`.
    occupancyAccessories = new Map();
    numberAccessories = new Map();
    flexAccessories = new Map();
    privacyAccessories = new Map();
    outletAccessories = new Map();
    lightStripAccessories = new Map();
    footWarmerAccessories = new Map();
    /** Accessories loaded from cache that are no longer needed. */
    staleAccessories = [];
    // Foundation capability flags, detected once at startup.
    hasFoundation = false;
    hasOutletLeft = false;
    hasOutletRight = false;
    hasLightstripLeft = false;
    hasLightstripRight = false;
    hasWarmers = false;
    constructor(log, config, api) {
        this.log = log;
        this.api = api;
        this.hap = {
            Service: api.hap.Service,
            Characteristic: api.hap.Characteristic,
        };
        const cfg = config;
        if (!cfg?.email || !cfg?.password) {
            this.log.warn('Ignoring SleepIQ setup because email or password was not provided.');
            // Early return — Homebridge will still load but the platform won't register accessories.
            this.snapi = new api_1.SleepIQAPI('', '');
            this.refreshTime = 5000;
            this.sendDelay = 2000;
            this.warmingTimer = '6h';
            return;
        }
        this.snapi = new api_1.SleepIQAPI(cfg.email, cfg.password);
        this.refreshTime = (cfg.refreshTime ?? 5) * 1000;
        this.sendDelay = (cfg.sendDelay ?? 2) * 1000;
        this.warmingTimer = cfg.warmingTimer ?? '6h';
        this.api.on('didFinishLaunching', () => {
            this.log.debug('API finished launching');
            this.didFinishLaunching().catch(err => this.log.error('Fatal error during launch:', err));
        });
    }
    // ─── Homebridge lifecycle ──────────────────────────────────────────────────
    /**
     * Called by Homebridge for every accessory loaded from cache.
     * We restore the in-memory accessory object and re-attach handlers.
     */
    configureAccessory(rawAccessory) {
        const accessory = rawAccessory;
        this.log.debug(`Configuring cached accessory: ${accessory.displayName} (${accessory.UUID})`);
        // ── Legacy cleanup ──────────────────────────────────────────────────────
        // Old accessories without a bedName context field should be removed.
        if (accessory.displayName.endsWith('privacy') &&
            !accessory.context.bedName) {
            this.log.debug(`Stale legacy accessory (no bedName): ${accessory.displayName}. Marking for removal.`);
            accessory.context.type = 'remove';
        }
        // Very old accessories whose name ends in 'Side' (pre-v4 naming scheme).
        if (accessory.displayName.endsWith('Side')) {
            this.log.debug(`Stale legacy accessory (old name): ${accessory.displayName}. Marking for removal.`);
            accessory.context.type = 'remove';
        }
        // Duplicate detection across all typed maps.
        const allDisplayNames = this.allAccessoryInstances().map(a => a.accessory.displayName);
        if (allDisplayNames.includes(accessory.displayName)) {
            this.log.warn(`Duplicate cached accessory: ${accessory.displayName}. ` +
                'Marking for removal. If this persists, clear your accessory cache.');
            accessory.context.type = 'remove';
        }
        if (accessory.context.type === 'remove' || !accessory.context.type) {
            accessory.context.remove = true;
            this.staleAccessories.push(accessory);
            return;
        }
        this.restoreAccessory(accessory);
    }
    // ─── Startup ───────────────────────────────────────────────────────────────
    async didFinishLaunching() {
        this.removeMarkedAccessories();
        await this.authenticate();
        if (!this.snapi.key) {
            return;
        }
        await this.addAccessories();
        setInterval(() => this.fetchData(), this.refreshTime);
    }
    async authenticate() {
        try {
            this.log.debug('SleepIQ authenticating…');
            await this.snapi.login();
        }
        catch (err) {
            this.log.error('Failed to authenticate with SleepIQ — check your email and password.', err);
        }
    }
    // ─── Accessory Registration ────────────────────────────────────────────────
    async addAccessories() {
        // ── Fetch bed list ──────────────────────────────────────────────────────
        try {
            await this.snapi.familyStatus();
        }
        catch (err) {
            this.handleApiError('familyStatus', err);
            return;
        }
        const familyStatus = this.snapi.json;
        if (!familyStatus.beds) {
            this.log.error('No beds found in familyStatus response.');
            return;
        }
        for (const [index, bed] of familyStatus.beds.entries()) {
            const bedName = `bed${index}`;
            const bedID = bed.bedId;
            // ── Detect foundation capabilities (once per bed) ───────────────────
            await this.detectFoundationCapabilities(bedID);
            // ── Privacy switch ──────────────────────────────────────────────────
            const privacyKey = `${bedID}privacy`;
            if (!this.privacyAccessories.has(privacyKey)) {
                this.registerAccessory(privacyKey, `${bedName}privacy`, 'privacy', { sideID: privacyKey, type: 'privacy', bedName }, acc => new snPrivacy_1.SnPrivacy(this.log, acc, this.hap, this.snapi), svc => (this.privacyAccessories.set(privacyKey, svc)));
            }
            else {
                this.log.debug(`${bedName} privacy already in cache`);
            }
            // ── Bed sides ───────────────────────────────────────────────────────
            const sides = this.extractSides(bed);
            for (const [bedside, _sideData] of Object.entries(sides)) {
                const sideName = `${bedName}${bedside}`;
                const sideID = `${bedID}${bedside}`;
                const sideChar = bedside[0].toUpperCase(); // 'L' or 'R'
                // Occupancy sensor
                const occKey = `${sideID}occupancy`;
                if (!this.occupancyAccessories.has(occKey)) {
                    this.registerOccupancySensor(sideName, sideID, occKey);
                }
                else {
                    this.log.debug(`${sideName} occupancy already in cache`);
                }
                // Sleep number control
                const numKey = `${sideID}number`;
                if (!this.numberAccessories.has(numKey)) {
                    this.log.info(`Found BedSide Number Control: ${sideName}`);
                    this.registerAccessory(numKey, `${sideName}number`, 'number', { sideID: numKey, type: 'number', side: sideChar, sideName }, acc => new snNumber_1.SnNumber(this.log, acc, this.hap, this.snapi, this.sendDelay), svc => this.numberAccessories.set(numKey, svc));
                }
                else {
                    this.log.debug(`${sideName} number already in cache`);
                }
                if (this.hasFoundation) {
                    // Foundation flex
                    const flexKey = `${sideID}flex`;
                    if (!this.flexAccessories.has(flexKey)) {
                        this.log.info(`Found BedSide Flex Foundation: ${sideName}`);
                        this.registerAccessory(flexKey, `${sideName}flex`, 'flex', { sideID: flexKey, type: 'flex', side: sideChar, sideName }, acc => new snFlex_1.SnFlex(this.log, acc, this.hap, this.snapi), svc => this.flexAccessories.set(flexKey, svc));
                    }
                    // Outlet
                    const hasOutlet = (bedside === 'rightSide' && this.hasOutletRight) ||
                        (bedside === 'leftSide' && this.hasOutletLeft);
                    if (hasOutlet) {
                        const outletKey = `${sideID}outlet`;
                        if (!this.outletAccessories.has(outletKey)) {
                            this.log.info(`Found BedSide Outlet: ${sideName}`);
                            this.registerAccessory(outletKey, `${sideName}outlet`, 'outlet', { sideID: outletKey, type: 'outlet', side: sideChar, sideName }, acc => new snOutlet_1.SnOutlet(this.log, acc, this.hap, this.snapi), svc => this.outletAccessories.set(outletKey, svc));
                        }
                    }
                    // Lightstrip
                    const hasStrip = (bedside === 'rightSide' && this.hasLightstripRight) ||
                        (bedside === 'leftSide' && this.hasLightstripLeft);
                    if (hasStrip) {
                        const stripKey = `${sideID}lightstrip`;
                        if (!this.lightStripAccessories.has(stripKey)) {
                            this.log.info(`Found BedSide Lightstrip: ${sideName}`);
                            this.registerAccessory(stripKey, `${sideName}lightstrip`, 'lightstrip', { sideID: stripKey, type: 'lightstrip', side: sideChar, sideName }, acc => new snLightStrip_1.SnLightStrip(this.log, acc, this.hap, this.snapi), svc => this.lightStripAccessories.set(stripKey, svc));
                        }
                    }
                    // Foot warmer
                    if (this.hasWarmers) {
                        const warmerKey = `${sideID}footwarmer`;
                        if (!this.footWarmerAccessories.has(warmerKey)) {
                            this.log.info(`Found BedSide Foot Warmer: ${sideName}`);
                            this.registerAccessory(warmerKey, `${sideName}footwarmer`, 'footwarmer', { sideID: warmerKey, type: 'footwarmer', side: sideChar, sideName }, acc => new snFootWarmer_1.SnFootWarmer(this.log, acc, this.hap, this.snapi, this.warmingTimer), svc => this.footWarmerAccessories.set(warmerKey, svc));
                        }
                    }
                } // hasFoundation
            } // for bedside
            // ── Virtual sensors: anySide / bothSides ────────────────────────────
            for (const virtual of ['anySide', 'bothSides']) {
                const vID = `${bedID}${virtual}`;
                const vName = `${bedName}${virtual}`;
                const vKey = `${vID}occupancy`;
                if (!this.occupancyAccessories.has(vKey)) {
                    this.registerOccupancySensor(vName, vID, vKey);
                }
                else {
                    this.log.debug(`${vName} occupancy already in cache`);
                }
            }
        } // for bed
    }
    // ─── Polling ───────────────────────────────────────────────────────────────
    async fetchData() {
        this.log.debug('Polling SleepIQ…');
        try {
            await this.snapi.familyStatus();
        }
        catch (err) {
            this.handleApiError('familyStatus poll', err);
            return;
        }
        const status = this.snapi.json;
        // Re-authenticate if the session expired.
        if ('Error' in status) {
            const code = status.Error.Code;
            if (code === 50002 || code === 401) {
                this.log.debug('Session expired — re-authenticating.');
                await this.authenticate();
            }
            else {
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
    async parseBed(bedID, bed) {
        const privacyKey = `${bedID}privacy`;
        if (!this.privacyAccessories.has(privacyKey)) {
            this.log.info('New bed detected. Re-running accessory registration.');
            await this.addAccessories();
            return;
        }
        // ── Privacy ──────────────────────────────────────────────────────────────
        this.snapi.bedID = bedID;
        try {
            await this.snapi.bedPauseMode();
            const pm = this.snapi.json;
            this.log.debug(`Privacy mode: ${pm.pauseMode}`);
            this.privacyAccessories.get(privacyKey)?.updatePrivacy(pm.pauseMode);
        }
        catch (err) {
            this.log.error('Failed to retrieve bed pause mode:', err);
        }
        // ── Foundation ───────────────────────────────────────────────────────────
        let foundationData;
        if (this.hasFoundation) {
            try {
                await this.snapi.foundationStatus();
                foundationData = this.snapi.json;
            }
            catch (err) {
                this.log.error('Failed to fetch foundation status:', err);
            }
        }
        // ── Foot warming ─────────────────────────────────────────────────────────
        let footWarmerData;
        if (this.hasWarmers) {
            try {
                await this.snapi.footWarmingStatus();
                footWarmerData = this.snapi.json;
            }
            catch (err) {
                this.log.error('Failed to fetch foot warmer status:', err);
            }
        }
        // ── Per-side updates ─────────────────────────────────────────────────────
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
            // Occupancy
            const occupied = sideData.isInBed;
            this.log.debug(`Occupancy: ${bedside} = ${occupied}`);
            this.occupancyAccessories.get(`${sideID}occupancy`)?.setOccupancyDetected(occupied);
            anySideOccupied = anySideOccupied || occupied;
            bothSidesOccupied = bothSidesOccupied && occupied;
            // Sleep number
            this.log.debug(`Sleep number: ${bedside} = ${sideData.sleepNumber}`);
            this.numberAccessories.get(`${sideID}number`)?.updateSleepNumber(sideData.sleepNumber);
            if (this.hasFoundation) {
                // Flex positions
                if (foundationData) {
                    if (bedside === 'leftSide') {
                        this.flexAccessories.get(`${sideID}flex`)?.updateFoundation(Number(foundationData.fsLeftHeadPosition), Number(foundationData.fsLeftFootPosition));
                    }
                    else {
                        this.flexAccessories.get(`${sideID}flex`)?.updateFoundation(Number(foundationData.fsRightHeadPosition), Number(foundationData.fsRightFootPosition));
                    }
                }
                // Outlets
                const hasOutlet = (bedside === 'rightSide' && this.hasOutletRight) ||
                    (bedside === 'leftSide' && this.hasOutletLeft);
                if (hasOutlet) {
                    try {
                        const outletNum = bedside === 'rightSide' ? '1' : '2';
                        await this.snapi.outletStatus(outletNum);
                        const od = this.snapi.json;
                        if (!('Error' in od)) {
                            this.outletAccessories.get(`${sideID}outlet`)?.updateOutlet(od.setting);
                        }
                    }
                    catch (err) {
                        this.log.error('Failed to fetch outlet status:', err);
                    }
                }
                // Lightstrips
                const hasStrip = (bedside === 'rightSide' && this.hasLightstripRight) ||
                    (bedside === 'leftSide' && this.hasLightstripLeft);
                if (hasStrip) {
                    try {
                        const stripNum = bedside === 'rightSide' ? '3' : '4';
                        await this.snapi.outletStatus(stripNum);
                        const ld = this.snapi.json;
                        if (!('Error' in ld)) {
                            this.lightStripAccessories.get(`${sideID}lightstrip`)?.updateLightStrip(ld.setting);
                        }
                    }
                    catch (err) {
                        this.log.error('Failed to fetch lightstrip status:', err);
                    }
                }
                // Foot warmer
                if (this.hasWarmers && footWarmerData) {
                    const rawTemp = bedside === 'leftSide'
                        ? footWarmerData.footWarmingStatusLeft
                        : footWarmerData.footWarmingStatusRight;
                    this.footWarmerAccessories.get(`${sideID}footwarmer`)?.updateFootWarmer(rawTemp);
                }
            } // hasFoundation
        } // for bedside
        // ── Virtual sensors ───────────────────────────────────────────────────────
        this.occupancyAccessories.get(`${bedID}anySideoccupancy`)?.setOccupancyDetected(anySideOccupied);
        this.occupancyAccessories.get(`${bedID}bothSidesoccupancy`)?.setOccupancyDetected(bothSidesOccupied);
    }
    // ─── Accessory Cache Management ────────────────────────────────────────────
    removeMarkedAccessories() {
        const toRemove = this.staleAccessories.filter(a => a.context.remove === true);
        if (toRemove.length > 0) {
            this.log.debug(`Removing ${toRemove.length} stale accessory/accessories from cache.`);
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, toRemove);
        }
        // Remove from stale list
        this.staleAccessories.splice(0, this.staleAccessories.length, ...this.staleAccessories.filter(a => a.context.remove !== true));
    }
    /**
     * Restore an accessory loaded from the Homebridge cache.
     * Re-creates the in-memory accessory object so that handlers are re-attached.
     */
    restoreAccessory(accessory) {
        const { sideID, type, sideName } = accessory.context;
        switch (type) {
            case 'occupancy':
                this.occupancyAccessories.set(sideID, new snOccupancy_1.SnOccupancy(this.log, accessory, this.hap));
                break;
            case 'number':
                this.numberAccessories.set(sideID, new snNumber_1.SnNumber(this.log, accessory, this.hap, this.snapi, this.sendDelay));
                break;
            case 'flex':
                this.flexAccessories.set(sideID, new snFlex_1.SnFlex(this.log, accessory, this.hap, this.snapi));
                break;
            case 'outlet':
                this.outletAccessories.set(sideID, new snOutlet_1.SnOutlet(this.log, accessory, this.hap, this.snapi));
                break;
            case 'lightstrip':
                this.lightStripAccessories.set(sideID, new snLightStrip_1.SnLightStrip(this.log, accessory, this.hap, this.snapi));
                break;
            case 'footwarmer':
                this.footWarmerAccessories.set(sideID, new snFootWarmer_1.SnFootWarmer(this.log, accessory, this.hap, this.snapi, this.warmingTimer));
                break;
            case 'privacy':
                this.privacyAccessories.set(sideID, new snPrivacy_1.SnPrivacy(this.log, accessory, this.hap, this.snapi));
                break;
            default:
                this.log.warn(`Unknown cached accessory type '${type}' for ${sideName ?? sideID}. Removing.`);
                accessory.context.remove = true;
                this.staleAccessories.push(accessory);
        }
    }
    // ─── Helpers ───────────────────────────────────────────────────────────────
    /**
     * Generic helper that creates and registers a new platform accessory.
     * @param key     The Map key (e.g. `${sideID}number`)
     * @param name    Display name passed to `new PlatformAccessory()`
     * @param type    Stored in `context.type` for cache restoration
     * @param context Full context object to persist
     * @param factory Creates the typed accessory from the PlatformAccessory
     * @param store   Stores the resulting typed accessory into the appropriate Map
     */
    registerAccessory(key, name, type, context, factory, store) {
        const uuid = this.api.hap.uuid.generate(key);
        const acc = new this.api.platformAccessory(name, uuid);
        Object.assign(acc.context, context);
        acc.context.type = type;
        const instance = factory(acc);
        store(instance);
        this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [acc]);
    }
    registerOccupancySensor(sideName, sideID, key) {
        this.log.info(`Found BedSide Occupancy Sensor: ${sideName}`);
        this.registerAccessory(key, `${sideName}occupancy`, 'occupancy', { sideID: key, type: 'occupancy' }, acc => new snOccupancy_1.SnOccupancy(this.log, acc, this.hap), svc => this.occupancyAccessories.set(key, svc));
    }
    /**
     * Probe the bed for optional foundation hardware and set the `has*` flags.
     * Only called once per bed during `addAccessories()`.
     */
    async detectFoundationCapabilities(bedID) {
        this.snapi.bedID = bedID;
        // Foundation base
        try {
            await this.snapi.foundationStatus();
            const fs = this.snapi.json;
            if ('Error' in fs) {
                const err = fs.Error;
                if (err.Code !== 404) {
                    this.log.error('Unexpected foundation status error:', err.Message);
                }
            }
            else {
                this.hasFoundation = true;
            }
        }
        catch (err) {
            this.handleApiError('foundationStatus', err, [404]);
        }
        if (!this.hasFoundation) {
            return;
        }
        // Outlets
        for (const outletId of ['1', '2', '3', '4']) {
            try {
                await this.snapi.outletStatus(outletId);
                const os = this.snapi.json;
                if (!('Error' in os)) {
                    if (outletId === '1') {
                        this.hasOutletRight = true;
                    }
                    if (outletId === '2') {
                        this.hasOutletLeft = true;
                    }
                    if (outletId === '3') {
                        this.hasLightstripRight = true;
                    }
                    if (outletId === '4') {
                        this.hasLightstripLeft = true;
                    }
                }
            }
            catch (err) {
                this.handleApiError(`outletStatus(${outletId})`, err, [404]);
            }
        }
        // Foot warmers
        try {
            await this.snapi.footWarmingStatus();
            const fw = this.snapi.json;
            if (!('Error' in fw)) {
                this.hasWarmers = true;
            }
        }
        catch (err) {
            this.handleApiError('footWarmingStatus', err, [404]);
        }
    }
    /**
     * Extract the per-side data from a bed object, stripping non-side fields.
     */
    extractSides(bed) {
        const { bedId: _id, status: _s, ...sides } = bed;
        return sides;
    }
    /** Returns a flat array of all typed accessory instances across all Maps. */
    allAccessoryInstances() {
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
     * Log an API error, suppressing expected status codes (e.g. 404 = "not present").
     */
    handleApiError(context, err, suppressCodes = []) {
        try {
            const parsed = JSON.parse(String(err));
            if (suppressCodes.includes(parsed.statusCode)) {
                return;
            }
            this.log.error(`${context} failed (HTTP ${parsed.statusCode}):`, parsed.body ?? err);
        }
        catch {
            this.log.error(`${context} failed:`, err);
        }
    }
}
exports.SleepIQPlatform = SleepIQPlatform;
