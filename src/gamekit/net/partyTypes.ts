/**
 * Wire types for Line Party (backend app/Domains/Party). Keep in step with
 * RoomService::snapshot and RoundService::summary.
 */
import type { BotProfile } from '../../games/party/bonkRace';

export type RoomStatus = 'lobby' | 'countdown' | 'playing' | 'results' | 'closed';
export type MemberState = 'active' | 'away';

export interface PartyMember {
  id: number;
  name: string;
  avatar_url: string | null;
  team: string | null;
  state: MemberState;
  ready: boolean;
  live_score: number | null;
}

export interface Seat {
  seat: number;
  kind: 'human' | 'bot';
  user_id?: number;
  name: string;
  avatar_url: string | null;
  team: string | null;
  profile?: BotProfile;
}

/**
 * Reason-coded verdicts (design 11.4). no_contest:* is never a loss: 0 points
 * and the dropped round of the series. Only dq:* is a proven cheat.
 */
export type Verdict =
  | 'ok'
  | 'bot'
  | 'no_contest:hold'
  | 'no_contest:walk'
  | 'no_contest:desync'
  | 'no_contest:left'
  | 'dq:token'
  | 'dq:impossible';

export function isNoContest(v: string | null | undefined): boolean {
  return !!v && v.startsWith('no_contest:');
}

export function isDq(v: string | null | undefined): boolean {
  return !!v && v.startsWith('dq:');
}

export interface SeatResult extends Seat {
  score: number;
  placement: number;
  points: number;
  filled_by: 'ghost' | null;
  filled_from_ms: number | null;
  verdict: Verdict | string;
  stats: {
    hits?: number;
    quick?: number;
    goldens?: number;
    sgHits?: number;
    maxStreak?: number;
    lureHits?: number;
    sgReactions?: number[];
    barScores?: number[];
  };
  /** Bonk Race v2: the board's own score; `score` = board_score + shared_bonus. */
  board_score?: number;
  /** +200 per Shared Golden SNATCH, settled room-wide by the server replay. */
  shared_bonus?: number;
  /** explain(): the biggest lost-points moment of this seat's log (design 7.1.5). */
  key_moment?: KeyMoment | null;
  /** Star Player highlight (design 8.3). */
  star?: StarHighlight | null;
}

export interface KeyMoment {
  kind: 'lure' | 'butterfingers' | 'golden_escaped' | 'shared_missed' | 'snatch_missed' | 'none';
  bar: number;
  at: number;
  cost: number;
  byMs: number;
}

export interface StarHighlight {
  category: 'snatches' | 'longest_streak' | 'goldens' | 'cleanest' | 'best_bar';
  value: number;
  bar?: number;
}

/** Per Shared Golden: the winning replayed reaction and the seats that snatched it. */
export interface SharedGoldResult {
  sg: number;
  reaction: number;
  winners: number[];
}

export interface RoundSummary {
  id: string;
  round_no: number;
  /** 1-5 inside the Party Series; 5 is the FINAL ROUND (double points). */
  series_round: number | null;
  final: boolean;
  game: string;
  sim_version: number;
  seed: number;
  start_at_ms: number;
  end_at_ms: number;
  duration_ms: number;
  status: 'scheduled' | 'finalized';
  seats: Seat[];
  results: SeatResult[] | null;
  /** Bonk Race v2 SNATCH settle; winners are indexes into `seats`. */
  shared?: SharedGoldResult[] | null;
}

export interface SeriesStanding {
  key: string;
  kind: 'human' | 'bot';
  user_id: number | null;
  name: string | null;
  avatar_url: string | null;
  team: string | null;
  /** Points per micro-round (null = not seated that round). */
  rounds: Array<number | null>;
  no_contest: boolean[];
  points: number;
  verified_total: number;
  dropped: number | null;
  rank: number;
}

export interface SeriesSummary {
  id: string;
  series_no: number;
  rounds_total: number;
  rounds_played: number;
  count_best: number;
  status: 'playing' | 'finished';
  standings: SeriesStanding[];
  crown_key: string | null;
  crown_user_id: number | null;
}

export interface RoomSnapshot {
  id: string;
  ride_id: number | null;
  kind: string;
  status: RoomStatus;
  game: string;
  capacity: number;
  version: number;
  round_no: number;
  host_user_id: number | null;
  autostart_at_ms: number | null;
  server_ms: number;
  members: PartyMember[];
  round: RoundSummary | null;
  series?: SeriesSummary | null;
  you?: {
    user_id: number;
    /** The round the seat/submitted fields describe. */
    round_id: string | null;
    state: string | null;
    seat: number | null;
    submitted: boolean;
    verified_score: number | null;
    verdict: string | null;
    /** Private to this phone: proves the submit came from the seated player. */
    round_token?: string | null;
    /** Real screen names this viewer may see (self and friends); everyone else is a park alias. */
    known?: Record<string, string>;
  };
}

export interface EntryResponse {
  entry: {
    seat: number;
    partial: boolean;
    verified_score: number | null;
    verdict: string | null;
    reason?: string | null;
    stats: Record<string, number>;
  };
  room: RoomSnapshot;
}

export interface PartyApiError {
  status: number;
  code: string;
  message: string;
  room?: RoomSnapshot;
}

/** Sticker emotes: ids of Alex's original art. Never text, never emoji. */
export const EMOTES = ['foam_finger', 'sunglasses', 'gift', 'treasure', 'fin', 'compass', 'coin', 'bowtie'] as const;
export type EmoteId = (typeof EMOTES)[number];

export interface EmoteEvent {
  user_id: number;
  emote: EmoteId;
  at_ms: number;
  /** 2+ players sent the same sticker within 1 s (combo emote). */
  combo?: number;
}

/** 4 Hz display telemetry whispered between phones. Never trusted by the server. */
export interface ProgressWhisper {
  u: number;
  s: number;
  k: number;
  t: number;
  r: number;
  /** Shared Golden reactions so far (-1 = not hit), so a dropped SNATCH whisper heals. */
  g?: number[];
}

/**
 * Sent the moment a player bonks a Shared Golden (design 7.1.3), so every phone
 * can stamp SNATCHED one beat after the window. Display only: the server's
 * settle of the replayed logs is final.
 */
export interface SnatchWhisper {
  u: number;
  r: number;
  /** 1-5: the Shared Golden of bar 2/4/6/8/10 */
  sg: number;
  /** replayed-style reaction: tap board-ms minus spawn board-ms */
  ms: number;
}
