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

const SPECS: Readonly<Record<1 | 2 | 3 | 4 | 5, RideSpec>> = {
  1: { style: 'chomp', track: 'family', passMs: 0, frameHalf: 1, litMs: null, photosNeeded: 0, maxRides: null, developBeats: 1, returnMs: 0 },
  2: { style: 'ride_photo', track: 'family', passMs: 2600, frameHalf: 0.15, litMs: null, photosNeeded: 1, maxRides: null, developBeats: 1, returnMs: 650 },
  3: { style: 'ride_photo', track: 'hill', passMs: 2300, frameHalf: 0.12, litMs: null, photosNeeded: 1, maxRides: null, developBeats: 2, returnMs: 600 },
  4: { style: 'ride_photo', track: 'dark', passMs: 2100, frameHalf: 0.11, litMs: 650, photosNeeded: 2, maxRides: null, developBeats: 3, returnMs: 550 },
  5: { style: 'ride_photo', track: 'launch', passMs: 1900, frameHalf: 0.1, litMs: null, photosNeeded: 1, maxRides: 3, developBeats: 3, returnMs: 700 },
};

export function rideSpec(rarity: number | null | undefined): RideSpec {
  'worklet';
  const tier = Math.round(Number(rarity));
  const clamped = (Number.isFinite(tier) ? Math.max(1, Math.min(5, tier)) : 1) as 1 | 2 | 3 | 4 | 5;
  return SPECS[clamped];
}

/** After each miss the frame grows a little (up to +60%), so nobody gets stuck. */
export function frameHalfAfterMisses(spec: RideSpec, misses: number): number {
  'worklet';
  return spec.frameHalf * (1 + 0.2 * Math.max(0, Math.min(3, misses)));
}

/** The next pass comes back sooner after a miss: fail fast, retry fast. */
export function returnDelayMs(spec: RideSpec, missedLastPass: boolean): number {
  'worklet';
  return missedLastPass ? Math.round(spec.returnMs * 0.45) : spec.returnMs;
}

/**
 * Grade from how far the car's centre was from the frame's centre when the
 * shutter went down, as a fraction of the frame's half width.
 */
export function gradeShot(offsetFraction: number): PhotoGrade {
  'worklet';
  const off = Math.abs(offsetFraction);
  if (!Number.isFinite(off) || off > 1) return 'blurry';
  if (off <= 0.22) return 'frame_it';
  if (off <= 0.55) return 'great';
  return 'good';
}

/** Reduce Motion: the car waits in the frame; any tap is a Great. */
export const REDUCED_MOTION_GRADE: PhotoGrade = 'great';

export const GRADE_RANK: Readonly<Record<PhotoGrade, number>> = { blurry: 0, good: 1, great: 2, frame_it: 3 };
export const GRADE_LABEL: Readonly<Record<PhotoGrade, string>> = {
  blurry: 'Blurry!', good: 'Good!', great: 'Great!', frame_it: 'Frame It!',
};
/** Suggested bonus XP (the server decides; CONTRACT.md App requests). */
export const GRADE_BONUS_XP: Readonly<Record<PhotoGrade, number>> = { blurry: 0, good: 0, great: 5, frame_it: 15 };

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
