/**
 * "Welcome to the park!": the arrival moment's pure rules (no React), unit
 * tested in tools/tests/park-arrival.test.cjs.
 *
 * What today holds at this park, as three picture cards a kid reads with zero
 * words: today's limited coin, the boss time, and what is new. Every card is
 * real data from the map (the coins the server put on it) and the live-parks
 * feed (the next boss). Nothing is invented: a card with no real data is
 * replaced by the coins still to find here.
 *
 * Once per park per day; the timeline follows the motion language in
 * src/ui/motion.ts (gather, hold, burst, settle) with the payoff inside 1.5 s.
 */

/** The map coin fields the arrival reads (TaskType is a superset). */
export interface ArrivalTask {
  readonly id: number;
  readonly name: string;
  readonly latitude: string | number;
  readonly longitude: string | number;
  readonly active_from?: string | null;
  readonly limited?: { readonly active: boolean; readonly ends_at: string | null } | null;
}

export interface ArrivalBoss {
  /** ISO time with the park's own offset ("2026-10-24T11:00:00-04:00"). */
  readonly at: string;
  readonly park_name: string;
}

export type ArrivalCard =
  | { readonly kind: 'limited'; readonly taskId: number; readonly name: string; readonly count: number;
    readonly latitude: number; readonly longitude: number }
  | { readonly kind: 'boss'; readonly time: string }
  | { readonly kind: 'new'; readonly count: number; readonly latitude: number | null; readonly longitude: number | null }
  | { readonly kind: 'coins'; readonly count: number };

/** The phone's own calendar day ("2026-10-24"): the arrival shows once per park per day. */
export function parkDayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Seen records: { [parkId]: dayKey }. */
export type ArrivalSeen = Readonly<Record<string, string>>;

export function arrivalSeenToday(seen: ArrivalSeen | null | undefined, parkId: number, day: string): boolean {
  return !!seen && seen[String(parkId)] === day;
}

export function markArrivalSeen(seen: ArrivalSeen | null | undefined, parkId: number, day: string): ArrivalSeen {
  // Old days are dropped so the record never grows.
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(seen ?? {})) if (value === day) next[key] = value;
  next[String(parkId)] = day;
  return next;
}

/**
 * The boss time as the park's own wall clock ("11 AM", "3:30 PM"), read straight
 * from the ISO string so a phone in another time zone still shows the park's time.
 */
export function bossTimeLabel(at: string): string | null {
  const match = /T(\d{2}):(\d{2})/.exec(at);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${h12} ${suffix}` : `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Coins that came onto the map in the last NEW_DAYS days count as new. */
export const NEW_DAYS = 7;

function parseLocal(value: string | null | undefined): number | null {
  if (!value) return null;
  // "2026-10-24 08:38:07" (server local) or ISO; both parse as the phone's local time.
  const t = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}

/**
 * Exactly three cards, in this order of preference: limited coin, boss time,
 * what is new; any missing one becomes "coins to find here" (shown once).
 */
export function arrivalCards({ tasks, nextBoss, parkNames, now }: {
  readonly tasks: readonly ArrivalTask[];
  readonly nextBoss: ArrivalBoss | null | undefined;
  /** The park's name and display name (the boss feed names the park). */
  readonly parkNames: readonly (string | null | undefined)[];
  readonly now: Date;
}): ArrivalCard[] {
  const cards: ArrivalCard[] = [];
  const nowMs = now.getTime();
  const located = (task: ArrivalTask) => Number.isFinite(Number(task.latitude)) && Number.isFinite(Number(task.longitude));

  const limited = tasks.filter(task => task.limited?.active && located(task))
    .slice().sort((a, b) => {
      const ea = parseLocal(a.limited?.ends_at) ?? Infinity;
      const eb = parseLocal(b.limited?.ends_at) ?? Infinity;
      return ea - eb || a.id - b.id;
    });
  if (limited.length > 0) {
    const pick = limited[0];
    cards.push({ kind: 'limited', taskId: pick.id, name: pick.name, count: limited.length,
      latitude: Number(pick.latitude), longitude: Number(pick.longitude) });
  }

  const bossAt = nextBoss ? Date.parse(nextBoss.at) : NaN;
  const bossHere = !!nextBoss && parkNames.some(name => sameName(name, nextBoss.park_name));
  // Today only: a boss up to 18 hours away (never yesterday's, never next week's).
  const bossSoon = Number.isFinite(bossAt) && bossAt > nowMs - 30 * 60_000 && bossAt - nowMs < 18 * 3_600_000;
  const bossTime = nextBoss && bossHere && bossSoon ? bossTimeLabel(nextBoss.at) : null;
  if (bossTime) cards.push({ kind: 'boss', time: bossTime });

  const fresh = tasks.filter(task => {
    const from = parseLocal(task.active_from);
    // The server stamps in its own clock, so "later today" still counts as today.
    return from !== null && from - nowMs < 86_400_000 && nowMs - from < NEW_DAYS * 86_400_000;
  });
  if (fresh.length > 0) {
    const first = fresh.find(located);
    cards.push({ kind: 'new', count: fresh.length,
      latitude: first ? Number(first.latitude) : null, longitude: first ? Number(first.longitude) : null });
  }

  if (cards.length < 3 && tasks.length > 0) cards.push({ kind: 'coins', count: tasks.length });
  return cards.slice(0, 3);
}

/**
 * The arrival's beat sheet (ms from the start). Payoff (rays, confetti, the
 * park name done) inside 1.5 s; cards settled by about 1.4 s; the handoff to
 * the map at 3.5 s or on the first tap; everything gone inside 4.5 s.
 */
export const ARRIVAL = {
  scrimMs: 240,
  scrimOpacity: 0.25,
  ribbonMs: 300,
  lettersAt: 150,
  letterStepMs: 25,
  letterCapMs: 400,
  burstAt: 450,
  finnAt: 520,
  cardsAt: 600,
  cardStepMs: 90,
  cardDrop: 40,
  coinTurnMs: 4000,
  handoffAt: 3500,
  /** A tap before this is ignored (a kid mashing through the moment still sees the park name land). */
  minTapAt: 700,
  flyMs: 520,
  flyStepMs: 70,
  shrinkMs: 380,
  confetti: 28,
  sparkles: 12,
} as const;

/** When each letter of the park name stamps in: 25 ms apart, all inside 400 ms. */
export function letterDelays(count: number): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const step = n > 1 ? Math.min(ARRIVAL.letterStepMs, ARRIVAL.letterCapMs / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => Math.round(ARRIVAL.lettersAt + i * step));
}

/** When the moment has fully handed off (ms), for a handoff that starts at `handoffAt`. */
export function arrivalEndsAt(cardCount: number, handoffAt: number = ARRIVAL.handoffAt): number {
  return handoffAt + Math.max(ARRIVAL.shrinkMs, ARRIVAL.flyMs + Math.max(0, cardCount - 1) * ARRIVAL.flyStepMs);
}

/** The big line on the ribbon: the park's short name, upper case for the stamp font. */
export function arrivalTitle(displayName: string | null | undefined, name: string | null | undefined): string {
  const raw = (displayName || name || '').trim();
  return raw.toUpperCase();
}

/** Ribbon text size so the whole name fits on one line of the ribbon (Shark is about 0.62 em wide). */
export function arrivalTitleSize(title: string, width: number): number {
  const chars = Math.max(1, title.length);
  return Math.max(18, Math.min(40, Math.floor(width / (chars * 0.62))));
}
