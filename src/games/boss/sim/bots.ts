/**
 * Test and demo bots (design v7 9.1). Bots see exactly what a player sees (the
 * attack plan's tells, the opening's lit suckers and rings) and answer with
 * jittered inputs through the same `input()` path, so balance numbers come
 * from the real rules. Also drives the dev autoplay and the house crew.
 *
 * The profiles are the starting fit only: Gate H (design 9.2) replaces them
 * with measured human timing distributions before any value locks.
 */
import { createRng, rngFloat, type Rng } from '../../../gamekit/core/rng';
import { IN_BOON, IN_GETUP, IN_PAD_DOWN, IN_PAD_UP, IN_TARGET, READ_GRACE_MS, type BossId } from './constants';
import {
  advance, carryOut, createBout, freshCarry, input, O_BREAK, P_DONE, P_DOWN, type Bout, type BoutConfig, type InputEvent,
} from './encounter';
import { boonOffer, laneAt } from './patterns';

export interface BotProfile {
  name: string;
  /** Chance of reading the right lane on a tell. */
  read: number;
  /** Counter timing jitter half-width (ms) around a bias. */
  jitter: number;
  bias: number;
  /** Chance of popping a slot on its ring (else off the ring: a HIT). */
  ringAcc: number;
  /** Half-width (ms) of the on-ring pop jitter. */
  popJitter: number;
  /** Chance of tapping the lit sucker (else an unlit one: CLANK). */
  laneAcc: number;
  /** Get-up taps per second. */
  getupRate: number;
  /** Chance of biting a fake. */
  feintBite: number;
  padMasher?: boolean;
  laneMasher?: boolean;
  guesser?: boolean;
  /** Holds the float for an Easy Slam on every opening. */
  slam?: boolean;
  /** Panic burst of taps on random lanes when a tell starts (kids). */
  panic?: boolean;
  /** Chance of a second (stray) tap in a slot. */
  doubleTap?: number;
  /** Comeback bot (design 9.1): the first N attacks of bout 1 land on you (a wrong lane at the impact). */
  comeback?: number;
}

const base = { jitter: 0, bias: 0, ringAcc: 0, popJitter: 60, laneAcc: 1, getupRate: 7, feintBite: 0 };

export const BOTS: Record<string, BotProfile> = {
  padMasher: { ...base, name: 'padMasher', read: 0, padMasher: true, getupRate: 0 },
  laneMasher: { ...base, name: 'laneMasher', read: 0, laneMasher: true },
  /** Back-compat alias for the v4 suites. */
  masher: { ...base, name: 'masher', read: 0, padMasher: true, getupRate: 0 },
  guesser: { ...base, name: 'guesser', read: 0.34, guesser: true, laneAcc: 0.34, feintBite: 0.5, getupRate: 6 },
  kid: {
    ...base, name: 'kid', read: 0.7, jitter: 180, bias: -60, ringAcc: 0.4, popJitter: 80, laneAcc: 0.85, feintBite: 0.5,
    getupRate: 6, panic: true, doubleTap: 0.12,
  },
  ringBlind: { ...base, name: 'ringBlind', read: 0.85, jitter: 150, bias: -40, ringAcc: 0, laneAcc: 0.9, feintBite: 0.3, getupRate: 6 },
  median: { ...base, name: 'median', read: 0.85, jitter: 150, bias: -40, ringAcc: 0.5, popJitter: 70, laneAcc: 0.9, feintBite: 0.3, getupRate: 6 },
  medianWalk: { ...base, name: 'medianWalk', read: 0.85, jitter: 150, bias: -40, ringAcc: 0.5, popJitter: 70, laneAcc: 0.9, feintBite: 0.3, getupRate: 6 },
  easySlam: { ...base, name: 'easySlam', read: 0.85, jitter: 150, bias: -40, slam: true, feintBite: 0.3, getupRate: 6 },
  /** Median, but punished on the first 2 attacks of bout 1 (proves the 5.2 decay and cap). */
  comeback: { ...base, name: 'comeback', read: 0.85, jitter: 150, bias: -40, ringAcc: 0.5, popJitter: 70, laneAcc: 0.9, feintBite: 0.3, getupRate: 6, comeback: 2 },
  mastery: { ...base, name: 'mastery', read: 0.97, jitter: 40, bias: -30, ringAcc: 0.9, popJitter: 45, laneAcc: 0.99, getupRate: 8 },
};

function uni(r: Rng, half: number): number {
  return Math.round((rngFloat(r) * 2 - 1) * half);
}

function otherLane(r: Rng, lane: number): number {
  return (lane + 1 + Math.floor(rngFloat(r) * 2)) % 3;
}

/** Play one bout with a bot. Returns the bout (its log is the proof). */
export function runBotBout(cfg: BoutConfig, bot: BotProfile, botSeed: number, boon = -1): Bout {
  const b = createBout(cfg);
  const r = createRng(botSeed);
  const queue: InputEvent[] = [];
  const push = (t: number, k: number, a?: number) => {
    queue.push(a === undefined ? { t, k } : { t, k, a });
  };
  if (cfg.bout > 0) {
    const offer = boonOffer(cfg.seed, cfg.bout);
    input(b, { t: 0, k: IN_BOON, a: boon >= 0 ? boon : offer[0] });
  }
  let seenAttack = -1;
  let seenOpening = -1;
  let seenDown = -1;
  let nextMash = 0;
  let mashLane = 0;
  for (let t = 0; t < 180000 && b.phase !== P_DONE; t += 10) {
    queue.sort((x, y) => x.t - y.t || x.k - y.k);
    while (queue.length && queue[0].t <= t) input(b, queue.shift()!);
    if (b.phase === P_DONE) break;
    advance(b, t);
    if (b.phase === P_DOWN && b.down && seenDown !== b.down.start && bot.getupRate > 0) {
      seenDown = b.down.start;
      const gap = Math.floor(1000 / bot.getupRate);
      for (let k = 0; k < 14; k++) push(b.down.open + 30 + k * gap + uni(r, 15), IN_GETUP);
    }
    if (bot.padMasher) {
      if (t >= nextMash) {
        push(t, IN_PAD_DOWN);
        push(t + 40, IN_PAD_UP);
        nextMash = t + 143;
      }
      continue;
    }
    if (bot.laneMasher) {
      if (t >= nextMash) {
        push(t, b.phase === P_DOWN ? IN_GETUP : IN_TARGET, b.phase === P_DOWN ? undefined : mashLane);
        mashLane = (mashLane + 1) % 3;
        nextMash = t + 143;
      }
      continue;
    }
    const a = b.attack;
    if (a && seenAttack !== a.no + 1000 * b.cfg.bout) {
      seenAttack = a.no + 1000 * b.cfg.bout;
      if (bot.panic) {
        push(a.T + 20, IN_TARGET, Math.floor(rngFloat(r) * 3));
        push(a.T + 185, IN_TARGET, Math.floor(rngFloat(r) * 3));
      }
      if (a.feintLane >= 0 && rngFloat(r) < bot.feintBite) push(a.feintT0 + 200, IN_TARGET, a.feintLane);
      if (a.hazardLane >= 0 && rngFloat(r) < Math.max(0.3, bot.read)) push(a.hazardT0 + 250, IN_TARGET, a.hazardLane);
      if (bot.guesser) {
        const I = a.steps[0].I;
        push(a.T + Math.floor(rngFloat(r) * (I + 90 - a.T)), IN_TARGET, Math.floor(rngFloat(r) * 3));
      } else if (bot.comeback && b.cfg.bout === 0 && a.no < bot.comeback) {
        const s0 = a.steps[0];
        push(Math.max(s0.I - 20, t), IN_TARGET, otherLane(r, laneAt(a, 0, s0.I - 20)));
      } else {
        const right = rngFloat(r) < bot.read;
        a.steps.forEach((s, k) => {
          const at = s.graded ? s.I + bot.bias + uni(r, bot.jitter) : a.T + READ_GRACE_MS + 40 + k * 110;
          const lane = right ? laneAt(a, k, at) : otherLane(r, laneAt(a, k, at));
          push(Math.max(at, t), IN_TARGET, lane);
        });
      }
    }
    const o = b.opening;
    if (o && o.id !== seenOpening) {
      seenOpening = o.id;
      const finalSlot = o.finalIdx;
      if (bot.slam && o.rings.length > (finalSlot >= 0 ? 1 : 0)) {
        push(Math.max(o.start + 20, t), IN_PAD_DOWN);
        const lastNormal = finalSlot >= 0 ? finalSlot - 1 : o.rings.length - 1;
        push(o.rings[lastNormal] + 60, IN_PAD_UP);
      }
      o.rings.forEach((ring, j) => {
        if (bot.slam && j !== finalSlot) return;
        let lane = o.lanes[j];
        if (bot.guesser) lane = Math.floor(rngFloat(r) * 3);
        else if (rngFloat(r) >= bot.laneAcc && o.kind !== O_BREAK) lane = otherLane(r, lane);
        const on = !bot.guesser && rngFloat(r) < bot.ringAcc;
        const at = bot.guesser
          ? ring - 200 + Math.floor(rngFloat(r) * 300)
          : on ? ring + uni(r, bot.popJitter) : ring - 130 - Math.floor(rngFloat(r) * 60);
        push(Math.max(at, o.start + 1, t), IN_TARGET, lane);
        if (bot.doubleTap && rngFloat(r) < bot.doubleTap) push(Math.max(at, o.start + 1, t) + 90, IN_TARGET, lane);
      });
    }
  }
  advance(b, Number.MAX_SAFE_INTEGER - 1);
  return b;
}

export interface BotRoundOpts { walk?: boolean; variant?: number; novice?: boolean; boons?: [number, number] }

/** A whole round (3 bouts, carry passed through) with one bot. Stops after a TKO. */
export function runBotRound(boss: BossId, seed: number, bot: BotProfile, opts: BotRoundOpts = {}): Bout[] {
  let carry = freshCarry();
  const out: Bout[] = [];
  for (let n = 0; n < 3; n++) {
    const b = runBotBout(
      { boss, seed, bout: n, carry, walk: opts.walk, variant: opts.variant ?? 1, novice: opts.novice },
      bot, (seed ^ 0x5bd1e995) + n * 7919, n > 0 && opts.boons ? opts.boons[n - 1] : -1,
    );
    out.push(b);
    carry = carryOut(b);
    if (carry.tko) break;
  }
  return out;
}
