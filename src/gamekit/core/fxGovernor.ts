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
};

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
  /** Counters for the dev overlay. */
  denied: number;
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
    denied: 0,
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
    if (now - g.lastFlashAt < c.flashMinGapMs) { g.denied += 1; return 0; }
    let inWindow = 0;
    for (let i = 0; i < g.flashTimes.length; i++) if (now - g.flashTimes[i] < c.flashWindowMs) inWindow += 1;
    if (inWindow >= c.flashesPerWindow) { g.denied += 1; return 0; }
    if (!claim(g, now, prio, GOV_TOOK_FLASH)) { g.denied += 1; return 0; }
  }
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
