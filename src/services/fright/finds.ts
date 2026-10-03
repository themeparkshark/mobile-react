/**
 * Fright Reef finds (F1) and the Lantern Star encounter (F3). Pure, unit tested.
 *
 * F1: a reef is found with two fixes at least 45 s apart, both inside its
 *     radius. The app holds the first fix and sends both. Once per night.
 * F3: the encounter is in the payload only while its 7-minute window is live.
 *     Catch it within 40 m. The first catch of the night asks Team Chaos or
 *     Team Control (`me.side` null), later catches reuse the side.
 */
import type { FrightFix } from '../../api/endpoints/fright';
import type { FrightEncounter, FrightMe, FrightSide, FrightSpot } from '../../api/endpoints/fright/types';
import { FRIGHT_DEFAULTS } from './config';
import { distanceMeters, type FrightFixSample } from './geo';

export interface ReefHold {
  readonly key: string;
  readonly first: FrightFixSample;
}

export interface ReefStep {
  readonly hold: ReefHold | null;
  /** Both fixes, ready to send, when the reef is found. */
  readonly found: { readonly key: string; readonly fixes: readonly [FrightFixSample, FrightFixSample] } | null;
}

export function insideSpot(spot: Pick<FrightSpot, 'latitude' | 'longitude' | 'radius'>, fix: FrightFixSample,
  fallbackRadius: number = FRIGHT_DEFAULTS.reefRadiusM): boolean {
  const radius = spot.radius > 0 ? spot.radius : fallbackRadius;
  return distanceMeters(fix, spot) <= radius;
}

/**
 * Feed one fix. Picks the nearest reef the fix is inside (not found tonight),
 * holds the first fix, and reports a find once a second fix 45 s later is
 * still inside. Leaving the reef (or a poor fix) drops the hold.
 */
export function reefStep(hold: ReefHold | null, reefs: readonly FrightSpot[], foundTonight: readonly string[],
  fix: FrightFixSample | null | undefined, gapMs: number = FRIGHT_DEFAULTS.reefGapMs): ReefStep {
  if (!fix || fix.accuracy == null || fix.accuracy > FRIGHT_DEFAULTS.enterAccuracyM) return { hold, found: null };
  const inside = reefs
    .filter(spot => spot.kind === 'reef' && !foundTonight.includes(spot.key) && insideSpot(spot, fix))
    .sort((a, b) => distanceMeters(fix, a) - distanceMeters(fix, b));
  const held = hold ? inside.find(spot => spot.key === hold.key) : undefined;
  if (hold && held) {
    if (fix.at - hold.first.at >= gapMs) return { hold: null, found: { key: hold.key, fixes: [hold.first, fix] } };
    return { hold, found: null };
  }
  const nearest = inside[0];
  return { hold: nearest ? { key: nearest.key, first: fix } : null, found: null };
}

export function toWireFix(fix: FrightFixSample): FrightFix {
  return { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, at: new Date(fix.at).toISOString() };
}

/** F3: the encounter window is live and not yet caught tonight. */
export function encounterLive(encounter: FrightEncounter | null | undefined, now: number): boolean {
  if (!encounter || encounter.caught) return false;
  const start = Date.parse(encounter.starts_at);
  const end = Date.parse(encounter.ends_at);
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end;
}

/** F3: close enough to catch (40 m default, or the server's radius). */
export function encounterInRange(encounter: FrightEncounter | null | undefined, fix: FrightFixSample | null | undefined,
  now: number): boolean {
  if (!fix || !encounter || !encounterLive(encounter, now)) return false;
  if (fix.accuracy != null && fix.accuracy > FRIGHT_DEFAULTS.enterAccuracyM) return false;
  const radius = encounter.radius > 0 ? encounter.radius : FRIGHT_DEFAULTS.encounterRadiusM;
  return distanceMeters(fix, encounter) <= radius;
}

/** F3: the first catch of the night asks for a side. */
export function needsSidePick(me: Pick<FrightMe, 'side'> | null | undefined, localSide?: FrightSide | null): boolean {
  return !(me?.side ?? localSide);
}

/** Minutes left in the encounter window (for "7 minutes" copy). */
export function encounterMinutesLeft(encounter: FrightEncounter | null | undefined, now: number): number {
  if (!encounter) return 0;
  const end = Date.parse(encounter.ends_at);
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 60_000)) : 0;
}
