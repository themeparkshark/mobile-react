/**
 * fxGovernor.ts: one referee for the loud effects (full-frame flashes,
 * global hit-stops, camera punches and shakes) so stacked moments read as one
 * big beat instead of a strobe.
 *
 * The rules come straight from the designs:
 *   - Flash gate (Line Party, Current Quest, Memory marquee): at most one
 *     full-frame flash per `flashMinGapMs` (500 ms keeps every flash point
 *     under 3 Hz, the photosensitivity line), peak capped (35% by default),
 *     and a rolling budget of `flashesPerWindow` per `flashWindowMs`.
 *   - Camera: no punch within `punchAfterShakeMs` (150 ms) of a shake, so the
 *     two never fight; shakes inside the merge window keep the larger trauma.
 *   - Hit-stop budget (Sharky): at most `hitStopBudgetMs` of global freeze per
 *     `hitStopWindowMs`, and at most one global stop per "stroke" key
 *     (Current Quest: one per player move).
 *   - Screen-event cap (Banana 7.0): at most `screenEventsPerWindow` screen-space
 *     moments (big flash, stamp, kick, zoom, vignette, banner) per
 *     `screenWindowMs`. A denied moment keeps its in-place particles, audio and
 *     haptic. 0 turns the cap off (the default).
 *   - Priority (Current Quest: golden > unlock > Riptide > pearl bank > tide):
 *     inside `mergeMs`, a lower-priority moment cannot take a flash, stop or
 *     punch that a higher one already took.
 *
 * Pure and worklet-safe. `force` always passes (KO, round end), but it still
 * respects the flash peak cap.
 */

export interface GovernorConfig {
  flashMaxPeak: number;
  flashMinGapMs: number;
  flashWindowMs: number;
  flashesPerWindow: number;
  punchAfterShakeMs: number;
  hitStopBudgetMs: number;
  hitStopWindowMs: number;
  /** Max single global stop (ms). */
  hitStopMaxMs: number;
  /** Moments closer than this are one beat for priority arbitration. */
  mergeMs: number;
  /** Walking or reduced motion: flashes and camera are softened further. */
  calm: boolean;
  /** Screen-space moments allowed per window (0 = no cap). */
  screenEventsPerWindow: number;
  screenWindowMs: number;
  /**
   * Whack v5 flash governor: a flash asked for inside the gap MERGES into the
   * live one (it already reads as one beat), so it is neither a new flash nor
   * a bloom. Off by default (a denied flash becomes a bloom).
   */
  flashMerge: boolean;
}

export const DEFAULT_GOVERNOR: GovernorConfig = {
  flashMaxPeak: 0.35,
  flashMinGapMs: 500,
  flashWindowMs: 2000,
  flashesPerWindow: 1,
  punchAfterShakeMs: 150,
  hitStopBudgetMs: 90,
  hitStopWindowMs: 1000,
  hitStopMaxMs: 160,
  mergeMs: 120,
  calm: false,
  screenEventsPerWindow: 0,
  screenWindowMs: 250,
  flashMerge: false,
};

/**
 * Per-game referee rules from the designs:
 *   createFxGovernor({ ...GOVERNOR_PRESETS.whack, calm: walking || reducedMotion })
 */
export const GOVERNOR_PRESETS = {
  /** Whack v5: 334 ms gap, 3 per second, merge; impact frames hold 33 ms of wall time. */
  whack: { flashMinGapMs: 334, flashesPerWindow: 3, flashWindowMs: 1000, flashMerge: true },
  /** Trivia rev 7: at most 2 full-frame flashes per match (Final stamp, crown) at 35%. */
  trivia: { flashMinGapMs: 500, flashesPerWindow: 2, flashWindowMs: 1e9, flashMaxPeak: 0.35 },
  /** Current Quest: 1 flash per 2 s at 20%, one hit-stop per stroke, no punch within 150 ms of a shake. */
  currentQuest: { flashMinGapMs: 2000, flashesPerWindow: 1, flashWindowMs: 2000, flashMaxPeak: 0.2 },
  /** Line Party FlashGate: 35% max, never 2 within 500 ms. */
  lineParty: { flashMinGapMs: 500, flashesPerWindow: 2, flashWindowMs: 1000, flashMaxPeak: 0.35 },
  /** Sharky: global stops only on hit (70) and Wipeout (160), 90 ms of freeze per second. */
  sharky: { hitStopBudgetMs: 90, hitStopWindowMs: 1000, hitStopMaxMs: 160 },
  /** Banana 7.0: 2 screen-space moments per 250 ms; global stops never two within 15 steps (250 ms). */
  banana: { screenEventsPerWindow: 2, screenWindowMs: 250, hitStopBudgetMs: 120, hitStopWindowMs: 250 },
  /** Memory: flash-all only on Showtime matches, under 3 Hz per bulb. */
  memory: { flashMinGapMs: 500, flashesPerWindow: 1, flashWindowMs: 1000 },
  /** Boss: PERFECT and Break freezes are whole-arena; no screen wash. */
  boss: { flashMaxPeak: 0.25, hitStopMaxMs: 300, hitStopBudgetMs: 360, hitStopWindowMs: 1000 },
  /** Parade Beat: full-lane flash capped at 0.12 over the reading surface. */
  rhythm: { flashMaxPeak: 0.12, flashMinGapMs: 334, flashesPerWindow: 3, flashWindowMs: 1000 },
} satisfies Record<string, Partial<GovernorConfig>>;

export type GovernorPreset = keyof typeof GOVERNOR_PRESETS;

/** Verdict of the last govFlash call (for callers that branch on merge vs deny). */
export const FLASH_ALLOWED = 0;
export const FLASH_DENIED = 1;
export const FLASH_MERGED = 2;

export interface FxGovernor {
  cfg: GovernorConfig;
  lastFlashAt: number;
  /** Ring of recent flash times (budget window). */
  flashTimes: number[];
  lastShakeAt: number;
  lastShakeTrauma: number;
  lastPunchAt: number;
  /** Recent global stops as [at, ms] pairs, flattened. */
  stops: number[];
  strokeKey: number;
  strokeStopUsed: boolean;
  /** Highest priority seen inside the current merge window. */
  beatAt: number;
  beatPrio: number;
  beatTook: number;
  /** Recent screen-space moments (cap window). */
  screenTimes: number[];
  /** Counters for the dev overlay. */
  denied: number;
  merged: number;
  /** FLASH_ALLOWED / FLASH_DENIED / FLASH_MERGED for the last govFlash. */
  lastFlashVerdict: number;
}

export const GOV_TOOK_FLASH = 1;
export const GOV_TOOK_STOP = 2;
export const GOV_TOOK_PUNCH = 4;

export function createFxGovernor(cfg: Partial<GovernorConfig> = {}): FxGovernor {
  'worklet';
  return {
    cfg: { ...DEFAULT_GOVERNOR, ...cfg },
    lastFlashAt: -1e9,
    flashTimes: [],
    lastShakeAt: -1e9,
    lastShakeTrauma: 0,
    lastPunchAt: -1e9,
    stops: [],
    strokeKey: -1,
    strokeStopUsed: false,
    beatAt: -1e9,
    beatPrio: -1,
    beatTook: 0,
    screenTimes: [],
    denied: 0,
    merged: 0,
    lastFlashVerdict: FLASH_ALLOWED,
  };
}

/** Start a new "stroke" (a player move): resets the one-stop-per-stroke rule. */
export function govBeginStroke(g: FxGovernor, key: number): void {
  'worklet';
  if (key !== g.strokeKey) {
    g.strokeKey = key;
    g.strokeStopUsed = false;
  }
}

/**
 * Enter a moment. Returns true when this moment is allowed to take big
 * effects (it is the highest priority inside the merge window so far).
 */
function claim(g: FxGovernor, now: number, prio: number, bit: number): boolean {
  'worklet';
  if (now - g.beatAt > g.cfg.mergeMs) {
    g.beatAt = now;
    g.beatPrio = prio;
    g.beatTook = 0;
  }
  if (prio > g.beatPrio) {
    g.beatPrio = prio;
    return true;
  }
  if (prio === g.beatPrio) return (g.beatTook & bit) === 0;
  // A higher-priority moment owns this beat: it may still be about to take
  // this effect, so the lower one never does.
  return false;
}

/**
 * Ask for a full-frame flash. Returns the allowed peak (0 = denied: use a
 * localized bloom instead).
 */
export function govFlash(g: FxGovernor, now: number, peak: number, prio = 0, force = false): number {
  'worklet';
  const c = g.cfg;
  const cap = c.calm ? Math.min(c.flashMaxPeak, 0.15) : c.flashMaxPeak;
  const allowedPeak = Math.min(peak, cap);
  if (!force) {
    if (now - g.lastFlashAt < c.flashMinGapMs) {
      if (c.flashMerge) { g.merged += 1; g.lastFlashVerdict = FLASH_MERGED; return 0; }
      g.denied += 1; g.lastFlashVerdict = FLASH_DENIED; return 0;
    }
    let inWindow = 0;
    for (let i = 0; i < g.flashTimes.length; i++) if (now - g.flashTimes[i] < c.flashWindowMs) inWindow += 1;
    if (inWindow >= c.flashesPerWindow) { g.denied += 1; g.lastFlashVerdict = FLASH_DENIED; return 0; }
    if (!claim(g, now, prio, GOV_TOOK_FLASH)) { g.denied += 1; g.lastFlashVerdict = FLASH_DENIED; return 0; }
  }
  g.lastFlashVerdict = FLASH_ALLOWED;
  g.lastFlashAt = now;
  g.flashTimes.push(now);
  if (g.flashTimes.length > 8) g.flashTimes.shift();
  g.beatTook |= GOV_TOOK_FLASH;
  return allowedPeak;
}

/** Ask for a global hit-stop. Returns the allowed ms (0 = denied). */
export function govHitStop(g: FxGovernor, now: number, ms: number, prio = 0, force = false): number {
  'worklet';
  const c = g.cfg;
  let want = Math.min(ms, c.hitStopMaxMs);
  if (!force) {
    if (g.strokeKey >= 0 && g.strokeStopUsed) { g.denied += 1; return 0; }
    if (!claim(g, now, prio, GOV_TOOK_STOP)) { g.denied += 1; return 0; }
    let used = 0;
    const keep: number[] = [];
    for (let i = 0; i + 1 < g.stops.length; i += 2) {
      if (now - g.stops[i] < c.hitStopWindowMs) {
        used += g.stops[i + 1];
        keep.push(g.stops[i], g.stops[i + 1]);
      }
    }
    g.stops = keep;
    want = Math.min(want, c.hitStopBudgetMs - used);
    if (want < 16) { g.denied += 1; return 0; }
  }
  g.stops.push(now, want);
  g.strokeStopUsed = true;
  g.beatTook |= GOV_TOOK_STOP;
  return want;
}

/** Ask for a shake. Returns the trauma to add (merged moments keep the larger). */
export function govShake(g: FxGovernor, now: number, trauma: number): number {
  'worklet';
  const scaled = g.cfg.calm ? trauma * 0.3 : trauma;
  if (now - g.lastShakeAt < g.cfg.mergeMs) {
    const extra = Math.max(0, scaled - g.lastShakeTrauma);
    g.lastShakeTrauma = Math.max(g.lastShakeTrauma, scaled);
    return extra;
  }
  g.lastShakeAt = now;
  g.lastShakeTrauma = scaled;
  return scaled;
}

/** Ask for a camera punch. Denied right after a shake or when a bigger moment already punched. */
export function govPunch(g: FxGovernor, now: number, prio = 0, force = false): boolean {
  'worklet';
  if (g.cfg.calm && !force) return false;
  if (!force) {
    if (now - g.lastShakeAt < g.cfg.punchAfterShakeMs) { g.denied += 1; return false; }
    if (!claim(g, now, prio, GOV_TOOK_PUNCH)) { g.denied += 1; return false; }
  }
  g.lastPunchAt = now;
  g.beatTook |= GOV_TOOK_PUNCH;
  return true;
}

/** Per-point flash frequency check for chase lights (marquee bulbs): Hz must stay under 3. */
export function flashRateHz(onOffPeriodMs: number): number {
  'worklet';
  return onOffPeriodMs > 0 ? 1000 / onOffPeriodMs : Infinity;
}

/**
 * Ask for a screen-space moment (Banana: at most 2 per 250 ms). Returns false
 * when the cap is full: skip the flash, stamp, kick, zoom and vignette, but
 * keep the in-place particles, audio and haptic. Higher-priority moments
 * should be offered first inside a frame (puffer hit > Golden Hour > TIME! >
 * tier-up > BONK > POP > CLOSE CALL > PERFECT > coin). `force` always passes
 * and still counts.
 */
export function govScreenEvent(g: FxGovernor, now: number, force = false): boolean {
  'worklet';
  const c = g.cfg;
  if (c.screenEventsPerWindow <= 0) return true;
  const keep: number[] = [];
  for (let i = 0; i < g.screenTimes.length; i++) if (now - g.screenTimes[i] < c.screenWindowMs) keep.push(g.screenTimes[i]);
  g.screenTimes = keep;
  if (!force && keep.length >= c.screenEventsPerWindow) {
    g.denied += 1;
    return false;
  }
  g.screenTimes.push(now);
  return true;
}
