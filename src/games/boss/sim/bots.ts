/**
 * Test and demo bots (design 7.2 / 18.1). Bots see exactly what a player sees
 * (the attack plan's tells, the opening's rings) and answer with jittered
 * inputs through the same `input()` path, so balance numbers come from the
 * real rules. Also drives the dev autoplay and house-crew allies.
 */
import { createRng, rngFloat, type Rng } from '../../../gamekit/core/rng';
import { IN_PAD_DOWN, IN_PAD_UP, IN_TARGET, type BossId } from './constants';
import {
  advance, carryOut, createBout, freshCarry, input, P_DONE, P_FINISHER, type Bout, type BoutConfig, type InputEvent,
} from './encounter';
import { laneAt } from './patterns';

export interface BotProfile {
  name: string;
  /** Chance of reading the right target. */
  read: number;
  /** Counter timing jitter half-width (ms) around a bias. */
  jitter: number;
  bias: number;
  /** Chance of tapping a ring on its close (else off the ring). */
  ringAcc: number;
  masher?: boolean;
  guesser?: boolean;
  ringBlind?: boolean;
  /** Takes the Heavy instead of the ring chain. */
  heavy?: boolean;
  /** Chance of tapping a feint's buoy. */
  feintBite: number;
}

export const BOTS: Record<string, BotProfile> = {
  masher: { name: 'masher', read: 0, jitter: 0, bias: 0, ringAcc: 0, masher: true, feintBite: 0 },
  guesser: { name: 'guesser', read: 0.34, jitter: 0, bias: 0, ringAcc: 0, guesser: true, ringBlind: true, feintBite: 0.5 },
  ringBlind: { name: 'ringBlind', read: 0.6, jitter: 150, bias: -40, ringAcc: 0, ringBlind: true, feintBite: 0.3 },
  median: { name: 'median', read: 0.6, jitter: 150, bias: -40, ringAcc: 0.5, feintBite: 0.3 },
  medianWalk: { name: 'medianWalk', read: 0.6, jitter: 150, bias: -40, ringAcc: 0.5, heavy: true, feintBite: 0.3 },
  mastery: { name: 'mastery', read: 0.95, jitter: 40, bias: -30, ringAcc: 0.9, feintBite: 0 },
};

function uni(r: Rng, half: number): number {
  return Math.round((rngFloat(r) * 2 - 1) * half);
}

/** Play one bout with a bot. Returns the bout (its log is the proof). */
export function runBotBout(cfg: BoutConfig, bot: BotProfile, botSeed: number): Bout {
  const b = createBout(cfg);
  const r = createRng(botSeed);
  const queue: InputEvent[] = [];
  const push = (t: number, k: number, a?: number) => {
    queue.push(a === undefined ? { t, k } : { t, k, a });
  };
  let seenAttack = -1;
  let seenOpening = -1;
  let finisherPlanned = false;
  let nextMash = 0;
  for (let t = 0; t < 180000 && b.phase !== P_DONE; t += 10) {
    queue.sort((x, y) => x.t - y.t || x.k - y.k);
    while (queue.length && queue[0].t <= t) input(b, queue.shift()!);
    if (b.phase === P_DONE) break;
    advance(b, t);
    const a = b.attack;
    if (bot.masher) {
      if (t >= nextMash) {
        push(t, IN_PAD_DOWN);
        push(t + 40, IN_PAD_UP);
        nextMash = t + 143;
      }
      continue;
    }
    if (a && seenAttack !== a.no + 1000 * b.cfg.bout) {
      seenAttack = a.no + 1000 * b.cfg.bout;
      if (a.feintLane >= 0 && rngFloat(r) < bot.feintBite) push(a.feintT0 + 200, IN_TARGET, a.feintLane);
      if (a.hazardLane >= 0 && rngFloat(r) < bot.read) push(a.hazardT0 + 150, IN_TARGET, a.hazardLane);
      if (bot.guesser) {
        const I = a.steps[0].I;
        push(a.T + Math.floor(rngFloat(r) * (I + 90 - a.T)), IN_TARGET, Math.floor(rngFloat(r) * 3));
      } else {
        const right = rngFloat(r) < bot.read;
        a.steps.forEach((s, k) => {
          const at = s.graded ? s.I + bot.bias + uni(r, bot.jitter) : a.T + 60 + k * 90;
          const lane = right ? laneAt(a, k, at) : (laneAt(a, k, at) + 1 + Math.floor(rngFloat(r) * 2)) % 3;
          push(Math.max(at, t), IN_TARGET, lane);
        });
      }
    }
    const o = b.opening;
    if (o && o.id !== seenOpening) {
      seenOpening = o.id;
      if (bot.ringBlind) {
        for (let x = o.start; x < o.end; x += 143) {
          push(x, IN_PAD_DOWN);
          push(x + 40, IN_PAD_UP);
        }
      } else if (bot.heavy && o.kind !== 1) {
        push(o.start + 30, IN_PAD_DOWN);
        push(o.rings[o.rings.length - 1] + uni(r, 90), IN_PAD_UP);
      } else {
        o.rings.forEach((ring) => {
          const on = rngFloat(r) < bot.ringAcc;
          const at = on ? ring + uni(r, 60) : ring - 130 - Math.floor(rngFloat(r) * 60);
          push(Math.max(at, o.start), IN_PAD_DOWN);
          push(Math.max(at, o.start) + 45, IN_PAD_UP);
        });
      }
    }
    if (b.phase === P_FINISHER && b.finisher && !finisherPlanned) {
      finisherPlanned = true;
      const f = b.finisher;
      push(f.start + 300, IN_PAD_DOWN);
      push(f.ring + bot.bias / 2 + uni(r, bot.jitter), IN_PAD_UP);
    }
  }
  advance(b, Number.MAX_SAFE_INTEGER - 1);
  return b;
}

/** A whole round (3 bouts, carry passed through) with one bot. */
export function runBotRound(boss: BossId, seed: number, bot: BotProfile, opts: { walk?: boolean; tide?: boolean; variant?: number } = {}): Bout[] {
  let carry = freshCarry();
  const out: Bout[] = [];
  for (let n = 0; n < 3; n++) {
    const b = runBotBout({ boss, seed, bout: n, carry, walk: opts.walk, tide: n > 0 && opts.tide, variant: opts.variant }, bot, (seed ^ 0x5bd1e995) + n * 7919);
    out.push(b);
    carry = carryOut(b);
  }
  return out;
}
