/**
 * Sharky missions (design 5.5): 3 active from a pool, local in the slice with
 * a visible rank bar (3 completions = rank up). Shark Coin payouts switch on
 * when WS7's endpoint is live; nothing here grants currency.
 */

export interface RunStats {
  skims: number;
  perfects: number;
  frenzies: number;
  tokens: number;
  chomps: number;
  score: number;
  gates: number;
  coins: number;
  dashes: number;
  hits: number;
}

export interface MissionDef {
  id: string;
  text: string;
  target: number;
  /** 'sum' accumulates across runs; 'best' must happen in one run. */
  kind: 'sum' | 'best';
  unlock: number;
  read: (s: RunStats) => number;
}

export const MISSION_POOL: MissionDef[] = [
  { id: 'skim10', text: 'Skim 10 times', target: 10, kind: 'sum', unlock: 2, read: (s) => s.skims },
  { id: 'perfect3', text: 'Perfect 3 rings in one run', target: 3, kind: 'best', unlock: 0, read: (s) => s.perfects },
  { id: 'frenzy1', text: 'Reach a FRENZY', target: 1, kind: 'best', unlock: 0, read: (s) => s.frenzies },
  { id: 'tokens3', text: 'Grab all 3 Ride Tokens', target: 3, kind: 'best', unlock: 1, read: (s) => s.tokens },
  { id: 'chomp5', text: 'Chomp 5 prize boxes or puffers', target: 5, kind: 'sum', unlock: 1, read: (s) => s.chomps },
  { id: 'score3000', text: 'Score 3,000 in one run', target: 3000, kind: 'best', unlock: 0, read: (s) => s.score },
  { id: 'gates3', text: 'Reach 3 Tide Gates in one run', target: 3, kind: 'best', unlock: 0, read: (s) => s.gates },
  { id: 'coins60', text: 'Collect 60 coins in one run', target: 60, kind: 'best', unlock: 0, read: (s) => s.coins },
  { id: 'dash6', text: 'Boost Dash 6 times', target: 6, kind: 'sum', unlock: 2, read: (s) => s.dashes },
  { id: 'clean', text: 'Finish a run without a hit', target: 1, kind: 'best', unlock: 0, read: (s) => (s.hits === 0 && s.score > 0 ? 1 : 0) },
];

export interface MissionSlot {
  id: string;
  progress: number;
  done: boolean;
}

export interface MissionUpdate {
  missions: MissionSlot[];
  completed: string[];
  rank: number;
  rankedUp: boolean;
  /** Completions toward the next rank (0..2). */
  rankProgress: number;
}

function pick(tier: number, taken: Set<string>, salt: number): MissionSlot | null {
  const open = MISSION_POOL.filter((m) => m.unlock <= tier && !taken.has(m.id));
  if (!open.length) return null;
  const m = open[Math.abs(salt) % open.length];
  return { id: m.id, progress: 0, done: false };
}

/** Fill to 3 active missions (missions start at run 3). */
export function activeMissions(current: MissionSlot[], tier: number, salt: number): MissionSlot[] {
  const out = current.filter((m) => !m.done && MISSION_POOL.some((p) => p.id === m.id)).slice(0, 3);
  const taken = new Set(out.map((m) => m.id));
  let k = 0;
  while (out.length < 3) {
    const next = pick(tier, taken, salt + k * 7);
    if (!next) break;
    taken.add(next.id);
    out.push(next);
    k++;
  }
  return out;
}

export function applyRun(current: MissionSlot[], rank: number, rankCount: number, tier: number, stats: RunStats, salt: number): MissionUpdate & { rankCount: number } {
  const act = activeMissions(current, tier, salt);
  const completed: string[] = [];
  const updated = act.map((slot) => {
    const def = MISSION_POOL.find((m) => m.id === slot.id)!;
    const v = def.read(stats);
    const progress = def.kind === 'sum' ? Math.min(def.target, slot.progress + v) : Math.max(slot.progress, Math.min(def.target, v));
    const done = progress >= def.target;
    if (done) completed.push(slot.id);
    return { id: slot.id, progress, done };
  });
  let count = rankCount + completed.length;
  let r = rank;
  let rankedUp = false;
  while (count >= 3) {
    count -= 3;
    r += 1;
    rankedUp = true;
  }
  return { missions: updated, completed, rank: r, rankedUp, rankProgress: count, rankCount: count };
}

export function missionText(id: string): string {
  return MISSION_POOL.find((m) => m.id === id)?.text ?? id;
}

export function missionTarget(id: string): number {
  return MISSION_POOL.find((m) => m.id === id)?.target ?? 1;
}
