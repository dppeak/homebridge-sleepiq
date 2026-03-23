/**
 * SleepIQ REST API client.
 *
 * Communicates with the Sleep Number cloud API. Uses Node.js native fetch
 * (available since Node 18) and manually persists session cookies between
 * requests, replicating request-promise-native's `jar: true` behaviour.
 *
 * The _k session key is injected automatically by _request() at the moment
 * each request (or retry) is built, so re-authentication always uses the
 * fresh key rather than a stale value captured at call time.
 */

import {
  ApiCallback,
  ApiResponseJSON,
  FamilyStatusResponse,
  FoundationStatusResponse,
  FootWarmingStatusResponse,
  OutletStatusResponse,
} from './types';

const BASE_URL = 'https://api.sleepiq.sleepnumber.com/rest';

export class SleepIQAPI {
  username: string;
  password: string;
  userID: string;
  bedID: string;
  key: string;
  /** Last parsed response body; read by platform.ts after awaiting API calls. */
  json: ApiResponseJSON;
  /** Which bed index to default to when multiple beds are registered. */
  defaultBed: number;
  /** Set to true to return hard-coded fixture data (useful for development). */
  testing: boolean;

  private _cookieStr: string;
  /** Prevents concurrent re-authentication attempts. */
  private _reauthPromise: Promise<void> | null = null;

  constructor(username: string, password: string) {
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

  // --- Internal Helpers --------------------------------------------------------

  private _buildURL(
    path: string,
    params: Record<string, string | number> = {},
    injectKey = true,
  ): string {
    const url = new URL(`${BASE_URL}/${path}`);
    // Always inject the current session key so retries after reauth use the
    // fresh value rather than whatever was captured at call time.
    if (injectKey && this.key) {
      url.searchParams.set('_k', this.key);
    }
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  private _headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this._cookieStr) {
      headers['Cookie'] = this._cookieStr;
    }
    return headers;
  }

  /**
   * Persist Set-Cookie headers from a response.
   * Handles both the Node 18.14+ getSetCookie() array API and the older
   * combined-string get('set-cookie') fallback.
   */
  private _storeCookies(headers: Headers): void {
    let cookies: string[];
    if (typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function') {
      cookies = (headers as unknown as { getSetCookie: () => string[] })
        .getSetCookie()
        .map(c => c.split(';')[0].trim());
    } else {
      const raw = headers.get('set-cookie');
      cookies = raw ? raw.split(',').map(c => c.split(';')[0].trim()) : [];
    }
    if (cookies.length > 0) {
      this._cookieStr = cookies.join('; ');
    }
  }

  /**
   * Re-authenticate, deduplicating concurrent calls.
   * If multiple requests fail with 401 simultaneously (e.g. rapid HomeKit
   * toggles) they all await the same single login call rather than hammering
   * the auth endpoint.
   */
  private async _reauth(): Promise<void> {
    if (!this._reauthPromise) {
      this._reauthPromise = this._request('PUT', 'login', {
        body: { login: this.username, password: this.password },
        injectKey: false,
        allowRetry: false,
      }).then(data => {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        this.userID = parsed.userID as string;
        this.key = parsed.key as string;
      }).finally(() => {
        this._reauthPromise = null;
      });
    }
    await this._reauthPromise;
  }

  /**
   * Core HTTP helper.
   *
   * Automatically injects _k: this.key into every request URL at build time,
   * so retries after reauth always use the fresh session key.
   *
   * On a 401 response, re-authenticates and retries once. This covers all
   * API calls including write operations fired from HomeKit onSet handlers.
   *
   * Throws a JSON-stringified { statusCode, body } object on failure.
   */
  private async _request(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | number>;
      body?: Record<string, unknown>;
      injectKey?: boolean;
      allowRetry?: boolean;
    } = {},
  ): Promise<string> {
    const { allowRetry = true, injectKey = true, params, body } = options;

    // _buildURL reads this.key at call time — after _reauth() the retry will
    // read the updated key automatically.
    const url = this._buildURL(path, params ?? {}, injectKey);
    const init: RequestInit = { method, headers: this._headers() };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (networkErr) {
      throw JSON.stringify({ statusCode: 0, message: (networkErr as Error).message });
    }

    this._storeCookies(response.headers);
    const text = await response.text();

    if (!response.ok) {
      if (response.status === 401 && allowRetry) {
        // Re-authenticate then rebuild the request — _buildURL will inject
        // the new this.key into the URL on the retry.
        await this._reauth();
        return this._request(method, path, { params, body, injectKey, allowRetry: false });
      }
      throw JSON.stringify({ statusCode: response.status, body: text });
    }

    return text;
  }

  // --- Authentication ----------------------------------------------------------

  async login(callback?: ApiCallback): Promise<string> {
    try {
      const data = await this._request('PUT', 'login', {
        body: { login: this.username, password: this.password },
        injectKey: false,  // login doesn't use _k
        allowRetry: false, // never retry a login call itself
      });
      const parsed = JSON.parse(data) as Record<string, unknown>;
      this.json = parsed;
      this.userID = parsed.userID as string;
      this.key = parsed.key as string;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`Error: login PUT request failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  // --- Bed Status --------------------------------------------------------------

  async familyStatus(callback?: ApiCallback): Promise<string> {
    try {
      const data = await this._request('GET', 'bed/familyStatus');
      const parsed = JSON.parse(data) as FamilyStatusResponse;
      this.json = parsed;
      if (parsed.beds?.length) {
        this.bedID = parsed.beds[this.defaultBed].bedId;
      }
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`Error: familyStatus GET request failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  async bedPauseMode(callback?: ApiCallback): Promise<string> {
    try {
      const data = await this._request('GET', `bed/${this.bedID}/pauseMode`);
      this.json = JSON.parse(data) as ApiResponseJSON;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`Error: pauseMode GET request failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  async setBedPauseMode(mode: 'on' | 'off', callback?: ApiCallback): Promise<string> {
    try {
      const data = await this._request('PUT', `bed/${this.bedID}/pauseMode`, {
        params: { mode },
      });
      this.json = JSON.parse(data) as ApiResponseJSON;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`Error: pauseMode PUT request failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  // --- Sleep Number ------------------------------------------------------------

  /** @param side 'L' or 'R' */
  async sleepNumber(side: string, num: number, callback?: ApiCallback): Promise<string> {
    try {
      const data = await this._request('PUT', `bed/${this.bedID}/sleepNumber`, {
        body: { side, sleepNumber: num },
      });
      this.json = JSON.parse(data) as ApiResponseJSON;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`SleepNumber PUT failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  // --- Pump --------------------------------------------------------------------

  async forceIdle(callback?: ApiCallback): Promise<string> {
    try {
      const data = await this._request('PUT', `bed/${this.bedID}/pump/forceIdle`);
      this.json = JSON.parse(data) as ApiResponseJSON;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`forceIdle PUT failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  // --- Foundation --------------------------------------------------------------

  async preset(side: string, num: number, callback?: ApiCallback): Promise<string> {
    try {
      const data = await this._request('PUT', `bed/${this.bedID}/foundation/preset`, {
        body: { speed: 0, side, preset: num },
      });
      this.json = JSON.parse(data) as ApiResponseJSON;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`preset PUT failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  /**
   * Adjust a foundation actuator position.
   * @param side     'L' or 'R'
   * @param actuator 'H' (head) or 'F' (foot)
   * @param num      Position value 0-100
   */
  async adjust(side: string, actuator: string, num: number, callback?: ApiCallback): Promise<string> {
    try {
      const data = await this._request('PUT', `bed/${this.bedID}/foundation/adjustment/micro`, {
        body: { speed: 0, side, position: num, actuator },
      });
      this.json = JSON.parse(data) as ApiResponseJSON;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`adjust PUT failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  async foundationStatus(callback?: ApiCallback): Promise<string> {
    if (this.testing) {
      const fixture: FoundationStatusResponse = {
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
      const data = await this._request('GET', `bed/${this.bedID}/foundation/status`);
      this.json = JSON.parse(data) as FoundationStatusResponse;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`foundationStatus GET failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  // --- Outlets & Lightstrips ---------------------------------------------------

  /**
   * Get the status of a foundation outlet or lightstrip.
   * @param num 1-4 (1-2 = power outlets, 3-4 = lightstrips)
   */
  async outletStatus(num: string | number, callback?: ApiCallback): Promise<string> {
    if (this.testing) {
      const fixture: OutletStatusResponse = { bedId: this.bedID, outlet: Number(num), setting: 0, timer: null };
      this.json = fixture;
      const str = JSON.stringify(fixture);
      callback?.(str);
      return str;
    }

    try {
      const data = await this._request('GET', `bed/${this.bedID}/foundation/outlet`, {
        params: { outletId: String(num) },
      });
      this.json = JSON.parse(data) as OutletStatusResponse;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`outletStatus GET failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  /**
   * Set an outlet or lightstrip on/off.
   * @param num     1-4
   * @param setting 0 = off, 1 = on
   */
  async outlet(num: number, setting: number, callback?: ApiCallback): Promise<string> {
    if (this.testing) {
      const fixture: OutletStatusResponse = { bedId: this.bedID, outlet: num, setting, timer: null };
      this.json = fixture;
      const str = JSON.stringify(fixture);
      callback?.(str);
      return str;
    }

    try {
      const data = await this._request('PUT', `bed/${this.bedID}/foundation/outlet`, {
        body: { outletId: num, setting },
      });
      this.json = JSON.parse(data) as ApiResponseJSON;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`outlet PUT failed. Error: ${String(err)}`, err);
      throw err;
    }
  }

  // --- Foot Warming ------------------------------------------------------------

  async footWarmingStatus(callback?: ApiCallback): Promise<string> {
    if (this.testing) {
      const fixture: FootWarmingStatusResponse = {
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
      const data = await this._request('GET', `bed/${this.bedID}/foundation/footwarming`);
      this.json = JSON.parse(data) as FootWarmingStatusResponse;
      callback?.(data);
      return data;
    } catch (err) {
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
  async footWarming(side: string, temp: string, timer: string, callback?: ApiCallback): Promise<string> {
    const isRight = side === 'R';
    const params: Record<string, string> = {};
    if (isRight) {
      params.footWarmingTempRight = temp;
      params.footWarmingTimerRight = timer;
    } else {
      params.footWarmingTempLeft = temp;
      params.footWarmingTimerLeft = timer;
    }

    if (this.testing) {
      const fixture: FootWarmingStatusResponse = isRight
        ? { footWarmingStatusLeft: 31, footWarmingStatusRight: Number(temp), footWarmingTimerLeft: 292, footWarmingTimerRight: Number(timer) }
        : { footWarmingStatusLeft: Number(temp), footWarmingStatusRight: 0, footWarmingTimerLeft: Number(timer), footWarmingTimerRight: 0 };
      this.json = fixture;
      const str = JSON.stringify(fixture);
      callback?.(str);
      return str;
    }

    try {
      const data = await this._request('PUT', `bed/${this.bedID}/foundation/footwarming`, { params });
      this.json = JSON.parse(data) as ApiResponseJSON;
      callback?.(data);
      return data;
    } catch (err) {
      callback?.(`footWarming PUT failed. Error: ${String(err)}`, err);
      throw err;
    }
  }
}
