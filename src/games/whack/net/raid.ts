/**
 * Crew Raid (design 10.2 B): an async shared boss per crew per ride queue.
 * A 10-minute window, 3 Raid Bursts per member, HP = 30 x crew (min 45).
 * Damage is the server-replayed boss damage. Two members whose Bursts finish
 * within 60 s of each other both get +15% ("TAG TEAM!").
 */

export const RAID_WINDOW_MS = 10 * 60 * 1000;
export const RAID_SLOTS = 3;
export const TAG_TEAM_MS = 60 * 1000;
export const TAG_TEAM_BONUS = 0.15;
export const CREW_COLORS = ['#00a5f5', '#1fc8b8', '#fec90e', '#ff6b5c'];

export interface RaidHit { member: string; damage: number; finishedAt: number; tagTeam: boolean }

export interface RaidState {
  hpMax: number;
  hp: number;
  openedAt: number;
  hits: RaidHit[];
  slotsUsed: Record<string, number>;
  defeatedAt: number | null;
}

export function raidHpMax(crewCount: number): number {
  return Math.max(45, 30 * Math.max(1, Math.min(4, crewCount)));
}

export function createRaid(crewCount: number, openedAt: number): RaidState {
  const hpMax = raidHpMax(crewCount);
  return { hpMax, hp: hpMax, openedAt, hits: [], slotsUsed: {}, defeatedAt: null };
}

function effective(h: RaidHit): number {
  return Math.round(h.damage * (h.tagTeam ? 1 + TAG_TEAM_BONUS : 1));
}

/**
 * Apply one verified Raid Burst. Returns the damage applied (with Tag Team) or
 * null when refused (window closed, no slots, raid already down).
 */
export function applyRaidBurst(r: RaidState, member: string, damage: number, finishedAt: number): { applied: number; tagTeam: boolean } | null {
  if (r.defeatedAt != null) return null;
  if (finishedAt - r.openedAt > RAID_WINDOW_MS) return null;
  const used = r.slotsUsed[member] ?? 0;
  if (used >= RAID_SLOTS) return null;
  r.slotsUsed[member] = used + 1;
  const hit: RaidHit = { member, damage: Math.max(0, Math.floor(damage)), finishedAt, tagTeam: false };
  // Tag Team: a crewmate's Burst finished within 60 s (either side). Both get +15%.
  for (const other of r.hits) {
    if (other.member !== member && Math.abs(other.finishedAt - finishedAt) <= TAG_TEAM_MS) {
      hit.tagTeam = true;
      if (!other.tagTeam) other.tagTeam = true;
    }
  }
  r.hits.push(hit);
  const dealt = r.hits.reduce((sum, h) => sum + effective(h), 0);
  r.hp = Math.max(0, r.hpMax - dealt);
  if (r.hp === 0) r.defeatedAt = finishedAt;
  return { applied: effective(hit), tagTeam: hit.tagTeam };
}

/** Crew-colored damage slices for the HP bar (member order = roster order). */
export function raidSlices(r: RaidState, roster: string[]): { member: string; color: string; damage: number }[] {
  return roster.map((m, i) => ({
    member: m,
    color: CREW_COLORS[i % CREW_COLORS.length],
    damage: r.hits.filter((h) => h.member === m).reduce((s, h) => s + effective(h), 0),
  }));
}
