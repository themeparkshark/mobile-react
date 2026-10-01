/**
 * TEAM STRIKE (design v7 13.3): one real shared moment per bout.
 *
 * In every bout a crew starts together, attack #2 is the Team Strike. The frame
 * a player counters it, their client whispers {bout, attack, grade, at} on the
 * presence channel. Every arriving ally PERFECT within the merge window lands
 * with yours as ONE combined hit (TEAM STRIKE x2 / x3); later arrivals play as
 * a small "+ALLY" echo. Cosmetic at once; credited only from proofs at
 * settlement (both PERFECT on attack #2 of the same bout, same Rally): +25% of
 * that attack's counter and opening points.
 *
 * Also the async tier-1 data shaping the raid sheet uses: the crew raid ticker
 * line and the raid log rows (names for self and friends, park aliases for
 * strangers).
 */
import { E_GOOD, E_HIT, E_PERFECT, E_POP, E_POP_PERFECT, E_SLAM, E_TELL, UNIT_POINTS, type Bout } from '../sim/encounter';

/** Attack index (0-based) of the Team Strike in a bout. */
export const TEAM_STRIKE_ATTACK = 1;
/** Ally strikes arriving within this of yours merge into one hit (p50 target 150 ms; tolerate LTE p95). */
export const MERGE_MS = 400;
/** Settlement bonus on the Team Strike attack's points (integer percent). */
export const TEAM_STRIKE_PCT = 25;

export interface StrikeWhisper { who: string; bout: number; attack: number; grade: number; at: number }

export interface StrikeMerge {
  /** Allies whose PERFECT lands with yours (one combined hit). */
  merged: string[];
  /** Allies too far apart: a small "+ALLY" echo. */
  echoes: string[];
  /** x2 / x3 ... (you plus merged allies). */
  multiplier: number;
}

/** Merge the ally whispers for one bout's Team Strike against your own PERFECT at wall time `mine`. */
export function mergeTeamStrike(mine: number, bout: number, whispers: readonly StrikeWhisper[]): StrikeMerge {
  const merged: string[] = [];
  const echoes: string[] = [];
  const seen = new Set<string>();
  for (const w of whispers) {
    if (w.bout !== bout || w.attack !== TEAM_STRIKE_ATTACK || w.grade !== 2 || seen.has(w.who)) continue;
    seen.add(w.who);
    if (Math.abs(w.at - mine) <= MERGE_MS) merged.push(w.who);
    else echoes.push(w.who);
  }
  return { merged, echoes, multiplier: 1 + merged.length };
}

/** Points (scoring units) of the n-th attack of a bout: its counter and its opening, until the next attack's first tell. */
export function attackUnits(b: Bout, attack: number): { units: number; perfect: boolean } {
  let idx = -1;
  let units = 0;
  let perfect = false;
  for (const e of b.events) {
    if (e.code === E_TELL && e.b === 0) {
      idx += 1;
      if (idx > attack) break;
      continue;
    }
    if (idx !== attack) continue;
    if (e.code === E_PERFECT) perfect = true;
    if (e.code === E_PERFECT || e.code === E_GOOD || e.code === E_POP || e.code === E_POP_PERFECT || e.code === E_HIT || e.code === E_SLAM) {
      units += e.v;
    }
  }
  return { units, perfect };
}

/**
 * Server settlement (spec for WS6): for each player in the same Rally bout,
 * the Team Strike bonus in points when that player and at least one teammate
 * PERFECTed attack #2. Integer, one floor.
 */
export function settleTeamStrike(bouts: Record<string, Bout>): Record<string, number> {
  const perfects = Object.keys(bouts).filter((id) => attackUnits(bouts[id], TEAM_STRIKE_ATTACK).perfect);
  const out: Record<string, number> = {};
  for (const id of Object.keys(bouts)) {
    const a = attackUnits(bouts[id], TEAM_STRIKE_ATTACK);
    out[id] = a.perfect && perfects.length >= 2 ? Math.floor((a.units * TEAM_STRIKE_PCT) / (100 * UNIT_POINTS)) : 0;
  }
  return out;
}

// ---- async tier 1: crew raid ticker and raid log ------------------------------

export interface SettledBout {
  playerId: number;
  /** Shown only for self and accepted friends. */
  name: string | null;
  /** Daily park alias from the server (strangers). */
  alias: string;
  self: boolean;
  friend: boolean;
  crewmate: boolean;
  damage: number;
  /** Which part-breaks this bout knocked off (1 hat, 2 tentacle, 3 shell). */
  breaks: number[];
  skillStar: boolean;
  gotUp: boolean;
  at: number;
}

const PART: Record<number, string> = { 1: 'the hat', 2: 'a tentacle', 3: 'the shell' };

export function displayName(b: Pick<SettledBout, 'name' | 'alias' | 'self' | 'friend'>): string {
  if (b.self) return 'You';
  return b.friend && b.name ? b.name : b.alias;
}

/** "Your crew hit the Kraken for 4 210 today. Maya broke the hat." (positive framing only). */
export function crewTickerLine(bossName: string, bouts: readonly SettledBout[], dayStart: number): string | null {
  const today = bouts.filter((b) => b.crewmate && b.at >= dayStart);
  if (today.length === 0) return null;
  const total = today.reduce((s, b) => s + b.damage, 0);
  const lead = `Your crew hit ${bossName} for ${total.toLocaleString('en-US')} today.`;
  const breaker = [...today].sort((a, b) => b.at - a.at).find((b) => b.breaks.length > 0);
  if (breaker) return `${lead} ${displayName(breaker)} broke ${PART[breaker.breaks[0]] ?? 'a part'}.`;
  const star = today.find((b) => b.skillStar);
  if (star) return `${lead} ${displayName(star)} earned a Skill Star.`;
  return lead;
}

export interface RaidLogRow { who: string; damage: number; breaks: number; skillStars: number; gotUp: number; you: boolean }

/** Per-slot raid log (Clash of Clans): who did what, best first; names for self and friends, aliases otherwise. */
export function raidLog(bouts: readonly SettledBout[]): RaidLogRow[] {
  const by = new Map<number, RaidLogRow>();
  for (const b of bouts) {
    const row = by.get(b.playerId) ?? { who: displayName(b), damage: 0, breaks: 0, skillStars: 0, gotUp: 0, you: b.self };
    row.damage += b.damage;
    row.breaks += b.breaks.length;
    row.skillStars += b.skillStar ? 1 : 0;
    row.gotUp += b.gotUp ? 1 : 0;
    by.set(b.playerId, row);
  }
  return [...by.values()].sort((a, b) => b.damage - a.damage || a.who.localeCompare(b.who));
}
