/**
 * proof.ts: Whack-a-Shark proof v2 (design 11). One proof per Burst; a Run
 * submits an array. The server rebuilds the timeline from the seed, replays
 * the tap log and trusts only its own result (the client's is a checksum).
 *
 * `verifyProof` is the reference verifier: node tests run it, and the PHP port
 * (App\Domains\Game\Services\Whack\{Timeline,Resolver}.php, owned by WS7)
 * must agree with it on the golden vectors in __vectors__/.
 *
 * Compatibility: the ride flow still sends the v1 fields the live server
 * checks today (`hits` >= 10, `elapsed_ms`, `seed`, `score`). `hits` is the
 * legacy count (a golden counts double), which is always >= 10 on a ride win.
 */

import { buildBurst, type BurstInput, type Timeline, type WalkBoost, type WhackThemeId } from './timeline';
import {
  E_BRUISER, E_HIT, E_RESUME, TAP_SWIPE, createSim, simAdvanceTo, simBank, simResult, simSwipe, simTap, simUnfreeze,
  type BurstCarry, type BurstResult,
} from './sim';
import type { Difficulty, WhackFormat } from './waves';

export interface WhackProofV2 {
  game: 'tap';
  v: 2;
  seed: number;
  format: WhackFormat;
  burst: number;
  difficulty: Difficulty;
  theme: WhackThemeId;
  unlock_level: number;
  xform: number;
  walk_boost: WalkBoost;
  incoming?: { match_seed: number; sender_event_ids: number[] } | null;
  carry: { meter: number; fever_left: number; streak: number };
  elapsed_ms: number;
  wall_ms: number;
  taps: [number, number, number][];
  swipes: [number, number][];
  interrupts: [number, number, string][];
  result: { score: number; meter: number; win: boolean; hits: number; maxStreak: number; stars: number; freezes: number };
  client: { build: string; fps_p5: number | null; walking?: boolean };
}

export function proofInput(p: WhackProofV2): BurstInput {
  return {
    seed: p.seed >>> 0,
    burstIndex: p.burst,
    format: p.format,
    difficulty: p.difficulty,
    theme: p.theme,
    unlockLevel: p.unlock_level,
    xform: p.xform,
    walkBoost: p.walk_boost,
    incoming: p.incoming ? { matchSeed: p.incoming.match_seed, senderEventIds: p.incoming.sender_event_ids } : null,
  };
}

export function buildProof(tl: Timeline, carry: BurstCarry, taps: number[], res: BurstResult, extra: {
  wallMs: number; interrupts?: [number, number, string][]; build?: string; fpsP5?: number | null; walking?: boolean;
}): WhackProofV2 {
  const triples: [number, number, number][] = [];
  const swipes: [number, number][] = [];
  for (let i = 0; i + 2 < taps.length; i += 3) {
    triples.push([taps[i], taps[i + 1], taps[i + 2]]);
    if (taps[i + 2] & TAP_SWIPE) swipes.push([taps[i], taps[i + 1]]);
  }
  const inp = tl.input;
  return {
    game: 'tap',
    v: 2,
    seed: inp.seed >>> 0,
    format: inp.format,
    burst: inp.burstIndex,
    difficulty: inp.difficulty,
    theme: inp.theme,
    unlock_level: inp.unlockLevel,
    xform: (inp.xform ?? 0) & 7,
    walk_boost: inp.walkBoost ?? null,
    incoming: inp.incoming ? { match_seed: inp.incoming.matchSeed, sender_event_ids: inp.incoming.senderEventIds } : null,
    carry: { meter: carry.meter, fever_left: carry.feverLeft, streak: carry.streak },
    elapsed_ms: res.elapsedMs,
    wall_ms: Math.round(extra.wallMs),
    taps: triples,
    swipes,
    interrupts: extra.interrupts ?? [],
    result: {
      score: res.score, meter: res.meter, win: res.win, hits: res.legacyHits, maxStreak: res.maxStreak,
      stars: res.stars, freezes: res.freezes,
    },
    client: { build: extra.build ?? 'dev', fps_p5: extra.fpsP5 ?? null, walking: extra.walking },
  };
}

export interface ReplayDetail {
  result: BurstResult;
  /** Reaction (ms after emerge) of each counted hit, excluding hits within 600 ms of a resume. */
  reactions: number[];
  reachedEnd: boolean;
}

/** Replay a proof's tap log and collect reaction times for the plausibility filters. */
export function replayProof(p: WhackProofV2): ReplayDetail {
  const tl = buildBurst(proofInput(p));
  const s = createSim(tl, { meter: p.carry?.meter ?? 0, feverLeft: p.carry?.fever_left ?? 0, streak: p.carry?.streak ?? 0 }, true);
  const reactions: number[] = [];
  let lastResume = -99999;
  let reachedEnd = true;
  const drain = () => {
    for (let i = 0; i < s.ev.length; i += 5) {
      const k = s.ev[i];
      if (k === E_RESUME) lastResume = s.ev[i + 4];
      if (k === E_HIT || k === E_BRUISER) {
        const h = s.ev[i + 1];
        const t = s.ev[i + 4];
        const e = s.hEv[h];
        if (e >= 0 && t - lastResume > 600) reactions.push(t - s.evEmerge[e]);
      }
    }
    s.ev.length = 0;
  };
  for (const [gt, hole, flags] of p.taps.slice(0, 400)) {
    simAdvanceTo(s, gt);
    drain();
    if (s.ended) break;
    if (s.t !== gt) { reachedEnd = false; break; }
    if (hole < 0) simUnfreeze(s);
    else if (flags & TAP_SWIPE) simSwipe(s, hole);
    else simTap(s, hole);
    drain();
  }
  if (!s.ended && reachedEnd) {
    simAdvanceTo(s, Math.min(p.elapsed_ms, tl.lengthMs));
    if (!s.ended && p.elapsed_ms < tl.lengthMs && s.t >= p.elapsed_ms) simBank(s);
    drain();
  }
  return { result: simResult(s), reactions, reachedEnd };
}

export type ProofVerdict = { ok: true; result: BurstResult; flagged: string | null } | { ok: false; reason: string; result?: BurstResult };

function mean(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
}

/** Human plausibility (11.2 step 5). Returns a reason string or null. */
export function plausibility(p: WhackProofV2, detail: ReplayDetail): string | null {
  const r = detail.reactions;
  if (r.length >= 5 && r.filter((x) => x < 170).length / r.length > 0.35) return 'reaction';
  if (r.length >= 10) {
    const m = mean(r);
    const sd = Math.sqrt(mean(r.map((x) => (x - m) * (x - m))));
    if (sd < 25) return 'robotic';
  }
  let fastJumps = 0;
  const taps = p.taps.filter((t) => t[1] >= 0 && !(t[2] & TAP_SWIPE));
  for (let i = 1; i < taps.length; i++) {
    const [t0, h0] = taps[i - 1];
    const [t1, h1] = taps[i];
    const dr = Math.abs(Math.floor(h0 / 3) - Math.floor(h1 / 3));
    const dc = Math.abs((h0 % 3) - (h1 % 3));
    if (Math.max(dr, dc) > 1 && t1 - t0 < 60) fastJumps++;
  }
  if (fastJumps > 3) return 'jumps';
  return null;
}

/**
 * Reference verifier. `serverSeed` is the attempt seed (HMAC) for ride proofs;
 * `profileUnlock` the server profile's lifetime Bursts; `attemptAgeMs` the
 * attempt age. Ride-coin wins get a 422-style rejection on plausibility; other
 * formats are flagged (shadow leaderboard), never rejected for it.
 */
export function verifyProof(p: WhackProofV2, ctx: { serverSeed?: number; profileUnlock?: number; attemptAgeMs?: number } = {}): ProofVerdict {
  if (!p || p.game !== 'tap' || p.v !== 2 || !Array.isArray(p.taps)) return { ok: false, reason: 'shape' };
  if (ctx.serverSeed != null && (p.seed >>> 0) !== (ctx.serverSeed >>> 0)) return { ok: false, reason: 'seed' };
  if (ctx.profileUnlock != null && p.unlock_level > ctx.profileUnlock) return { ok: false, reason: 'unlock' };
  if (p.taps.length > 400) return { ok: false, reason: 'taps' };
  for (let i = 1; i < p.taps.length; i++) if (p.taps[i][0] < p.taps[i - 1][0]) return { ok: false, reason: 'order' };
  if (ctx.attemptAgeMs != null && p.wall_ms > ctx.attemptAgeMs + 5000) return { ok: false, reason: 'age' };
  if (p.wall_ms + 1500 < p.elapsed_ms * 0.3) return { ok: false, reason: 'wall' };
  const detail = replayProof(p);
  if (!detail.reachedEnd) return { ok: false, reason: 'replay', result: detail.result };
  const res = detail.result;
  const c = p.result;
  if (c.score !== res.score || c.win !== res.win || c.hits !== res.legacyHits || c.maxStreak !== res.maxStreak || c.freezes !== res.freezes) {
    return { ok: false, reason: 'mismatch', result: res };
  }
  if (p.format === 'ride' && c.win && !(res.win && res.winAt <= 30000)) return { ok: false, reason: 'ride', result: res };
  const implausible = plausibility(p, detail);
  if (implausible) {
    if (p.format === 'ride' && res.win) return { ok: false, reason: implausible, result: res };
    return { ok: true, result: res, flagged: implausible };
  }
  return { ok: true, result: res, flagged: null };
}

export const WHACK_PROOF_ERROR = 'This Whack-a-Shark result could not be verified. Replay the challenge.';
