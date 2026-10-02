/**
 * Strike Team rules (design 11), pure and shared by the client presentation,
 * the house-crew fill and (as a spec) the WS6 server settlement.
 *
 * Nothing in co-op shares a sim timeline: every player fights their own
 * deterministic bouts on their own clock. Team windows are judged on WALL
 * clock with tolerance, so a player's hit-stops, Breaks, pauses or a shuffle
 * forward in line never affect anyone else, and nobody ever waits for anyone.
 */
import { mixSeed } from '../../../gamekit/core/rng';

export const SURGE_PIPS = 6;
export const SURGE_TTL_MS = 20000;
export const SYNC_START_MS = 3000;
export const ALLY_MATCH_MIN_MS = 0;
export const ALLY_MATCH_MAX_MS = 12000;
export const ALLY_TOLERANCE_MS = 2000;
export const RESCUE_WINDOW_MS = 2000;

export interface Teammate {
  id: string;
  name: string;
  /** Join order in the raid slot (stable). */
  order: number;
  bot?: boolean;
}

/**
 * Lure for a bout: seeded rotation by join order among teammates who are in a
 * bout right now. Solo players are always Strikers (null).
 */
export function lureFor(teamSeed: number, bout: number, inBout: readonly Teammate[]): string | null {
  if (inBout.length < 2) return null;
  const sorted = [...inBout].sort((a, b) => a.order - b.order);
  const k = mixSeed(teamSeed >>> 0, (bout + 1) >>> 0) % sorted.length;
  return sorted[k].id;
}

/** Rolling Team Surge meter: PERFECTs add pips that expire after 20 s of wall clock. */
export interface SurgeMeter { pips: number[]; firedAt: number }

export function createSurge(): SurgeMeter {
  return { pips: [], firedAt: -1e12 };
}

/** Add a teammate PERFECT at wall time `now`. Returns true when the meter fills (TEAM SURGE). */
export function surgePip(m: SurgeMeter, now: number): boolean {
  m.pips = m.pips.filter((t) => now - t < SURGE_TTL_MS);
  m.pips.push(now);
  if (m.pips.length >= SURGE_PIPS) {
    m.pips = [];
    m.firedAt = now;
    return true;
  }
  return false;
}

export function surgeLevel(m: SurgeMeter, now: number): number {
  return m.pips.filter((t) => now - t < SURGE_TTL_MS).length;
}

/** A Break window in wall time (server: bout receive time - sim_ms + simT). */
export interface BreakWindow { player: string; start: number; end: number; crits: number }

/**
 * Sync Strike: two or more teammates each land a crit inside Break windows
 * that overlap in wall time or start within 3 s of each other. Returns the
 * players whose Break earns +25%.
 */
export function syncStrikes(windows: readonly BreakWindow[]): Set<string> {
  const out = new Set<string>();
  const w = windows.filter((x) => x.crits > 0);
  for (let i = 0; i < w.length; i++) {
    for (let j = i + 1; j < w.length; j++) {
      if (w[i].player === w[j].player) continue;
      const overlap = w[i].start < w[j].end && w[j].start < w[i].end;
      const near = Math.abs(w[i].start - w[j].start) <= SYNC_START_MS;
      if (overlap || near) {
        out.add(w[i].player);
        out.add(w[j].player);
      }
    }
  }
  return out;
}

/**
 * Server settlement rule for an Ally Opening in a receiver's proof: it is
 * credited only if the Lure's own proof shows a PERFECT at a wall time 0-12 s
 * before the receiver's insertion (+-2 s tolerance). Unmatched ones are stripped.
 */
export function allyOpeningMatches(lurePerfectWall: readonly number[], insertedWall: number): boolean {
  return lurePerfectWall.some((t) => {
    const d = insertedWall - t;
    return d >= ALLY_MATCH_MIN_MS - ALLY_TOLERANCE_MS && d <= ALLY_MATCH_MAX_MS + ALLY_TOLERANCE_MS;
  });
}

/** Receivers hold at most one pending Ally Opening. */
export function deliverAlly(pending: Map<string, number>, receiver: string, now: number): boolean {
  if (pending.has(receiver)) return false;
  pending.set(receiver, now);
  return true;
}

/** Duel tug-of-war: -1..1 bar position from both players' replayed damage. */
export function tugPosition(mine: number, theirs: number): number {
  const total = mine + theirs;
  if (total <= 0) return 0;
  return Math.max(-1, Math.min(1, (mine - theirs) / Math.max(400, total)));
}

/** Did the lead change between two samples? (lead-change flash and sting) */
export function leadChanged(prevMine: number, prevTheirs: number, mine: number, theirs: number): boolean {
  const a = Math.sign(prevMine - prevTheirs);
  const b = Math.sign(mine - theirs);
  return a !== 0 && b !== 0 && a !== b;
}
