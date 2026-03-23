/**
 * SleepIQ REST API client.
 *
 * Communicates with the Sleep Number cloud API.  Uses Node.js native fetch
 * (available since Node 18) and manually persists session cookies between
 * requests (replicating request-promise-native's `jar: true` behaviour).
 *
 * All public methods are `async` and additionally accept an optional
 * callback to preserve compatibility with existing call sites in platform.ts.
 */
import { ApiCallback, ApiResponseJSON } from './types';
export declare class SleepIQAPI {
    username: string;
    password: string;
    userID: string;
    bedID: string;
    key: string;
    /** Last parsed response body; read by platform.ts after awaiting API calls. */
    json: ApiResponseJSON;
    /** Which bed index to default to when multiple beds are registered. */
    defaultBed: number;
    /** Set to `true` to return hard-coded fixture data (useful for development). */
    testing: boolean;
    private _cookieStr;
    constructor(username: string, password: string);
    private _buildURL;
    private _headers;
    /**
     * Persist Set-Cookie headers from a response.
     * Handles both the Node 18.14+ `getSetCookie()` array API and the older
     * combined-string `get('set-cookie')` fallback.
     */
    private _storeCookies;
    /**
     * Core HTTP helper.
     *
     * Returns the raw response text on success, or throws a JSON-stringified
     * error object `{ statusCode, body }` on failure — matching the shape that
     * the original request-promise-native errors had so existing catch blocks
     * in platform.ts continue to work unchanged.
     */
    private _request;
    login(callback?: ApiCallback): Promise<string>;
    familyStatus(callback?: ApiCallback): Promise<string>;
    bedPauseMode(callback?: ApiCallback): Promise<string>;
    setBedPauseMode(mode: 'on' | 'off', callback?: ApiCallback): Promise<string>;
    /** @param side 'L' or 'R' */
    sleepNumber(side: string, num: number, callback?: ApiCallback): Promise<string>;
    forceIdle(callback?: ApiCallback): Promise<string>;
    preset(side: string, num: number, callback?: ApiCallback): Promise<string>;
    /**
     * Adjust a foundation actuator position.
     * @param side     'L' or 'R'
     * @param actuator 'H' (head) or 'F' (foot)
     * @param num      Position value 0–100
     */
    adjust(side: string, actuator: string, num: number, callback?: ApiCallback): Promise<string>;
    foundationStatus(callback?: ApiCallback): Promise<string>;
    /**
     * Get the status of a foundation outlet or lightstrip.
     * @param num 1–4 (1–2 = power outlets, 3–4 = lightstrips)
     */
    outletStatus(num: string | number, callback?: ApiCallback): Promise<string>;
    /**
     * Set an outlet or lightstrip on/off.
     * @param num     1–4
     * @param setting 0 = off, 1 = on
     */
    outlet(num: number, setting: number, callback?: ApiCallback): Promise<string>;
    footWarmingStatus(callback?: ApiCallback): Promise<string>;
    /**
     * Set the foot warmer temperature and timer.
     * @param side  'L' or 'R'
     * @param temp  '0' | '31' | '57' | '72'
     * @param timer '30m' | '1h' | '2h' | '3h' | '4h' | '5h' | '6h'
     */
    footWarming(side: string, temp: string, timer: string, callback?: ApiCallback): Promise<string>;
}
