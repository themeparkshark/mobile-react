/**
 * modes/stealDuel.ts: Steal Duel, the headline live mode (design v8 4.6).
 *
 * Two players share one board on a fixed seeded layout and every reveal is
 * public: every card you flip teaches your rival. Pure and deterministic
 * (time passed in), so the server (WS7, `POST /memory/steal/{id}/flips`) runs
 * this same reducer and the client replays the event log.
 *
 *   Turns       two flips inside a 4000ms ring (+500ms server grace). A match
 *               goes again with a fresh ring; a miss holds both cards up for
 *               1500ms (everyone sees them) and passes the turn. When the ring
 *               runs out the server flips your remaining card(s) at random
 *               among unseen cards (Mario Party), so stalling is impossible.
 *   Forced      while unseen cards remain, a first flip on a table-known card
 *               must be followed by its known partner or an unseen card.
 *   No slips    a miss is just a miss; nothing punishes re-flipping.
 *   Streak      consecutive turns of yours with at least one match. Pair value
 *               = 100 x (x1 at streak 1, x1.5 at 2, x2 at 3+). A turn with no
 *               match resets your streak to 0.
 *   STEAL       a match where either card was first revealed by your rival
 *               pays +50 and takes their streak (yours + theirs, theirs = 0).
 *   End         all pairs matched; most points wins. A tie goes to Sudden
 *               Death on a fresh 4-card board: the next match wins.
 */

export const TURN_RING_MS = 4000;
export const RING_GRACE_MS = 500;
export const MISS_HOLD_MS = 1500;
export const STEAL_BONUS = 50;
export const PAIR_BASE = 100;

export interface SDPlayer {
  points: number;
  pairs: number;
  streak: number;
  bestStreak: number;
  steals: number;
  /** This turn already had a match (streak counted once per turn). */
  turnMatched: boolean;
  autoFlips: number;
}

export interface SDState {
  n: number;
  faces: number[];
  matched: boolean[];
  /** Who first revealed each slot (-1 nobody yet). */
  firstBy: number[];
  tableSeen: boolean[];
  players: [SDPlayer, SDPlayer];
  current: number;
  /** 0 idle, 1 one up, 2 miss hold, 3 over. */
  phase: number;
  a: number;
  b: number;
  aKnown: boolean;
  /** Ring deadline for the current turn (ms). */
  deadline: number;
  holdUntil: number;
  suddenDeath: boolean;
  /** -1 playing, 0/1 winner, 2 draw. */
  winner: number;
  rng: number;
  /** Flat [player, slot, at, auto] log (proof and replays). */
  log: number[];
  now: number;
  sdSeed: number;
}

export type SDEvent =
  | { k: 'flip'; slot: number; player: number; face: number; auto: boolean }
  | { k: 'blocked'; slot: number; player: number }
  | { k: 'match'; a: number; b: number; player: number; face: number; value: number; streak: number; steal: boolean; took: number; auto: boolean }
  | { k: 'miss'; a: number; b: number; player: number }
  | { k: 'hide'; a: number; b: number }
  | { k: 'pass'; to: number; deadline: number }
  | { k: 'ring'; player: number; deadline: number }
  | { k: 'streakReset'; player: number }
  | { k: 'suddenDeath'; starts: number }
  | { k: 'over'; winner: number; points: [number, number] };

function rand(s: SDState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function player(): SDPlayer {
  return { points: 0, pairs: 0, streak: 0, bestStreak: 0, steals: 0, turnMatched: false, autoFlips: 0 };
}

/** `starts`: who flips first (alternates on rematch). */
export function createStealDuel(faces: readonly number[], seed: number, starts = 0, at = 0): SDState {
  const n = faces.length;
  return {
    n,
    faces: faces.slice(),
    matched: new Array(n).fill(false),
    firstBy: new Array(n).fill(-1),
    tableSeen: new Array(n).fill(false),
    players: [player(), player()],
    current: starts & 1,
    phase: 0,
    a: -1,
    b: -1,
    aKnown: false,
    deadline: at + TURN_RING_MS,
    holdUntil: 0,
    suddenDeath: false,
    winner: -1,
    rng: (seed >>> 0) || 1,
    log: [],
    now: at,
    sdSeed: seed,
  };
}

/** x1 / x1.5 / x2 in halves. */
export function streakHalves(streak: number): number {
  return streak >= 3 ? 4 : streak === 2 ? 3 : 2;
}

export function pairValue(streak: number, steal: boolean): number {
  return (PAIR_BASE * streakHalves(streak)) / 2 + (steal ? STEAL_BONUS : 0);
}

function partnerOf(s: SDState, slot: number): number {
  for (let i = 0; i < s.n; i++) if (i !== slot && s.faces[i] === s.faces[slot]) return i;
  return -1;
}

function anyUnseen(s: SDState): boolean {
  for (let i = 0; i < s.n; i++) if (!s.matched[i] && !s.tableSeen[i]) return true;
  return false;
}

/** Legal second flips under the forced-new-card rule ([] = any). */
export function forcedSet(s: SDState): number[] {
  if (s.phase !== 1 || !s.aKnown || !anyUnseen(s)) return [];
  const p = partnerOf(s, s.a);
  const out: number[] = [];
  for (let i = 0; i < s.n; i++) {
    if (i === s.a || s.matched[i]) continue;
    if (!s.tableSeen[i] || (i === p && s.tableSeen[p])) out.push(i);
  }
  return out;
}

function endTurnNoMatch(s: SDState, ev: SDEvent[]): void {
  const pl = s.players[s.current];
  if (!pl.turnMatched && pl.streak > 0) {
    pl.streak = 0;
    ev.push({ k: 'streakReset', player: s.current });
  }
  pl.turnMatched = false;
}

function pass(s: SDState, ev: SDEvent[], at: number): void {
  endTurnNoMatch(s, ev);
  s.current = 1 - s.current;
  s.phase = 0;
  s.a = -1;
  s.b = -1;
  s.deadline = at + TURN_RING_MS;
  ev.push({ k: 'pass', to: s.current, deadline: s.deadline });
}

function finish(s: SDState, ev: SDEvent[], at: number): void {
  const [p0, p1] = s.players;
  if (s.suddenDeath || p0.points !== p1.points) {
    s.phase = 3;
    s.winner = s.suddenDeath ? s.current : p0.points > p1.points ? 0 : 1;
    ev.push({ k: 'over', winner: s.winner, points: [p0.points, p1.points] });
    return;
  }
  // Tie: Sudden Death on a fresh 4-card board, the next match wins.
  s.suddenDeath = true;
  const pool = Array.from(new Set(s.faces));
  const i1 = Math.floor(rand(s) * pool.length);
  let i2 = Math.floor(rand(s) * Math.max(1, pool.length - 1));
  if (i2 >= i1) i2 += 1;
  const f1 = pool[i1];
  const f2 = pool[Math.min(i2, pool.length - 1)];
  const faces = [f1, f1, f2, f2];
  for (let i = faces.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    const t = faces[i];
    faces[i] = faces[j];
    faces[j] = t;
  }
  s.n = 4;
  s.faces = faces;
  s.matched = [false, false, false, false];
  s.firstBy = [-1, -1, -1, -1];
  s.tableSeen = [false, false, false, false];
  s.current = 1 - s.current;
  s.phase = 0;
  s.a = -1;
  s.b = -1;
  s.deadline = at + TURN_RING_MS;
  ev.push({ k: 'suddenDeath', starts: s.current });
}

function doFlip(s: SDState, slot: number, at: number, auto: boolean, ev: SDEvent[]): void {
  const who = s.current;
  s.log.push(who, slot, at, auto ? 1 : 0);
  if (auto) s.players[who].autoFlips += 1;
  if (s.firstBy[slot] < 0) s.firstBy[slot] = who;
  if (s.phase === 0) {
    s.aKnown = s.tableSeen[slot];
    s.tableSeen[slot] = true;
    s.a = slot;
    s.phase = 1;
    ev.push({ k: 'flip', slot, player: who, face: s.faces[slot], auto });
    return;
  }
  s.tableSeen[slot] = true;
  s.b = slot;
  ev.push({ k: 'flip', slot, player: who, face: s.faces[slot], auto });
  const a = s.a;
  if (s.faces[a] === s.faces[slot]) {
    const pl = s.players[who];
    const rival = s.players[1 - who];
    if (!pl.turnMatched) {
      pl.turnMatched = true;
      pl.streak += 1;
    }
    const steal = s.firstBy[a] === 1 - who || s.firstBy[slot] === 1 - who;
    let took = 0;
    if (steal) {
      took = rival.streak;
      pl.streak += rival.streak;
      rival.streak = 0;
      pl.steals += 1;
    }
    pl.bestStreak = Math.max(pl.bestStreak, pl.streak);
    const value = pairValue(pl.streak, steal);
    pl.points += value;
    pl.pairs += 1;
    s.matched[a] = true;
    s.matched[slot] = true;
    ev.push({ k: 'match', a, b: slot, player: who, face: s.faces[a], value, streak: pl.streak, steal, took, auto });
    s.phase = 0;
    s.a = -1;
    s.b = -1;
    if (s.suddenDeath || s.matched.every(Boolean)) {
      finish(s, ev, at);
      return;
    }
    // Go again with a fresh ring.
    s.deadline = at + TURN_RING_MS;
    ev.push({ k: 'ring', player: who, deadline: s.deadline });
    return;
  }
  s.phase = 2;
  s.holdUntil = at + MISS_HOLD_MS;
  ev.push({ k: 'miss', a, b: slot, player: who });
}

/** A flip by `who` at `at`. Off-turn, illegal or stale flips are ignored (or `blocked`). */
export function sdFlip(s: SDState, who: number, slot: number, at: number): SDEvent[] {
  const ev = sdTick(s, at);
  if (s.phase === 3 || who !== s.current || slot < 0 || slot >= s.n || s.matched[slot]) return ev;
  if (s.phase === 2) return ev;
  if (s.phase === 1 && slot === s.a) return ev;
  if (s.phase === 1) {
    const allowed = forcedSet(s);
    if (allowed.length && allowed.indexOf(slot) < 0) {
      ev.push({ k: 'blocked', slot, player: who });
      return ev;
    }
  }
  doFlip(s, slot, at, false, ev);
  return ev;
}

/** The player who missed taps to flip back early (the turn passes now). */
export function sdDismiss(s: SDState, who: number, at: number): SDEvent[] {
  const ev = sdTick(s, at);
  if (s.phase !== 2 || who !== s.current) return ev;
  ev.push({ k: 'hide', a: s.a, b: s.b });
  pass(s, ev, at);
  return ev;
}

function autoPick(s: SDState): number {
  const pool: number[] = [];
  for (let i = 0; i < s.n; i++) if (!s.matched[i] && i !== s.a && !s.tableSeen[i]) pool.push(i);
  if (!pool.length) for (let i = 0; i < s.n; i++) if (!s.matched[i] && i !== s.a) pool.push(i);
  return pool.length ? pool[Math.floor(rand(s) * pool.length)] : -1;
}

/** Advance time: miss holds resolve, and an expired ring (plus grace) auto-flips. */
export function sdTick(s: SDState, at: number): SDEvent[] {
  const ev: SDEvent[] = [];
  if (at < s.now) return ev;
  s.now = at;
  for (let guard = 0; guard < 8 && s.phase !== 3; guard++) {
    if (s.phase === 2) {
      if (at < s.holdUntil) break;
      const t = s.holdUntil;
      ev.push({ k: 'hide', a: s.a, b: s.b });
      pass(s, ev, t);
      continue;
    }
    if (at < s.deadline + RING_GRACE_MS) break;
    const t = s.deadline + RING_GRACE_MS;
    // Mario Party: the server flips your remaining card(s) for you.
    const first = autoPick(s);
    if (first < 0) break;
    doFlip(s, first, t, true, ev);
    if (s.phase === 1) {
      const allowed = forcedSet(s);
      let second = autoPick(s);
      if (allowed.length && allowed.indexOf(second) < 0) second = allowed[Math.floor(rand(s) * allowed.length)];
      if (second >= 0) doFlip(s, second, t, true, ev);
    }
  }
  return ev;
}

/** Replay a duel log (proof, ghost replays, the rival's flips on my phone). */
export function sdReplay(faces: readonly number[], seed: number, starts: number, log: readonly number[]): SDState {
  const s = createStealDuel(faces, seed, starts, 0);
  for (let i = 0; i + 3 < log.length; i += 4) {
    const [who, slot, at, auto] = [log[i], log[i + 1], log[i + 2], log[i + 3]];
    if (auto) {
      sdTick(s, at);
      continue;
    }
    if (s.phase === 2 && s.current === who) sdDismiss(s, who, at);
    sdFlip(s, who, slot, at);
  }
  return s;
}

// -----------------------------------------------------------------------------
// The house shark (practice rival when nobody is in the line; never a fake person)
// -----------------------------------------------------------------------------

export interface SDBotProfile {
  /** Chance it uses a pair the table has seen. */
  recall: number;
  minMs: number;
  maxMs: number;
}

export const HOUSE_SHARK: SDBotProfile = { recall: 0.78, minMs: 650, maxMs: 1250 };

/** The bot only sees what the table saw (public reveals), never the layout. */
export function sdBotPick(s: SDState, recall: number, r: () => number): number {
  const known = new Map<number, number[]>();
  const unseen: number[] = [];
  for (let i = 0; i < s.n; i++) {
    if (s.matched[i] || (s.phase === 1 && i === s.a)) continue;
    if (s.tableSeen[i]) known.set(s.faces[i], [...(known.get(s.faces[i]) ?? []), i]);
    else unseen.push(i);
  }
  const any = (xs: number[]) => xs[Math.floor(r() * xs.length)];
  if (s.phase === 1) {
    const p = (known.get(s.faces[s.a]) ?? [])[0];
    if (p != null && r() < recall) return p;
    const allowed = forcedSet(s);
    if (allowed.length) return any(allowed.filter((x) => x !== p).length ? allowed.filter((x) => x !== p) : allowed);
    return unseen.length ? any(unseen) : any([...known.values()].flat());
  }
  for (const slots of known.values()) if (slots.length >= 2 && r() < recall) return slots[0];
  return unseen.length ? any(unseen) : any([...known.values()].flat());
}
