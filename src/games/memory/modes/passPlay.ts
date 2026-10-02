/**
 * modes/passPlay.ts: Pass & Play Classic (design 4.6).
 *
 * 2-4 players on one phone, turn based. Match = go again. A miss holds both
 * cards up until the player taps (or the hold max), then the phone passes.
 * Each player's knowledge is their own flips; the table's knowledge drives the
 * forced-new-card rule that kills the Concentration stall: while unseen cards
 * remain, if your first flip is a table-known card, your second flip may only
 * be its known partner or a card nobody has seen yet.
 *
 * Pure and deterministic (layout passed in), so it is fully unit tested.
 */

export interface PPPlayer {
  pairs: number;
  turns: number;
  recalls: number;
  bestRun: number;
}

export interface PPState {
  n: number;
  /** faces[slot] (the layout is local: one phone, one table). */
  faces: number[];
  matched: boolean[];
  /** Somebody at the table has seen this card face up. */
  tableSeen: boolean[];
  /** seen[player][slot]: this player flipped it. */
  seen: boolean[][];
  players: PPPlayer[];
  current: number;
  /** 0 idle, 1 one up, 2 miss hold, 3 over. */
  phase: number;
  a: number;
  b: number;
  run: number;
  /** The rule has been shown once this game ("Try a new card!"). */
  ruleShown: boolean;
  /** The first card of this turn was already known to the table before its flip. */
  aKnown: boolean;
  turn: number;
}

export type PPEvent =
  | { k: 'flip'; slot: number; player: number }
  | { k: 'blocked'; slot: number; reason: 'forced' }
  | { k: 'rule'; allowed: number[] }
  | { k: 'match'; a: number; b: number; player: number; recall: boolean; run: number }
  | { k: 'miss'; a: number; b: number; player: number }
  | { k: 'hide'; a: number; b: number }
  | { k: 'pass'; from: number; to: number }
  | { k: 'over'; ranking: number[][] };

export function createPassPlay(faces: readonly number[], players: number): PPState {
  const n = faces.length;
  const p = Math.max(2, Math.min(4, players));
  return {
    n,
    faces: faces.slice(),
    matched: new Array(n).fill(false),
    tableSeen: new Array(n).fill(false),
    seen: Array.from({ length: p }, () => new Array(n).fill(false)),
    players: Array.from({ length: p }, () => ({ pairs: 0, turns: 0, recalls: 0, bestRun: 0 })),
    current: 0,
    phase: 0,
    a: -1,
    b: -1,
    run: 0,
    ruleShown: false,
    aKnown: false,
    turn: 0,
  };
}

function partnerOf(s: PPState, slot: number): number {
  for (let i = 0; i < s.n; i++) if (i !== slot && s.faces[i] === s.faces[slot]) return i;
  return -1;
}

function anyUnseen(s: PPState): boolean {
  for (let i = 0; i < s.n; i++) if (!s.matched[i] && !s.tableSeen[i]) return true;
  return false;
}

/** Forced-new-card rule, computed from the table's knowledge before the first flip. */
export function forcedSet(s: PPState, a: number, aWasKnown: boolean): number[] {
  if (!aWasKnown || !anyUnseen(s)) return [];
  const out: number[] = [];
  const p = partnerOf(s, a);
  for (let i = 0; i < s.n; i++) {
    if (i === a || s.matched[i]) continue;
    if (!s.tableSeen[i] || (i === p && s.tableSeen[p])) out.push(i);
  }
  return out;
}

export interface PPStepResult {
  events: PPEvent[];
  /** Allowed second flips while the forced rule is active (empty = any). */
  allowed: number[];
}

export function ppFlip(s: PPState, slot: number): PPStepResult {
  const events: PPEvent[] = [];
  if (s.phase === 3 || slot < 0 || slot >= s.n || s.matched[slot]) return { events, allowed: [] };
  if (s.phase === 2) {
    // Tapping during a miss hold resolves it (and passes the phone); the tap is spent.
    return { events: ppDismiss(s), allowed: [] };
  }
  const who = s.current;
  if (s.phase === 0) {
    s.aKnown = s.tableSeen[slot];
    s.a = slot;
    s.phase = 1;
    s.seen[who][slot] = true;
    s.tableSeen[slot] = true;
    events.push({ k: 'flip', slot, player: who });
    const allowed = forcedSet(s, slot, s.aKnown);
    if (allowed.length) {
      // The view shows "Try a new card!" the first time the rule triggers.
      if (!s.ruleShown) { s.ruleShown = true; events.push({ k: 'rule', allowed }); }
    }
    return { events, allowed };
  }
  // Second flip.
  if (slot === s.a) return { events, allowed: [] };
  const allowed = forcedSet(s, s.a, s.aKnown);
  if (allowed.length && allowed.indexOf(slot) < 0) {
    events.push({ k: 'blocked', slot, reason: 'forced' });
    return { events, allowed };
  }
  // A recall: this player had flipped the card they are matching before.
  const knewPartner = s.seen[who][slot];
  s.b = slot;
  s.seen[who][slot] = true;
  s.tableSeen[slot] = true;
  s.players[who].turns += 1;
  s.turn += 1;
  events.push({ k: 'flip', slot, player: who });
  if (s.faces[slot] === s.faces[s.a]) {
    s.matched[s.a] = true;
    s.matched[slot] = true;
    s.run += 1;
    const pl = s.players[who];
    pl.pairs += 1;
    if (knewPartner) pl.recalls += 1;
    pl.bestRun = Math.max(pl.bestRun, s.run);
    events.push({ k: 'match', a: s.a, b: slot, player: who, recall: knewPartner, run: s.run });
    s.phase = 0;
    s.a = -1;
    s.b = -1;
    if (s.matched.every(Boolean)) {
      s.phase = 3;
      events.push({ k: 'over', ranking: ranking(s) });
    }
    return { events, allowed: [] };
  }
  s.phase = 2;
  events.push({ k: 'miss', a: s.a, b: slot, player: who });
  return { events, allowed: [] };
}

/** Resolve a miss hold: flip both back and pass the phone. */
export function ppDismiss(s: PPState): PPEvent[] {
  if (s.phase !== 2) return [];
  const events: PPEvent[] = [{ k: 'hide', a: s.a, b: s.b }];
  const from = s.current;
  s.current = (s.current + 1) % s.players.length;
  s.phase = 0;
  s.a = -1;
  s.b = -1;
  s.run = 0;
  events.push({ k: 'pass', from, to: s.current });
  return events;
}

/** Players grouped by place: most pairs first; ties share a place. */
export function ranking(s: PPState): number[][] {
  const order = s.players.map((p, i) => ({ i, p })).sort((x, y) => y.p.pairs - x.p.pairs || x.i - y.i);
  const out: number[][] = [];
  let last = -1;
  for (const o of order) {
    if (o.p.pairs !== last) out.push([]);
    out[out.length - 1].push(o.i);
    last = o.p.pairs;
  }
  return out;
}
