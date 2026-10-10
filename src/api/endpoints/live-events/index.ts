import client from '../../client';

/**
 * Shark Events (director stream): server-run live events.
 * GET /live-events?park_id=N and POST /live-events/{id}/open. New routes only.
 */
export interface EventReward {
  readonly coins: number;
  readonly tickets: number;
  readonly energy: number;
  readonly xp: number;
  readonly item: { readonly id: number; readonly name: string; readonly image: string | null } | null;
}

export interface EventChest {
  /** p1..pN (yours) or t1..tN (everyone's). */
  readonly key: string;
  readonly points: number;
  readonly reward: EventReward;
  readonly reached: boolean;
  readonly claimed: boolean;
  readonly claimable: boolean;
}

export type TeamKey = 'mouse' | 'globe' | 'shark';

export interface LiveEvent {
  readonly id: number;
  readonly slug: string;
  readonly title: string;
  readonly tagline: string | null;
  readonly art_key: string | null;
  readonly theme: { readonly primary?: string; readonly accent?: string; readonly deep?: string } | null;
  readonly phase: 'upcoming' | 'live' | 'ended';
  readonly starts_at: string;
  readonly ends_at: string;
  readonly claim_until: string;
  readonly server_now: string;
  readonly how_to: readonly { readonly icon: string; readonly text: string }[];
  readonly points: Readonly<Record<'home_find' | 'ride_win' | 'spotlight_win' | 'boss_hit', number>>;
  readonly daily_caps: Readonly<Record<string, number>>;
  /** The park asked about is part of this event. */
  readonly here: boolean;
  /** Star Ride win vs a normal win, rounded (2 = "x2"). */
  readonly star_times?: number;
  /** The event's goal in one word ("reef"); empty for a plain event. */
  readonly goal_word?: string;
  readonly include_home: boolean;
  readonly frenzy: {
    readonly active: boolean;
    readonly ends_at: string | null;
    readonly next_starts_at: string | null;
    readonly multiplier: number;
    readonly hours: readonly { readonly from: string; readonly to: string }[];
  };
  /** Today's Star Rides at the park asked about (same for everyone). */
  readonly star_rides: readonly { readonly task_id: number; readonly name: string; readonly latitude: number; readonly longitude: number }[];
  readonly me: { readonly points: number; readonly team: TeamKey | null; readonly helped: boolean; readonly chests: readonly EventChest[] };
  readonly together: { readonly total: number; readonly goal: number; readonly min_personal: number; readonly chests: readonly EventChest[] };
  /** Signs of life, counts only: points everyone added in the last 15 min, and when any chest was last opened. */
  readonly activity?: { readonly recent_points: number; readonly last_open_at: string | null };
  readonly team_race: {
    readonly scores: Readonly<Record<TeamKey, number>>;
    readonly leaders: readonly TeamKey[];
    readonly winners: readonly TeamKey[];
    readonly min_personal: number;
    readonly reward_all: EventReward;
    readonly reward_winner: EventReward;
    readonly you_won: boolean;
    readonly claimed: boolean;
    readonly claimable: boolean;
  } | null;
}

export async function getLiveEvents(parkId: number | null): Promise<readonly LiveEvent[]> {
  const { data } = await client.get<{ data: { events: LiveEvent[] } }>('/live-events', {
    params: parkId ? { park_id: parkId } : undefined,
    timeout: 8000,
  });
  const events = data?.data?.events;
  return Array.isArray(events) ? events : [];
}

export interface OpenChestResult {
  readonly already: boolean;
  readonly rewards: EventReward;
  readonly event: LiveEvent;
}

export async function openEventChest(eventId: number, key: string, parkId: number | null = null): Promise<OpenChestResult> {
  const { data } = await client.post<{ data: OpenChestResult }>(`/live-events/${eventId}/open`, parkId ? { key, park_id: parkId } : { key }, { timeout: 8000 });
  return data.data;
}
