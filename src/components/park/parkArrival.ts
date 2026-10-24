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
  | { readonly kind: 'boss'; readonly time: string; readonly at?: string }
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
  if (bossTime && nextBoss) cards.push({ kind: 'boss', time: bossTime, at: nextBoss.at });

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
 * The arrival's beat sheet (ms from the first visible frame). Gather: the veil,
 * the ribbon unfurl, the plaque and the letters (all landed by 540 ms). Hold:
 * one 70 ms frame with the flash and the haptic. Burst at 610 ms: rays, sparkles,
 * confetti. Settle: Finn, then the three cards 90 ms apart (landed by about
 * 1.4 s). The micro-beat at 1.5 s (Finn points, the limited coin flips) keeps
 * the stage alive until the handoff at 2.6 s or the first tap; everything is
 * gone inside 3.6 s.
 */
export const ARRIVAL = {
  scrimMs: 240,
  /** A light sky-blue veil (never navy): the map recedes so the gold reads. */
  scrimOpacity: 0.42,
  ribbonMs: 210,
  welcomeAt: 100,
  lettersAt: 120,
  letterStepMs: 25,
  /** The last letter starts by lettersAt + this, so every letter has landed before the hit. */
  letterSpanMs: 300,
  hitAt: 540,
  burstAt: 610,
  goldHold: 0.78,
  finnAt: 650,
  cardsAt: 700,
  cardStepMs: 90,
  cardDrop: 40,
  /** Each card catches one white shine just after it lands. */
  shineAfterMs: 240,
  shineMs: 520,
  confettiSecondAt: 900,
  goalAt: 1250,
  pointAt: 1500,
  flipMs: 520,
  coinTurnMs: 4000,
  handoffAt: 2600,
  /** The UI clock runs a little past the handoff. */
  clockMs: 3000,
  rainMs: 2200,
  /** The longest the stage waits for its art to decode before it starts anyway. */
  artWaitMs: 260,
  /** While arming, the stage is drawn at this (invisible) opacity for armMs so iOS decodes it before frame 1. */
  armOpacity: 0.012,
  armMs: 90,
  /** A tap before this is ignored (a kid mashing through the moment still sees the park name land). */
  minTapAt: 700,
  /** Each card flies home on a visible arc with a gold trail, one after another. */
  flyMs: 720,
  flyStepMs: 90,
  shrinkMs: 460,
  confetti: 28,
  /** A second, smaller shower as the cards land. */
  confettiSecond: 12,
  sparkles: 12,
} as const;

export type ArrivalPlan = { readonly [K in keyof typeof ARRIVAL]: number };

/**
 * A second (or later) arrival at the same park within a week: the ribbon, the name and the cards only,
 * about 1.4 s before the handoff, no confetti, no Finn wave, no micro-beat (it is a hello, not a party).
 */
export const ARRIVAL_REPEAT: ArrivalPlan = {
  ...ARRIVAL,
  ribbonMs: 180,
  welcomeAt: 60,
  lettersAt: 90,
  letterStepMs: 16,
  letterSpanMs: 180,
  hitAt: 390,
  burstAt: 460,
  goldHold: 0.6,
  finnAt: 470,
  cardsAt: 480,
  cardStepMs: 70,
  confettiSecondAt: 99_999,
  goalAt: 760,
  pointAt: 1000,
  handoffAt: 1400,
  clockMs: 1800,
  minTapAt: 500,
  confetti: 0,
  confettiSecond: 0,
  sparkles: 8,
};

/** How many days a park visit counts as "recent" (a repeat arrival is the short one). */
export const REPEAT_DAYS = 7;

/** Last arrival day per park: { [parkId]: dayKey }, kept for REPEAT_DAYS. */
export type ArrivalHistory = Readonly<Record<string, string>>;

function dayNumber(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

/** This park had an arrival on an earlier day within the last week: play the short hello. */
export function arrivalIsRepeat(history: ArrivalHistory | null | undefined, parkId: number, day: string): boolean {
  const last = history?.[String(parkId)];
  if (!last || last === day) return false;
  const a = dayNumber(last), b = dayNumber(day);
  return a !== null && b !== null && b > a && b - a < REPEAT_DAYS;
}

export function markArrivalHistory(history: ArrivalHistory | null | undefined, parkId: number, day: string): ArrivalHistory {
  const today = dayNumber(day);
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(history ?? {})) {
    const n = dayNumber(value);
    if (n !== null && today !== null && today - n < REPEAT_DAYS && today >= n) next[key] = value;
  }
  next[String(parkId)] = day;
  return next;
}

/** Finn has a few ways to say hello; the pose for a park and day stays put (no flicker on a replay). */
export const FINN_POSES = 3;
export function finnPose(parkId: number, day: string): number {
  let h = parkId * 31;
  for (let i = 0; i < day.length; i += 1) h = (h * 33 + day.charCodeAt(i)) % 100_003;
  return h % FINN_POSES;
}

/** The boss card's clock face: hour and minute hand angles (degrees from 12) for the park wall time. */
export function bossClockHands(at: string): { readonly hour: number; readonly minute: number; readonly night: boolean } | null {
  const match = /T(\d{2}):(\d{2})/.exec(at);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  return { hour: ((hour % 12) + minute / 60) * 30, minute: minute * 6, night: hour < 6 || hour >= 19 };
}

/** How long the Today chip stays in the map's HUD stack after the arrival (then the HUD is itself again). */
export const TODAY_CHIP_MS = 30 * 60_000;

export function todayChipFresh(endedAt: number, now: number): boolean {
  return Number.isFinite(endedAt) && now >= endedAt && now - endedAt < TODAY_CHIP_MS;
}

/** Today's Daily 3 for the arrival and the Today chip: a flame, the streak and three pips. */
export interface ArrivalGoal {
  readonly done: number;
  readonly total: number;
  readonly streak: number;
}

export type ArrivalCueKind = 'hit' | 'card' | 'goal' | 'handoff';

/** The JS side of the beats (haptics, the sound, the handoff), fired from the stage's UI clock. */
export function arrivalCues(cardCount: number, hasGoal: boolean, reduced: boolean, plan: ArrivalPlan = ARRIVAL): { readonly at: number; readonly kind: ArrivalCueKind }[] {
  if (reduced) return [{ at: 1, kind: 'hit' }, { at: plan.handoffAt, kind: 'handoff' }];
  const cues: { at: number; kind: ArrivalCueKind }[] = [{ at: plan.hitAt, kind: 'hit' }];
  for (let i = 0; i < Math.max(0, Math.min(3, cardCount)); i += 1) {
    // The tick lands with the card (SPRING.land reaches the slot about 120 ms after it starts).
    cues.push({ at: plan.cardsAt + i * plan.cardStepMs + 120, kind: 'card' });
  }
  if (hasGoal) cues.push({ at: plan.goalAt + 80, kind: 'goal' });
  cues.push({ at: plan.handoffAt, kind: 'handoff' });
  return cues;
}

/** When each letter of the park name stamps in: 25 ms apart, the whole name inside ARRIVAL.letterSpanMs. */
export function letterDelays(count: number, plan: ArrivalPlan = ARRIVAL): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const step = n > 1 ? Math.min(plan.letterStepMs, plan.letterSpanMs / (n - 1)) : 0;
  return Array.from({ length: n }, (_, i) => Math.round(plan.lettersAt + i * step));
}

/** When the moment has fully handed off (ms), for a handoff that starts at `handoffAt`. */
export function arrivalEndsAt(cardCount: number, handoffAt: number = ARRIVAL.handoffAt): number {
  return handoffAt + Math.max(ARRIVAL.shrinkMs + 140, ARRIVAL.flyMs + Math.max(0, cardCount - 1) * ARRIVAL.flyStepMs);
}

/**
 * Where a flying card is at f (0..1): one smooth arc. Bound for the HUD stack button it swings out to the
 * right first and climbs the right edge (never across the Ride Control or Adventure chips); bound for a map
 * coin it lobs up and drops onto it. Shared by the card and its gold trail (a worklet).
 */
export function flyPoint(fromX: number, fromY: number, toX: number, toY: number, toCoin: boolean, f: number): { x: number; y: number } {
  'worklet';
  const cx = toCoin ? (fromX + toX) / 2 : toX;
  const cy = toCoin ? Math.min(fromY, toY) - 90 : fromY - 30;
  const u = 1 - f;
  return { x: u * u * fromX + 2 * u * f * cx + f * f * toX, y: u * u * fromY + 2 * u * f * cy + f * f * toY };
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
