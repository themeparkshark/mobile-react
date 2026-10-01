/**
 * Planner bots for Tide Run (design v7.1 5.8).
 *
 *   planRun(cfg, profile): a full-run input log from a receding-horizon DFS
 *   planner with human limits (decision cadence, planning horizon) and seeded
 *   mistakes. Rally house-crew seats are planned once at the lineup (JS
 *   thread), then replay in lockstep like any ghost, and the server can replay
 *   the exact same log. Also used by the chunk gates, score-sim and the
 *   Monte-Carlo ride validation in tests.
 *
 * Skill is expressed the way a human expresses it: how often the bot aims for
 * the Close line (graze) instead of the lazy centre line, how far ahead it
 * plans, how fast it can change its input, and how often it slips. Humans tune
 * these profiles (5.8 step 2); until the walking playtest logs exist they are
 * starting values, not a lock.
 *
 * Pure TS on top of sim/core (no React, no Reanimated).
 */

import {
  IN_EXT, IN_PRESS, IN_RELEASE, EXT_REVIVE, PH_DONE, PH_PLAY, PH_WIPE,
  applyInput, botTargetY, createSim, planHold, rngNext, step,
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
  /** Chance (0..1000) per hazard approach to aim for the Close line. */
  hug: number;
  /** Revives in queue mode when offered. */
  revive: boolean;
}

export const BOT_PROFILES: Record<string, BotProfile> = {
  ace: { name: 'ace', every: 6, horizon: 16, slip: 0, hug: 920, revive: true },
  regular: { name: 'regular', every: 7, horizon: 11, slip: 30, hug: 380, revive: true },
  rookie: { name: 'rookie', every: 8, horizon: 7, slip: 90, hug: 120, revive: true },
  novice: { name: 'novice', every: 8, horizon: 6, slip: 50, hug: 0, revive: false },
  /** A lazy-line bot: never grazes on purpose (Rally skill check, idle checks). */
  lazy: { name: 'lazy', every: 7, horizon: 11, slip: 0, hug: 0, revive: true },
};

function advance(s: SimState, hold: boolean, steps: number, log: InputEntry[]): void {
  for (let k = 0; k < steps; k++) {
    if (hold && !s.holding) {
      log.push({ step: s.step, kind: IN_PRESS, sub: 0, arg: 0 });
      applyInput(s, IN_PRESS, 0, 0);
    } else if (!hold && s.holding) {
      log.push({ step: s.step, kind: IN_RELEASE, sub: 0, arg: 0 });
      applyInput(s, IN_RELEASE, 0, 0);
    }
    step(s);
    if (s.phase !== PH_PLAY) return;
  }
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
  let hugNow = 0;
  let hugUntil = -1;
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
      // Pockets: an engaged bot keeps holding through the gate line sometimes;
      // either way it lets go in the pocket (input is ignored there).
      if (s.holding) {
        log.push({ step: s.step, kind: IN_RELEASE, sub: 0, arg: 0 });
        applyInput(s, IN_RELEASE, 0, 0);
      }
      step(s);
      continue;
    }
    // Re-roll the line choice every ~0.5s so a "regular" hugs some hazards.
    if (s.step >= hugUntil) {
      hugNow = rngNext(r) % 1000 < profile.hug ? 1 : 0;
      hugUntil = s.step + 30;
    }
    const ty = botTargetY(s, (s.speed >> 8) + 120, hugNow);
    const prefer = (s.y >> 8) > ty ? 1 : 0;
    let choice = planHold(s, profile.every, profile.horizon, 1500, prefer);
    // The preferred subtree can exhaust the budget: try the other branch first.
    if (choice < 0) choice = planHold(s, profile.every, profile.horizon, 1500, 1 - prefer);
    if (choice < 0) {
      (globalThis as { __SHARKY_FAILS?: number }).__SHARKY_FAILS = ((globalThis as { __SHARKY_FAILS?: number }).__SHARKY_FAILS ?? 0) + 1;
      choice = prefer;
    }
    if (profile.slip > 0 && rngNext(r) % 1000 < profile.slip) choice = 1 - choice;
    advance(s, choice === 1, profile.every, log);
  }
  return { log, s };
}
