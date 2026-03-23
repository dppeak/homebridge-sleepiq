import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { SleepIQPlatform } from './platform';

/**
 * Homebridge plugin entry point.
 * Called once by Homebridge when the plugin is loaded.
 */
export = (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, SleepIQPlatform);
};
