/**
 * roomState: the pure client mirror of a Line Party room.
 *
 * Snapshots and pushes can arrive twice, late or out of order (socket plus HTTP
 * poll fallback, reconnects on park LTE). Every server snapshot carries a
 * monotonic room version; we apply a snapshot only when it is not older than
 * what we hold, and round pushes only when they are for the current or a newer
 * round. Live rival scores are display telemetry and never decide anything.
 */
import type { EmoteEvent, ProgressWhisper, RoomSnapshot, RoundSummary } from './partyTypes';

export type PartyPhase =
  | 'idle'
  | 'joining'
  | 'lobby'
  | 'countdown'
  | 'playing'
  | 'ghosting'
  | 'submitting'
  | 'waiting'
  | 'spectating'
  | 'results'
  | 'left'
  | 'error';

export type Connection = 'offline' | 'connecting' | 'live' | 'polling';

export interface RivalProgress {
  score: number;
  streak: number;
  t: number;
  round: number;
  receivedAt: number;
  /** Their phone handed the seat to their ghost (backgrounded or left). */
  ghost?: boolean;
}

export interface MyEntry {
  roundId: string;
  verifiedScore: number | null;
  verdict: string | null;
  partial: boolean;
}

/** A personal HOLD in progress: only this player's board clock is frozen. */
export interface HoldState {
  reason: 'background' | 'manual';
  /** Wall ms (Date.now) when the hold started. */
  since: number;
  /** HOLD budget left for this micro-round when it started, ms. */
  budgetLeftMs: number;
  /** Wall ms when the resume count-in ends (null until the player is back). */
  resumeAt: number | null;
}

export interface PartyState {
  phase: PartyPhase;
  connection: Connection;
  userId: number | null;
  room: RoomSnapshot | null;
  rivals: Record<number, RivalProgress>;
  emotes: Array<EmoteEvent & { key: string; receivedAt: number }>;
  entry: MyEntry | null;
  /** Rounds this phone handed to its ghost (backgrounded, pocketed, left). */
  ghostedRoundId: string | null;
  error: { code: string; message: string } | null;
  leftReason: 'left_queue' | 'left' | 'closed' | null;
  clockOffsetMs: number;
  /** Screen names this phone may show (self, friends). Everyone else is a park alias. */
  known: Record<number, string>;
  hold: HoldState | null;
}

export function initialPartyState(userId: number | null = null): PartyState {
  return {
    phase: 'idle',
    connection: 'offline',
    userId,
    room: null,
    rivals: {},
    emotes: [],
    entry: null,
    ghostedRoundId: null,
    error: null,
    leftReason: null,
    clockOffsetMs: 0,
    known: {},
    hold: null,
  };
}

/** Friends see screen names; strangers only ever see the park alias. */
export function displayName(state: Pick<PartyState, 'known'>, userId: number | null | undefined, fallback: string | null | undefined): string {
  return (userId != null ? state.known[userId] : undefined) ?? fallback ?? 'Shark';
}

function mergeKnown(state: PartyState, snap: RoomSnapshot): Record<number, string> {
  const k = snap.you?.known;
  if (!k) return state.known;
  const next = { ...state.known };
  let changed = false;
  for (const [id, name] of Object.entries(k)) {
    if (next[Number(id)] !== name) { next[Number(id)] = name; changed = true; }
  }
  return changed ? next : state.known;
}

/**
 * True when `next` should replace `current`: a different room, or a strictly
 * newer version. An equal version carries the same room state (the server bumps
 * the version on every change), and a round pushed over the socket may already
 * be ahead of a poll that was in flight, so equal never overwrites.
 */
export function isNewerSnapshot(current: RoomSnapshot | null, next: RoomSnapshot): boolean {
  if (!current || current.id !== next.id) return true;
  return next.version > current.version;
}

export function applySnapshot(state: PartyState, snap: RoomSnapshot): PartyState {
  const current = state.room;
  if (!isNewerSnapshot(current, snap)) {
    // Same or older state; only our private `you` block may be fresher.
    if (current && snap.you && current.id === snap.id && snap.version === current.version) {
      return { ...state, room: { ...current, you: snap.you }, known: mergeKnown(state, snap) };
    }
    return state;
  }
  const previousRound = current?.round?.id ?? null;
  const nextRound = snap.round?.id ?? null;
  const roundChanged = previousRound !== nextRound;
  // Pushes carry no `you`; keep the last private block we got over HTTP.
  const you = snap.you ?? (current?.id === snap.id ? current?.you : undefined);
  return {
    ...state,
    room: { ...snap, you },
    known: mergeKnown(state, snap),
    rivals: roundChanged ? {} : state.rivals,
    entry: roundChanged && state.entry?.roundId !== nextRound ? null : state.entry,
  };
}

export function applyRound(state: PartyState, round: RoundSummary): PartyState {
  const room = state.room;
  if (!room) return state;
  const current = room.round;
  if (current && current.round_no > round.round_no) return state;
  if (current && current.id === round.id && current.status === 'finalized' && round.status !== 'finalized') return state;
  const status = round.status === 'finalized' ? 'results' : room.status === 'lobby' || room.status === 'results' ? 'countdown' : room.status;
  const roundChanged = current?.id !== round.id;
  // A private `you` block describes one round; drop it when a new round arrives.
  const you = roundChanged ? undefined : room.you;
  return {
    ...state,
    room: { ...room, round, round_no: Math.max(room.round_no, round.round_no), status, you },
    rivals: roundChanged ? {} : state.rivals,
    entry: roundChanged ? null : state.entry,
  };
}

export function applyProgress(state: PartyState, w: ProgressWhisper, receivedAt: number): PartyState {
  if (w.u === state.userId) return state;
  const round = state.room?.round;
  if (!round || w.r !== round.round_no) return state;
  const prev = state.rivals[w.u];
  if (prev && prev.round === w.r && prev.t > w.t) return state;
  return { ...state, rivals: { ...state.rivals, [w.u]: { score: w.s, streak: w.k, t: w.t, round: w.r, receivedAt } } };
}

export const EMOTE_TTL_MS = 2600;

export function applyEmote(state: PartyState, e: EmoteEvent, receivedAt: number): PartyState {
  const key = `${e.user_id}:${e.at_ms}`;
  if (state.emotes.some((x) => x.key === key)) return state;
  const fresh = state.emotes.filter((x) => receivedAt - x.receivedAt < EMOTE_TTL_MS);
  // One visible sticker per player; a new one replaces the old.
  const others = fresh.filter((x) => x.user_id !== e.user_id);
  return { ...state, emotes: [...others, { ...e, key, receivedAt }].slice(-8) };
}

/** Placement for a live board: 1 + number of seats strictly ahead. */
export function placementOf(score: number, all: number[]): number {
  return 1 + all.filter((s) => s > score).length;
}

export function ordinal(n: number): string {
  return n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : `${n}TH`;
}
