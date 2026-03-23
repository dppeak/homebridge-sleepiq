/**
 * SleepIQ REST API client.
 *
 * Session management strategy:
 * - The platform calls proactiveReauth() on a timer every SESSION_REFRESH_MS
 *   to keep the session fresh before it expires (~60s TTL observed).
 * - On a 401 (fallback for edge cases), _rawRequest re-authenticates once
 *   and retries. This should rarely trigger with proactive auth in place.
 * - All public methods are serialized through a single promise queue so only
 *   one HTTP request is in-flight at a time.
 */

import type { Logging } from 'homebridge';
import {
  ApiCallback,
  ApiResponseJSON,
  FamilyStatusResponse,
  FoundationStatusResponse,
  FootWarmingStatusResponse,
  OutletStatusResponse,
} from './types';

const BASE_URL = 'https://api.sleepiq.sleepnumber.com/rest';

/** Fallback retry attempts on 401. Kept at 1 since proactive auth is primary. */
const MAX_AUTH_RETRIES = 1;

/** Milliseconds to wait after reauth before retrying (session propagation delay). */
const REAUTH_RETRY_DELAY_MS = 1000;

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
  private _log: Logging | null = null;
  /** Serial request queue — only one HTTP job runs at a time. */
  private _queue: Promise<void> = Promise.resolve();

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

  setLogger(log: Logging): void {
    this._log = log;
  }

  // --- Internal Helpers --------------------------------------------------------

  private _buildURL(
    path: string,
    params: Record<string, string | number> = {},
    injectKey = true,
  ): string {
    const url = new URL(`${BASE_URL}/${path}`);
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

  private _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private _enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this._queue.then(job, job);
    this._queue = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Re-authenticate in-place. Must be called from within a queued job. */
  private async _reauth(): Promise<void> {
    this._log?.info('SleepIQ session expired — re-authenticating...');
    try {
      const data = await this._rawRequest('PUT', 'login', {
        body: { login: this.username, password: this.password },
        injectKey: false,
        retriesLeft: 0,
      });
      const parsed = JSON.parse(data) as Record<string, unknown>;
      this.userID = parsed.userID as string;
      this.key = parsed.key as string;
      this._log?.info(`SleepIQ re-authentication successful (key: ...${this.key.slice(-6)}).`);
    } catch (err) {
      this._log?.error('SleepIQ re-authentication failed:', String(err));
      throw err;
    }
  }

  /**
   * Proactive session refresh — called by platform on a timer.
   * Enqueued like any other request so it doesn't interrupt in-flight calls.
   */
  async proactiveReauth(): Promise<void> {
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('PUT', 'login', {
          body: { login: this.username, password: this.password },
          injectKey: false,
          retriesLeft: 0,
        });
        const parsed = JSON.parse(data) as Record<string, unknown>;
        this.userID = parsed.userID as string;
        this.key = parsed.key as string;
        this._log?.debug(`SleepIQ session refreshed proactively (key: ...${this.key.slice(-6)}).`);
      } catch (err) {
        this._log?.warn('SleepIQ proactive session refresh failed — will retry on next cycle:', String(err));
        // Do not throw — a failed proactive refresh is non-fatal; the reactive
        // reauth in _rawRequest will catch any 401s that result.
      }
    });
  }

  /**
   * Raw HTTP helper — no queuing. Must be called from within a queued job.
   * On 401, re-authenticates and retries up to retriesLeft times.
   */
  private async _rawRequest(
    method: string,
    path: string,
    options: {
      params?: Record<string, string | number>;
      body?: Record<string, unknown>;
      injectKey?: boolean;
      retriesLeft?: number;
    } = {},
  ): Promise<string> {
    const { retriesLeft = MAX_AUTH_RETRIES, injectKey = true, params, body } = options;

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
      if (response.status === 401 && retriesLeft > 0) {
        await this._reauth();
        await this._delay(REAUTH_RETRY_DELAY_MS);
        const attempt = MAX_AUTH_RETRIES - retriesLeft + 1;
        this._log?.info(`Retrying ${method} ${path} (attempt ${attempt}/${MAX_AUTH_RETRIES})...`);
        return this._rawRequest(method, path, { params, body, injectKey, retriesLeft: retriesLeft - 1 });
      }
      throw JSON.stringify({ statusCode: response.status, body: text });
    }

    return text;
  }

  // --- Authentication ----------------------------------------------------------

  async login(callback?: ApiCallback): Promise<string> {
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('PUT', 'login', {
          body: { login: this.username, password: this.password },
          injectKey: false,
          retriesLeft: 0,
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
    });
  }

  // --- Bed Status --------------------------------------------------------------

  async familyStatus(callback?: ApiCallback): Promise<string> {
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('GET', 'bed/familyStatus');
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
    });
  }

  async bedPauseMode(callback?: ApiCallback): Promise<string> {
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('GET', `bed/${this.bedID}/pauseMode`);
        this.json = JSON.parse(data) as ApiResponseJSON;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`Error: pauseMode GET request failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
  }

  async setBedPauseMode(mode: 'on' | 'off', callback?: ApiCallback): Promise<string> {
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('PUT', `bed/${this.bedID}/pauseMode`, {
          params: { mode },
        });
        this.json = JSON.parse(data) as ApiResponseJSON;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`Error: pauseMode PUT request failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
  }

  // --- Sleep Number ------------------------------------------------------------

  async sleepNumber(side: string, num: number, callback?: ApiCallback): Promise<string> {
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('PUT', `bed/${this.bedID}/sleepNumber`, {
          body: { side, sleepNumber: num },
        });
        this.json = JSON.parse(data) as ApiResponseJSON;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`SleepNumber PUT failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
  }

  // --- Pump --------------------------------------------------------------------

  async forceIdle(callback?: ApiCallback): Promise<string> {
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('PUT', `bed/${this.bedID}/pump/forceIdle`);
        this.json = JSON.parse(data) as ApiResponseJSON;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`forceIdle PUT failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
  }

  // --- Foundation --------------------------------------------------------------

  async preset(side: string, num: number, callback?: ApiCallback): Promise<string> {
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('PUT', `bed/${this.bedID}/foundation/preset`, {
          body: { speed: 0, side, preset: num },
        });
        this.json = JSON.parse(data) as ApiResponseJSON;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`preset PUT failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
  }

  async adjust(side: string, actuator: string, num: number, callback?: ApiCallback): Promise<string> {
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('PUT', `bed/${this.bedID}/foundation/adjustment/micro`, {
          body: { speed: 0, side, position: num, actuator },
        });
        this.json = JSON.parse(data) as ApiResponseJSON;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`adjust PUT failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
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
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('GET', `bed/${this.bedID}/foundation/status`);
        this.json = JSON.parse(data) as FoundationStatusResponse;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`foundationStatus GET failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
  }

  // --- Outlets & Lightstrips ---------------------------------------------------

  async outletStatus(num: string | number, callback?: ApiCallback): Promise<string> {
    if (this.testing) {
      const fixture: OutletStatusResponse = { bedId: this.bedID, outlet: Number(num), setting: 0, timer: null };
      this.json = fixture;
      const str = JSON.stringify(fixture);
      callback?.(str);
      return str;
    }
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('GET', `bed/${this.bedID}/foundation/outlet`, {
          params: { outletId: String(num) },
        });
        this.json = JSON.parse(data) as OutletStatusResponse;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`outletStatus GET failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
  }

  async outlet(num: number, setting: number, callback?: ApiCallback): Promise<string> {
    if (this.testing) {
      const fixture: OutletStatusResponse = { bedId: this.bedID, outlet: num, setting, timer: null };
      this.json = fixture;
      const str = JSON.stringify(fixture);
      callback?.(str);
      return str;
    }
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('PUT', `bed/${this.bedID}/foundation/outlet`, {
          body: { outletId: num, setting },
        });
        this.json = JSON.parse(data) as ApiResponseJSON;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`outlet PUT failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
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
    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('GET', `bed/${this.bedID}/foundation/footwarming`);
        this.json = JSON.parse(data) as FootWarmingStatusResponse;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`footWarmingStatus GET failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
  }

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

    return this._enqueue(async () => {
      try {
        const data = await this._rawRequest('PUT', `bed/${this.bedID}/foundation/footwarming`, { params });
        this.json = JSON.parse(data) as ApiResponseJSON;
        callback?.(data);
        return data;
      } catch (err) {
        callback?.(`footWarming PUT failed. Error: ${String(err)}`, err);
        throw err;
      }
    });
  }
}
