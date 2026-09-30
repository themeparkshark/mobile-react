import type { AdventureTicket, TripGoalRide } from '../../api/endpoints/me/trip-goal';
import type { LivePark, LiveRide } from '../../api/endpoints/parks/live';

type Point = { readonly latitude: number; readonly longitude: number };

const CLOSED = ['CLOSED', 'DOWN', 'REFURBISHMENT'];

/** The live response must belong to the ticket's park and remain recently confirmed. */
export function adventureRideClosed(ticket: AdventureTicket, live: LivePark | null, parkId: number, now: number): boolean {
  if (ticket.park_id !== parkId || ticket.phase === 'complete' || !live?.fetched_at) return false;
  const age = now - Date.parse(live.fetched_at);
  if (!Number.isFinite(age) || age < -30000 || age > 180000) return false;
  const matches = live.rides.filter(ride => ride.task_id === ticket.ride.task_id);
  return matches.length === 1 && CLOSED.includes(matches[0].status);
}

export function metersBetween(a: Point, b: Point): number {
  const k = Math.cos(((a.latitude + b.latitude) / 2) * Math.PI / 180);
  return Math.hypot((b.latitude - a.latitude) * 111320, (b.longitude - a.longitude) * 111320 * k);
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.max(5, Math.round(meters / 5) * 5)} m`;
}

/** Slack on top of the ride's own radius: GPS in a queue wanders. */
export const PLAY_GATE_SLACK_METERS = 25;

/**
 * Whether the player is standing at the ticket ride's queue. Unknown when either
 * position is missing: the server still verifies queue time, so Play stays open.
 */
export function adventurePlayGate(ticket: AdventureTicket, location: Point | null | undefined):
  { state: 'near' | 'far' | 'unknown'; meters: number | null } {
  const { lat, lng } = ticket.ride;
  if (!location || !Number.isFinite(lat) || !Number.isFinite(lng)) return { state: 'unknown', meters: null };
  const meters = metersBetween(location, { latitude: Number(lat), longitude: Number(lng) });
  const reach = Math.max(ticket.ride.radius ?? 50, 30) + PLAY_GATE_SLACK_METERS;
  return { state: meters <= reach ? 'near' : 'far', meters };
}

export interface AdventurePrompt {
  readonly title: string;
  readonly action: string;
  readonly detail: string;
  /** What the primary button does. */
  readonly intent: 'shelf' | 'detour' | 'discover' | 'play' | 'find_line' | 'celebrate';
}

/**
 * The one line the ticket leads with. Queue play never pauses for movement: the
 * line always moves, so the copy promises play-as-you-shuffle, not pausing.
 */
export function adventurePrompt(ticket: AdventureTicket, closed = false,
  gate: { state: 'near' | 'far' | 'unknown'; meters: number | null } = { state: 'unknown', meters: null }): AdventurePrompt {
  if (ticket.phase === 'complete') return { title: 'Your park-day souvenir', action: 'Visit my coin', detail: 'A coin, a story, a day to remember.', intent: 'shelf' };
  if (closed && ticket.phase !== 'celebrate') return { title: 'Adventure takes a detour', action: 'Choose another ride', detail: 'Keep every stamp you have earned.', intent: 'detour' };
  if (ticket.phase === 'discover') return { title: 'Your first chapter awaits', action: 'Find this coin', detail: 'Win its coin challenge at the ride.', intent: 'discover' };
  if (ticket.phase === 'play') {
    if (ticket.play_hint === 'get_in_line') {
      return { title: `Get in line at ${ticket.ride.ride_name}`, action: gate.state === 'far' ? 'Show me the line' : 'Play the queue adventure',
        detail: 'Your story is done. Finish it in this ride\'s queue to punch the Play stamp.', intent: gate.state === 'far' ? 'find_line' : 'play' };
    }
    if (gate.state === 'far') {
      return { title: 'A story for your next wait', action: 'Show me the line',
        detail: `${formatDistance(gate.meters ?? 0)} away. The story opens when you are in its queue.`, intent: 'find_line' };
    }
    return { title: 'A story for your next wait', action: 'Play the queue adventure', detail: 'Three short missions, made to play as the line moves.', intent: 'play' };
  }
  return { title: 'You made a park memory', action: 'Unfold my souvenir', detail: 'Your coin and your story, together.', intent: 'celebrate' };
}

/** Stamps in order: Discover, Play, Celebrate. */
export function adventureStamps(ticket: AdventureTicket): [boolean, boolean, boolean] {
  return [!!ticket.discover, !!ticket.play, ticket.phase === 'complete'];
}

/** Indexes of stamps earned since the player last saw this ticket on the map. */
export function newlyEarnedStamps(seen: readonly boolean[] | null, current: readonly boolean[]): number[] {
  if (!seen) return [];
  return current.flatMap((earned, index) => earned && !seen[index] ? [index] : []);
}

export interface DetourPick {
  readonly ride: TripGoalRide;
  readonly open: boolean;
  readonly meters: number | null;
  readonly wait: number | null;
}

/**
 * Detour picker: attractions at this park other than the current ride, closed or
 * down rides hidden, sorted open first, then nearest, then shortest wait. Top 3.
 */
export function rankDetours(rides: readonly TripGoalRide[], options: {
  readonly parkId: number;
  readonly currentTaskId: number;
  readonly live?: ReadonlyMap<number, LiveRide>;
  readonly coords?: ReadonlyMap<number, Point>;
  readonly location?: Point | null;
  readonly limit?: number;
}): DetourPick[] {
  const picks = rides.flatMap(ride => {
    if (ride.park_id !== options.parkId || !ride.ride_id || ride.task_id === options.currentTaskId ||
      ride.adventure_ready === false) return [];
    const live = options.live?.get(ride.task_id);
    if (live && CLOSED.includes(live.status)) return [];
    const spot = options.coords?.get(ride.task_id);
    const meters = spot && options.location ? metersBetween(options.location, spot) : null;
    return [{ ride, open: live?.status === 'OPERATING', meters, wait: live?.wait ?? null }];
  });
  const far = Number.MAX_SAFE_INTEGER;
  return picks.sort((a, b) => Number(b.open) - Number(a.open) || (a.meters ?? far) - (b.meters ?? far) ||
    (a.wait ?? far) - (b.wait ?? far) || a.ride.ride_name.localeCompare(b.ride.ride_name)).slice(0, options.limit ?? 3);
}

export function detourDetail(pick: DetourPick): string {
  const parts = [pick.open ? (pick.wait !== null ? `${pick.wait} min wait` : 'Open now') : null,
    pick.meters !== null ? formatDistance(pick.meters) : null,
    pick.ride.coin_owned ? 'Your coin, a new story' : 'A new coin to discover'];
  return parts.filter(Boolean).join(' · ');
}

/** A server 422 carries a readable reason; anything else keeps the offline copy. */
export function adventureErrorMessage(cause: unknown): string {
  const response = (cause as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } })?.response;
  if (response?.status === 422) {
    const first = Object.values(response.data?.errors ?? {})[0]?.[0];
    if (first || response.data?.message) return String(first ?? response.data?.message);
  }
  return 'Your ticket is safe. Reconnect and try again.';
}

/** Hand-off for WS3's measured shelf arrival on the Park screen (won coins only). */
export function adventureShelfArrival(ticket: AdventureTicket) {
  const discover = ticket.discover;
  if (!discover || discover.kind !== 'coin_win' || !discover.attempt_id) return null;
  return { attemptId: discover.attempt_id, assetId: discover.asset_id, taskId: discover.task_id,
    taskType: 'task' as const, firstCollection: false };
}
