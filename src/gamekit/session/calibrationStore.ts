/**
 * calibrationStore: per-device, per-audio-route timing calibration, shared by
 * every game (Rhythm's Tune sheet writes it; Boss, Trivia and Current Quest
 * read it). Memory first, AsyncStorage second.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultCalibration, type Calibration } from '../core/calibration';

const PREFIX = 'gamekit:calibration:';
const memory = new Map<string, Calibration>();

export async function loadCalibration(route = 'speaker', backend: 'audio-api' | 'expo-av' = 'audio-api'): Promise<Calibration> {
  const mem = memory.get(route);
  if (mem) return mem;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + route);
    if (raw) {
      const parsed = JSON.parse(raw) as Calibration;
      if (parsed && typeof parsed.inputOffsetMs === 'number') {
        memory.set(route, parsed);
        return parsed;
      }
    }
  } catch {
    // fall through to defaults
  }
  return defaultCalibration(route, backend);
}

export async function saveCalibration(cal: Calibration): Promise<void> {
  memory.set(cal.route, cal);
  try {
    await AsyncStorage.setItem(PREFIX + cal.route, JSON.stringify(cal));
  } catch {
    // memory copy still covers this session
  }
}
