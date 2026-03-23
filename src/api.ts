/**
 * SleepIQ REST API client.
 *
 * Communicates with the Sleep Number cloud API. Uses Node.js native fetch
 * (available since Node 18) and manually persists session cookies between
 * requests, replicating request-promise-native's `jar: true` behaviour.
 *
 * All public API methods are serialized through a single promise queue so
 * only one request is in-flight at a time. This prevents a concurrent poll
 * and a HomeKit onSet from both triggering reauth simultaneously, which
 * would cause one of them to retry with a key already invalidated by the
 * other's login call.
 *
 * The _k session key is injected automatically by _buildURL() at the moment
 * each request (or retry) is built, so retries always use the fresh key.
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
  /** Homebridge logger — set by platform after construction. */
  private _log: Logging | null = null;
  /**
   * Serial request queue. Every public API call is enqueued here so that
   * only one HTTP request (including its reauth+retry if needed) is
   * in-flight at a time. This prevents concurrent requests from both
   * triggering _reauth(), getting the same new key, then racing to use it
   * — which causes one to arrive at the API while the other's retry is
   * mid-flight, confusing the Sleep Number session state.
   */
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

  /** Attach the Homebridge logger so auth events appear in logs at info level. */
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

  /**
   * Enqueue a job so it runs only after all previously enqueued jobs finish.
   * Errors are swallowed from the queue chain itself (but still propagate to
   * the caller via the returned promise) so one failure does not stall the queue.
   */
  private _enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this._queue.then(job, job);
    // Advance the queue regardless of whether the job succeeds or fails.
    this._queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Re-authenticate. Called from within an already-queued job, so no
   * additional serialization is needed here — no other request can start
   * until the current queued job (including this reauth and its retry) finishes.
   */
  private async _reauth(): Promise<void> {
    this._log?.info('SleepIQ session expired — re-authenticating...');
    try {
      const data = await this._rawRequest('PUT', 'login', {
        body: { login: this.username, password: this.password },
        injectKey: false,
        allowRetry: false,
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
   * Raw HTTP helper — executes immediately with no queuing.
   * Only call this from within an already-queued job (i.e. from _enqueue's
   * callback, or from _reauth which is itself called from there).
   */
  private async _rawRequest(
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
        await this._reauth();
        this._log?.info(`Retrying ${method} ${path} with fresh session...`);
        return this._rawRequest(method, path, { params, body, injectKey, allowRetry: false });
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
          allowRetry: false,
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
