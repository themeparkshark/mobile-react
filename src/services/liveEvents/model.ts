import type { EventChest, LiveEvent, TeamKey } from '../../api/endpoints/live-events';

/**
 * Shark Events: pure display rules (no React). Copy follows the kids panel:
 * pictures first, 3-4 words a line, clock times never ticking countdowns, no
 * server totals or point tables in the main view.
 */

const DAY_MS = 24 * 3600_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The one event to show: live first (soonest to end), then one with chests still to open, then the next upcoming. */
export function pickEvent(events: readonly LiveEvent[] | null | undefined): LiveEvent | null {
  if (!events?.length) return null;
  const live = events.filter(e => e.phase === 'live').sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at));
  if (live.length) return live[0];
  const ended = events.filter(e => e.phase === 'ended' && openableKeys(e).length > 0);
  if (ended.length) return ended[0];
  const upcoming = events.filter(e => e.phase === 'upcoming').sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return upcoming[0] ?? null;
}

/** "1 PM", "1:30 PM" in the phone's own time. */
export function clockTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  try {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).replace(':00', '');
  } catch {
    const h = d.getHours() % 12 || 12;
    const m = d.getMinutes();
    return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  }
}

function weekday(iso: string): string {
  return WEEKDAYS[new Date(iso).getDay()];
}

/** One short line about time: never a ticking countdown. */
export function timeLine(event: LiveEvent, now: number): string {
  if (event.phase === 'upcoming') {
    const ms = Date.parse(event.starts_at) - now;
    return ms < DAY_MS ? `Starts ${clockTime(event.starts_at)}` : `Starts ${weekday(event.starts_at)}`;
  }
  if (event.phase === 'ended') return 'Open your chests';
  const left = Date.parse(event.ends_at) - now;
  if (left < DAY_MS) return `Ends ${clockTime(event.ends_at)}`;
  if (left < 6 * DAY_MS) return `Ends ${weekday(event.ends_at).slice(0, 3)} ${clockTime(event.ends_at)}`;
  return `Ends ${new Date(event.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * Progress along a chest track as 0..1, with chests evenly spaced (so the
 * first chest is never a sliver at the left). Returns where each chest sits too.
 */
export function trackFill(chests: readonly Pick<EventChest, 'points'>[], value: number): { fill: number; stops: number[] } {
  const n = chests.length;
  if (!n) return { fill: 0, stops: [] };
  const stops = chests.map((_, i) => (i + 1) / n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const goal = chests[i].points;
    if (value < goal) {
      const part = goal > prev ? (value - prev) / (goal - prev) : 0;
      return { fill: Math.max(0, (i + Math.max(0, Math.min(1, part))) / n), stops };
    }
    prev = goal;
  }
  return { fill: 1, stops };
}

/** The next chest not reached yet (null when all are reached). */
export function nextChest<T extends Pick<EventChest, 'reached'>>(chests: readonly T[]): T | null {
  return chests.find(c => !c.reached) ?? null;
}

/** Every chest this player can open right now, in order: yours, everyone's, team. */
export function openableKeys(event: LiveEvent): string[] {
  const keys = [
    ...event.me.chests.filter(c => c.claimable).map(c => c.key),
    ...event.together.chests.filter(c => c.claimable).map(c => c.key),
  ];
  if (event.team_race?.claimable) keys.push('team');
  return keys;
}

/** 1st, 2nd or 3rd (ties share a place); null when you have no team or nobody scored. */
export function teamPlace(scores: Readonly<Record<TeamKey, number>>, team: TeamKey | null): number | null {
  if (!team) return null;
  const mine = scores[team] ?? 0;
  if (Object.values(scores).every(v => !v)) return null;
  return 1 + Object.values(scores).filter(v => v > mine).length;
}

export function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

export const TEAM_LABEL: Record<TeamKey, string> = { mouse: 'Team Mouse', globe: 'Team Globe', shark: 'Team Shark' };

/** Frenzy in words: "x2 until 1 PM". Null when off. */
export function frenzyLine(event: LiveEvent): string | null {
  if (event.phase !== 'live' || !event.frenzy.active || !event.frenzy.ends_at) return null;
  const times = event.frenzy.multiplier;
  return `Rides x${times} until ${clockTime(event.frenzy.ends_at)}`;
}

export type ChipState =
  | { readonly kind: 'open'; readonly count: number }
  | { readonly kind: 'frenzy'; readonly line: string }
  | { readonly kind: 'progress'; readonly fill: number }
  | { readonly kind: 'upcoming'; readonly line: string };

/** What the map chip says, most urgent first: a chest to open, Frenzy, then your progress. */
export function chipState(event: LiveEvent, now: number): ChipState {
  const open = openableKeys(event);
  if (open.length) return { kind: 'open', count: open.length };
  if (event.phase === 'upcoming') return { kind: 'upcoming', line: timeLine(event, now) };
  const frenzy = frenzyLine(event);
  if (frenzy) return { kind: 'frenzy', line: frenzy };
  return { kind: 'progress', fill: trackFill(event.me.chests, event.me.points).fill };
}

/** Points you need for your next chest ("3 more"), or null when every chest of yours is reached. */
export function pointsToNext(event: LiveEvent): number | null {
  const next = nextChest(event.me.chests);
  return next ? Math.max(1, next.points - event.me.points) : null;
}

/**
 * A plain "do this" hint for the next chest. Counts in actions, never points:
 * "1 ride win" or "3 snack finds".
 */
export function nextStepHint(event: LiveEvent, atPark: boolean): string | null {
  const need = pointsToNext(event);
  if (need == null) return null;
  if (atPark) {
    const wins = Math.ceil(need / Math.max(1, event.points.ride_win));
    return wins === 1 ? 'Win 1 ride' : `Win ${wins} rides`;
  }
  if (!event.include_home) return 'Win rides at a park';
  const perFind = Math.max(1, event.points.home_find);
  const finds = Math.ceil(need / perFind);
  const cap = Math.floor((event.daily_caps.home_find ?? 0) / perFind);
  if (cap > 0 && finds > cap) return `Find ${cap} snacks today`;
  return finds === 1 ? 'Find 1 snack' : `Find ${finds} snacks`;
}

/** Points gained since the last look (for the "+8 to the reef" toast). */
export function pointsGained(prev: LiveEvent | null, next: LiveEvent | null): number {
  if (!prev || !next || prev.id !== next.id) return 0;
  return Math.max(0, next.me.points - prev.me.points);
}

/** A reward as short chips: "+50 coins", "+1 Ticket". Gear first. */
export function rewardChips(r: LiveEvent['me']['chests'][number]['reward']): { icon: 'coin' | 'ticket' | 'energy' | 'xp' | 'gift'; text: string }[] {
  const out: { icon: 'coin' | 'ticket' | 'energy' | 'xp' | 'gift'; text: string }[] = [];
  if (r.item) out.push({ icon: 'gift', text: r.item.name });
  if (r.coins) out.push({ icon: 'coin', text: `${r.coins}` });
  if (r.tickets) out.push({ icon: 'ticket', text: `${r.tickets}` });
  if (r.energy) out.push({ icon: 'energy', text: `${r.energy}` });
  if (r.xp) out.push({ icon: 'xp', text: `${r.xp}` });
  return out;
}

/** "x2" for a Star Ride (server-rounded; never "x2.5"). */
export function starTimes(event: LiveEvent): number {
  return Math.max(1, Math.round(event.star_times ?? event.points.spotlight_win / Math.max(1, event.points.ride_win)));
}

/** The event's goal word ("reef"), or a plain fallback. */
export function goalWord(event: LiveEvent | null | undefined): string {
  return event?.goal_word?.trim() || 'event';
}

/** "+46 in the last 15 min · a chest opened 3 min ago" (null when nothing recent: never "0"). */
export function activityLine(event: LiveEvent, now: number): string | null {
  const a = event.activity;
  if (!a || event.phase === 'upcoming') return null;
  const parts: string[] = [];
  if (a.recent_points > 0) parts.push(`+${a.recent_points} in the last 15 min`);
  if (a.last_open_at) {
    const mins = Math.max(0, Math.round((now - Date.parse(a.last_open_at)) / 60_000));
    if (mins < 120) parts.push(mins <= 1 ? 'a chest just opened' : `a chest opened ${mins} min ago`);
  }
  return parts.length ? parts.join('  ·  ') : null;
}

/** Star Rides at this park as a Set for marker lookups. */
export function starRideIds(event: LiveEvent | null): ReadonlySet<number> {
  if (!event || event.phase !== 'live' || !event.here) return EMPTY;
  return new Set(event.star_rides.map(r => r.task_id));
}
const EMPTY: ReadonlySet<number> = new Set();
