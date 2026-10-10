/**
 * Boss Bash: the raid round rules (pure, deterministic per seed, no clocks).
 *
 * One idea a 7-year-old gets without reading:
 *   1. Tentacles pop out of the water. BONK them. Each bonk fills a fin.
 *   2. Three fins full: the boss is DIZZY and its head drops down with a gold
 *      target. SMASH the head for a big hit.
 *   3. Never bonk the spiky pufferfish: it pops a fin and the shark sees stars.
 *
 * The server's proof rules are the game's rules, shown on screen:
 *   - damage = per_hit x hits + per_weak_hit x weak hits (config/boss.php),
 *   - a weak hit needs at least 3 hits per weak hit in total: the fins are that
 *     charge-up (2 bonks + the head smash is the shortest cycle),
 *   - hits never pass the round's cap (round.max_hits).
 * Tapping a hit after the cap still bonks (visible, never "lost") but adds 0.
 */

export const ROUND_MS = 20_000;
/** Spots on the water: 3 lanes x 2 rows (0-2 far row, 3-5 near row). */
export const SPOTS = 6;
export type SpotId = 0 | 1 | 2 | 3 | 4 | 5;
export type PhaseId = 'warm' | 'angry' | 'fury';
/** A gold tentacle is worth two fins but only pops up next to a pufferfish, briefly: the risky, rewarding tap. */
export type Kind = 'tentacle' | 'puffer' | 'gold';

export interface PhaseRule {
  readonly id: PhaseId;
  readonly from: number;
  /** Tentacles kept up at once. */
  readonly visible: number;
  /** Shortest gap between two pop-ups. */
  readonly gapMs: number;
  /** How long a tentacle stays up before it sinks. */
  readonly upMs: number;
  /** Chance a pop-up is a pufferfish. */
  readonly puffer: number;
  /** How long the dizzy head stays open. */
  readonly dizzyMs: number;
  /** Bonks to fill the fins (FURY shortens it). */
  readonly need: number;
}

export const PHASES: readonly PhaseRule[] = [
  { id: 'warm', from: 0, visible: 3, gapMs: 150, upMs: 2400, puffer: 0, dizzyMs: 1700, need: 3 },
  { id: 'angry', from: 6_500, visible: 3, gapMs: 130, upMs: 1900, puffer: 0.3, dizzyMs: 1450, need: 3 },
  { id: 'fury', from: 13_500, visible: 3, gapMs: 100, upMs: 1500, puffer: 0.34, dizzyMs: 1200, need: 2 },
];
/** The head drops for this long before it can be smashed (the dizzy wobble). */
export const DIZZY_DROP_MS = 120;
/** A PERFECT smash: tap while the closing ring sits on the gold core (this slice of the dizzy window). */
export const PERFECT_FROM = 0.27;
export const PERFECT_UNTIL = 0.38;
/** INK attack: the boss puffs up for this long (the tell). Tap the boss to block it; miss it and you get inked. */
export const INK_TELL_MS = 1150;
/** First ink, then one every INK_EVERY_MS (never in the last INK_LAST_MS). */
export const INK_FIRST_MS = 8_000;
export const INK_EVERY_MS = 4_600;
export const INK_LAST_MS = 1_800;
/** Ink on the screen lasts this long (looks only; it never changes the score). */
export const INKED_MS = 2_000;
/** A tap on empty water splashes and holds the next tap this long (mashing is slower than aiming). */
export const SPLASH_MS = 350;
/** Bonking a pufferfish stuns the shark this long (taps are ignored, shown by the bonked pose). */
export const OUCH_MS = 1000;
/** No new pop-ups in the last moment, so nothing sinks unseen at the bell. */
export const LAST_SPAWN_MS = ROUND_MS - 700;
/** Gold tentacle: how often it appears beside a pufferfish, and how briefly. */
export const GOLD_CHANCE = 0.55;
export const GOLD_UP_MS = 1250;
/** Smallest cycle the server accepts: one weak hit per three hits. */
export const MIN_BONKS = 2;

export interface Popup {
  readonly id: number;
  readonly spot: SpotId;
  readonly kind: Kind;
  readonly at: number;
  readonly until: number;
}

export interface BashState {
  readonly seed: number;
  readonly rng: number;
  readonly ms: number;
  readonly nextId: number;
  readonly nextSpawnAt: number;
  readonly lastSpot: number;
  readonly up: readonly Popup[];
  /** Fins filled toward the next dizzy. */
  readonly power: number;
  /** Fins pre-filled by a PERFECT smash or FURY (shown as a glowing fin). */
  readonly headStart: number;
  readonly dizzy: { readonly from: number; readonly until: number } | null;
  readonly ouchUntil: number;
  /** The INK tell (puffed up) while it is on. */
  readonly ink: { readonly from: number; readonly until: number } | null;
  readonly nextInkAt: number;
  readonly inkedUntil: number;
  readonly blocks: number;
  readonly inked: number;
  readonly splashUntil: number;
  /** Empty-water taps in a row: each one holds the next tap a little longer (mashing loses to aiming). */
  readonly splashChain: number;
  /** Right after a smash the next tentacles pop up together (a fast rebuild rewards a clean player). */
  readonly burst: number;
  /** Real hits since the last smash: the server's share rule needs 2 before every weak hit. */
  readonly bonksSince: number;
  readonly golds: number;
  /** First-time players: no gold tentacles yet (learn bonk / smash / puffer first). */
  readonly noGold?: boolean;
  readonly inks: number;
  readonly hits: number;
  readonly weak: number;
  readonly bonks: number;
  readonly smashes: number;
  readonly perfects: number;
  readonly ouches: number;
  readonly missedDizzy: number;
  readonly streak: number;
  readonly bestStreak: number;
  /** Bonks the cap absorbed (shown, scored 0). */
  readonly capped: number;
}

export type BashEvent =
  | { type: 'spawn'; popup: Popup }
  | { type: 'sink'; popup: Popup }
  | { type: 'phase'; phase: PhaseId }
  | { type: 'bonk'; popup: Popup; damage: number; streak: number; power: number; need: number; counted: boolean }
  | { type: 'dizzy'; from: number; until: number }
  | { type: 'smash'; damage: number; perfect: boolean; weak: boolean; final: boolean }
  | { type: 'ouch'; popup: Popup; lostFins: number }
  | { type: 'shakeOff' }
  | { type: 'clank' }
  | { type: 'inkTell'; from: number; until: number }
  | { type: 'inkBlock'; damage: number; power: number; need: number; counted: boolean }
  | { type: 'inked'; until: number; lostFins: number }
  | { type: 'splash'; lane: number };

export interface Weights { readonly per_hit: number; readonly per_weak_hit: number }
export const DEFAULT_WEIGHTS: Weights = { per_hit: 4, per_weak_hit: 40 };

function next(r: number): number {
  // xorshift32, kept positive.
  let x = r | 0 || 0x9e3779b9;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return x >>> 0;
}
const unit = (r: number) => (r % 100000) / 100000;

export function phaseAt(ms: number): PhaseRule {
  let rule = PHASES[0];
  for (const p of PHASES) if (ms >= p.from) rule = p;
  return rule;
}

export function createBash(seed: number): BashState {
  return { seed, rng: next((seed >>> 0) * 2654435761 + 1), ms: 0, nextId: 1, nextSpawnAt: 450, lastSpot: -1, up: [],
    power: 0, headStart: 0, dizzy: null, ouchUntil: -1, hits: 0, weak: 0, bonks: 0, smashes: 0, perfects: 0, ouches: 0,
    missedDizzy: 0, streak: 0, bestStreak: 0, capped: 0, ink: null, nextInkAt: INK_FIRST_MS, inkedUntil: -1, blocks: 0, inked: 0,
    splashUntil: -1, splashChain: 0, inks: 0, burst: 0, bonksSince: 0, golds: 0 };
}

/** Fins to fill for the next dizzy (the head start counts as a filled fin). */
export function finsNeeded(state: Pick<BashState, 'headStart'> & Partial<Pick<BashState, 'power' | 'bonksSince'>>, ms: number): number {
  // Fins shown = free fins (head start, gold bonus) + bonks; at least MIN_BONKS real bonks before every dizzy, so
  // full fins always mean dizzy right now (a gold bonus can add a fin to the row, never a full row that waits).
  const free = Math.max(state.headStart, (state.power ?? 0) - (state.bonksSince ?? 0));
  return Math.max(phaseAt(ms).need, free + MIN_BONKS);
}

/** The server formula, rounded once after the home rate. */
export function bashDamage(hits: number, weak: number, rate = 1, w: Weights = DEFAULT_WEIGHTS): number {
  return Math.floor((hits * w.per_hit + weak * w.per_weak_hit) * rate);
}

/** Advance the clock: sink expired pop-ups, end a missed dizzy, spawn new ones. */
export function tick(state: BashState, ms: number): { state: BashState; events: BashEvent[] } {
  const events: BashEvent[] = [];
  if (!Number.isFinite(ms) || ms <= state.ms) return { state, events };
  let s: BashState = { ...state, ms };
  const before = phaseAt(state.ms), now = phaseAt(ms);
  if (now.id !== before.id) events.push({ type: 'phase', phase: now.id });
  if (s.dizzy && ms >= s.dizzy.until) {
    s = { ...s, dizzy: null, power: 0, headStart: 0, bonksSince: 0, missedDizzy: s.missedDizzy + 1, nextSpawnAt: ms + 250 };
    events.push({ type: 'shakeOff' });
  }
  if (s.ink && ms >= s.ink.until) {
    // Missed the block: the ink costs a fin (never the head start below it) and the screen gets splatted.
    const lost = s.power > 0 ? 1 : 0;
    const power = s.power - lost;
    s = { ...s, ink: null, inkedUntil: ms + INKED_MS, inked: s.inked + 1, streak: 0, power, headStart: Math.min(s.headStart, power) };
    events.push({ type: 'inked', until: ms + INKED_MS, lostFins: lost });
  }
  if (!s.ink && ms >= s.nextInkAt) {
    if (ms >= ROUND_MS - INK_LAST_MS) s = { ...s, nextInkAt: Number.POSITIVE_INFINITY };
    else if (s.dizzy) s = { ...s, nextInkAt: s.dizzy.until + 500 };
    // Never while the shark is seeing stars: a block must always be possible.
    else if (ms < s.ouchUntil + 300) s = { ...s, nextInkAt: s.ouchUntil + 300 };
    else {
      const ink = { from: ms, until: ms + INK_TELL_MS };
      s = { ...s, ink, nextInkAt: ms + INK_EVERY_MS, inks: s.inks + 1 };
      events.push({ type: 'inkTell', ...ink });
    }
  }
  const sinking = s.up.filter(p => ms >= p.until);
  if (sinking.length) {
    // A tentacle that got away breaks the bonk streak; a pufferfish left alone is the right call.
    const escaped = sinking.some(p => p.kind === 'tentacle');
    s = { ...s, up: s.up.filter(p => ms < p.until), streak: escaped ? 0 : s.streak };
    sinking.forEach(popup => events.push({ type: 'sink', popup }));
  }
  if (!s.dizzy && ms < LAST_SPAWN_MS) {
    // At most one pop-up per tick, spaced by the phase gap.
    const tentacles = s.up.filter(p => p.kind === 'tentacle').length;
    if (ms >= s.nextSpawnAt && tentacles < now.visible) {
      let r = next(s.rng);
      const taken = new Set(s.up.map(p => p.spot % 3));
      const free = [0, 1, 2].filter(lane => !taken.has(lane) && lane !== s.lastSpot % 3);
      const lanes = free.length ? free : [0, 1, 2].filter(lane => !taken.has(lane));
      if (lanes.length) {
        const lane = lanes[r % lanes.length];
        r = next(r);
        const row = unit(r) < 0.5 ? 0 : 3;
        r = next(r);
        // Never two puffers up, and never a puffer before the first dizzy of the round.
        const puffers = s.up.some(p => p.kind === 'puffer');
        const puffer = s.up.find(p => p.kind === 'puffer');
        const golds = s.up.some(p => p.kind === 'gold');
        // A gold tentacle only shows beside a pufferfish (next lane), so grabbing it is a real risk.
        // Gold appears while a pufferfish is up but in the far lane (a safe distance, never right beside it).
        const goldLane = puffer && !golds ? [puffer.spot % 3 - 2, puffer.spot % 3 + 2].find(l => lanes.includes(l)) : undefined;
        const gold = !s.noGold && !s.dizzy && goldLane !== undefined && unit(r) < GOLD_CHANCE;
        const kind: Kind = gold ? 'gold' : !puffers && s.smashes + s.missedDizzy > 0 && unit(r) < now.puffer ? 'puffer' : 'tentacle';
        r = next(r);
        const spotLane = gold ? goldLane! : lane;
        const life = kind === 'gold' ? GOLD_UP_MS : now.upMs + (kind === 'puffer' ? 250 : 0);
        const popup: Popup = { id: s.nextId, spot: (spotLane + (gold ? (puffer!.spot < 3 ? 0 : 3) : row)) as SpotId, kind, at: ms, until: ms + life };
        const burst = Math.max(0, s.burst - 1);
        s = { ...s, rng: r, nextId: s.nextId + 1, up: [...s.up, popup], lastSpot: popup.spot, burst,
          nextSpawnAt: ms + (s.burst > 0 ? 20 : now.gapMs) };
        events.push({ type: 'spawn', popup });
      }
    }
  }
  return { state: s, events };
}

/** Tap a pop-up (by id). */
export function tapPopup(state: BashState, id: number, ms: number, maxHits = Number.POSITIVE_INFINITY,
  w: Weights = DEFAULT_WEIGHTS): { state: BashState; events: BashEvent[] } {
  const popup = state.up.find(p => p.id === id);
  if (!popup || ms < state.ouchUntil || ms < state.splashUntil || state.dizzy || ms >= ROUND_MS) return { state, events: [] };
  const up = state.up.filter(p => p.id !== id);
  if (popup.kind === 'puffer') {
    // A spike pops one fin and the shark sees stars for a moment (one penalty a kid can see, not a wipe).
    const lostFins = state.power > 0 ? 1 : 0;
    const power = state.power - lostFins;
    return { state: { ...state, up, power, headStart: Math.min(state.headStart, power), streak: 0, ouches: state.ouches + 1,
      ouchUntil: ms + OUCH_MS },
      events: [{ type: 'ouch', popup, lostFins }] };
  }
  const counted = state.hits < maxHits;
  const hits = state.hits + (counted ? 1 : 0);
  const streak = state.streak + 1;
  const bonksSince = state.bonksSince + (counted ? 1 : 0);
  const raw = state.power + (popup.kind === 'gold' ? 2 : 1);
  const need = finsNeeded({ headStart: state.headStart, power: raw, bonksSince }, ms);
  const power = Math.min(need, raw);
  let s: BashState = { ...state, up, hits, bonks: state.bonks + 1, streak, bestStreak: Math.max(state.bestStreak, streak),
    power, bonksSince, golds: state.golds + (popup.kind === 'gold' ? 1 : 0), capped: state.capped + (counted ? 0 : 1),
    nextSpawnAt: Math.min(state.nextSpawnAt, ms + 60) };
  const events: BashEvent[] = [{ type: 'bonk', popup, damage: counted ? w.per_hit : 0, streak, power, need, counted }];
  if (power >= need && bonksSince >= MIN_BONKS) s = goDizzy(s, ms, events);
  return { state: s, events };
}

/** Fins full: the boss flops over dizzy, every pop-up dives, the ink (if any) fizzles. */
function goDizzy(s: BashState, ms: number, events: BashEvent[]): BashState {
  const rule = phaseAt(ms);
  const dizzy = { from: ms + DIZZY_DROP_MS, until: ms + DIZZY_DROP_MS + rule.dizzyMs };
  s.up.forEach(p => events.push({ type: 'sink', popup: p }));
  events.push({ type: 'dizzy', ...dizzy });
  // A live ink is not lost when the fins fill first: it comes back right after the smash.
  return { ...s, dizzy, up: [], ink: null, nextInkAt: s.ink ? dizzy.until + 400 : s.nextInkAt };
}

/** A tap on empty water: a splash, and a short hold so mashing is slower than aiming. */
export function tapWater(state: BashState, lane: number, ms: number): { state: BashState; events: BashEvent[] } {
  if (ms < state.ouchUntil || state.dizzy || ms >= ROUND_MS || ms < state.splashUntil) return { state, events: [] };
  const chain = state.splashUntil > 0 && ms - state.splashUntil < 600 ? state.splashChain + 1 : 0;
  return { state: { ...state, splashUntil: ms + SPLASH_MS * (1 + Math.min(3, chain) * 0.5), splashChain: chain },
    events: [{ type: 'splash', lane }] };
}

/** Where the dizzy ring is: 0 just opened, 1 about to close. */
export function dizzyProgress(state: Pick<BashState, 'dizzy'>, ms: number): number {
  if (!state.dizzy) return 0;
  return Math.max(0, Math.min(1, (ms - state.dizzy.from) / Math.max(1, state.dizzy.until - state.dizzy.from)));
}

/** Tap the boss. Dizzy: SMASH. Otherwise its armour blocks (a hint, never a penalty). */
export function tapBoss(state: BashState, ms: number, maxHits = Number.POSITIVE_INFINITY,
  w: Weights = DEFAULT_WEIGHTS): { state: BashState; events: BashEvent[] } {
  if (ms < state.ouchUntil || ms >= ROUND_MS) return { state, events: [] };
  if (state.ink && !state.dizzy) {
    // Blocked the ink: it counts as a hit and fills a fin.
    const counted = state.hits < maxHits;
    const need = finsNeeded(state, ms), power = Math.min(need, state.power + 1);
    let s: BashState = { ...state, ink: null, hits: state.hits + (counted ? 1 : 0), blocks: state.blocks + 1, power,
      bonksSince: state.bonksSince + (counted ? 1 : 0),
      streak: state.streak + 1, bestStreak: Math.max(state.bestStreak, state.streak + 1), capped: state.capped + (counted ? 0 : 1) };
    const events: BashEvent[] = [{ type: 'inkBlock', damage: counted ? w.per_hit : 0, power, need, counted }];
    if (power >= need && s.bonksSince >= MIN_BONKS) s = goDizzy(s, ms, events);
    return { state: s, events };
  }
  if (!state.dizzy || ms < state.dizzy.from - DIZZY_DROP_MS / 2) return { state, events: [{ type: 'clank' }] };
  const counted = state.hits < maxHits;
  const hits = state.hits + (counted ? 1 : 0);
  // The fins guarantee the server's share rule; this guard keeps it true even at the cap.
  const weakOk = counted && state.weak + 1 <= Math.floor(hits / 3);
  const weak = state.weak + (weakOk ? 1 : 0);
  const p = dizzyProgress(state, ms);
  const band = perfectBand(ms);
  const perfect = p >= band[0] && p <= band[1];
  const damage = (counted ? w.per_hit : 0) + (weakOk ? w.per_weak_hit : 0);
  const headStart = perfect ? 1 : 0;
  const s: BashState = { ...state, hits, weak, dizzy: null, power: headStart, headStart, bonksSince: 0, smashes: state.smashes + 1,
    perfects: state.perfects + (perfect ? 1 : 0), capped: state.capped + (counted ? 0 : 1), nextSpawnAt: ms + 60, burst: 2 };
  return { state: s, events: [{ type: 'smash', damage, perfect, weak: weakOk, final: ms >= ROUND_MS - 3000 }] };
}

export function bashScore(state: Pick<BashState, 'hits' | 'weak'>, rate = 1, w: Weights = DEFAULT_WEIGHTS): number {
  return bashDamage(state.hits, state.weak, rate, w);
}

/**
 * Stars for one round, on full-power damage so home and park players earn the
 * same stars for the same play (the home rate only changes the damage dealt).
 */
export const STAR_DAMAGE: readonly [number, number, number] = [1, 350, 700];
export function bashStars(state: Pick<BashState, 'hits' | 'weak'>, w: Weights = DEFAULT_WEIGHTS): 0 | 1 | 2 | 3 {
  const d = bashDamage(state.hits, state.weak, 1, w);
  if (state.hits <= 0) return 0;
  return d >= STAR_DAMAGE[2] ? 3 : d >= STAR_DAMAGE[1] ? 2 : 1;
}

/** The PERFECT slice of the dizzy window; FURY is tighter so a chain stays earned late in the round. */
export function perfectBand(ms: number): readonly [number, number] {
  'worklet';
  return ms >= 13_500 ? [0.29, 0.37] : [PERFECT_FROM, PERFECT_UNTIL];
}

/**
 * The closing ring's size at progress p: closes from 2x onto the core, sits ON the core (1.0) for the
 * whole PERFECT band, then shrinks inside it. The picture and the scoring use the same band.
 */
export function ringScaleAt(p: number, band: readonly [number, number]): number {
  'worklet';
  if (p < band[0]) return 2 - p / band[0];
  if (p <= band[1]) return 1;
  return Math.max(0.45, 1 - (p - band[1]) * 1.2);
}
