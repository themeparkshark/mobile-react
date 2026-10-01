/**
 * modes/stealApi.ts: Steal Duel and lobby over plain HTTP (design v8 10.3).
 *
 * No sockets: the lobby short-polls every 3000ms while the booth menu is open,
 * the rival's flips poll every 500ms on their turn (2000ms on yours), and every
 * write happens only on a tap (QUICK DUEL, a token's duel card, ACCEPT, a
 * flip). Until WS7 ships these endpoints every call fails fast and the menu
 * falls back to the house shark practice duel (labelled as such, never a
 * made-up person).
 *
 *   GET  /memory/duels/lobby?ride_id                 tokens, next_tick_at, waiting
 *   POST /memory/duels {kind, target_user_id | quick, ride_id}
 *   POST /memory/duels/{id}/accept
 *   POST /memory/steal/{id}/flips {slot, client_seq}
 *   GET  /memory/steal/{id}/events?after=seq
 */

import apiClient from '../../../api/client';
import type { SDEvent } from './stealDuel';

export interface LobbyToken {
  user_id: number;
  username: string;
  /** Shark outfit key (party art), never location. */
  outfit: string;
}

export interface Lobby {
  tokens: LobbyToken[];
  /** Server ms of the next 30s QUICK pairing tick. */
  next_tick_at: number;
  server_time: number;
  waiting: number;
}

export const LOBBY_POLL_MS = 3000;
export const QUICK_TICK_MS = 30000;
export const RIVAL_POLL_MS = 500;
export const MY_TURN_POLL_MS = 2000;

/** Seconds to the next 30s tick (client fallback when the lobby is offline). */
export function secondsToTick(nowMs: number, tickMs = QUICK_TICK_MS): number {
  return Math.ceil((tickMs - (nowMs % tickMs)) / 1000);
}

export function lobbyLine(secs: number, sharks: number): string {
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');
  return `STEAL DUEL in ${mm}:${ss} · ${sharks} ${sharks === 1 ? 'shark' : 'sharks'} in line`;
}

export async function fetchLobby(rideId: number | string | null): Promise<Lobby | null> {
  try {
    const res = await apiClient.get('/memory/duels/lobby', { params: rideId != null ? { ride_id: rideId } : {}, timeout: 2500 });
    const d = res?.data?.data ?? res?.data;
    if (!d || !Array.isArray(d.tokens)) return null;
    return d as Lobby;
  } catch {
    return null;
  }
}

/** Only called from the QUICK DUEL tap. */
export async function requestQuickDuel(rideId: number | string | null): Promise<{ id: number } | null> {
  try {
    const res = await apiClient.post('/memory/duels', { kind: 'steal', quick: true, ride_id: rideId }, { timeout: 2500 });
    const d = res?.data?.data ?? res?.data;
    return d && Number.isFinite(d.id) ? { id: d.id } : null;
  } catch {
    return null;
  }
}

export async function postFlip(duelId: number, slot: number, clientSeq: number): Promise<SDEvent[] | null> {
  try {
    const res = await apiClient.post(`/memory/steal/${duelId}/flips`, { slot, client_seq: clientSeq }, { timeout: 4000 });
    return (res?.data?.events ?? null) as SDEvent[] | null;
  } catch {
    return null;
  }
}

export async function pollEvents(duelId: number, after: number): Promise<{ events: SDEvent[]; seq: number } | null> {
  try {
    const res = await apiClient.get(`/memory/steal/${duelId}/events`, { params: { after }, timeout: 3000 });
    const d = res?.data ?? null;
    return d && Array.isArray(d.events) ? { events: d.events as SDEvent[], seq: Number(d.seq) || after } : null;
  } catch {
    return null;
  }
}
