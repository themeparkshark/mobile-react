/**
 * Whack multiplayer contract (design 10). Every mode is a set of solo Bursts
 * on shared seeds; the server replays each proof and applies the cross-player
 * rules. Nothing needs two players to be playing at the same moment, so a
 * moving line, a pocketed phone or a dropped socket never freezes anyone.
 *
 * WS5 / Line Party implement WhackNetAdapter over HTTPS + Reverb (the socket
 * only pushes reveals and HP; a 2 s poll covers it when it's down). The dev
 * MiniGameTester uses createLocalNetAdapter (local verify + house-crew bot).
 */

import type { BurstResult } from '../sim';
import type { WhackProofV2 } from '../proof';

export interface WhackGhost {
  name: string;
  /** Alex sticker / avatar id for the puck. */
  avatar?: string;
  /** The ghost's own board symmetry (weekly sub-seed). */
  xform: number;
  /** Hits as [gameTimeMs, hole] in the ghost's board. */
  hits: [number, number][];
  /** Score every 500 ms of game time (pace line). */
  pace: number[];
  score: number;
}

export interface WhackDuelConfig {
  matchId: string;
  matchSeed: number;
  burstIndex: number;
  rival: { name: string; avatar?: string };
  /** Sender event ids from the rival's previous Burst (goldens / DOUBLE BONKs), max 3. */
  incomingSplats: number[];
  /** Burst window deadline (epoch ms). */
  deadline: number;
  /** Bursts won so far: [me, rival]. */
  wins: [number, number];
}

export interface WhackRaidConfig {
  raidId: string;
  raidSeed: number;
  hpNow: number;
  hpMax: number;
  slotsLeft: number;
  closesAt: number;
  crew: { id: string; name: string; color: string; damage: number }[];
}

export type BurstVerdict =
  | { ok: true; score: number; result: BurstResult; flagged?: string | null; duel?: DuelReveal | null; raid?: RaidUpdate | null }
  | { ok: false; reason: string };

export interface DuelReveal {
  matchId: string;
  burstIndex: number;
  me: { score: number; hits: [number, number][] } | null;
  rival: { score: number; hits: [number, number][] } | null;
  winner: 'me' | 'rival' | 'tie';
  wins: [number, number];
  /** Splats I queued into the rival's next Burst. */
  sent: number;
  /** Sender ids the rival queued into my next Burst. */
  incoming: number[];
  matchOver: boolean;
  matchWinner?: 'me' | 'rival' | 'tie';
}

export interface RaidUpdate {
  raidId: string;
  hpNow: number;
  hpMax: number;
  damage: number;
  tagTeam: boolean;
  crew: WhackRaidConfig['crew'];
  defeated: boolean;
}

export type WhackServerEvent =
  | { type: 'DuelBurstRevealed'; reveal: DuelReveal }
  | { type: 'RaidHpChanged'; update: RaidUpdate }
  | { type: 'Emote'; from: string; sticker: number };

export interface WhackNetAdapter {
  submitBurst(proof: WhackProofV2): Promise<BurstVerdict>;
  subscribe(cb: (e: WhackServerEvent) => void): () => void;
  sendEmote(id: number): void;
}
