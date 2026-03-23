"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SleepIQAPI = void 0;
const BASE_URL = 'https://api.sleepiq.sleepnumber.com/rest';
class SleepIQAPI {
    username;
    password;
    userID;
    bedID;
    key;
    /** Last parsed response body; read by platform.ts after awaiting API calls. */
    json;
    /** Which bed index to default to when multiple beds are registered. */
    defaultBed;
    /** Set to `true` to return hard-coded fixture data (useful for development). */
    testing;
    _cookieStr;
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.userID = '';
        this.bedID = '';
        this.key = '';
        this.json = {};
        this.defaultBed = 0;
        this.testing = false;
        this._cookieStr = '';
    }
    // ─── Internal Helpers ───────────────────────────────────────────────────────
    _buildURL(path, params = {}) {
        const url = new URL(`${BASE_URL}/${path}`);
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, String(v));
        }
        return url.toString();
    }
    _headers() {
        const headers = { 'Content-Type': 'application/json' };
        if (this._cookieStr) {
            headers['Cookie'] = this._cookieStr;
        }
        return headers;
    }
    /**
     * Persist Set-Cookie headers from a response.
     * Handles both the Node 18.14+ `getSetCookie()` array API and the older
     * combined-string `get('set-cookie')` fallback.
     */
    _storeCookies(headers) {
        let cookies;
        if (typeof headers.getSetCookie === 'function') {
            cookies = headers
                .getSetCookie()
                .map(c => c.split(';')[0].trim());
        }
        else {
            const raw = headers.get('set-cookie');
            cookies = raw ? raw.split(',').map(c => c.split(';')[0].trim()) : [];
        }
        if (cookies.length > 0) {
            this._cookieStr = cookies.join('; ');
        }
    }
    /**
     * Core HTTP helper.
     *
     * Returns the raw response text on success, or throws a JSON-stringified
     * error object `{ statusCode, body }` on failure — matching the shape that
     * the original request-promise-native errors had so existing catch blocks
     * in platform.ts continue to work unchanged.
     */
    async _request(method, path, options = {}) {
        const url = this._buildURL(path, options.params ?? {});
        const init = { method, headers: this._headers() };
        if (options.body !== undefined) {
            init.body = JSON.stringify(options.body);
        }
        let response;
        try {
            response = await fetch(url, init);
        }
        catch (networkErr) {
            throw JSON.stringify({ statusCode: 0, message: networkErr.message });
        }
        this._storeCookies(response.headers);
        const text = await response.text();
        if (!response.ok) {
            throw JSON.stringify({ statusCode: response.status, body: text });
        }
        return text;
    }
    // ─── Authentication ─────────────────────────────────────────────────────────
    async login(callback) {
        try {
            const data = await this._request('PUT', 'login', {
                body: { login: this.username, password: this.password },
            });
            const parsed = JSON.parse(data);
            this.json = parsed;
            this.userID = parsed.userID;
            this.key = parsed.key;
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`Error: login PUT request failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    // ─── Bed Status ─────────────────────────────────────────────────────────────
    async familyStatus(callback) {
        try {
            const data = await this._request('GET', 'bed/familyStatus', {
                params: { _k: this.key },
            });
            const parsed = JSON.parse(data);
            this.json = parsed;
            if (parsed.beds?.length) {
                this.bedID = parsed.beds[this.defaultBed].bedId;
            }
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`Error: familyStatus GET request failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    async bedPauseMode(callback) {
        try {
            const data = await this._request('GET', `bed/${this.bedID}/pauseMode`, {
                params: { _k: this.key },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`Error: pauseMode GET request failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    async setBedPauseMode(mode, callback) {
        try {
            const data = await this._request('PUT', `bed/${this.bedID}/pauseMode`, {
                params: { _k: this.key, mode },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`Error: pauseMode PUT request failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    // ─── Sleep Number ───────────────────────────────────────────────────────────
    /** @param side 'L' or 'R' */
    async sleepNumber(side, num, callback) {
        try {
            const data = await this._request('PUT', `bed/${this.bedID}/sleepNumber`, {
                params: { _k: this.key },
                body: { side, sleepNumber: num },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`SleepNumber PUT failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    // ─── Pump ───────────────────────────────────────────────────────────────────
    async forceIdle(callback) {
        try {
            const data = await this._request('PUT', `bed/${this.bedID}/pump/forceIdle`, {
                params: { _k: this.key },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`forceIdle PUT failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    // ─── Foundation ─────────────────────────────────────────────────────────────
    async preset(side, num, callback) {
        try {
            const data = await this._request('PUT', `bed/${this.bedID}/foundation/preset`, {
                params: { _k: this.key },
                body: { speed: 0, side, preset: num },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`preset PUT failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    /**
     * Adjust a foundation actuator position.
     * @param side     'L' or 'R'
     * @param actuator 'H' (head) or 'F' (foot)
     * @param num      Position value 0–100
     */
    async adjust(side, actuator, num, callback) {
        try {
            const data = await this._request('PUT', `bed/${this.bedID}/foundation/adjustment/micro`, {
                params: { _k: this.key },
                body: { speed: 0, side, position: num, actuator },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`adjust PUT failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    async foundationStatus(callback) {
        // Testing fixture
        if (this.testing) {
            const fixture = {
                fsCurrentPositionPresetRight: 'Not at preset',
                fsNeedsHoming: false,
                fsRightFootPosition: '00',
                fsLeftPositionTimerLSB: '00',
                fsTimerPositionPresetLeft: 'No timer running',
                fsCurrentPositionPresetLeft: 'Not at preset',
                fsLeftPositionTimerMSB: '00',
                fsRightFootActuatorMotorStatus: '00',
                fsCurrentPositionPreset: '00',
                fsTimerPositionPresetRight: 'No timer running',
                fsType: 'Split Head',
                fsOutletsOn: false,
                fsLeftHeadPosition: '09',
                fsIsMoving: false,
                fsRightHeadActuatorMotorStatus: '00',
                fsStatusSummary: '42',
                fsTimerPositionPreset: '00',
                fsLeftFootPosition: '00',
                fsRightPositionTimerLSB: '00',
                fsTimedOutletsOn: false,
                fsRightHeadPosition: '0c',
                fsConfigured: true,
                fsRightPositionTimerMSB: '00',
                fsLeftHeadActuatorMotorStatus: '00',
                fsLeftFootActuatorMotorStatus: '00',
            };
            this.json = fixture;
            const str = JSON.stringify(fixture);
            callback?.(str);
            return str;
        }
        try {
            const data = await this._request('GET', `bed/${this.bedID}/foundation/status`, {
                params: { _k: this.key },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`foundationStatus GET failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    // ─── Outlets & Lightstrips ──────────────────────────────────────────────────
    /**
     * Get the status of a foundation outlet or lightstrip.
     * @param num 1–4 (1–2 = power outlets, 3–4 = lightstrips)
     */
    async outletStatus(num, callback) {
        if (this.testing) {
            const fixture = { bedId: this.bedID, outlet: Number(num), setting: 0, timer: null };
            this.json = fixture;
            const str = JSON.stringify(fixture);
            callback?.(str);
            return str;
        }
        try {
            const data = await this._request('GET', `bed/${this.bedID}/foundation/outlet`, {
                params: { _k: this.key, outletId: String(num) },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`outletStatus GET failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    /**
     * Set an outlet or lightstrip on/off.
     * @param num     1–4
     * @param setting 0 = off, 1 = on
     */
    async outlet(num, setting, callback) {
        if (this.testing) {
            const fixture = { bedId: this.bedID, outlet: num, setting, timer: null };
            this.json = fixture;
            const str = JSON.stringify(fixture);
            callback?.(str);
            return str;
        }
        try {
            const data = await this._request('PUT', `bed/${this.bedID}/foundation/outlet`, {
                params: { _k: this.key },
                body: { outletId: num, setting },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`outlet PUT failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    // ─── Foot Warming ───────────────────────────────────────────────────────────
    async footWarmingStatus(callback) {
        if (this.testing) {
            const fixture = {
                footWarmingStatusLeft: 31,
                footWarmingStatusRight: 0,
                footWarmingTimerLeft: 292,
                footWarmingTimerRight: 0,
            };
            this.json = fixture;
            const str = JSON.stringify(fixture);
            callback?.(str);
            return str;
        }
        try {
            const data = await this._request('GET', `bed/${this.bedID}/foundation/footwarming`, {
                params: { _k: this.key },
            });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`footWarmingStatus GET failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
    /**
     * Set the foot warmer temperature and timer.
     * @param side  'L' or 'R'
     * @param temp  '0' | '31' | '57' | '72'
     * @param timer '30m' | '1h' | '2h' | '3h' | '4h' | '5h' | '6h'
     */
    async footWarming(side, temp, timer, callback) {
        const isRight = side === 'R';
        const params = { _k: this.key };
        if (isRight) {
            params.footWarmingTempRight = temp;
            params.footWarmingTimerRight = timer;
        }
        else {
            params.footWarmingTempLeft = temp;
            params.footWarmingTimerLeft = timer;
        }
        if (this.testing) {
            const fixture = isRight
                ? { footWarmingStatusLeft: 31, footWarmingStatusRight: Number(temp), footWarmingTimerLeft: 292, footWarmingTimerRight: Number(timer) }
                : { footWarmingStatusLeft: Number(temp), footWarmingStatusRight: 0, footWarmingTimerLeft: Number(timer), footWarmingTimerRight: 0 };
            this.json = fixture;
            const str = JSON.stringify(fixture);
            callback?.(str);
            return str;
        }
        try {
            const data = await this._request('PUT', `bed/${this.bedID}/foundation/footwarming`, { params });
            this.json = JSON.parse(data);
            callback?.(data);
            return data;
        }
        catch (err) {
            callback?.(`footWarming PUT failed. Error: ${String(err)}`, err);
            throw err;
        }
    }
}
exports.SleepIQAPI = SleepIQAPI;
