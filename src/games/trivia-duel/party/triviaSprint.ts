/**
 * triviaSprint.ts: the Line Party "Trivia Sprint" round (Trivia Duel live, design
 * 4.5 / 10), as a pure, integer-only simulation shared with the server.
 *
 * Every phone in a line room builds the same 3-question timeline from the
 * server's seed, answers on its own board and submits a tap log of
 * [ms since GO, choice]. The server runs a line-for-line PHP port
 * (TriviaSprintSim, to be added next to BonkRaceSim by the backend owner) and
 * the golden vectors in tools/tests/fixtures/party/trivia_sprint_vectors.json
 * keep the two ports identical.
 *
 * Content is only the verified opening-year fact table, so the server needs no
 * authored question pool: True or Tall Tale, "which opened first" pairs and
 * 3-way Which Opened First. Answers stay face-down until each unlock; a lock is
 * final; speed is points; the streak multiplies.
 *
 * Rules for this file: integers only, no Math.random, no Date, no floats in
 * state. Math.floor only on non-negative values (equals PHP intdiv).
 * Walk-safe: taps before the unlock guard or on a spent question are ignored,
 * never punished (a bump in line costs nothing).
 */

export const TRIVIA_SPRINT_VERSION = 1;
export const QUESTIONS = 3;
export const SLOT_MS = 9000;
export const FIRST_SHOW_MS = 400;
export const READ_MS = 1200;
export const JITTER_MAX = 250;
export const WINDOW_MS = 6500;
export const GUARD_MS = 120;
export const GRACE_MS = 600;
export const HORIZON_MS = 5000;
export const ROUND_MS = FIRST_SHOW_MS + QUESTIONS * SLOT_MS;
export const MAX_TAPS = 60;

/** Verified facts (mirrors engine/facts.ts: id, short label, opening year). */
export const SPRINT_FACTS: readonly [string, string, number][] = [
  ['dl-park', 'Disneyland', 1955],
  ['dl-matterhorn', 'Matterhorn Bobsleds', 1959],
  ['ush-tour', 'the Universal Studio Tour', 1964],
  ['dl-pirates', 'Pirates of the Caribbean', 1967],
  ['dl-mansion', 'Disneyland’s Haunted Mansion', 1969],
  ['mk-space', 'Magic Kingdom’s Space Mountain', 1975],
  ['dl-space', 'Disneyland’s Space Mountain', 1977],
  ['ak-park', 'Disney’s Animal Kingdom', 1998],
  ['dca-park', 'Disney California Adventure', 2001],
];

export type SprintKind = 'truetale' | 'pair' | 'opened';

export interface SprintQuestion {
  id: number;
  kind: SprintKind;
  /** Fact indices shown (truetale: 1, pair: 2, opened: 3), in display order. */
  facts: number[];
  /** truetale: year shift (0 = TRUE). */
  shift: number;
  choices: number;
  correct: number;
  showAt: number;
  unlockAt: number;
  closeAt: number;
}

/** [ms since GO, choice] */
export type SprintTap = [number, number];

export interface SprintResult {
  score: number;
  hits: number;
  maxStreak: number;
  /** per question: chosen index or -1 */
  picks: number[];
  /** per question: lock ms from unlock or -1 */
  reactions: number[];
  /** per question: points */
  points: number[];
}

/** mulberry32 (identical to bonkRace.rng and the PHP Mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

function pickDistinct(next: () => number, n: number, minGap: number): number[] {
  // Draw n distinct fact indices whose years are at least minGap apart.
  for (let attempt = 0; attempt < 50; attempt++) {
    const out: number[] = [];
    let guard = 0;
    while (out.length < n && guard < 40) {
      guard++;
      const k = next() % SPRINT_FACTS.length;
      let ok = true;
      for (const o of out) if (o === k || Math.abs(SPRINT_FACTS[o][2] - SPRINT_FACTS[k][2]) < minGap) ok = false;
      if (ok) out.push(k);
    }
    if (out.length === n) return out;
  }
  return [0, 4, 8].slice(0, n);
}

export function buildQuestions(seed: number): SprintQuestion[] {
  const next = rng(seed);
  const qs: SprintQuestion[] = [];
  const used: number[] = [];
  for (let i = 0; i < QUESTIONS; i++) {
    const kind: SprintKind = i === 0 ? 'truetale' : i === 1 ? 'pair' : 'opened';
    const showAt = FIRST_SHOW_MS + i * SLOT_MS;
    const unlockAt = showAt + READ_MS + (next() % (JITTER_MAX + 1));
    const closeAt = unlockAt + WINDOW_MS;
    if (kind === 'truetale') {
      let f = next() % SPRINT_FACTS.length;
      while (used.indexOf(f) >= 0) f = (f + 1) % SPRINT_FACTS.length;
      used.push(f);
      const truthful = next() % 2 === 0;
      const mag = 4 + (next() % 9);
      const shift = truthful ? 0 : next() % 2 === 0 ? -mag : mag;
      qs.push({ id: i, kind, facts: [f], shift, choices: 2, correct: shift === 0 ? 0 : 1, showAt, unlockAt, closeAt });
    } else {
      const n = kind === 'pair' ? 2 : 3;
      const set = pickDistinct(next, n, 2);
      // Display order: a seeded rotation of the drawn set.
      const rot = next() % n;
      const order: number[] = [];
      for (let k = 0; k < n; k++) order.push(set[(k + rot) % n]);
      let best = 0;
      for (let k = 1; k < n; k++) if (SPRINT_FACTS[order[k]][2] < SPRINT_FACTS[order[best]][2]) best = k;
      qs.push({ id: i, kind, facts: order, shift: 0, choices: n, correct: best, showAt, unlockAt, closeAt });
    }
  }
  return qs;
}

export function questionText(q: SprintQuestion): { prompt: string; choices: string[] } {
  if (q.kind === 'truetale') {
    const f = SPRINT_FACTS[q.facts[0]];
    return { prompt: `${f[1]} opened in ${f[2] + q.shift}.`, choices: ['TRUE', 'TALL TALE'] };
  }
  return { prompt: q.kind === 'pair' ? 'Which one opened first?' : 'Which of these opened first?', choices: q.facts.map((k) => SPRINT_FACTS[k][1]) };
}

export function validTaps(taps: unknown): taps is SprintTap[] {
  if (!Array.isArray(taps) || taps.length > MAX_TAPS) return false;
  let last = 0;
  for (const tap of taps) {
    if (!Array.isArray(tap) || tap.length !== 2) return false;
    const [t, c] = tap;
    if (!Number.isInteger(t) || !Number.isInteger(c)) return false;
    if (t < 0 || t > ROUND_MS || c < 0 || c > 3 || t < last) return false;
    last = t;
  }
  return true;
}

/** Speed 0-100 in steps of 5 (integer port of engine/scoring speedPoints). */
export function sprintSpeed(t: number): number {
  if (t <= GRACE_MS) return 100;
  if (t >= HORIZON_MS) return 0;
  const raw = Math.floor((100 * (HORIZON_MS - t)) / (HORIZON_MS - GRACE_MS));
  return Math.floor(raw / 5) * 5;
}

/** Streak multiplier in tenths: 1 = x1.0, 2 = x1.2, 3+ = x1.5 (Hot Streak). */
export function sprintMultTenths(streak: number): number {
  return streak >= 3 ? 15 : streak === 2 ? 12 : 10;
}

export function resolve(qs: SprintQuestion[], taps: SprintTap[]): SprintResult {
  const r: SprintResult = { score: 0, hits: 0, maxStreak: 0, picks: qs.map(() => -1), reactions: qs.map(() => -1), points: qs.map(() => 0) };
  for (const [t, c] of taps) {
    for (const q of qs) {
      if (t < q.unlockAt + GUARD_MS || t >= q.closeAt) continue;
      if (r.picks[q.id] >= 0 || c >= q.choices) break;
      r.picks[q.id] = c;
      r.reactions[q.id] = t - q.unlockAt;
      break;
    }
  }
  let streak = 0;
  for (const q of qs) {
    if (r.picks[q.id] === q.correct) {
      streak += 1;
      if (streak > r.maxStreak) r.maxStreak = streak;
      r.hits += 1;
      const pts = Math.floor(((100 + sprintSpeed(r.reactions[q.id])) * sprintMultTenths(streak)) / 10);
      r.points[q.id] = pts;
      r.score += pts;
    } else streak = 0;
  }
  return r;
}

export type SprintBotProfile = 'rookie' | 'regular' | 'ace';

/** House crew (Captain Fin and friends): accuracy % and lock-time spread per profile. */
export const SPRINT_BOTS: Record<SprintBotProfile, { acc: number; reactMin: number; reactSpread: number }> = {
  rookie: { acc: 58, reactMin: 2400, reactSpread: 2600 },
  regular: { acc: 72, reactMin: 1700, reactSpread: 2000 },
  ace: { acc: 86, reactMin: 1100, reactSpread: 1400 },
};

export function botSeed(seed: number, seat: number): number {
  return (seed + (seat + 1) * 1000003) % 4294967296;
}

export function botTaps(qs: SprintQuestion[], seed: number, seat: number, profile: SprintBotProfile, fromMs = 0): SprintTap[] {
  const p = SPRINT_BOTS[profile];
  const next = rng(botSeed(seed, seat));
  const taps: SprintTap[] = [];
  for (const q of qs) {
    const roll = next() % 100;
    const react = p.reactMin + (next() % p.reactSpread);
    const wrong = q.choices > 1 ? (q.correct + 1 + (next() % (q.choices - 1))) % q.choices : q.correct;
    if (q.unlockAt < fromMs) continue;
    const at = q.unlockAt + react;
    if (at >= q.closeAt) continue;
    taps.push([at, roll < p.acc ? q.correct : wrong]);
  }
  return taps;
}

export function ghostFill(qs: SprintQuestion[], seed: number, seat: number, own: SprintTap[], untilMs: number, profile: SprintBotProfile): SprintTap[] {
  const mine = own.filter(([t]) => t < untilMs);
  const merged = [...mine, ...botTaps(qs, seed, seat, profile, untilMs)];
  merged.sort((a, b) => a[0] - b[0]);
  return merged;
}

export function resultHash(r: SprintResult): string {
  const text = [r.score, r.hits, r.maxStreak, r.picks.join('.'), r.reactions.join('.'), r.points.join('.')].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
