/**
 * Optional pedometer evidence for a dark queue gap (L1). Uses expo-sensors,
 * already linked in the binary (OTA-safe), and iOS motion history, which keeps
 * counting while the app is suspended or killed. Every failure is silent: no
 * reading only means the server falls back to the posted-wait cap.
 */
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import { usableSteps, type StepReading } from './checkpointCredit';

let permissionAsked = false;
let unavailable = false;

/** Ask for motion access once, at the start of a wait (never mid-game). */
export async function prepareQueuePedometer(): Promise<void> {
  if (Platform.OS !== 'ios' || unavailable || permissionAsked) return;
  permissionAsked = true;
  try {
    if (!await Pedometer.isAvailableAsync()) {
      unavailable = true;
      return;
    }
    const current = await Pedometer.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Pedometer.requestPermissionsAsync();
  } catch {
    unavailable = true;
  }
}

/** Steps between two phone-clock times, or null when there is no honest reading. */
export async function readQueueSteps(from: number, to: number): Promise<StepReading | null> {
  if (Platform.OS !== 'ios' || unavailable || !(to - from >= 60_000)) return null;
  try {
    const permission = await Pedometer.getPermissionsAsync();
    if (!permission.granted) return null;
    const result = await Pedometer.getStepCountAsync(new Date(from), new Date(to));
    return usableSteps({ count: Math.round(result.steps), from, to });
  } catch {
    return null;
  }
}
