/**
 * The launch's sheet host, read through the feature-flags store (ui/sheetHost.ts has the why). Its own file so a
 * caller that only asks the mode (the grown-up gate) never loads the sheet host's React parts.
 */
import { Platform } from 'react-native';
import { chooseSheetHost, sheetHostMode, type SheetHostMode } from './sheetHost';

/** The feature-flags store's answer if it already has one (required late: this file loads before the API client). */
function launchFlags(): Record<string, boolean> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const store = require('../api/endpoints/platform/feature-flags') as { featureFlagsNow?: () => { flags?: Record<string, boolean> } | null };
    return store.featureFlagsNow?.()?.flags ?? null;
  } catch {
    return null;
  }
}

/** The launch's sheet host: the switch's default, unless the server switch already read says native (ui/sheetHost.ts). */
export function readSheetHost(): SheetHostMode {
  return chooseSheetHost({
    os: Platform.OS,
    flags: launchFlags(),
    laneOverride: process.env.EXPO_PUBLIC_SHEET_HOST ?? null,
  });
}

/** True when this launch draws iOS sheets in-tree (a host that fades its own sheet can let the overlay do it). */
export function sheetsInTree(): boolean {
  return Platform.OS === 'ios' && sheetHostMode(readSheetHost) === 'overlay';
}

