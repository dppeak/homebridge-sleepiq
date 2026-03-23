import type { Service, Characteristic } from 'homebridge';

// ─── HAP Bundle ──────────────────────────────────────────────────────────────

/** Convenience wrapper around the two HAP constructor namespaces. */
export interface HAPBundle {
  Service: typeof Service;
  Characteristic: typeof Characteristic;
}

// ─── Accessory Context ───────────────────────────────────────────────────────

export type SleepIQAccessoryType =
  | 'occupancy'
  | 'number'
  | 'flex'
  | 'privacy'
  | 'outlet'
  | 'lightstrip'
  | 'footwarmer'
  | 'remove';

/** Persisted to the Homebridge accessory cache; identifies each accessory. */
export interface SleepIQContext {
  sideID: string;
  type: SleepIQAccessoryType;
  bedName?: string;
  /** 'L' or 'R' */
  side?: string;
  sideName?: string;
  remove?: boolean;
}

// ─── SleepIQ REST API Response Types ─────────────────────────────────────────

export interface ApiError {
  Code: number;
  Message: string;
}

export interface BedSide {
  isInBed: boolean;
  sleepNumber: number;
  alertId: number;
  alertDetailedMessage: string;
  lastLink: string;
  pressure: number;
}

export interface Bed {
  status: number;
  bedId: string;
  leftSide?: BedSide;
  rightSide?: BedSide;
  /** Index signature lets us iterate sides dynamically (leftSide / rightSide). */
  [key: string]: BedSide | number | string | undefined;
}

export interface FamilyStatusResponse {
  beds: Bed[];
  Error?: ApiError;
}

export interface PauseModeResponse {
  accountId: string;
  bedId: string;
  pauseMode: 'on' | 'off';
  Error?: ApiError;
}

export interface FoundationStatusResponse {
  fsLeftHeadPosition: string;
  fsLeftFootPosition: string;
  fsRightHeadPosition: string;
  fsRightFootPosition: string;
  fsIsMoving: boolean;
  fsConfigured: boolean;
  fsType: string;
  fsOutletsOn: boolean;
  fsNeedsHoming: boolean;
  Error?: ApiError;
  /** Remaining foundation fields (motor statuses, timer fields, etc.). */
  [key: string]: unknown;
}

export interface OutletStatusResponse {
  bedId: string;
  outlet: number;
  setting: number;
  timer: number | null;
  Error?: ApiError;
}

export interface FootWarmingStatusResponse {
  footWarmingStatusLeft: number;
  footWarmingStatusRight: number;
  footWarmingTimerLeft: number;
  footWarmingTimerRight: number;
  /** Present in some firmware versions. */
  footWarmingTempLeft?: string;
  footWarmingTempRight?: string;
  Error?: ApiError;
}

/** Union of all possible parsed API responses stored in `SleepIQAPI.json`. */
export type ApiResponseJSON =
  | FamilyStatusResponse
  | PauseModeResponse
  | FoundationStatusResponse
  | OutletStatusResponse
  | FootWarmingStatusResponse
  | Record<string, unknown>;

/** Callback shape used throughout the API class, matching the original JS API. */
export type ApiCallback = (data: string, err?: unknown) => void;
