/**
 * sim: scripted players for tests, max score, house-crew bots and ghosts.
 *
 * A player model turns a chart into a touch script (down / move / up events
 * in song time); runScript() feeds it through the real judge with an 8 ms
 * tick, so sims exercise exactly the rules the phone plays.
 *
 * Models:
 *   perfect   every note dead on, right zone, ROLLs held, BIGs doubled,
 *             CYMBAL flicks, POPPERs popped (Fever fires itself)
 *   human     Gaussian timing error (sigma), lapses (skipped notes), zone
 *             slips, a small constant bias
 *   masher    uniform taps at N per second, random zones
 */

import { mulberry32 } from './generate';
import {
  createJudge,
  judgeDown,
  judgeMove,
  judgeTick,
  judgeUp,
  finishJudge,
  type JudgeConfig,
  type JudgeState,
} from './judge';
import {
  F_FLICK,
  K_BIG,
  K_CYMBAL,
  K_FREEZE,
  K_POPPER,
  K_RIM,
  K_ROLL,
  L_MARCH,
  L_STANDING,
  Z_CENTRE,
  Z_RIM_L,
  Z_RIM_R,
  type Chart,
} from './types';

export interface TouchEv {
  t: number;
  /** 0 down, 1 up, 2 move */
  type: number;
  zone: number;
  pid: number;
  y: number;
}

export interface HumanModel {
  sigmaMs: number;
  biasMs?: number;
  /** A linear drift across the run, 0 at the first note to this many ms at the last. */
  driftMs?: number;
  lapse?: number;
  zoneSlip?: number;
  /** Layer the player reads (their own walking plan). */
  march?: boolean;
  popperRate?: number;
}

function gauss(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function scriptHuman(chart: Chart, model: HumanModel, seed: number): TouchEv[] {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const ev: TouchEv[] = [];
  let pid = 1;
  const layer = model.march ? L_MARCH : L_STANDING;
  for (let i = 0; i < chart.t.length; i++) {
    if (!(chart.layers[i] & layer)) continue;
    const k = chart.kind[i];
    if (k === K_FREEZE) continue;
    if (k === K_POPPER) {
      const need = chart.popperTaps;
      const rate = model.popperRate ?? 9;
      const span = chart.end[i] - chart.t[i];
      const taps = Math.min(need + 2, Math.floor((span / 1000) * rate));
      for (let j = 0; j < taps; j++) {
        const t = chart.t[i] + 60 + j * (1000 / rate) + gauss(rand) * 8;
        ev.push({ t, type: 0, zone: Z_CENTRE, pid, y: 700 }, { t: t + 40, type: 1, zone: Z_CENTRE, pid, y: 700 });
        pid++;
      }
      continue;
    }
    if ((model.lapse ?? 0) > 0 && rand() < (model.lapse ?? 0)) continue;
    const span = chart.t.length > 1 ? chart.t[chart.t.length - 1] - chart.t[0] : 1;
    const drift = (model.driftMs ?? 0) * ((chart.t[i] - chart.t[0]) / span);
    const err = (model.biasMs ?? 0) + drift + gauss(rand) * model.sigmaMs;
    const t = chart.t[i] + err;
    let zone = k === K_RIM ? (rand() < 0.5 ? Z_RIM_L : Z_RIM_R) : Z_CENTRE;
    if ((model.zoneSlip ?? 0) > 0 && rand() < (model.zoneSlip ?? 0)) zone = zone === Z_CENTRE ? Z_RIM_L : Z_CENTRE;
    const p = pid++;
    ev.push({ t, type: 0, zone, pid: p, y: 700 });
    if (k === K_ROLL) {
      ev.push({ t: chart.end[i] + 5, type: 1, zone, pid: p, y: 700 });
    } else if (k === K_CYMBAL && chart.flags[i] & F_FLICK) {
      ev.push({ t: t + 60, type: 2, zone, pid: p, y: 660 }, { t: t + 90, type: 1, zone, pid: p, y: 660 });
    } else {
      ev.push({ t: t + 70, type: 1, zone, pid: p, y: 700 });
    }
    if (k === K_BIG) {
      const p2 = pid++;
      ev.push({ t: t + 12, type: 0, zone: Z_CENTRE, pid: p2, y: 700 }, { t: t + 80, type: 1, zone: Z_CENTRE, pid: p2, y: 700 });
    }
  }
  ev.sort((a, b) => a.t - b.t || a.type - b.type);
  return ev;
}

export function scriptMasher(chart: Chart, tapsPerSec: number, seed: number): TouchEv[] {
  const rand = mulberry32(seed ^ 0x51ed270b);
  const ev: TouchEv[] = [];
  const start = chart.barStart[chart.firstBar] - 500;
  const end = chart.barStart[chart.lastBar + 1];
  let t = start;
  let pid = 1;
  while (t < end) {
    t += (1000 / tapsPerSec) * (0.5 + rand());
    const z = Math.floor(rand() * 3);
    ev.push({ t, type: 0, zone: z, pid, y: 700 }, { t: t + 30, type: 1, zone: z, pid, y: 700 });
    pid++;
  }
  ev.sort((a, b) => a.t - b.t || a.type - b.type);
  return ev;
}

/**
 * Feed a script through the judge with an 8 ms tick; `marchPlan` drives the
 * MARCH pill. Returns the finished judge.
 */
export function runScript(chart: Chart, script: TouchEv[], cfg: JudgeConfig = {}, marchPlan?: (t: number) => boolean): JudgeState {
  const s = createJudge(chart, cfg);
  const events = script.slice().sort((a, b) => a.t - b.t || a.type - b.type);
  let now = chart.barStart[0];
  const endT = chart.endMs + 50;
  let e = 0;
  while (now <= endT) {
    if (marchPlan) s.marchWant = marchPlan(now) ? 1 : 0;
    while (e < events.length && events[e].t <= now) {
      const x = events[e++];
      if (x.type === 0) judgeDown(s, x.t, x.zone, x.pid, x.y);
      else if (x.type === 1) judgeUp(s, x.t, x.pid);
      else judgeMove(s, x.t, x.pid, x.y);
    }
    judgeTick(s, now);
    if (s.stalled) break;
    now += 8;
  }
  finishJudge(s, now, false);
  return s;
}

/** Perfect play (Fever fires itself, Keep it lit holds it). */
export function perfectRun(chart: Chart, cfg: JudgeConfig = {}): JudgeState {
  const script = scriptHuman(chart, { sigmaMs: 0 }, 1);
  return runScript(chart, script, { ...cfg, forceMarch: 0 });
}

/** Drop lines of a chart (first bar of every section after the first). */
export function dropBarsOf(chart: Chart): number[] {
  const out: number[] = [];
  for (let b = chart.firstBar + 4; b <= chart.lastBar; b += 4) out.push(b);
  return out;
}

/** Max score (4.2): deterministic, a perfect run under auto-fire. No routing. */
export function maxScore(chart: Chart): number {
  return perfectRun(chart).score;
}
