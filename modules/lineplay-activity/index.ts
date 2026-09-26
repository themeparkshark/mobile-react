import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface LinePlayActivityState {
  parts: number;
  /** Epoch ms when the next Ride Part lands; null while capped, paused or checking. */
  nextPartAtMs: number | null;
  intervalSeconds: number;
  status: string;
  paused: boolean;
}

interface NativeLinePlayActivity {
  isSupported(): boolean;
  start(rideName: string, state: LinePlayActivityState): Promise<boolean>;
  update(state: LinePlayActivityState): Promise<void>;
  end(state: LinePlayActivityState | null): Promise<void>;
}

// Absent on Android, web, and any binary built before this module existed.
const native = Platform.OS === 'ios'
  ? requireOptionalNativeModule<NativeLinePlayActivity>('LinePlayActivity')
  : null;

export const LinePlayActivity = {
  isSupported: () => { try { return native?.isSupported() ?? false; } catch { return false; } },
  start: (rideName: string, state: LinePlayActivityState) =>
    native ? native.start(rideName, state).catch(() => false) : Promise.resolve(false),
  update: (state: LinePlayActivityState) =>
    native ? native.update(state).catch(() => undefined) : Promise.resolve(),
  end: (state: LinePlayActivityState | null) =>
    native ? native.end(state).catch(() => undefined) : Promise.resolve(),
};
