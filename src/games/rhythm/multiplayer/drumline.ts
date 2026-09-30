/**
 * drumline: the async Drum-Off (design 11.2, "Ghost Drumline").
 *
 * Every queue round races up to three drummers on the identical chart:
 *   - your personal-best ghost (its verified touch log replayed through the
 *     real judge),
 *   - a friend's or crew mate's challenge ghost when one was sent,
 *   - house-crew drummers (the Line Party bot names) filling empty seats,
 *     played by the human model in core/sim.ts.
 *
 * Each rival yields the times of their hits (their rail flashes on the
 * beat-map time of the note, never on arrival), the cumulative score at every
 * bar line (the ahead/behind delta chip) and their final score. The same
 * Rival shape is what a live Line Party room feeds from 250 ms telemetry
 * (see rhythmParty.ts), so the UI does not care which it is.
 *
 * Pure (no React).
 */

import { mulberry32 } from '../core/generate';
import { decodeTouches } from '../core/proof';
import { createJudge, finishJudge, judgeDown, judgeMove, judgeTick, judgeUp, type JudgeConfig, type JudgeState } from '../core/judge';
import { scriptHuman, type TouchEv } from '../core/sim';
import { J_GOOD, J_SHARP, type Chart } from '../core/types';
import type { GhostRun } from '../meta/progress';

export interface Rival {
  id: string;
  name: string;
  color: string;
  isGhost: boolean;
  /** Song times (ms) of the rival's hits, ascending. */
  hitT: number[];
  /** Cumulative score at the end of each playable bar. */
  barScores: number[];
  finalScore: number;
}

export const CREW = [
  { id: 'bot:captain', name: 'Captain Fin', color: '#1f8fff', sigma: 26, lapse: 0.01 },
  { id: 'bot:bubbles', name: 'Bubbles', color: '#ff8a6b', sigma: 40, lapse: 0.03 },
  { id: 'bot:chomps', name: 'Chomps', color: '#35c46a', sigma: 55, lapse: 0.05 },
  { id: 'bot:coral', name: 'Coral', color: '#ffb02e', sigma: 33, lapse: 0.02 },
  { id: 'bot:tidal', name: 'Tidal', color: '#12b5c9', sigma: 46, lapse: 0.04 },
];

/** Play a touch script through the judge, recording the score at every bar line. */
export function playRival(chart: Chart, script: TouchEv[], cfg: JudgeConfig): { s: JudgeState; barScores: number[] } {
  const s = createJudge(chart, cfg);
  const barScores: number[] = [];
  let bar = chart.firstBar;
  let now = chart.barStart[0];
  let e = 0;
  while (now <= chart.endMs + 50) {
    while (e < script.length && script[e].t <= now) {
      const x = script[e++];
      if (x.type === 0) judgeDown(s, x.t, x.zone, x.pid, x.y);
      else if (x.type === 1) judgeUp(s, x.t, x.pid);
      else judgeMove(s, x.t, x.pid, x.y);
    }
    judgeTick(s, now);
    while (bar <= chart.lastBar && now >= chart.barStart[bar + 1]) {
      barScores.push(s.score);
      bar++;
    }
    if (s.stalled) break;
    now += 16;
  }
  finishJudge(s, now, false);
  while (barScores.length < chart.lastBar - chart.firstBar + 1) barScores.push(s.score);
  return { s, barScores };
}

function hitsOf(s: JudgeState): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.n; i++) if (s.res[i] >= J_SHARP && s.res[i] <= J_GOOD) out.push(s.t[i]);
  return out;
}

export function ghostRival(chart: Chart, ghost: GhostRun, id: string, color: string, autoFever: boolean): Rival | null {
  if (ghost.seed !== chart.seed) return null;
  const touches = decodeTouches(ghost.touches).map((x) => ({ t: x.t, type: x.type, zone: x.zone, pid: x.pid, y: x.y }));
  const { s, barScores } = playRival(chart, touches, { autoFever: ghost.autoFever ?? autoFever, marchBars: ghost.marchBars });
  return { id, name: ghost.name, color, isGhost: true, hitT: hitsOf(s), barScores, finalScore: s.score };
}

export function botRival(chart: Chart, bot: (typeof CREW)[number], seed: number, autoFever: boolean): Rival {
  const script = scriptHuman(chart, { sigmaMs: bot.sigma, lapse: bot.lapse, zoneSlip: 0.02 }, seed);
  const { s, barScores } = playRival(chart, script, { autoFever: true, forceMarch: 0 });
  void autoFever;
  return { id: bot.id, name: bot.name, color: bot.color, isGhost: false, hitT: hitsOf(s), barScores, finalScore: s.score };
}

/**
 * The round's drumline: the challenge ghost first, then your PB ghost when it
 * was set on this exact seed, then house crew up to 3 rivals.
 */
export function crewForRound(
  chart: Chart,
  plan: { seed: number; autoFever: boolean },
  pbGhost: GhostRun | null,
  challenge: GhostRun | null,
): Rival[] {
  const out: Rival[] = [];
  if (challenge) {
    const r = ghostRival(chart, challenge, `ghost:${challenge.name}`, '#ffcf3b', plan.autoFever);
    if (r) out.push(r);
  }
  if (pbGhost) {
    const r = ghostRival(chart, pbGhost, 'ghost:pb', '#ffffff', plan.autoFever);
    if (r) out.push(r);
  }
  const rand = mulberry32(plan.seed ^ 0xc0ffee);
  const pool = CREW.slice();
  while (out.length < 3 && pool.length) {
    const k = Math.floor(rand() * pool.length);
    const bot = pool.splice(k, 1)[0];
    out.push(botRival(chart, bot, (plan.seed + out.length * 7919) >>> 0, plan.autoFever));
  }
  return out;
}
