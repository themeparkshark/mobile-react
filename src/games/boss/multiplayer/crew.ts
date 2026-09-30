/**
 * Crew presence for Boss Brawl: live teammates (transport) and the house-crew
 * fill, plus async ghost races. All of it is presentation plus team windows;
 * every point of damage still comes from each player's own replayed proof.
 *
 * - `HouseCrew`: when the queue has nobody else (or a teammate drops or
 *   backgrounds), deterministic house-crew sharks fight the same team seed on
 *   their own clocks, joined a few seconds apart, walking between bouts like a
 *   real line. They lunge on their crits, feed the Team Surge meter, and the
 *   Lure's PERFECTs send you Ally Openings, exactly as a human teammate would.
 * - `GhostRun`: a stored round log (yours or a friend's) replayed on the same
 *   seed and variant against your bout clock, with a running delta.
 * - `CrewTransport`: the seam a live transport (the 2 s raid poll or Reverb
 *   presence, WS6) plugs into. Same event shape as the house crew.
 */
import { replayRound, type RoundLog } from '../sim/round';
import { runBotRound, BOTS } from '../sim/bots';
import { E_BREAK, E_BREAK_END, E_CRIT, E_HEAVY, E_PERFECT, E_PUNISH, UNIT_POINTS, type Bout } from '../sim/encounter';
import type { BossId } from '../sim/constants';
import { mixSeed } from '../../../gamekit/core/rng';
import { lureFor, type Teammate } from './strikeTeam';

export const CREW_LUNGE = 1;
export const CREW_PERFECT = 2;
export const CREW_BREAK = 3;
export const CREW_BREAK_END = 4;
export const CREW_CAUGHT = 5;
export const CREW_BOUT = 6;
export const CREW_EMOTE = 7;

export interface CrewEvent {
  kind: number;
  who: string;
  /** Wall time (ms since the round started for the local player). */
  at: number;
  /** Bout index for CREW_BOUT, emote id for CREW_EMOTE. */
  a?: number;
  lure?: boolean;
}

export interface CrewTransport {
  /** Teammates currently in the raid slot (presence). */
  roster(): Teammate[];
  /** Pull new events since the last call (poll or socket buffer). */
  drain(nowWall: number): CrewEvent[];
  /** Publish my own team-relevant events (PERFECT, Break windows, emotes). */
  publish(ev: CrewEvent): void;
}

interface Scripted { at: number; ev: CrewEvent }

/** Timeline of one bot round mapped onto wall time with walking intermissions. */
function scriptFor(mate: Teammate, boss: BossId, seed: number, teamSeed: number, startAt: number, skill: string): Scripted[] {
  const bouts = runBotRound(boss, seed, BOTS[skill] ?? BOTS.median);
  const out: Scripted[] = [];
  let wall = startAt;
  bouts.forEach((b: Bout, n: number) => {
    const boutStart = wall + 1200;
    out.push({ at: boutStart, ev: { kind: CREW_BOUT, who: mate.id, at: boutStart, a: n } });
    for (const e of b.events) {
      const at = boutStart + e.t;
      if (e.code === E_CRIT || e.code === E_HEAVY) out.push({ at, ev: { kind: CREW_LUNGE, who: mate.id, at } });
      else if (e.code === E_PERFECT) out.push({ at, ev: { kind: CREW_PERFECT, who: mate.id, at } });
      else if (e.code === E_BREAK) out.push({ at, ev: { kind: CREW_BREAK, who: mate.id, at } });
      else if (e.code === E_BREAK_END) out.push({ at, ev: { kind: CREW_BREAK_END, who: mate.id, at } });
      else if (e.code === E_PUNISH) out.push({ at, ev: { kind: CREW_CAUGHT, who: mate.id, at } });
    }
    // Walks with the line between bouts: 4-14 s, seeded.
    const pause = 4000 + (mixSeed(teamSeed, (n + 1) * 97 + mate.order) % 10000);
    wall = boutStart + Math.max(0, b.endT) + pause;
  });
  return out.sort((x, y) => x.at - y.at);
}

export class HouseCrew implements CrewTransport {
  private mates: Teammate[];
  private script: Scripted[];
  private idx = 0;
  private boutOf = new Map<string, number>();
  readonly teamSeed: number;
  readonly me: Teammate;
  readonly published: CrewEvent[] = [];

  constructor(boss: BossId, teamSeed: number, count = 2, meName = 'You') {
    this.teamSeed = teamSeed >>> 0;
    this.me = { id: 'me', name: meName, order: 0 };
    const names = ['Finn', 'Coral', 'Bubbles', 'Reef'];
    const skills = ['median', 'mastery', 'median', 'ringBlind'];
    this.mates = [];
    this.script = [];
    for (let i = 0; i < count; i++) {
      const mate: Teammate = { id: `crew${i}`, name: names[i % names.length], order: i + 1, bot: true };
      this.mates.push(mate);
      // Joined a few seconds apart; nobody waits for anyone.
      const start = 1500 + i * 3500 + (mixSeed(this.teamSeed, i + 11) % 2500);
      this.script.push(...scriptFor(mate, boss, this.teamSeed, this.teamSeed, start, skills[i % skills.length]));
    }
    this.script.sort((a, b) => a.at - b.at);
  }

  roster(): Teammate[] {
    return [this.me, ...this.mates];
  }

  /** Who is the Lure right now (among players in a bout), if anyone. */
  lure(myBout: number, meInBout: boolean): string | null {
    const inBout = this.mates.filter((m) => this.boutOf.has(m.id));
    if (meInBout) inBout.push(this.me);
    return lureFor(this.teamSeed, myBout, inBout);
  }

  drain(nowWall: number): CrewEvent[] {
    const out: CrewEvent[] = [];
    while (this.idx < this.script.length && this.script[this.idx].at <= nowWall) {
      const e = this.script[this.idx++].ev;
      if (e.kind === CREW_BOUT) this.boutOf.set(e.who, e.a ?? 0);
      out.push(e);
    }
    return out;
  }

  publish(ev: CrewEvent): void {
    this.published.push(ev);
  }

  mateIds(): string[] {
    return this.mates.map((m) => m.id);
  }
}

// ---- ghost race -------------------------------------------------------------

export interface GhostTimeline {
  /** Per bout: [simT, cumulative points] steps, and the bout's final points. */
  bouts: { steps: number[]; total: number; lunges: number[] }[];
  name: string;
}

export function ghostTimeline(log: RoundLog, name: string): GhostTimeline {
  const bouts = replayRound(log);
  return {
    name,
    bouts: bouts.map((b) => {
      const steps: number[] = [];
      const lunges: number[] = [];
      let units = 0;
      for (const e of b.events) {
        if (e.v > 0) {
          units += e.v;
          steps.push(e.t, Math.floor(units / UNIT_POINTS));
        }
        if (e.code === E_CRIT || e.code === E_HEAVY) lunges.push(e.t);
      }
      return { steps, total: Math.floor(b.sum / UNIT_POINTS), lunges };
    }),
  };
}

/** Ghost's points at (bout, simT): previous bouts' totals plus this bout so far. */
export function ghostAt(g: GhostTimeline, bout: number, t: number): number {
  let sum = 0;
  for (let i = 0; i < bout && i < g.bouts.length; i++) sum += g.bouts[i].total;
  const cur = g.bouts[bout];
  if (!cur) return sum;
  let v = 0;
  for (let i = 0; i < cur.steps.length; i += 2) {
    if (cur.steps[i] > t) break;
    v = cur.steps[i + 1];
  }
  return sum + v;
}
