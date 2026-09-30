import type { BossId, RaidDamageWeights } from '../../api/endpoints/parks/raid';

/**
 * Boss Brawl rules, shared by the arena, the node balance sim and the server
 * proof limits. Each boss has one read, and only reading it opens the weak spot:
 * - Kraken telegraphs a tentacle over one buoy. Only that buoy lures it; the
 *   other buoy (or a buoy with no tentacle up) snags and locks the buoys.
 * - Robo-Shark flashes its circuit order, hides it and shuffles the nodes.
 *   Taps during the flash are ignored; a wrong node zaps and re-flashes.
 * - Ghost Squid gives a 300ms tell before it turns solid. A tap while it is
 *   not solid spooks it: no hits land for a moment.
 * Pure and deterministic per (boss, round): no clocks, no randomness.
 */
export const BRAWL_MS = 20_000;
/** One strike every 290ms at most: 69 hits a round, under the server's 70 hit cap. */
export const HIT_GAP_MS = 290;
/** Mirrors config/boss.php damage. A live raid passes its own weights from the raid payload. */
export const BRAWL_DAMAGE: RaidDamageWeights = { per_hit: 4, per_weak_hit: 40, weak_share: 3 };

export const KRAKEN_FIRST_TELL_MS = 700;
/** How long a tentacle hangs over its buoy. */
export const KRAKEN_TELL_MS = 1400;
export const KRAKEN_GAP_MS = 450;
export const KRAKEN_OPEN_MS = 1800;
/** Robo-Shark flashes one node per beat, then shuffles. */
export const ROBO_FLASH_MS = 300;
export const ROBO_SHUFFLE_MS = 260;
export const ROBO_OPEN_MS = 1700;
export const GHOST_CYCLE_MS = 2400;
export const GHOST_TELL_MS = 300;
export const GHOST_SOLID_FROM = 1400;
/** The glowing center only shows as the squid turns solid. */
export const GHOST_CRIT_MS = 600;
export const SNAG_MS = 900;
export const ZAP_MS = 700;
export const SPOOK_MS = 800;

const CIRCUITS = [[0, 2, 1], [2, 0, 1], [1, 2, 0], [1, 0, 2], [2, 1, 0], [0, 1, 2]] as const;
/** Position -> node id. */
const LAYOUTS = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [1, 0, 2], [2, 1, 0], [0, 2, 1]] as const;

export interface EncounterState {
  readonly boss: BossId;
  readonly round: number;
  readonly cycle: number;
  readonly exposedUntil: number;
  /** Kraken: the buoy the tentacle was lured to (or snagged on). */
  readonly lureSide: -1 | 1;
  /** Kraken: when the current run of tentacle tells started. */
  readonly tellAt: number;
  /** Robo-Shark: the node order to connect, the progress, and the flash window. */
  readonly circuit: readonly number[];
  readonly step: number;
  readonly showFrom: number;
  readonly showUntil: number;
  /** Robo-Shark: node at each position during the flash, then after the shuffle. */
  readonly shownLayout: readonly number[];
  readonly layout: readonly number[];
  /** A snag, zap or spook: the mechanic (Ghost: every strike) is locked until then. */
  readonly lockedUntil: number;
  readonly misreads: number;
}
export interface StrikeStats { hits: number; weak: number; lastHitMs: number; }

function mix(round: number, salt: number): number {
  return Math.imul((Math.abs(round) + 1) * 0x9e37 + salt * 0x85eb + 7, 0x27d4eb2d) >>> 9;
}
function tellSide(round: number, index: number): -1 | 1 {
  return (mix(round, index) & 1) === 1 ? 1 : -1;
}
const showLength = (circuit: readonly number[]) => circuit.length * ROBO_FLASH_MS + ROBO_SHUFFLE_MS;
function nextLayout(round: number, salt: number, from: readonly number[]): readonly number[] {
  const pick = mix(round, salt + 101) % (LAYOUTS.length - 1);
  const options = LAYOUTS.filter(layout => layout.some((node, i) => node !== from[i]));
  return options[pick % options.length];
}

export function createEncounter(boss: BossId, round: number): EncounterState {
  const circuit = CIRCUITS[mix(round, 0) % CIRCUITS.length];
  const start = boss === 'robo_shark' ? 400 : 0;
  return { boss, round, cycle: 0, exposedUntil: -1, lureSide: -1,
    tellAt: KRAKEN_FIRST_TELL_MS, circuit, step: 0, showFrom: start, showUntil: start + showLength(circuit),
    shownLayout: LAYOUTS[0], layout: nextLayout(round, 0, LAYOUTS[0]), lockedUntil: -1, misreads: 0 };
}

export function ghostRevealed(ms: number): boolean {
  'worklet';
  return ms % 2400 >= 1400;
}
export type GhostPhase = 'hidden' | 'tell' | 'solid';
export function ghostPhase(ms: number): GhostPhase {
  const p = ms % GHOST_CYCLE_MS;
  return p >= GHOST_SOLID_FROM ? 'solid' : p >= GHOST_SOLID_FROM - GHOST_TELL_MS ? 'tell' : 'hidden';
}
export function weakAvailable(stats: Pick<StrikeStats, 'hits' | 'weak'>): boolean {
  return stats.weak < Math.floor((stats.hits + 1) / 3);
}
export function encounterExposed(state: EncounterState, ms: number): boolean {
  if (state.boss === 'ghost_squid') {
    const p = ms % GHOST_CYCLE_MS;
    return p >= GHOST_SOLID_FROM && p < GHOST_SOLID_FROM + GHOST_CRIT_MS && ms >= state.lockedUntil;
  }
  return ms < state.exposedUntil;
}
export function encounterLocked(state: EncounterState, ms: number): boolean {
  return ms < state.lockedUntil;
}

/** Kraken: the tentacle tell at `ms`, if a run of tells is under way. */
export function krakenTell(state: EncounterState, ms: number): { side: -1 | 1; at: number; index: number; up: boolean } | null {
  if (state.boss !== 'kraken' || ms < state.tellAt || ms < state.exposedUntil || ms < state.lockedUntil) return null;
  const period = KRAKEN_TELL_MS + KRAKEN_GAP_MS;
  const index = Math.floor((ms - state.tellAt) / period);
  const at = state.tellAt + index * period;
  return { side: tellSide(state.round, state.cycle + index), at, index, up: ms - at < KRAKEN_TELL_MS };
}

/** Robo-Shark: what the circuit board shows at `ms`. */
export function roboBoard(state: EncounterState, ms: number): {
  phase: 'flash' | 'shuffle' | 'connect' | 'open'; flashing: number | null; shown: number; positions: readonly number[];
} {
  if (encounterExposed(state, ms)) return { phase: 'open', flashing: null, shown: 0, positions: state.shownLayout };
  const into = ms - state.showFrom;
  const flashEnd = state.circuit.length * ROBO_FLASH_MS;
  if (into >= 0 && into < flashEnd) {
    const index = Math.floor(into / ROBO_FLASH_MS);
    return { phase: 'flash', flashing: state.circuit[index], shown: index + 1, positions: state.shownLayout };
  }
  if (into >= flashEnd && ms < state.showUntil) return { phase: 'shuffle', flashing: null, shown: 0, positions: state.layout };
  return { phase: 'connect', flashing: null, shown: 0, positions: ms < state.showFrom ? state.shownLayout : state.layout };
}

/** A lure or circuit press changes the opening, never grants a hit or reward. */
export function encounterAction(state: EncounterState, input: number, ms: number): {
  state: EncounterState; accepted: boolean; opened: boolean; misread: boolean;
} {
  const ignore = { state, accepted: false, opened: false, misread: false };
  if (!Number.isFinite(ms) || ms < 0 || ms >= BRAWL_MS || state.boss === 'ghost_squid' ||
      encounterExposed(state, ms) || encounterLocked(state, ms)) return ignore;
  if (state.boss === 'kraken') {
    if (input !== -1 && input !== 1) return ignore;
    const tell = krakenTell(state, ms);
    const cycle = state.cycle + (tell ? tell.index + 1 : 0);
    if (tell?.up && input === tell.side) {
      return { state: { ...state, cycle, lureSide: input, exposedUntil: ms + KRAKEN_OPEN_MS,
        tellAt: ms + KRAKEN_OPEN_MS + KRAKEN_GAP_MS }, accepted: true, opened: true, misread: false };
    }
    // The wrong buoy, or a buoy with no tentacle over it: the tentacle snags it.
    return { state: { ...state, cycle, lureSide: input, lockedUntil: ms + SNAG_MS, tellAt: ms + SNAG_MS,
      misreads: state.misreads + 1 }, accepted: false, opened: false, misread: true };
  }
  if (ms < state.showUntil || input < 0 || input > 2) return ignore;
  if (input !== state.circuit[state.step]) {
    // Zapped: the order re-flashes after the lockout and the nodes shuffle again.
    const from = ms + ZAP_MS;
    return { state: { ...state, step: 0, lockedUntil: from, misreads: state.misreads + 1, showFrom: from,
      showUntil: from + showLength(state.circuit), shownLayout: state.layout,
      layout: nextLayout(state.round, state.cycle * 13 + state.misreads + 1, state.layout) },
    accepted: false, opened: false, misread: true };
  }
  const step = state.step + 1;
  if (step < state.circuit.length) return { state: { ...state, step }, accepted: true, opened: false, misread: false };
  // Open, and set up the next circuit to flash when this opening ends.
  const cycle = state.cycle + 1, until = ms + ROBO_OPEN_MS;
  const circuit = CIRCUITS[mix(state.round, cycle) % CIRCUITS.length];
  return { state: { ...state, cycle, step: 0, exposedUntil: until, circuit, showFrom: until,
    showUntil: until + showLength(circuit), shownLayout: state.layout, layout: nextLayout(state.round, cycle * 13, state.layout) },
  accepted: true, opened: true, misread: false };
}

/** A critical ends the opening (one crit per lure or circuit). */
export function consumeOpening(state: EncounterState, ms: number): EncounterState {
  if (state.boss === 'ghost_squid') return state;
  if (state.boss === 'kraken') return { ...state, exposedUntil: ms, tellAt: ms + KRAKEN_GAP_MS };
  return { ...state, exposedUntil: ms, showFrom: ms, showUntil: ms + showLength(state.circuit) };
}

/** The server's exact formula (config/boss.php damage), rounded once after remote scaling. */
export function brawlDamage(stats: Pick<StrikeStats, 'hits' | 'weak'>, rate: number,
  weights: Pick<RaidDamageWeights, 'per_hit' | 'per_weak_hit'> = BRAWL_DAMAGE): number {
  return Math.floor((stats.hits * weights.per_hit + stats.weak * weights.per_weak_hit) * rate);
}

/**
 * One tap on the boss. Null when it does nothing (too soon after the last hit,
 * out of time, over the round's hit cap, or while Ghost Squid is spooked).
 * A tap on Ghost Squid while it is not solid spooks it instead of landing.
 */
export function registerStrike(stats: StrikeStats, state: EncounterState, ms: number, onWeakSpot: boolean,
  maxHits = Number.POSITIVE_INFINITY): { stats: StrikeStats; state: EncounterState; critical: boolean; spooked: boolean } | null {
  if (!Number.isFinite(ms) || ms < 0 || ms >= BRAWL_MS || ms - stats.lastHitMs < HIT_GAP_MS || stats.hits >= maxHits) return null;
  if (state.boss === 'ghost_squid') {
    if (encounterLocked(state, ms)) return null;
    if (!ghostRevealed(ms)) {
      return { stats, state: { ...state, lockedUntil: ms + SPOOK_MS, misreads: state.misreads + 1 }, critical: false, spooked: true };
    }
  }
  const critical = onWeakSpot && encounterExposed(state, ms) && weakAvailable(stats);
  return { stats: { hits: stats.hits + 1, weak: stats.weak + (critical ? 1 : 0), lastHitMs: ms }, state, critical, spooked: false };
}

export function encounterHint(state: EncounterState, stats: Pick<StrikeStats, 'hits' | 'weak'>, ms: number): string {
  if (state.boss === 'ghost_squid') {
    if (encounterLocked(state, ms)) return 'Spooked! Wait for its eyes to flash.';
    const phase = ghostPhase(ms);
    if (phase === 'solid') return encounterExposed(state, ms) && weakAvailable(stats) ? 'Solid! Strike the glowing center.' : 'Strike while it is solid.';
    return phase === 'tell' ? 'Its eyes flashed. Get ready.' : 'Wait for the eyes to flash.';
  }
  if (encounterExposed(state, ms)) return weakAvailable(stats) ? 'Center exposed. Strike now!' : 'Hit the boss to charge your strike.';
  if (state.boss === 'kraken') {
    if (encounterLocked(state, ms)) return 'Snagged! Wait for the next tentacle.';
    const tell = krakenTell(state, ms);
    return tell?.up ? `Tentacle ${tell.side < 0 ? 'left' : 'right'}! Tap that buoy.` : 'Watch for a tentacle over a buoy.';
  }
  if (encounterLocked(state, ms)) return 'Zapped! Watch the order again.';
  const board = roboBoard(state, ms);
  return board.phase === 'flash' ? 'Watch the order.' : board.phase === 'shuffle' ? 'Shuffling. Keep your eye on them.'
    : `Connect the circuit: node ${state.step + 1} of ${state.circuit.length}.`;
}

/**
 * Stars reward reading the boss, not tapping: openings landed, with gold only
 * for a clean read (at most one misread). Tuned on tools/tests/boss-balance.test.cjs.
 */
export const STAR_OPENINGS: Record<BossId, readonly [silver: number, gold: number]> = {
  kraken: [6, 12], robo_shark: [4, 7], ghost_squid: [4, 7],
};
export function brawlStars(boss: BossId, stats: Pick<StrikeStats, 'hits' | 'weak'>, misreads = 0): 0 | 1 | 2 | 3 {
  if (stats.hits <= 0) return 0;
  const [silver, gold] = STAR_OPENINGS[boss];
  if (stats.weak >= gold && misreads <= 1) return 3;
  // Mashing through spooks and snags never earns silver, however many openings it stumbles into.
  return stats.weak >= silver && misreads <= 4 ? 2 : 1;
}
