/**
 * Line Heat client (design rev 8, 11.2): a live race every 3 minutes per ride
 * queue. Everyone in that ride's line plays the same seed (the full Ride
 * timeline with queue telegraph leads and the day's Park Twist), with a live
 * ranked strip of up to 8 sharks. No sends and no new sim rules: results
 * resolve from verified replays only (the server ranks; the strip is a
 * never-trusted 4 Hz display whisper).
 *
 * Pure model (node-tested): schedule chip, join window, strip interpolation
 * and privacy, Finn fill bots, podium. The transport is an interface: WS7
 * provides RoundScheduled on presence-ride.{rideId}.line (Reverb) or the 1 Hz
 * polling fallback (multiplayer.md 10.1). LocalHeatTransport drives the dev lab.
 */

import { HEAT_CLOSE_S, HEAT_JOIN_S, HEAT_MAX_STRIP, HEAT_MIN_FIELD, HEAT_PERIOD_S, RIDE_STEPS } from './constants';
import { BOT_EXPERT, BOT_HUMAN, botInput, createBot, type Bot } from './bots';
import { mixSeed } from './fixed';
import { MODE_HEAT, createSim, finalScore, gatedTier, step, ballIsLive, type SimConfig, type SimState } from './sim';

/** multiplayer.md RoundScheduled for game "banana". */
export interface HeatRound {
  roundId: number;
  rideId: string;
  seed: number;
  twist: number;
  /** Epoch ms (server clock) of GO, on the 3-minute grid. */
  startAt: number;
  durationBars: number;
}

/** The 4 Hz display whisper (never trusted). */
export interface HeatWhisper {
  playerId: string;
  clockStep: number;
  x: number;
  score: number;
  chain: number;
  tier: number;
  hearts: number;
  ballLive: boolean;
  frozen: boolean;
  /** Receive time (local ms) for interpolation. */
  at: number;
}

export interface HeatPlayer {
  id: string;
  name: string;
  /** Friend or crew: avatar and name shown. Strangers render as a fin silhouette. */
  known: boolean;
  team: string;
  bot: boolean;
}

export interface HeatStripEntry {
  id: string;
  label: string;
  score: number;
  me: boolean;
  frozen: boolean;
  bot: boolean;
  silhouette: boolean;
  team: string;
}

export interface HeatResult {
  playerId: string;
  name: string;
  score: number;
  status: 'verified' | 'dnf';
  rank: number;
}

export interface HeatTransport {
  /** RoundScheduled pushes (at least 2 bars before start_at). Returns an unsubscribe. */
  onScheduled(rideId: string, cb: (r: HeatRound) => void): () => void;
  join(round: HeatRound): Promise<{ ok: boolean; reason?: string }>;
  whisper(round: HeatRound, w: Omit<HeatWhisper, 'at' | 'playerId'>): void;
  onWhisper(round: HeatRound, cb: (w: HeatWhisper, p: HeatPlayer) => void): () => void;
  results(round: HeatRound): Promise<HeatResult[] | null>;
  /** Server clock offset (serverMs - localMs) from ClockSync. */
  offsetMs(): number;
}

// -- schedule -----------------------------------------------------------------------------------

/** The next heat GO on the server's 3-minute grid (epoch ms). */
export function nextHeatAt(serverNowMs: number): number {
  const p = HEAT_PERIOD_S * 1000;
  return Math.ceil((serverNowMs + 1) / p) * p;
}

export function heatIndex(startAt: number): number {
  return Math.floor(startAt / (HEAT_PERIOD_S * 1000));
}

/** Client fallback seed; the server sends seed = hash(rideId, heat index) and wins. */
export function heatSeed(rideId: string, index: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < rideId.length; i++) {
    h ^= rideId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return mixSeed(h >>> 0, index >>> 0);
}

/** "NEXT HEAT 1:42" for the start and results cards. */
export function heatChip(serverNowMs: number): string {
  const left = Math.max(0, Math.ceil((nextHeatAt(serverNowMs) - serverNowMs) / 1000));
  const m = Math.floor(left / 60);
  const s = `${left % 60}`.padStart(2, '0');
  return `NEXT HEAT ${m}:${s}`;
}

/** Synced 3-2-1: the number to show at a server time (null = not counting, 0 = GO). */
export function countIn(serverNowMs: number, startAt: number): number | null {
  const d = startAt - serverNowMs;
  if (d > 3000 || d < -600) return null;
  if (d <= 0) return 0;
  return Math.ceil(d / 1000);
}

/** Your clock starts on your first touch within 10 s after GO, else you roll to the next heat. */
export function joinState(serverNowMs: number, startAt: number, firstTouchAt: number | null): 'waiting' | 'live' | 'rolled' {
  if (firstTouchAt !== null && firstTouchAt >= startAt && firstTouchAt <= startAt + HEAT_JOIN_S * 1000) return 'live';
  if (serverNowMs > startAt + HEAT_JOIN_S * 1000) return 'rolled';
  return 'waiting';
}

/** The heat closes at start_at + 150 s; unfinished runs are DNF with their partial score. */
export function heatClosed(serverNowMs: number, startAt: number): boolean {
  return serverNowMs >= startAt + HEAT_CLOSE_S * 1000;
}

export function heatConfig(r: HeatRound, difficulty: number, deck: string, cards: number): SimConfig {
  return { seed: r.seed >>> 0, difficulty, mode: MODE_HEAT, deck, unlock: 3, cards, assist: false, twist: r.twist, heatId: r.roundId };
}

// -- strip ------------------------------------------------------------------------------------------

/** Linear interpolation of a whisper pair, 250 ms behind (1 s on polling). */
export function interpScore(prev: HeatWhisper | null, cur: HeatWhisper, nowMs: number, delayMs = 250): number {
  if (!prev || cur.at <= prev.at) return cur.score;
  const t = nowMs - delayMs;
  const u = Math.max(0, Math.min(1, (t - prev.at) / (cur.at - prev.at)));
  return Math.round(prev.score + (cur.score - prev.score) * u);
}

/**
 * Build the ranked strip: up to 8 sharks, yours always included. Privacy per
 * multiplayer.md 10.2: strangers are a fin silhouette in their team color
 * (no name, never coordinates); friends and crew show their name.
 */
export function buildStrip(
  me: { id: string; score: number; frozen: boolean; team: string },
  rivals: { player: HeatPlayer; score: number; frozen: boolean }[],
): HeatStripEntry[] {
  const all: HeatStripEntry[] = [
    { id: me.id, label: 'YOU', score: me.score, me: true, frozen: me.frozen, bot: false, silhouette: false, team: me.team },
    ...rivals.map((r) => ({
      id: r.player.id,
      label: r.player.bot ? 'FINN' : r.player.known ? r.player.name.slice(0, 8).toUpperCase() : '',
      score: r.score,
      me: false,
      frozen: r.frozen,
      bot: r.player.bot,
      silhouette: !r.player.bot && !r.player.known,
      team: r.player.team,
    })),
  ];
  all.sort((a, b) => b.score - a.score || (a.me ? -1 : b.me ? 1 : a.id < b.id ? -1 : 1));
  if (all.length <= HEAT_MAX_STRIP) return all;
  const top = all.slice(0, HEAT_MAX_STRIP);
  if (!top.some((e) => e.me)) top[HEAT_MAX_STRIP - 1] = all.find((e) => e.me) as HeatStripEntry;
  return top;
}

// -- Finn fill bots ------------------------------------------------------------------------------------

export interface FinnBot {
  player: HeatPlayer;
  sim: SimState;
  bot: Bot;
}

/** With fewer than 4 humans the strip fills to 4 with labeled FINN bots (Human and Expert profiles). Never on boards. */
export function fillBots(cfg: SimConfig, humans: number): FinnBot[] {
  const need = Math.max(0, HEAT_MIN_FIELD - humans);
  const out: FinnBot[] = [];
  for (let i = 0; i < need; i++) {
    const kind = i % 2 === 0 ? BOT_HUMAN : BOT_EXPERT;
    out.push({
      player: { id: `finn-${i}`, name: 'FINN', known: true, team: 'finn', bot: true },
      sim: createSim({ ...cfg, cards: 0xffff }),
      bot: createBot(kind, mixSeed(cfg.seed >>> 0, 0x4649 + i)),
    });
  }
  return out;
}

/** Bots never freeze: they run on the heat's wall clock (60 steps per second since GO). */
export function advanceBots(bots: FinnBot[], elapsedMs: number): void {
  const target = Math.min(RIDE_STEPS + 400, Math.floor((elapsedMs * 60) / 1000));
  for (const b of bots) {
    let guard = 0;
    while (!b.sim.done && b.sim.steps < target && guard < 4000) {
      step(b.sim, 1, botInput(b.sim, b.bot));
      guard++;
    }
  }
}

export function botWhisper(b: FinnBot): { score: number; frozen: boolean } {
  return { score: b.sim.done ? finalScore(b.sim) : b.sim.score, frozen: false };
}

/** The display whisper for your own run. */
export function myWhisper(s: SimState, frozen: boolean): Omit<HeatWhisper, 'at' | 'playerId'> {
  return {
    clockStep: s.clock, x: s.bx >> 8, score: s.score, chain: s.chain, tier: gatedTier(s), hearts: s.hearts,
    ballLive: ballIsLive(s), frozen,
  };
}

/** Podium from verified results (top 3), with DNF handled. */
export function podium(results: HeatResult[]): HeatResult[] {
  return results.filter((r) => r.status === 'verified').sort((a, b) => a.rank - b.rank).slice(0, 3);
}

// -- local transport (dev lab, and the no-network fallback that races Finns) -------------------------------

export class LocalHeatTransport implements HeatTransport {
  private subs: ((r: HeatRound) => void)[] = [];
  private whisperSubs: ((w: HeatWhisper, p: HeatPlayer) => void)[] = [];
  constructor(private rideId: string, private leadMs = 6000) {}

  onScheduled(_rideId: string, cb: (r: HeatRound) => void): () => void {
    this.subs.push(cb);
    const startAt = Date.now() + this.leadMs;
    const idx = heatIndex(startAt);
    const r: HeatRound = { roundId: idx, rideId: this.rideId, seed: heatSeed(this.rideId, idx), twist: 1 + (idx % 4), startAt, durationBars: 24 };
    setTimeout(() => cb(r), 10);
    return () => {
      this.subs = this.subs.filter((s) => s !== cb);
    };
  }

  async join(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  whisper(): void {
    // Local: nobody else to tell.
  }

  onWhisper(_r: HeatRound, cb: (w: HeatWhisper, p: HeatPlayer) => void): () => void {
    this.whisperSubs.push(cb);
    return () => {
      this.whisperSubs = this.whisperSubs.filter((s) => s !== cb);
    };
  }

  async results(): Promise<HeatResult[] | null> {
    return null;
  }

  offsetMs(): number {
    return 0;
  }
}
