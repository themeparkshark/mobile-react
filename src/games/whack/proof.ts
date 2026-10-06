/**
 * proof.ts: Whack-a-Shark proof v5 (design v5 13; v4 proofs still verify with the v4 rules). One proof per Burst; a Run
 * submits an array. The server rebuilds the timeline from the seed, replays
 * the tap log and trusts only its own result (the client's is a checksum).
 *
 * `verifyProof` is the reference verifier: node tests run it, and the PHP port
 * (App\Domains\Game\Services\Whack\{Timeline,Resolver,Plausibility}.php, owned
 * by WS7) must agree with it on the golden vectors in __vectors__/.
 *
 * v4 policy (13.2, 13.3):
 *   - 422 only for structural impossibilities (seed, unlock, version, replay
 *     mismatch, a ride win without 100% inside 30s, wall time, malformed log).
 *   - Every plausibility finding is a shadow flag, never a rejection. A
 *     flagged ride win still grants the coin. Timing regularity alone never
 *     flags: F2 (Fitts coupling) is waived for an on-beat player (F3).
 *
 * Compatibility: the ride flow still sends the v1 fields the live server
 * checks today (`hits` >= 10, `elapsed_ms`, `seed`, `score`). `hits` is the
 * legacy count (a golden counts double), which is always >= 10 on a ride win.
 * v2 and v3 were studio builds that never shipped, so no proof of theirs exists.
 */

import { buildBurst, type BurstInput, type Timeline, type WalkBoost, type WhackThemeId } from './timeline';
import {
  E_BRUISER, E_HIT, E_RESUME, TAP_ANTICIPATED, TAP_SWIPE, createSim, simAdvanceTo, simBank, simResult, simSwipe, simTap,
  simUnfreeze, type BurstCarry, type BurstResult,
} from './sim';
import { EIGHTH_MS, MAX_TAPS, type Difficulty, type WhackFormat } from './waves';

/** [gameTimeMs, hole, flags, dx, dy, subFrameMs] (13.1). */
export type ProofTap = [number, number, number, number, number, number];

export interface WhackProofV4 {
  game: 'tap';
  /** 5 = current rules (v5 resolver); 4 = a v4 proof, replayed with the v4 rules. */
  v: 4 | 5;
  seed: number;
  format: WhackFormat;
  burst: number;
  difficulty: Difficulty;
  theme: WhackThemeId;
  unlock_level: number;
  xform: number;
  walk_boost: WalkBoost;
  run_of_day: number;
  /** This Burst opened with GO FEVER (banked fever fired in the breather): the Burst index, or null. */
  fever_fired_burst: number | null;
  /** The Champ (Wave 2): game time of the wake bonk, or null. */
  wake_at: number | null;
  /** v5: Boss Run finales enabled (Wave 2 flag; false in the Wave 1 build). */
  boss_runs?: boolean;
  incoming?: { match_seed: number; sender_event_ids: number[] } | null;
  carry: { meter: number; fever_left: number; streak: number; fever_ready: boolean };
  elapsed_ms: number;
  wall_ms: number;
  taps: ProofTap[];
  swipes: [number, number][];
  /** Live round splat landings [landGt, hole, senderSeat, eventId] (Wave 2). */
  splats_in: [number, number, number, number][];
  interrupts: [number, number, string][];
  /** [gameTimeMs, serverElapsedMs, hash of taps so far] (best-effort; missing anchors never flag). */
  anchors: [number, number, string][];
  result: { score: number; meter: number; win: boolean; hits: number; maxStreak: number; stars: number; freezes: number };
  client: { build: string; fps_p5: number | null; hz?: number | null; perf_tier?: string; thermal_max?: string; walking?: boolean };
}

/** Kept as aliases so older imports keep compiling. */
export type WhackProofV2 = WhackProofV4;
export type WhackProofV5 = WhackProofV4;
/** Proof versions the verifier replays (13.1: the server keeps accepting v4). */
export const PROOF_VERSIONS = [4, 5] as const;

export function proofInput(p: WhackProofV4): BurstInput {
  return {
    seed: p.seed >>> 0,
    burstIndex: p.burst,
    format: p.format,
    difficulty: p.difficulty,
    theme: p.theme,
    unlockLevel: p.unlock_level,
    xform: p.xform,
    walkBoost: p.walk_boost,
    runOfDay: p.run_of_day ?? 0,
    feverFired: p.fever_fired_burst != null,
    incoming: p.incoming ? { matchSeed: p.incoming.match_seed, senderEventIds: p.incoming.sender_event_ids } : null,
    rules: p.v === 4 ? 4 : 5,
    bossRuns: !!p.boss_runs,
  };
}

/** FNV-1a 32 over the tap log so far (anchor hash; the server stores its own receive time beside it). */
export function tapsHash(taps: ProofTap[] | number[][], count = taps.length): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < count && i < taps.length; i++) {
    const t = taps[i];
    for (let k = 0; k < 3; k++) {
      let v = (t[k] | 0) >>> 0;
      for (let b = 0; b < 4; b++) {
        h ^= v & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
        v >>>= 8;
      }
    }
  }
  return h.toString(16).padStart(8, '0');
}

export function buildProof(tl: Timeline, carry: BurstCarry, taps: number[], res: BurstResult, extra: {
  wallMs: number; pos?: number[]; interrupts?: [number, number, string][]; anchors?: [number, number, string][];
  build?: string; fpsP5?: number | null; hz?: number | null; perfTier?: string; thermalMax?: string; walking?: boolean;
}): WhackProofV4 {
  const out: ProofTap[] = [];
  const swipes: [number, number][] = [];
  const pos = extra.pos ?? [];
  for (let i = 0, j = 0; i + 2 < taps.length; i += 3, j += 3) {
    out.push([taps[i], taps[i + 1], taps[i + 2], pos[j] ?? 0, pos[j + 1] ?? 0, pos[j + 2] ?? 0]);
    if (taps[i + 2] & TAP_SWIPE) swipes.push([taps[i], taps[i + 1]]);
  }
  const inp = tl.input;
  return {
    game: 'tap',
    v: tl.rules === 4 ? 4 : 5,
    seed: inp.seed >>> 0,
    format: inp.format,
    burst: inp.burstIndex,
    difficulty: inp.difficulty,
    theme: inp.theme,
    unlock_level: inp.unlockLevel,
    xform: (inp.xform ?? 0) & 7,
    walk_boost: inp.walkBoost === 'golden' ? 'golden' : null,
    run_of_day: inp.runOfDay ?? 0,
    fever_fired_burst: tl.feverStart ? inp.burstIndex : null,
    wake_at: null,
    boss_runs: !!inp.bossRuns,
    incoming: inp.incoming ? { match_seed: inp.incoming.matchSeed, sender_event_ids: inp.incoming.senderEventIds } : null,
    carry: { meter: carry.meter, fever_left: carry.feverLeft, streak: carry.streak, fever_ready: !!carry.feverReady },
    elapsed_ms: res.elapsedMs,
    wall_ms: Math.round(extra.wallMs),
    taps: out,
    swipes,
    splats_in: [],
    interrupts: extra.interrupts ?? [],
    anchors: extra.anchors ?? [],
    result: {
      score: res.score, meter: res.meter, win: res.win, hits: res.legacyHits, maxStreak: res.maxStreak,
      stars: res.stars, freezes: res.freezes,
    },
    client: {
      build: extra.build ?? 'dev', fps_p5: extra.fpsP5 ?? null, hz: extra.hz ?? null, perf_tier: extra.perfTier,
      thermal_max: extra.thermalMax, walking: extra.walking,
    },
  };
}

/** One counted hit, for the plausibility features. */
export interface HitSample {
  /** Game time of the bonk. */
  t: number;
  hole: number;
  /** ms after emerge (0 for an anticipated QUICK). */
  reaction: number;
  /** Distance in cells from the previous tap's well (null for the first). */
  dist: number | null;
  dx: number;
  dy: number;
  sub: number;
}

export interface ReplayDetail {
  result: BurstResult;
  /** Reaction (ms after emerge) of each counted hit, excluding hits within 600 ms of a resume. */
  reactions: number[];
  hits: HitSample[];
  reachedEnd: boolean;
}

function cellDist(a: number, b: number): number {
  const dr = Math.floor(a / 3) - Math.floor(b / 3);
  const dc = (a % 3) - (b % 3);
  return Math.sqrt(dr * dr + dc * dc);
}

/** Replay a proof's tap log and collect hit samples for the plausibility features. */
export function replayProof(p: WhackProofV4): ReplayDetail {
  const tl = buildBurst(proofInput(p));
  const s = createSim(tl, {
    meter: p.carry?.meter ?? 0, feverLeft: p.carry?.fever_left ?? 0, streak: p.carry?.streak ?? 0, feverReady: !!p.carry?.fever_ready,
  }, true);
  const reactions: number[] = [];
  const hits: HitSample[] = [];
  let lastResume = -99999;
  let reachedEnd = true;
  let prevHole = -1;
  let cur: ProofTap | null = null;
  const drain = () => {
    for (let i = 0; i < s.ev.length; i += 5) {
      const k = s.ev[i];
      if (k === E_RESUME) lastResume = s.ev[i + 4];
      if (k === E_HIT || k === E_BRUISER) {
        const h = s.ev[i + 1];
        const t = s.ev[i + 4];
        const e = s.hEv[h];
        if (e >= 0 && t - lastResume > 600 && cur && cur[1] === h) {
          const reaction = Math.max(0, t - s.evEmerge[e]);
          reactions.push(reaction);
          hits.push({ t, hole: h, reaction, dist: null, dx: cur[3] ?? 0, dy: cur[4] ?? 0, sub: cur[5] ?? 0 });
        }
      }
    }
    s.ev.length = 0;
  };
  for (const tap of p.taps.slice(0, MAX_TAPS)) {
    const [gt, hole, flags] = tap;
    cur = null;
    simAdvanceTo(s, gt);
    drain();
    if (s.ended) break;
    if (s.t !== gt) { reachedEnd = false; break; }
    cur = tap;
    const before = hits.length;
    if (hole < 0) simUnfreeze(s);
    else if (flags & TAP_SWIPE) simSwipe(s, hole);
    else simTap(s, hole, tap[3] ?? 0, tap[4] ?? 0, tap[5] ?? 0);
    drain();
    if (hits.length > before && prevHole >= 0) hits[hits.length - 1].dist = cellDist(prevHole, hole);
    if (hole >= 0 && !(flags & TAP_SWIPE)) prevHole = hole;
  }
  if (!s.ended && reachedEnd) {
    simAdvanceTo(s, Math.min(p.elapsed_ms, tl.lengthMs));
    if (!s.ended && p.elapsed_ms < tl.lengthMs && s.t >= p.elapsed_ms) simBank(s);
    drain();
  }
  return { result: simResult(s), reactions, hits, reachedEnd };
}

export type ProofVerdict = { ok: true; result: BurstResult; flagged: string | null; features?: PlausibilityReport }
  | { ok: false; reason: string; result?: BurstResult };

function mean(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
}
function sd(a: number[]): number {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) * (x - m))));
}

export interface PlausibilityReport {
  /** F1 position entropy: SD of dx, dy in cells, and the share of hits dead centre. */
  posSd: [number, number];
  centreShare: number;
  /** F2 Fitts slope (ms per cell) and reaction SD over hits with a previous tap. */
  fittsSlope: number | null;
  reactionSd: number;
  /** F3: mean absolute error to the 16th grid and its SD (ms). */
  beatErr: number;
  beatSd: number;
  onBeat: boolean;
  /** F4 Kolmogorov-Smirnov D of sub-frame stamps vs uniform, and its p<0.001 critical value. */
  subD: number | null;
  subCrit: number | null;
  flags: string[];
}

/**
 * Minimum samples for a feature. The design says 10+, but a ride win needs as
 * few as 10 bonks (a QUICK bot wins with 9 sampled hits), so 8 keeps the
 * ride round covered; the false-flag gate in the tests holds at 8.
 */
export const PLAUS_MIN_HITS = 8;

/** 1/32-cell units -> cells. */
const CELL = 32;

/**
 * Plausibility features F1-F5 (13.3) over hits outside the 600 ms after a
 * resume, on 10+ hits. Returns the report; `flags` empty means clean.
 */
export function plausibility(p: WhackProofV4, detail: ReplayDetail): PlausibilityReport {
  const hits = detail.hits;
  const report: PlausibilityReport = {
    posSd: [0, 0], centreShare: 0, fittsSlope: null, reactionSd: 0, beatErr: 0, beatSd: 0, onBeat: false, subD: null, subCrit: null, flags: [],
  };
  if (hits.length >= PLAUS_MIN_HITS) {
    // F1 position entropy.
    const dxs = hits.map((h) => h.dx / CELL);
    const dys = hits.map((h) => h.dy / CELL);
    report.posSd = [sd(dxs), sd(dys)];
    report.centreShare = hits.filter((h) => Math.abs(h.dx) <= 1 && Math.abs(h.dy) <= 1).length / hits.length;
    if ((report.posSd[0] < 0.04 && report.posSd[1] < 0.04) || report.centreShare > 0.6) report.flags.push('F1');

    // F3 beat phase: error of each bonk to the nearest 16th slot of the Burst grid.
    const g = EIGHTH_MS / 2;
    const errs = hits.map((h) => {
      const k = Math.round(h.t / g);
      return h.t - k * g;
    });
    report.beatErr = mean(errs.map(Math.abs));
    report.beatSd = sd(errs);
    report.onBeat = report.beatErr < 15 && report.beatSd < 15;

    // F2 Fitts coupling: regress reaction on travel distance.
    const pairs = hits.filter((h) => h.dist != null);
    report.reactionSd = sd(hits.map((h) => h.reaction));
    if (pairs.length >= PLAUS_MIN_HITS) {
      const xs = pairs.map((h) => h.dist as number);
      const ys = pairs.map((h) => h.reaction);
      const mx = mean(xs);
      const my = mean(ys);
      let num = 0;
      let den = 0;
      for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
        den += (xs[i] - mx) * (xs[i] - mx);
      }
      report.fittsSlope = den > 1e-9 ? num / den : 0;
      // The slope is only trusted on 12+ samples (a short ride win gives 8-10, where it is noise);
      // below that, reaction regularity that the beat grid does not explain carries F2 alone.
      const flat = pairs.length >= 12 ? report.fittsSlope < 3 : true;
      if (flat && report.reactionSd < 30 && !report.onBeat) report.flags.push('F2');
    }
  }
  // F4 sub-frame stamps: uniform within a frame for real touches.
  const subs = p.taps.filter((t) => t[1] >= 0 && t.length >= 6).map((t) => t[5]);
  if (subs.length >= PLAUS_MIN_HITS) {
    const frame = 16.7;
    const sorted = subs.map((v) => Math.min(1, Math.max(0, (v + 0.5) / frame))).sort((a, b) => a - b);
    let d = 0;
    for (let i = 0; i < sorted.length; i++) {
      d = Math.max(d, Math.abs((i + 1) / sorted.length - sorted[i]), Math.abs(sorted[i] - i / sorted.length));
    }
    report.subD = d;
    report.subCrit = 1.95 / Math.sqrt(sorted.length);
    const constant = subs.every((v) => v === subs[0]);
    if (constant || d > report.subCrit) report.flags.push('F4');
  }
  // F5 anchors: game time can never outrun the server's own clock, and the hash must match the log.
  for (const [gt, serverElapsed, hash] of p.anchors ?? []) {
    let n = 0;
    while (n < p.taps.length && p.taps[n][0] <= gt) n++;
    const slack = 1500;
    if (gt > serverElapsed + slack || tapsHash(p.taps, n) !== hash) {
      report.flags.push('F5');
      break;
    }
  }
  return report;
}

/**
 * Reference verifier. `serverSeed` is the attempt seed (HMAC) for ride proofs;
 * `profileUnlock` the server profile's lifetime Bursts; `attemptAgeMs` the
 * attempt age. Structural problems reject; plausibility only flags (shadow
 * board, coin still granted on a ride win).
 */
export function verifyProof(p: WhackProofV4, ctx: { serverSeed?: number; profileUnlock?: number; attemptAgeMs?: number } = {}): ProofVerdict {
  if (!p || p.game !== 'tap' || (p.v !== 4 && p.v !== 5) || !Array.isArray(p.taps)) return { ok: false, reason: 'shape' };
  if (ctx.serverSeed != null && (p.seed >>> 0) !== (ctx.serverSeed >>> 0)) return { ok: false, reason: 'seed' };
  if (ctx.profileUnlock != null && p.unlock_level > ctx.profileUnlock) return { ok: false, reason: 'unlock' };
  if (p.taps.length > MAX_TAPS) return { ok: false, reason: 'taps' };
  for (let i = 0; i < p.taps.length; i++) {
    const t = p.taps[i];
    if (!Array.isArray(t) || t.length < 3) return { ok: false, reason: 'malformed' };
    if (i > 0 && t[0] < p.taps[i - 1][0]) return { ok: false, reason: 'order' };
    if (t.length >= 6 && (Math.abs(t[3]) > 128 || Math.abs(t[4]) > 128 || t[5] < 0 || t[5] > 16)) return { ok: false, reason: 'malformed' };
  }
  if (p.walk_boost && p.format !== 'queue') return { ok: false, reason: 'walk_boost' };
  if (ctx.attemptAgeMs != null && p.wall_ms > ctx.attemptAgeMs + 5000) return { ok: false, reason: 'age' };
  // Game time never runs faster than the wall clock (slow-mo, freezes and look-ups only slow it down).
  if (p.wall_ms + 1500 < p.elapsed_ms * 0.9) return { ok: false, reason: 'wall' };
  const detail = replayProof(p);
  if (!detail.reachedEnd) return { ok: false, reason: 'replay', result: detail.result };
  const res = detail.result;
  const c = p.result;
  if (c.score !== res.score || c.win !== res.win || c.hits !== res.legacyHits || c.maxStreak !== res.maxStreak || c.freezes !== res.freezes) {
    return { ok: false, reason: 'mismatch', result: res };
  }
  if (p.format === 'ride' && c.win && !(res.win && res.winAt <= 30000)) return { ok: false, reason: 'ride', result: res };
  const report = plausibility(p, detail);
  return { ok: true, result: res, flagged: report.flags.length ? report.flags.join(',') : null, features: report };
}

/** True when a tap carries the anticipated (pre-emerge QUICK) flag. */
export function isAnticipated(t: ProofTap): boolean {
  return (t[2] & TAP_ANTICIPATED) !== 0;
}

export const WHACK_PROOF_ERROR = "That Whack-a-Shark score didn't count. Play the challenge again.";
