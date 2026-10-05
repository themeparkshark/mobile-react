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
 * Timing windows in milliseconds at the frame (half widths). Ride Photo v2 (Dustin, Oct 4: "not hard
 * enough"): every tier is tighter than v1, and the training wheels come off with rarity. Uncommon stays
 * the fair tutorial tier: ages 6 to 8 spread about +-150 to 200 ms, so its Good window still covers
 * +-200 ms plus the coyote frame. Misses still grow Good and Great 20% each (to +60%), never Frame It!.
 *
 * | Rarity    | Frame It! | Great | Good | Good total (with the coyote frame) | v1 Good |
 * |-----------|-----------|-------|------|------------------------------------|---------|
 * | Uncommon  | +-40      | +-95  | +-200| about 433 ms                       | +-250   |
 * | Rare      | +-25      | +-80  | +-170| about 373 ms                       | +-225   |
 * | Epic      | +-15      | +-70  | +-145| about 323 ms                       | +-190   |
 * | Legendary | +-4       | +-55  | +-95 | about 223 ms                       | +-150   |
 */
export const GRADE_WINDOWS_BY_TIER: Readonly<Record<2 | 3 | 4 | 5, { frame_it: number; great: number; good: number }>> = {
  2: { frame_it: 40, great: 95, good: 200 },
  3: { frame_it: 25, great: 80, good: 170 },
  4: { frame_it: 15, great: 70, good: 145 },
  // R7 (difficulty proof, tools/ride-photo-difficulty.cjs: a +-150 ms jittered bot): first-try Frame It! falls
  // with rarity (about 39, 28, 21 and 14%), Legendary Great about 33%, Blurry about 25%. The Legendary mercy
  // ride grades on Uncommon's windows, and misses still grow Good and Great.
  5: { frame_it: 4, great: 55, good: 95 },
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
/** Mirror of the server's bonus XP (config home_hunt.ride_photo.bonus_xp). The server decides; this only feeds dev previews. */
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


// ─────────────────────────────────────────────────────────────────────────────
// Ride Photo v2: skill. The telegraph thins out with rarity, the camera sways like
// a ride vehicle, and the car's approach changes speed from pass to pass. Every
// rule is pure (and a worklet where the UI thread reads it), so tests pin it.
// ─────────────────────────────────────────────────────────────────────────────

export interface Telegraph {
  /** Ready pips, ms before the car reaches the frame (with their pitch in semitones). */
  readonly pips: readonly { readonly atMs: number; readonly semitones: number }[];
  /**
   * The green lamp (and green brackets) light this far before arrival. On Uncommon a kid can react to
   * green and still land Great. From Rare up green lights on arrival (a confirmation, not a cue): the
   * shot is read from the car, or from the rhythm of the pips.
   */
  readonly greenLeadMs: number;
  /** Rare: the pips land on the car's real arrival. Epic: on its nominal arrival, so a surge breaks the beat and the car is the truth. */
  readonly pipsOn: 'arrival' | 'nominal';
  /** The shutter ring and the brackets: close in all the way, fade out 300 ms before arrival (Epic), or never close (Legendary). */
  readonly ring: 'full' | 'fade' | 'none';
  /** Legendary: only the red lamp lights (no yellow, no green before the shot). */
  readonly redOnly: boolean;
}
/**
 * Rare and Epic: a rhythm a young kid can feel. Two pips 400 ms apart (150 bpm; ages 6 to 8 keep a beat
 * best at 400 to 600 ms), then tap on the silent third beat (arrival).
 */
export const RHYTHM_PIPS = [{ atMs: 800, semitones: 0 }, { atMs: 400, semitones: 3 }] as const;
const TELEGRAPH: Readonly<Record<2 | 3 | 4 | 5, Telegraph>> = {
  2: { pips: READY_PIPS, greenLeadMs: 200, pipsOn: 'arrival', ring: 'full', redOnly: false },
  3: { pips: RHYTHM_PIPS, greenLeadMs: 0, pipsOn: 'arrival', ring: 'full', redOnly: false },
  4: { pips: RHYTHM_PIPS, greenLeadMs: 0, pipsOn: 'nominal', ring: 'fade', redOnly: false },
  5: { pips: [], greenLeadMs: 0, pipsOn: 'arrival', ring: 'none', redOnly: true },
};
/** The Epic ring is gone this long before arrival: the last stretch is read from the car. */
export const RING_FADE_MS = 300;
/**
 * The telegraph for a pass. A Legendary's last ride is a mercy ride: the full Uncommon telegraph comes
 * back (with no sway and a steady car), so the rarest find never rides off from a child who is trying.
 */
export function telegraphFor(rarity: number | null | undefined, mercy = false): Telegraph {
  const tier = Math.max(2, Math.min(5, Math.round(Number(rarity) || 2))) as 2 | 3 | 4 | 5;
  return mercy ? TELEGRAPH[2] : TELEGRAPH[tier];
}

/** The last ride of a ride that can leave (Legendary ride 3 of 3). */
export function isMercyRide(spec: RideSpec, passesSoFar: number): boolean {
  return spec.maxRides != null && passesSoFar >= spec.maxRides - 1;
}

/**
 * The ready lamp at `ms` before arrival (negative is after): 0 off, 1 red, 2 yellow, 3 green, 4 a gold "ready"
 * glow. Legendary (redOnly) never shows red, yellow or green, which kids learned as wait and go: only the
 * gold glow, which means "a shot is live", not "now". Worklet.
 */
export function readyLamp(ms: number, greenLeadMs: number, redOnly = false): 0 | 1 | 2 | 3 | 4 {
  'worklet';
  if (ms > 1000) return 0;
  if (redOnly) return ms > -160 ? 4 : 0;
  if (ms > 600) return 1;
  if (ms > greenLeadMs) return 2;
  if (ms > -160) return 3;
  return 0;
}

export interface Sway {
  /** Peak sideways drift, points. */
  readonly amp: number;
  /** Peak roll, degrees. */
  readonly rollDeg: number;
}
/**
 * The viewfinder rides along like a ride vehicle. Slow (0.3 to 1 Hz), small (at most 11 pt and 1.2 deg),
 * never a shake: no motion-sickness extremes. Uncommon stays still (the tutorial tier). Reduce Motion: none.
 */
const SWAY: Readonly<Record<2 | 3 | 4 | 5, Sway>> = {
  2: { amp: 0, rollDeg: 0 },
  3: { amp: 8, rollDeg: 0.6 },
  4: { amp: 20, rollDeg: 1.0 },
  5: { amp: 28, rollDeg: 1.3 },
};
/**
 * R6: the camera is a real obstacle on Epic (20 pt) and Legendary (28 pt), still a slow tracking pan
 * (0.3 Hz) and never a shake. Legendary adds one seeded bump (LEGENDARY_BUMP) just before arrival.
 */
export const SWAY_MAX = { amp: 28, rollDeg: 1.3, hz: 1 } as const;
export function swayFor(rarity: number | null | undefined, reducedMotion = false, mercy = false): Sway {
  if (reducedMotion || mercy) return { amp: 0, rollDeg: 0 };
  const tier = Math.max(2, Math.min(5, Math.round(Number(rarity) || 2))) as 2 | 3 | 4 | 5;
  return SWAY[tier];
}
/** The sway offset at scene time `sec`, scaled by `on` (0..1, ramps in after the hop). Worklet. */
export function swayAt(sway: Sway, sec: number, on = 1): { x: number; y: number; rollDeg: number } {
  'worklet';
  const k = Math.max(0, Math.min(1, on));
  const tau = Math.PI * 2;
  // A slow sideways tracking pan (0.3 Hz) with a little bob; the vertical stays small (the track runs across).
  const x = sway.amp * k * (0.8 * Math.sin(tau * 0.3 * sec) + 0.2 * Math.sin(tau * 0.83 * sec + 1.3));
  const y = sway.amp * 0.3 * k * Math.sin(tau * 0.55 * sec + 0.7);
  const rollDeg = sway.rollDeg * k * Math.sin(tau * 0.26 * sec + 2);
  return { x, y, rollDeg };
}
/**
 * Legendary only: one seeded 10 pt camera bump per pass, kicking in 300 to 600 ms (car distance) before
 * arrival, like the vehicle hitting a seam. It moves the scene under the locked frame, so it shifts when
 * the car meets the frame (graded through swayShiftMs like the sway). Never on the mercy ride or under
 * Reduce Motion.
 */
export const LEGENDARY_BUMP = { amp: 10, leadMs: [700, 900] as const, kickMs: 90, tauMs: 700, totalMs: 2000 } as const;
export interface Bump { readonly leadMs: number; readonly dir: 1 | -1 }
export function bumpFor(rarity: number | null | undefined, seed: number, pass: number, reducedMotion = false, mercy = false): Bump | null {
  const tier = Math.round(Number(rarity) || 2);
  if (tier < 5 || reducedMotion || mercy) return null;
  const [lo, hi] = LEGENDARY_BUMP.leadMs;
  return { leadMs: Math.round(lo + (hi - lo) * unitHash(seed, 5000 + pass)), dir: unitHash(seed, 5300 + pass) < 0.5 ? -1 : 1 };
}
/**
 * R7: the bump's shape over time (ms since it kicked): a 90 ms kick to full, then a slow damped return
 * (tau 700 ms), so the camera is still off by a third to a half of the bump when the car arrives 700 to
 * 900 ms later. It changes the moment the car meets the frame, not only startles. Worklet.
 */
export function bumpCurve(ms: number): number {
  'worklet';
  if (ms <= 0 || ms >= LEGENDARY_BUMP.totalMs) return 0;
  const k = LEGENDARY_BUMP.kickMs;
  if (ms < k) { const x = ms / k; return 1 - (1 - x) * (1 - x); }
  const decay = Math.exp(-(ms - k) / LEGENDARY_BUMP.tauMs);
  const tail = ms > 1600 ? 1 - ((ms - 1600) / 400) ** 2 : 1;
  return decay * Math.max(0, tail);
}
/** The bump's offset for its shape value `v` (0..1). Worklet. */
export function bumpAt(v: number, dir: number): { x: number; y: number } {
  'worklet';
  return { x: LEGENDARY_BUMP.amp * v * dir, y: -LEGENDARY_BUMP.amp * 0.45 * v };
}

/**
 * R6 gull photobomb: Rare and up, 1 pass in 4 (seeded, so a ride replays the same and RIDE AGAIN does not).
 * The gull crosses the frame centred within 150 ms of the car's arrival and is in the frame for
 * GULL_IN_FRAME_MS; a shot while it is in the frame caps at Good ("Photobombed!"). It flies in from the
 * edge GULL_LEAD_MS ahead so a kid sees it coming and can time around it. Never on the mercy ride, never
 * under Reduce Motion, never on the first-ride freeze pass.
 */
export const GULL_CHANCE = 0.25;
/** R7: the gull crosses 120 to 180 ms before or after the perfect moment, never on it (waiting still lands Great). */
export const GULL_CENTER_MS = 150;
export const GULL_CLEAR_MS = [120, 180] as const;
export const GULL_IN_FRAME_MS = 160;
export const GULL_LEAD_MS = 600;
export interface Gull { readonly centerMs: number; readonly dir: 1 | -1 }
export function gullFor(rarity: number | null | undefined, seed: number, pass: number,
  opts: { reducedMotion?: boolean; mercy?: boolean; freeze?: boolean } = {}): Gull | null {
  const tier = Math.round(Number(rarity) || 2);
  if (tier < 3 || opts.reducedMotion || opts.mercy || opts.freeze) return null;
  if (unitHash(seed, 7000 + pass) >= GULL_CHANCE) return null;
  const [lo, hi] = GULL_CLEAR_MS;
  const side = unitHash(seed, 7300 + pass) < 0.5 ? -1 : 1;
  const centerMs = side * Math.round(lo + (hi - lo) * unitHash(seed, 7100 + pass));
  return { centerMs, dir: unitHash(seed, 7200 + pass) < 0.5 ? -1 : 1 };
}
/** True when a shot `msFromCrossing` (wall ms from the gull's frame crossing) has the gull in the frame. Worklet. */
export function gullInFrame(msFromCrossing: number): boolean {
  'worklet';
  return Math.abs(msFromCrossing) <= GULL_IN_FRAME_MS / 2;
}
/** A photobombed shot caps at Good; a Blurry stays Blurry. Worklet. */
export function photobombCap(grade: PhotoGrade): PhotoGrade {
  'worklet';
  return grade === 'great' || grade === 'frame_it' ? 'good' : grade;
}

/**
 * R6 "Uncommon grows up": the green lamp leads the tap by 200 ms for a kid's first 10 Uncommon catches,
 * then by 120 ms (still a real green, a tighter read).
 */
export const UNCOMMON_GROWN_AFTER = 10;
export const UNCOMMON_GROWN_LEAD_MS = 120;
/**
 * R7: per player, in steps (200 ms for the first 10 Uncommon catches, 160 ms to 20, then 120 ms), and it
 * relaxes back to 200 ms for the rest of a ride after 2 Blurry shots, so a struggling kid is never stuck.
 */
export function uncommonGreenLead(catches: number, blurriesThisRide = 0): number {
  if (blurriesThisRide >= 2 || catches < UNCOMMON_GROWN_AFTER) return TELEGRAPH[2].greenLeadMs;
  return catches < 2 * UNCOMMON_GROWN_AFTER ? 160 : UNCOMMON_GROWN_LEAD_MS;
}

/** How much to scale the scene so a swayed and rolled scene never uncovers its edges. */
export function swayOverscan(sway: Sway, width: number, height: number): number {
  if (sway.amp === 0 && sway.rollDeg === 0) return 1;
  const w = Math.max(1, width), h = Math.max(1, height);
  // Cover the drift on each axis separately (wide pan, small bob) plus the roll's corners.
  const rad = (sway.rollDeg * Math.PI) / 180;
  const sx = (w * Math.cos(rad) + h * Math.sin(rad) + 2 * (sway.amp + 4)) / w;
  const sy = (h * Math.cos(rad) + w * Math.sin(rad) + 2 * (sway.amp * 0.3 + 4)) / h;
  return Math.max(sx, sy);
}

/**
 * One pass's approach. The time to the frame is `k` times the nominal (the car dawdles or rushes) and
 * it reaches the frame at `r` times its nominal speed (a burst, or easing in), on smooth Hermite curves,
 * so the car never stops, jumps or reverses. Uncommon is always steady, and so is the first pass on
 * Rare (where the first-ride freeze lives). Fairness bounds: k in [0.8, 1.5], r in [0.85, 1.4]; a long k with a
 * high r reads as a fake-out (the car eases off mid-approach, then bursts into the frame), never a stop.
 */
export interface PassPlan {
  readonly fromT: number;
  readonly tFrame: number;
  /** Wall-clock ms from the pass start to the car at the frame. */
  readonly d1: number;
  /** Wall-clock ms from the frame to the end of the pass. */
  readonly d2: number;
  readonly k: number;
  readonly r: number;
}
const SURGE: Readonly<Record<2 | 3 | 4 | 5, { k: [number, number]; r: [number, number] }>> = {
  2: { k: [1, 1], r: [1, 1] },
  3: { k: [0.9, 1.15], r: [0.9, 1.2] },
  4: { k: [0.85, 1.35], r: [0.85, 1.3] },
  5: { k: [0.85, 1.5], r: [0.9, 1.4] },
};
export const SURGE_BOUNDS = { k: [0.8, 1.5], r: [0.85, 1.4] } as const;

/** A small deterministic hash to 0..1 (the same find and pass always ride the same way). */
export function unitHash(a: number, b: number): number {
  let h = (Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function passPlan(input: { rarity: number | null | undefined; seed: number; pass: number; fromT: number; tFrame: number;
  passMs: number; steady?: boolean }): PassPlan {
  // (steady: the Legendary mercy ride, and Reduce Motion's parked car)
  const tier = Math.max(2, Math.min(5, Math.round(Number(input.rarity) || 2))) as 2 | 3 | 4 | 5;
  const fromT = Math.min(input.fromT, input.tFrame);
  const n1 = Math.max(1, (input.tFrame - fromT) * input.passMs);
  const d2 = Math.max(1, (1 - input.tFrame) * input.passMs);
  const range = SURGE[tier];
  const steady = input.steady || tier === 2 || (tier === 3 && input.pass === 0) || input.fromT >= input.tFrame;
  const k = steady ? 1 : range.k[0] + (range.k[1] - range.k[0]) * unitHash(input.seed, input.pass * 2 + 1);
  const r = steady ? 1 : range.r[0] + (range.r[1] - range.r[0]) * unitHash(input.seed, input.pass * 2 + 2);
  return { fromT, tFrame: input.tFrame, d1: n1 * k, d2, k, r };
}

/** Hermite with h(0)=0, h(1)=1 and end slopes s0, s1. Worklet. */
function hermite(x: number, s0: number, s1: number): number {
  'worklet';
  const x2 = x * x, x3 = x2 * x;
  return (x3 - 2 * x2 + x) * s0 + (-2 * x3 + 3 * x2) + (x3 - x2) * s1;
}

/** Pass time t at `ms` of wall clock into the pass. Monotonic. Worklet. */
export function planT(plan: PassPlan, ms: number): number {
  'worklet';
  if (ms <= 0) return plan.fromT;
  if (ms < plan.d1) {
    // Normalised slopes: start at nominal speed (k), arrive at r times nominal (r * k).
    return plan.fromT + (plan.tFrame - plan.fromT) * hermite(ms / plan.d1, plan.k, plan.r * plan.k);
  }
  const x = Math.min(1, (ms - plan.d1) / plan.d2);
  return plan.tFrame + (1 - plan.tFrame) * hermite(x, plan.r, 1);
}

/** Wall-clock ms into the pass at pass time t (the inverse of planT, by bisection). Worklet. */
export function planMs(plan: PassPlan, t: number): number {
  'worklet';
  let lo = 0, hi = plan.d1 + plan.d2;
  if (t <= plan.fromT) return 0;
  if (t >= 1) return hi;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (planT(plan, mid) < t) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The withTiming easing for a pass (normalised wall time to normalised progress from fromT to 1). */
export function planEasing(plan: PassPlan): (x: number) => number {
  const total = plan.d1 + plan.d2;
  const span = Math.max(1e-6, 1 - plan.fromT);
  return (x: number) => {
    'worklet';
    return (planT(plan, x * total) - plan.fromT) / span;
  };
}


/**
 * The moving camera matters: the flash frame is locked to the viewfinder while the scene sways under it,
 * so the car meets the frame early or late by the sway. A tap's offset is corrected by how far the scene
 * has drifted along the car's path at that instant (drift / the car's speed at the frame), capped.
 * `vx` is the car's horizontal speed at the frame in points per ms at nominal speed; `r` the pass's
 * arrival speed factor. Worklet.
 */
export const SWAY_SHIFT_CAP_MS = 120;
export function swayShiftMs(swayX: number, vx: number, r: number): number {
  'worklet';
  const v = vx * r;
  if (!Number.isFinite(v) || Math.abs(v) < 0.04) return 0;
  const shift = swayX / v;
  return Math.max(-SWAY_SHIFT_CAP_MS, Math.min(SWAY_SHIFT_CAP_MS, shift));
}

/**
 * The car's distance to the frame, in nominal ms (pass time, not the wall clock). The brackets, the
 * shutter ring and the lamps follow this, so they close as fast as the car really comes: during a
 * dawdle they slow, in a burst they snap. Reading them is reading the car. Worklet.
 */
export function distanceMs(tFrame: number, t: number, passMs: number): number {
  'worklet';
  return (tFrame - t) * passMs;
}
