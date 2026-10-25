/**
 * loopSound.ts (wow-sound wave 5 round 2): the daily loop's hooks as one call each, so any surface that shows them
 * (today's map button and reveals, or a redesigned one) plays the same studio sound and shaped buzz on its frame.
 *
 * - A Daily 3 check climbs: the first goal rings the right-answer ding at home, the second a step up, the third a
 *   step higher again (do, re, mi), and that third note leads straight into the all-done chord, so a kid hears the
 *   set finish before reading anything.
 * - The all-done chord is the flame growing, and it grows with the streak: day 1 rings at home and each day of the
 *   streak a little brighter, up to day 7 (never past +4 semitones: warm, never chipmunk). Every 7th day is the
 *   rare one: the flame's own ignite with a rising chord (loop.flameMilestone) instead.
 * - Kid-safe: no countdown, no loss sound, no gambling sound. Battery Saver: one moment and one pulse.
 *
 * Studio off (or a cue not approved): returns false and the caller does exactly what it did before.
 */
import { momentSaver, playMoment, preloadMoments, studioReady } from './playMoment';
import type { MomentName } from './momentMap';
import type { HapticPatternName } from '../Haptics';

/** The three check-offs: do, re, mi (whole steps, under the +4.4 semitone cap). */
export const CHECK_SEMIS: readonly number[] = [0, 2, 4];
/**
 * The third check's note, then the all-done chord this much later: a quick "da-DAA" whose second note and the flame's
 * heavy land together on the third pip's pop peak. The note's light pulse and the swell (from here) stay 120 ms or
 * more apart, so the shared haptic gate never merges them.
 */
export const DONE_AFTER_CHECK_MS = 160;
/**
 * The map button's pip pops (scale up over 160 ms) on its next frame after the JS call that plays the check, so the
 * whole moment waits this long: the note and its light pulse land as the pip starts to pop, the check's medium pulse
 * (and the all-done chord's heavy) on its peak. Measured in release-like JS (w5r2 hook capture).
 */
export const DAILY3_POP_SYNC_MS = 20;
/** The flame ladder's top (semitones) and the streak day that reaches it. */
export const FLAME_TOP_SEMIS = 4;
export const FLAME_TOP_DAY = 7;

/** How much brighter the all-done chord rings on this streak day (0 on day 1, +4 from day 7 on). */
export function flameSemis(day: number): number {
  if (!Number.isFinite(day) || day <= 1) return 0;
  const d = Math.min(FLAME_TOP_DAY, Math.floor(day));
  return Math.round(((d - 1) * FLAME_TOP_SEMIS / (FLAME_TOP_DAY - 1)) * 100) / 100;
}

/** Every 7th day of a streak is the rare, bigger flame. */
export function flameMilestoneDay(day: number): boolean {
  return Number.isFinite(day) && day >= FLAME_TOP_DAY && Math.floor(day) % FLAME_TOP_DAY === 0;
}

/** The streak day the flame shows once today is done (the server may not have counted today yet). */
export function flameDay(streak: { readonly days: number; readonly counted_today?: boolean } | null | undefined): number {
  if (!streak) return 1;
  return streak.counted_today ? Math.max(1, streak.days) : streak.days + 1;
}

export interface LoopStep {
  readonly moment: MomentName;
  /** ms after the call. */
  readonly at: number;
  readonly pitch?: number;
  /** The step's own buzz when it differs from the moment's (the lead-in note's single light pulse, the swell). */
  readonly haptic?: HapticPatternName;
}

/**
 * What a Daily 3 check-off plays: `done` goals now done (1..3), on streak day `day`. Pure (tests, the listening pack).
 * `milestoneReady`: the 7-day flame's cue can play (approved and loaded).
 */
export function daily3Plan(done: number, day: number, opts: { readonly saver?: boolean; readonly milestoneReady?: boolean } = {}): LoopStep[] {
  const n = Math.max(1, Math.min(3, Math.floor(done)));
  const check: LoopStep = { moment: 'loop.daily3Check', at: 0, pitch: CHECK_SEMIS[n - 1] };
  if (n < 3) return [check];
  const big = flameMilestoneDay(day) && opts.milestoneReady !== false;
  // The rare 7th day keeps its sting as recorded (never re-pitched); every other day climbs the flame ladder.
  const chord: LoopStep = big ? { moment: 'loop.flameMilestone', at: 0 } : { moment: 'loop.daily3Done', at: 0, pitch: flameSemis(day) };
  // Battery Saver: the chord alone, one pulse (its heavy peak, never only the soft start of the swell), still on the
  // pip's pop peak (w5r2 capture: played at once it rang 133 ms before the peak).
  if (opts.saver) return [{ ...chord, at: DONE_AFTER_CHECK_MS, haptic: big ? undefined : 'tierUp' }];
  // The lead-in note keeps one light pulse; the chord swells (the 7th day's ignite keeps its golden pair).
  return [{ ...check, haptic: 'onBeatLight' }, { ...chord, at: DONE_AFTER_CHECK_MS, haptic: big ? undefined : 'flameSwell' }];
}

/**
 * Play a Daily 3 check-off (sound and shaped buzz). Returns false when studio sound cannot play it (the caller then
 * plays today's sound and buzz). Never throws.
 */
export function playDaily3(done: number, day: number): boolean {
  try {
    if (!studioReady('loop.daily3Check') || !studioReady('loop.daily3Done')) return false;
    const plan = daily3Plan(done, day, { saver: momentSaver(), milestoneReady: studioReady('loop.flameMilestone') });
    for (const step of plan) {
      playMoment(step.moment, { haptic: true, delayMs: step.at + DAILY3_POP_SYNC_MS || undefined, pitch: step.pitch || undefined, hapticPattern: step.haptic });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * A chest pops open (the daily chest, a level chest). `rowsFollow`: the reveal's own reward rows buzz right after
 * (the level chest from 300 ms), so the pop keeps its short form (lid pop, heavy land) and the rows carry the coins.
 * Returns false when studio sound cannot play it.
 */
export function playChestOpen(opts: { readonly rowsFollow?: boolean } = {}): boolean {
  try {
    if (!studioReady('chest.open')) return false;
    playMoment('chest.open', { haptic: true, hapticPattern: opts.rowsFollow ? 'chestPop' : undefined });
    return true;
  } catch {
    return false;
  }
}

/** The loop's cues. */
export const LOOP_MOMENTS: readonly MomentName[] = ['loop.daily3Check', 'loop.daily3Done', 'loop.flameMilestone', 'chest.open'];
let preloaded = false;
/**
 * Decode the loop's cues ahead of time (wave 5 round 2). An unpreloaded cue loads on its first play and starts late,
 * so the day's first check or chest pop would ring after its buzz and its frame. Call when a loop surface appears;
 * a no-op once done (and until studio sound is on, so a flag read late still preloads). Never throws.
 */
export function preloadLoopMoments(): void {
  try {
    if (preloaded || !studioReady('chest.open')) return;
    preloaded = true;
    // Nothing loaded (muted at the time, or before the player's settings are in, so no engine): drop the flag, so
    // the next call once sound is on decodes for real instead of the day's first check decoding on first play.
    void preloadMoments(LOOP_MOMENTS).then((ok) => { if (!ok) preloaded = false; }, () => { preloaded = false; });
  } catch { /* sound is decoration */ }
}
/** Tests only. */
export function resetLoopSoundForTests(): void { preloaded = false; }
