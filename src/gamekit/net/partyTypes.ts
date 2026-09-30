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

export interface SeatResult extends Seat {
  score: number;
  placement: number;
  points: number;
  filled_by: 'ghost' | null;
  filled_from_ms: number | null;
  verdict: string;
  stats: {
    hits?: number;
    quick?: number;
    goldens?: number;
    maxStreak?: number;
    lureHits?: number;
  };
}

export interface RoundSummary {
  id: string;
  round_no: number;
  game: 'bonk_race';
  sim_version: number;
  seed: number;
  start_at_ms: number;
  end_at_ms: number;
  duration_ms: number;
  status: 'scheduled' | 'finalized';
  seats: Seat[];
  results: SeatResult[] | null;
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
  you?: {
    user_id: number;
    /** The round the seat/submitted fields describe. */
    round_id: string | null;
    state: string | null;
    seat: number | null;
    submitted: boolean;
    verified_score: number | null;
    verdict: string | null;
  };
}

export interface EntryResponse {
  entry: {
    seat: number;
    partial: boolean;
    verified_score: number | null;
    verdict: string | null;
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
}

/** 4 Hz display telemetry whispered between phones. Never trusted by the server. */
export interface ProgressWhisper {
  u: number;
  s: number;
  k: number;
  t: number;
  r: number;
}
