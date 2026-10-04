/**
 * Ride Photo: the catch for Uncommon and rarer finds (Commons are a one-tap
 * Chomp). The find rides a little coaster car; the guest taps the on-ride
 * camera as the car hits the flash frame. Pure rules, so the UI-thread worklets,
 * the React flow and the tests all agree. Every function here is a worklet.
 * See home-hunt-v3/CATCH_PSYCHOLOGY.md for why each number is what it is.
 */

export type CatchStyle = 'chomp' | 'ride_photo';
export type PhotoGrade = 'blurry' | 'good' | 'great' | 'frame_it';
export type RideTrack = 'family' | 'hill' | 'dark' | 'launch';

export interface RideSpec {
  readonly style: CatchStyle;
  readonly track: RideTrack;
  /** One pass across the scene, ms (before any lift hill or launch shaping). */
  readonly passMs: number;
  /** Half the flash frame's grading window, as a fraction of the scene width. */
  readonly frameHalf: number;
  /** Dark ride: the frame is lit only this long around the car's arrival (ms); null = always lit. */
  readonly litMs: number | null;
  /** Good-or-better photos needed to catch. */
  readonly photosNeeded: number;
  /** Rides before the find leaves; null = never lost. */
  readonly maxRides: number | null;
  /** Suspense beats while the photo develops. */
  readonly developBeats: 1 | 2 | 3;
  /** Pause before the car comes back around for another pass (ms). */
  readonly returnMs: number;
}

// frameHalf is now only the lit frame's visual half width (grading is in ms, GRADE_WINDOWS_MS).
const SPECS: Readonly<Record<1 | 2 | 3 | 4 | 5, RideSpec>> = {
  1: { style: 'chomp', track: 'family', passMs: 0, frameHalf: 1, litMs: null, photosNeeded: 0, maxRides: null, developBeats: 1, returnMs: 0 },
  2: { style: 'ride_photo', track: 'family', passMs: 2600, frameHalf: 0.15, litMs: null, photosNeeded: 1, maxRides: null, developBeats: 1, returnMs: 350 },
  3: { style: 'ride_photo', track: 'hill', passMs: 2300, frameHalf: 0.14, litMs: null, photosNeeded: 1, maxRides: null, developBeats: 2, returnMs: 350 },
  4: { style: 'ride_photo', track: 'dark', passMs: 2100, frameHalf: 0.13, litMs: 650, photosNeeded: 2, maxRides: null, developBeats: 3, returnMs: 350 },
  5: { style: 'ride_photo', track: 'launch', passMs: 1900, frameHalf: 0.12, litMs: null, photosNeeded: 1, maxRides: 3, developBeats: 3, returnMs: 400 },
};

/**
 * Release gate. Ride Photo ships OFF: the catch is a chomp for every rarity until the server says otherwise
 * (`player_stats.ride_photo_enabled === true` on GET /me/prep-items, set when HOME_HUNT_RIDE_PHOTO_ENABLED is on).
 * An older backend never sends the field, so production stays chomp-only.
 */
let ridePhotoServerEnabled = false;
/**
 * Whether Ride Photo is on: an explicit server true, or the internal 'testflight' channel (Dustin's
 * preview build, real-finger testing). Never on for 'production' or any other channel without the flag.
 */
export function ridePhotoOnFor(serverFlag: unknown, channel?: string | null): boolean {
  return serverFlag === true || channel === 'testflight';
}
export function setRidePhotoServerEnabled(value: unknown, channel?: string | null): void {
  ridePhotoServerEnabled = ridePhotoOnFor(value, channel);
}
export function ridePhotoEnabled(): boolean {
  return ridePhotoServerEnabled;
}
/** The catch this find uses right now: its rarity's style, or a chomp while Ride Photo is off. */
export function catchStyleFor(rarity: number | null | undefined): CatchStyle {
  return ridePhotoServerEnabled ? rideSpec(rarity).style : 'chomp';
}

export function rideSpec(rarity: number | null | undefined): RideSpec {
  'worklet';
  const tier = Math.round(Number(rarity));
  const clamped = (Number.isFinite(tier) ? Math.max(1, Math.min(5, tier)) : 1) as 1 | 2 | 3 | 4 | 5;
  return SPECS[clamped];
}

/**
 * Timing windows in milliseconds at the frame (half widths). Frame It! stays
 * tight on every rarity so mastery matters; Good is generous on the easy rides
 * (ages 6 to 8 spread about ±150 to 200 ms) and tightens with rarity, which also
 * adds speed, track shape and lighting.
 *
 * | Rarity    | Frame It! | Great | Good | Good total (with the coyote frame) |
 * |-----------|-----------|-------|------|------------------------------------|
 * | Uncommon  | ±40       | ±110  | ±250 | about 533 ms                       |
 * | Rare      | ±35       | ±95   | ±225 | about 483 ms                       |
 * | Epic      | ±35       | ±85   | ±190 | about 413 ms                       |
 * | Legendary | ±35       | ±80   | ±150 | about 333 ms                       |
 */
export const GRADE_WINDOWS_BY_TIER: Readonly<Record<2 | 3 | 4 | 5, { frame_it: number; great: number; good: number }>> = {
  2: { frame_it: 40, great: 110, good: 250 },
  3: { frame_it: 35, great: 95, good: 225 },
  4: { frame_it: 35, great: 85, good: 190 },
  5: { frame_it: 35, great: 80, good: 150 },
};
/** The strictest table (Legendary), kept for callers that do not pass a rarity. */
export const GRADE_WINDOWS_MS = GRADE_WINDOWS_BY_TIER[5];
export function gradeWindows(rarity: number | null | undefined): { frame_it: number; great: number; good: number } {
  'worklet';
  const tier = Math.max(2, Math.min(5, Math.round(Number(rarity) || 3))) as 2 | 3 | 4 | 5;
  return GRADE_WINDOWS_BY_TIER[tier];
}
/** A touch lands this long after the frame the player reacted to (input plus display latency). */
export const INPUT_LATENCY_MS = 50;
/** One 60 Hz frame: the best grade within one frame either side counts (coyote frame). */
export const COYOTE_MS = 1000 / 60;
/** A miss within this many Good windows is "So close!". */
export const SO_CLOSE_FACTOR = 1.5;

/** After each miss every window grows 20% (up to +60%), so nobody gets stuck. */
export function windowScale(misses: number): number {
  'worklet';
  return 1 + 0.2 * Math.max(0, Math.min(3, misses));
}

/** Kept for the frame visuals: the frame grows with the windows. */
export function frameHalfAfterMisses(spec: RideSpec, misses: number): number {
  'worklet';
  return spec.frameHalf * windowScale(misses);
}

/** Milliseconds from the car's arrival at the frame centre, latency compensated (negative = early). */
export function shotOffsetMs(touchMsIntoPass: number, arrivalMsIntoPass: number): number {
  'worklet';
  return touchMsIntoPass - INPUT_LATENCY_MS - arrivalMsIntoPass;
}

export interface ShotResult {
  readonly grade: PhotoGrade;
  readonly offsetMs: number;
  /** For a miss: was the tap before or after the car reached the frame. */
  readonly direction: 'early' | 'late' | null;
  readonly soClose: boolean;
}

/** Grade a latency-compensated offset, taking the best result within one frame either side. */
export function gradeOffset(offsetMs: number, misses = 0, rarity: number = 5): ShotResult {
  'worklet';
  if (!Number.isFinite(offsetMs)) return { grade: 'blurry', offsetMs, direction: null, soClose: false };
  const w = gradeWindows(rarity);
  const k = windowScale(misses);
  const off = Math.max(0, Math.abs(offsetMs) - COYOTE_MS);
  let grade: PhotoGrade = 'blurry';
  if (off <= w.frame_it) grade = 'frame_it';
  else if (off <= w.great * k) grade = 'great';
  else if (off <= w.good * k) grade = 'good';
  const direction = grade === 'blurry' ? (offsetMs < 0 ? 'early' : 'late') : null;
  return { grade, offsetMs, direction, soClose: grade === 'blurry' && off <= w.good * k * SO_CLOSE_FACTOR };
}

/** What a shutter tap does right now. One gesture is always attached; this decides. */
export type ShutterAction = 'shoot' | 'skip' | 'not_yet' | 'ack';
export function shutterAction(state: { holding: boolean; armed: boolean; hintWaiting: boolean }): ShutterAction {
  'worklet';
  if (state.holding) return 'skip';
  if (!state.armed) return 'ack';
  // First-ride hint: the car has not reached the frame yet, so a tap is a soft "not yet", never a miss.
  if (state.hintWaiting) return 'not_yet';
  return 'shoot';
}

/**
 * The first-time hint. The guaranteed frozen Frame It! is for a first ride on
 * Uncommon or Rare only, and only once (it turns off after the frozen shot).
 * Silent passes bring the hand back, never the freeze. Epic and Legendary
 * never freeze.
 */
export function hintMode(rarity: number | null | undefined, firstRide: boolean, silentPasses: number): 'freeze' | 'hand' | 'none' {
  const tier = Math.round(Number(rarity) || 1);
  if (firstRide && tier <= 3) return 'freeze';
  if (silentPasses >= 2 || (firstRide && tier >= 4)) return 'hand';
  return 'none';
}

/**
 * Everything one open of the viewfinder takes from its find, in one place. The stage computes this
 * from the item it is rendering when it opens, so catch N+1 never runs on catch N's rules.
 */
export function openRules(rarity: number | null | undefined, firstRide: boolean) {
  const spec = rideSpec(rarity);
  return {
    track: spec.track,
    passMs: spec.passMs,
    windows: gradeWindows(rarity ?? 3),
    hint: hintMode(rarity, firstRide, 0),
    photosNeeded: spec.photosNeeded,
  };
}

/** Pre-v2 pixel grading, kept for callers that grade by position. */
export function gradeShot(offsetFraction: number): PhotoGrade {
  'worklet';
  const off = Math.abs(offsetFraction);
  if (!Number.isFinite(off) || off > 1) return 'blurry';
  if (off <= 0.22) return 'frame_it';
  if (off <= 0.55) return 'great';
  return 'good';
}

/** How long the grade holds before the print flies, by grade (tap skips). */
/**
 * Blurry holds 520 ms then slides out in 180 ms: the miss print is gone before the next pass's first pip
 * (retry starts 450 ms after the miss and arrives 900 ms later, so the -600 ms pip is at 750 ms).
 */
export const MISS_RETRY_MS = 450;
export const BLURRY_OUT_MS = 180;
export const GRADE_HOLD_MS: Readonly<Record<PhotoGrade, number>> = { blurry: 520, good: 450, great: 650, frame_it: 1100 };
/** Stars on the stamp, so the grade reads without colour. */
export const GRADE_STARS: Readonly<Record<PhotoGrade, number>> = { blurry: 0, good: 1, great: 2, frame_it: 3 };
/** Ready pips before the car reaches the frame (ms to arrival) and their pitch (semitones). */
export const READY_PIPS = [{ atMs: 600, semitones: 0 }, { atMs: 400, semitones: 3 }, { atMs: 200, semitones: 7 }] as const;
/** The next chance after a miss comes within this long. */
export const RETRY_MAX_MS = 1400;

/** The car comes back sooner after a miss: fail fast, retry fast. */
export function returnDelayMs(spec: RideSpec, missedLastPass: boolean): number {
  'worklet';
  return missedLastPass ? Math.round(spec.returnMs * 0.45) : spec.returnMs;
}

/** Reduce Motion: the car waits in the frame; any tap is a Great. */
export const REDUCED_MOTION_GRADE: PhotoGrade = 'great';

export const GRADE_RANK: Readonly<Record<PhotoGrade, number>> = { blurry: 0, good: 1, great: 2, frame_it: 3 };
export const GRADE_LABEL: Readonly<Record<PhotoGrade, string>> = {
  blurry: 'Blurry!', good: 'Good!', great: 'Great!', frame_it: 'Frame It!',
};
/** Suggested bonus XP (the server decides; CONTRACT.md App requests). */
export const GRADE_BONUS_XP: Readonly<Record<PhotoGrade, number>> = { blurry: 0, good: 0, great: 10, frame_it: 25 };

export function isGoodShot(grade: PhotoGrade): boolean {
  'worklet';
  return grade !== 'blurry';
}

export function bestGrade(grades: readonly PhotoGrade[]): PhotoGrade {
  'worklet';
  let best: PhotoGrade = 'blurry';
  for (const grade of grades) if (GRADE_RANK[grade] > GRADE_RANK[best]) best = grade;
  return best;
}

/**
 * Where the car is along the track (0..1 of its length) at a time fraction of
 * one pass. Each ride has its own feel: the family coaster rolls evenly, the
 * hill coaster crawls up a lift hill then drops, the launch coaster holds and
 * then fires. Always monotonic, 0 at 0 and 1 at 1.
 */
export function rideProgress(track: RideTrack, t: number): number {
  'worklet';
  const x = Math.max(0, Math.min(1, t));
  if (track === 'hill' || track === 'dark') {
    // Lift hill: the first 30% of the track takes 45% of the time, then a fast drop and a steady run.
    if (x < 0.45) return 0.3 * (x / 0.45);
    const r = (x - 0.45) / 0.55;
    return 0.3 + 0.7 * (1 - (1 - r) * (1 - r) * 0.35 - 0.65 * (1 - r));
  }
  if (track === 'launch') {
    // Hold on the launch pad, then a hard launch that eases into a cruise.
    if (x < 0.2) return 0.04 * (x / 0.2);
    const r = (x - 0.2) / 0.8;
    return 0.04 + 0.96 * (1 - (1 - r) ** 2.4);
  }
  // Family: a soft start and stop.
  return x < 0.5 ? 2 * x * x * 0.5 + x * 0.5 : 1 - (2 * (1 - x) * (1 - x) * 0.5 + (1 - x) * 0.5);
}

export interface RideState {
  readonly passes: number;
  readonly misses: number;
  readonly photos: readonly PhotoGrade[];
  readonly outcome: 'riding' | 'caught' | 'rode_off';
}

export const RIDE_START: RideState = { passes: 0, misses: 0, photos: [], outcome: 'riding' };

/**
 * One shot per pass. A good shot counts toward the photos needed; a blurry
 * shot or a pass with no shot is a miss. Only a ride with `maxRides`
 * (Legendary) can end in `rode_off`, and only after its last pass.
 */
export function rideStep(spec: RideSpec, state: RideState, event: { type: 'shot'; grade: PhotoGrade } | { type: 'pass_end' }): RideState {
  if (state.outcome !== 'riding') return state;
  const passes = state.passes + 1;
  const good = event.type === 'shot' && isGoodShot(event.grade);
  const photos = good ? [...state.photos, (event as { grade: PhotoGrade }).grade] : state.photos;
  const misses = good ? state.misses : state.misses + 1;
  if (photos.length >= spec.photosNeeded) return { passes, misses, photos, outcome: 'caught' };
  if (spec.maxRides != null && passes >= spec.maxRides) return { passes, misses, photos, outcome: 'rode_off' };
  return { passes, misses, photos, outcome: 'riding' };
}

/** "Last ride!" shows before the final pass of a ride that can leave. */
export function isLastRide(spec: RideSpec, state: RideState): boolean {
  return spec.maxRides != null && state.outcome === 'riding' && state.passes === spec.maxRides - 1;
}

/** What the catch call sends (CONTRACT.md App requests). Server stays the judge. */
export function photoPayload(spec: RideSpec, state: RideState): { catch_style: CatchStyle; photo_quality?: Exclude<PhotoGrade, 'blurry'>; rides?: number; photos?: number } {
  if (spec.style === 'chomp') return { catch_style: 'chomp' };
  const best = bestGrade(state.photos);
  return { catch_style: 'ride_photo', photo_quality: best === 'blurry' ? 'good' : best,
    rides: Math.max(1, state.passes), photos: state.photos.length };
}

/**
 * Keys each print. Timers scheduled for one print (a Blurry's slide-out, its "aww" buzz) check
 * `isCurrent(key)` before acting, so they never touch a newer print that landed inside their hold.
 */
export function createPrintClock() {
  let current = 0;
  return {
    next: () => ++current,
    /** The key the next print will get (a shot reads it before its print starts developing). */
    peekNext: () => current + 1,
    isCurrent: (key: number) => key === current,
  };
}

/**
 * The prime handshake (catch N+1 uses its own rules): a prime for a find that is not rendered yet waits;
 * the open runs on the first render that carries that find. Pure, so the swap is tested as behaviour.
 */
export function createPrimeGate<At>() {
  let pending: { id: number; at: At } | null = null;
  return {
    /** A tap primed `id`. Returns `{ at }` to open now (the stage already shows it), or null to wait. */
    prime(id: number, renderedId: number | null | undefined, at: At): { at: At } | null {
      if (id === renderedId) { pending = null; return { at }; }
      pending = { id, at };
      return null;
    },
    /** The stage rendered `renderedId`. Returns `{ at }` when a waiting prime can open now. */
    rendered(renderedId: number | null | undefined): { at: At } | null {
      if (!pending || pending.id !== renderedId) return null;
      const open = { at: pending.at };
      pending = null;
      return open;
    },
    cancel() { pending = null; },
  };
}
