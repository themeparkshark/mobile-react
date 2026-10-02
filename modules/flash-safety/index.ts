import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

interface NativeFlashSafety {
  isDimFlashingLightsEnabled(): boolean;
}

// Absent on Android, web, and binaries before 1.7.0: Reduce Motion alone then
// turns the level-up flash off.
const native = Platform.OS === 'ios'
  ? requireOptionalNativeModule<NativeFlashSafety>('FlashSafety')
  : null;

/** True when iOS "Dim Flashing Lights" is on. Read at the moment of the effect. */
export function isDimFlashingLightsEnabled(): boolean {
  try {
    return native?.isDimFlashingLightsEnabled() ?? false;
  } catch {
    return false;
  }
}
