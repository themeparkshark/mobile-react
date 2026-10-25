/**
 * "Your ride's up!" the second time in one day: the first ride of the day gets the full cheer (confetti, the
 * numbers rolling out of the burst); after that the same day, the card still slams and bursts but skips the
 * confetti and rolls the numbers in about 0.8 s (a hello, not a party). Unit tested in
 * tools/tests/ride-up-celebration.test.cjs.
 *
 * The record lives on the phone ({ day, count }), read once into memory at start-up so the recap's first frame
 * never waits on storage. The same recap (same ride and time) always gets the same answer, so a re-render never
 * counts a ride twice.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parkDayKey } from '../../../components/park/parkArrival';

export type RideUpVariant = 'full' | 'short';
export interface RideUpDay { readonly day: string; readonly count: number }

const KEY = 'tps.rideUp.day.v1';

/** Which cheer a ride gets: the full one for the day's first ride, the short one after that. */
export function rideUpVariantFor(record: RideUpDay | null | undefined, today: string): RideUpVariant {
  return record && record.day === today && record.count >= 1 ? 'short' : 'full';
}

/** The record after one more ride today (a new day starts over at 1). */
export function nextRideUpDay(record: RideUpDay | null | undefined, today: string): RideUpDay {
  return { day: today, count: record && record.day === today ? record.count + 1 : 1 };
}

let memory: RideUpDay | null = null;
let primed = false;
let last: { key: string; variant: RideUpVariant } | null = null;

/** Read the record into memory once (cheap, never throws). */
export function primeRideUpDay(): void {
  if (primed) return;
  primed = true;
  void AsyncStorage.getItem(KEY).then(raw => {
    if (!raw) return;
    const parsed = JSON.parse(raw) as RideUpDay;
    if (parsed && typeof parsed.day === 'string' && Number.isFinite(parsed.count) && memory === null) memory = parsed;
  }).catch(() => undefined);
}

/** The cheer for this recap (`key` names the recap: the same key always gets the same answer and counts once). */
export function takeRideUpVariant(key: string, now: Date = new Date()): RideUpVariant {
  if (last && last.key === key) return last.variant;
  const today = parkDayKey(now);
  const variant = rideUpVariantFor(memory, today);
  memory = nextRideUpDay(memory, today);
  last = { key, variant };
  void AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => undefined);
  return variant;
}

primeRideUpDay();
