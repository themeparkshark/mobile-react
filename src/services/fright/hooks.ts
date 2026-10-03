/**
 * Public hooks for other agents (DESIGN L6). Pure.
 *
 * Ride Photo (home-map agent) calls `frightPhotoTheme(getFrightSnapshot())`
 * from ridePhoto.ts: while the mode is ON it gets the spooky variant, else null
 * (normal photo). `isFrightModeOn()` answers from the live snapshot, or from an
 * explicit activation input (R6).
 */
import { isModeOn, type ActivationInput } from './phase';
import { getFrightSnapshot, type FrightSnapshot } from './store';
import { NIGHT } from './theme';

export interface FrightPhotoTheme {
  readonly backdrop: 'farNight';
  readonly frame: 'lantern';
  /** Overlay tint for the photo (night palette). */
  readonly tint: string;
}

function isActivationInput(value: unknown): value is ActivationInput {
  return !!value && typeof value === 'object' && 'tonight' in value && 'now' in value;
}

/** R6 check. No argument: the live snapshot published by useFrightNight. */
export function isFrightModeOn(input?: ActivationInput | Pick<FrightSnapshot, 'modeOn'> | null): boolean {
  if (input == null) return getFrightSnapshot().modeOn;
  if (isActivationInput(input)) return isModeOn(input);
  return !!(input as Pick<FrightSnapshot, 'modeOn'>).modeOn;
}

/** L6: the spooky Ride Photo variant while the mode is ON, else null. Calm mode gets a softer tint. */
export function frightPhotoTheme(state?: Pick<FrightSnapshot, 'modeOn'> & Partial<Pick<FrightSnapshot, 'calm'>> | null): FrightPhotoTheme | null {
  const current = state ?? getFrightSnapshot();
  if (!current.modeOn) return null;
  return { backdrop: 'farNight', frame: 'lantern', tint: current.calm ? 'rgba(30,24,70,0.24)' : NIGHT.overlay };
}

export { FRIGHT_OFF, getFrightSnapshot, publishFrightSnapshot, subscribeFrightSnapshot } from './store';
export type { FrightSnapshot } from './store';
