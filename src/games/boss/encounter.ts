import type { BossId } from '../../api/endpoints/parks/raid';

export const BRAWL_MS = 20_000;
export const HIT_GAP_MS = 145;
const CIRCUITS = [[0, 2, 1], [2, 0, 1], [1, 2, 0], [1, 0, 2]] as const;
export interface EncounterState {
  boss: BossId; circuit: readonly number[]; step: number;
  exposedUntil: number; lureSide: -1 | 1; cycle: number;
}
export interface StrikeStats { hits: number; weak: number; lastHitMs: number; }
export function createEncounter(boss: BossId, round: number): EncounterState {
  return { boss, circuit: CIRCUITS[Math.abs(round) % CIRCUITS.length], step: 0,
    exposedUntil: -1, lureSide: round % 2 === 0 ? -1 : 1, cycle: 0 };
}
export function ghostRevealed(ms: number): boolean {
  'worklet';
  return ms % 2400 >= 1400;
}
export function weakAvailable(stats: StrikeStats): boolean {
  return stats.weak < Math.floor((stats.hits + 1) / 3);
}
export function encounterExposed(state: EncounterState, ms: number): boolean {
  return state.boss === 'ghost_squid' ? ghostRevealed(ms) : ms < state.exposedUntil;
}
/** A lure or circuit changes the opening, never grants a hit or reward. */
export function encounterAction(state: EncounterState, input: number, ms: number): {
  state: EncounterState; accepted: boolean; opened: boolean;
} {
  if (!Number.isFinite(ms) || ms < 0 || ms >= BRAWL_MS || state.boss === 'ghost_squid' ||
      encounterExposed(state, ms)) return { state, accepted: false, opened: false };
  if (state.boss === 'kraken') {
    if (input !== -1 && input !== 1) return { state, accepted: false, opened: false };
    return { state: { ...state, lureSide: input, exposedUntil: ms + 1800, cycle: state.cycle + 1 }, accepted: true, opened: true };
  }
  if (input !== state.circuit[state.step]) return { state: { ...state, step: 0 }, accepted: false, opened: false };
  const step = state.step + 1;
  const opened = step === state.circuit.length;
  return { state: { ...state, step: opened ? 0 : step,
    exposedUntil: opened ? ms + 1600 : state.exposedUntil,
    cycle: opened ? state.cycle + 1 : state.cycle }, accepted: true, opened };
}
export function consumeOpening(state: EncounterState, ms: number): EncounterState {
  // The squid's timed reveal remains visible; only its crit budget limits repeats.
  if (state.boss === 'ghost_squid') return state;
  return { ...state, exposedUntil: ms, circuit: CIRCUITS[state.cycle % CIRCUITS.length], step: 0 };
}
/** This is the server's exact formula, including rounding once after remote scaling. */
export function brawlDamage(stats: Pick<StrikeStats, 'hits' | 'weak'>, rate: number): number {
  return Math.floor((stats.hits * 10 + stats.weak * 20) * rate);
}
export function registerStrike(stats: StrikeStats, state: EncounterState, ms: number, onWeakSpot: boolean): {
  stats: StrikeStats; critical: boolean;
} | null {
  if (!Number.isFinite(ms) || ms < 0 || ms >= BRAWL_MS || ms - stats.lastHitMs < HIT_GAP_MS ||
      (state.boss === 'ghost_squid' && !ghostRevealed(ms))) return null;
  const critical = onWeakSpot && encounterExposed(state, ms) && weakAvailable(stats);
  return { stats: { hits: stats.hits + 1, weak: stats.weak + (critical ? 1 : 0), lastHitMs: ms }, critical };
}
export function encounterHint(state: EncounterState, stats: StrikeStats, ms: number): string {
  if (state.boss === 'ghost_squid') return ghostRevealed(ms)
    ? weakAvailable(stats) ? 'Strike the glowing center!' : 'Strike while it is solid!'
    : 'Watch the ring. It is about to appear…';
  if (encounterExposed(state, ms)) return weakAvailable(stats) ? 'Center exposed — strike now!'
    : 'Tap the boss to charge your strike!';
  return state.boss === 'kraken' ? 'Tap a buoy to lure its tentacle away.'
    : `Connect the circuit: tap node ${state.step + 1}.`;
}
export function brawlStars(boss: BossId, stats: Pick<StrikeStats, 'hits' | 'weak'>): 0 | 1 | 2 | 3 {
  const full = brawlDamage(stats, 1);
  const [silver, gold] = boss === 'ghost_squid' ? [350, 550] : boss === 'robo_shark' ? [550, 850] : [600, 900];
  return full <= 0 ? 0 : full >= gold ? 3 : full >= silver ? 2 : 1;
}
