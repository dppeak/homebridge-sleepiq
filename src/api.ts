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
  /** Set to `true` to return hard-coded fixture data (useful for development). */
  testing: boolean;

  private _cookieStr: string;
  /** Prevents concurrent re-authentication attempts. */
  private _reauthPromise: Promise<string> | null = null;

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

  private _buildURL(path: string, params: Record<string, string | number> = {}): string {
    const url = new URL(`${BASE_URL}/${path}`);
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
   * Handles both the Node 18.14+ `getSetCookie()` array API and the older
   * combined-string `get('set-cookie')` fallback.
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
   * If multiple requests fail with 401 simultaneously (e.g. onSet handlers
   * firing in quick succession), they all await the same single login call
   * rather than hammering the auth endpoint.
   */
  private async _reauth(): Promise<void> {
    if (!this._reauthPromise) {
      this._reauthPromise = this._request('PUT', 'login', {
        body: { login: this.username, password: this.password },
        allowRetry: false,
      }).then(data => {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        this.userID = parsed.userID as string;
        this.key = parsed.key as string;
        return data;
      }).finally(() => {
        this._reauthPromise = null;
      });
    }
    await this._reauthPromise;
  }

  /**
   * Core HTTP helper.
   *
   * On a 401 response, automatically re-authenticates and retries the request
   * once. This covers all API calls including write operations fired from
   * HomeKit onSet handlers, which have no other session recovery path.
   *
   * Throws a JSON-stringified { statusCode, body } object on unrecoverable
   * failure so existing catch blocks in platform.ts continue to work unchanged.
   */
  private async _request(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | number>;
      body?: Record<string, unknown>;
      allowRetry?: boolean;
    } = {},
  ): Promise<string> {
    const { allowRetry = true, ...rest } = options;

    const url = this._buildURL(path, rest.params ?? {});
    const init: RequestInit = { method, headers: this._headers() };
    if (rest.body !== undefined) {
      init.body = JSON.stringify(rest.body);
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
      // On 401, re-authenticate and retry the original request once.
      if (response.status === 401 && allowRetry) {
        await this._reauth();
        return this._request(method, path, { ...rest, allowRetry: false });
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
      const data = await this._request('GET', 'bed/familyStatus', {
        params: { _k: this.key },
      });
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
      const data = await this._request('GET', `bed/${this.bedID}/pauseMode`, {
        params: { _k: this.key },
      });
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
        params: { _k: this.key, mode },
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
        params: { _k: this.key },
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
      const data = await this._request('PUT', `bed/${this.bedID}/pump/forceIdle`, {
        params: { _k: this.key },
      });
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
        params: { _k: this.key },
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
        params: { _k: this.key },
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
      const data = await this._request('GET', `bed/${this.bedID}/foundation/status`, {
        params: { _k: this.key },
      });
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
        params: { _k: this.key, outletId: String(num) },
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
        params: { _k: this.key },
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
      const data = await this._request('GET', `bed/${this.bedID}/foundation/footwarming`, {
        params: { _k: this.key },
      });
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
    const params: Record<string, string> = { _k: this.key };
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
