import { API, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig } from 'homebridge';
export declare class SleepIQPlatform implements DynamicPlatformPlugin {
    private readonly log;
    private readonly api;
    private readonly hap;
    private readonly snapi;
    private readonly refreshTime;
    private readonly sendDelay;
    private readonly warmingTimer;
    private readonly occupancyAccessories;
    private readonly numberAccessories;
    private readonly flexAccessories;
    private readonly privacyAccessories;
    private readonly outletAccessories;
    private readonly lightStripAccessories;
    private readonly footWarmerAccessories;
    /** Accessories loaded from cache that are no longer needed. */
    private readonly staleAccessories;
    private hasFoundation;
    private hasOutletLeft;
    private hasOutletRight;
    private hasLightstripLeft;
    private hasLightstripRight;
    private hasWarmers;
    constructor(log: Logging, config: PlatformConfig, api: API);
    /**
     * Called by Homebridge for every accessory loaded from cache.
     * We restore the in-memory accessory object and re-attach handlers.
     */
    configureAccessory(rawAccessory: PlatformAccessory): void;
    private didFinishLaunching;
    private authenticate;
    private addAccessories;
    private fetchData;
    private parseBed;
    private removeMarkedAccessories;
    /**
     * Restore an accessory loaded from the Homebridge cache.
     * Re-creates the in-memory accessory object so that handlers are re-attached.
     */
    private restoreAccessory;
    /**
     * Generic helper that creates and registers a new platform accessory.
     * @param key     The Map key (e.g. `${sideID}number`)
     * @param name    Display name passed to `new PlatformAccessory()`
     * @param type    Stored in `context.type` for cache restoration
     * @param context Full context object to persist
     * @param factory Creates the typed accessory from the PlatformAccessory
     * @param store   Stores the resulting typed accessory into the appropriate Map
     */
    private registerAccessory;
    private registerOccupancySensor;
    /**
     * Probe the bed for optional foundation hardware and set the `has*` flags.
     * Only called once per bed during `addAccessories()`.
     */
    private detectFoundationCapabilities;
    /**
     * Extract the per-side data from a bed object, stripping non-side fields.
     */
    private extractSides;
    /** Returns a flat array of all typed accessory instances across all Maps. */
    private allAccessoryInstances;
    /**
     * Log an API error, suppressing expected status codes (e.g. 404 = "not present").
     */
    private handleApiError;
}
