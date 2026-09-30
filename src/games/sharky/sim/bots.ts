/**
 * Planner bots for Tide Run.
 *
 *   planRun(cfg, profile): a full-run input log from a receding-horizon DFS
 *   planner with human limits (decision cadence, commit delay) and seeded
 *   mistakes. House-crew racers are planned once at the lineup (JS thread,
 *   ~10-40ms), then replay in lockstep like any ghost, and the server can
 *   replay the exact same log. Also used by the chunk gates and the
 *   Monte-Carlo ride validation in tests.
 *
 * Pure TS on top of sim/core (no React, no Reanimated).
 */

import {
  IN_DASH, IN_EXT, IN_PRESS, IN_RELEASE, EXT_REVIVE, PH_DONE, PH_PLAY, PH_WIPE,
  applyInput, botTargetY, cloneSim, createSim, planHold, rngNext, step,
  type InputEntry, type SimConfig, type SimState,
} from './core';

export interface BotProfile {
  name: string;
  /** Steps between input changes (7 = the 120ms human floor). */
  every: number;
  /** Planning horizon in decisions. */
  horizon: number;
  /** Chance (0..1000) per decision to take the other branch (a slip). */
  slip: number;
  /** Uses Boost Dash on long clear straights and to chomp puffers. */
  dash: boolean;
  /** Revives in queue mode when offered. */
  revive: boolean;
}

export const BOT_PROFILES: Record<string, BotProfile> = {
  ace: { name: 'ace', every: 6, horizon: 16, slip: 0, dash: true, revive: true },
  regular: { name: 'regular', every: 7, horizon: 11, slip: 30, dash: true, revive: true },
  rookie: { name: 'rookie', every: 8, horizon: 7, slip: 90, dash: false, revive: true },
  novice: { name: 'novice', every: 9, horizon: 4, slip: 150, dash: false, revive: false },
};

function advance(s: SimState, hold: boolean, steps: number, log: InputEntry[] | null): boolean {
  for (let k = 0; k < steps; k++) {
    if (hold && !s.holding) {
      if (log) log.push({ step: s.step, kind: IN_PRESS, sub: 0, arg: 0 });
      applyInput(s, IN_PRESS, 0, 0);
    } else if (!hold && s.holding) {
      if (log) log.push({ step: s.step, kind: IN_RELEASE, sub: 0, arg: 0 });
      applyInput(s, IN_RELEASE, 0, 0);
    }
    const hearts = s.hearts;
    const shield = s.shield;
    step(s);
    if (s.hearts < hearts || s.shield < shield) return false;
    if (s.phase !== PH_PLAY) return true;
  }
  return true;
}

/** Is there a hit-free continuation of `depth` decisions from s? First choice returned (-1 none). */
function safeChoice(s: SimState, every: number, depth: number, budget: { n: number }): number {
  const ty = botTargetY(s, (s.speed >> 8) + 120);
  const first = (s.y >> 8) > ty ? 1 : 0;
  for (const hold of [first, 1 - first]) {
    if (budget.n-- <= 0) return -1;
    const c = cloneSim(s);
    if (!advance(c, hold === 1, every, null)) continue;
    if (depth <= 1 || c.phase !== PH_PLAY) return hold;
    if (safeChoice(c, every, depth - 1, budget) >= 0) return hold;
  }
  return -1;
}

/**
 * Plan a whole run. Deterministic in (cfg, profile, seed). Returns the log
 * and the final state (so callers can read score / finish step).
 */
export function planRun(cfg: SimConfig, profile: BotProfile, seed: number, maxSteps = 7200): { log: InputEntry[]; s: SimState } {
  const s = createSim(cfg);
  const log: InputEntry[] = [];
  const r = { s: seed | 0 };
  let revived = false;
  while (s.phase !== PH_DONE && s.step < maxSteps) {
    if (s.phase === PH_WIPE) {
      if (profile.revive && !revived && s.phaseSteps === 70) {
        revived = true;
        log.push({ step: s.step, kind: IN_EXT, sub: EXT_REVIVE, arg: 1 });
        applyInput(s, IN_EXT, EXT_REVIVE, 1);
      }
      step(s);
      continue;
    }
    if (s.phase !== PH_PLAY) {
      if (s.holding) {
        log.push({ step: s.step, kind: IN_RELEASE, sub: 0, arg: 0 });
        applyInput(s, IN_RELEASE, 0, 0);
      }
      step(s);
      continue;
    }
    const ty = botTargetY(s, (s.speed >> 8) + 120);
    const prefer = (s.y >> 8) > ty ? 1 : 0;
    let choice = planHold(s, profile.every, profile.horizon, 1500, prefer);
    if (choice < 0) {
      (globalThis as { __SHARKY_FAILS?: number }).__SHARKY_FAILS = ((globalThis as { __SHARKY_FAILS?: number }).__SHARKY_FAILS ?? 0) + 1;
      choice = prefer;
    }
    if (profile.slip > 0 && rngNext(r) % 1000 < profile.slip) choice = 1 - choice;
    if (profile.dash && s.etier >= 2 && s.boost >= 100 && s.dash === 0 && rngNext(r) % 1000 < 120) {
      // Only Dash when a hit-free continuation exists after it (skill, not spam).
      const c = cloneSim(s);
      applyInput(c, IN_DASH, 0, 0);
      c.speedEff = (c.speed * 461) >> 8;
      if (c.dash > 0 && planHold(c, profile.every, profile.horizon + 4, 600, c.holding) >= 0) {
        log.push({ step: s.step, kind: IN_DASH, sub: 0, arg: 0 });
        applyInput(s, IN_DASH, 0, 0);
      }
    }
    advance(s, choice === 1, profile.every, log);
  }
  return { log, s };
}
