/**
 * The unlock ladder's pure rules (core loop blueprint 4.4, October 2026).
 *
 * Features arrive one at a time, keyed to what the player has done, not to
 * the calendar. This file holds only pure functions and types so plain node
 * tests can run them; revealLadder.ts re-exports everything here and adds the
 * per-player store and the useRung hook. Shared contract: owned by the
 * guide-map lane, every other lane imports from revealLadder.ts and never
 * edits either file.
 *
 * The pacing rule:
 * - Rungs open one at a time, in ladder order (a rung that is not eligible
 *   yet does not block a later one that is).
 * - At home, at most one rung opens per app open.
 * - At a park, at most one rung opens per hour, counted from the first coin of
 *   the day. Two exceptions, because they are the place itself: the team offer
 *   with the first coin (team) and LinePlay in a real line (lineplay).
 * - Keys and Pins show only while you hold something (or Pin of the Day is
 *   on), so they need no turn of their own. The level 3 NEW tag on the Pins
 *   door still takes a turn, so it counts as that open's one NEW.
 * - A rung waiting its turn stays fully hidden. Nothing is lost: the server
 *   keeps counting Parts, Energy, XP and boxes.
 *
 * Who gets every rung at once (no NEW tags): veterans (5 or more coins when
 * this build first sees them), players with the server's reveal_all flag
 * (preview ids), and, on a reinstall or new phone, every rung whose
 * server-backed trigger is already met.
 */

export type Rung = 'team' | 'lineplay' | 'coin_levels' | 'daily' | 'shark_pass'
  | 'trail' | 'keys' | 'pins' | 'events';

export type ProgressEvent = 'line_played' | 'line_part_earned'
  | 'park_day_started' | 'park_day_done' | 'home_day';

export interface Progress {
  // From the server (survive a reinstall)
  coinsWon: number; levelUpReady: boolean; level: number; hasTeam: boolean;
  keysHeld: number; trailBoxes: number; ownsPin: boolean; revealAll: boolean;
  // Phone counters, stored per player id, written only through recordProgress
  linesPlayed: number; linePartsOnOwned: number; parkDaysStarted: number;
  parkDaysDone: number; homeDays: number;
  /** The guide is in its in-line state right now (90 s nearly still in a queue ride's zone): rung 2's place trigger. */
  inLineNow?: boolean;
  /** An event is scheduled at the player's park. Omitted: the live_events switch alone decides. */
  eventScheduled?: boolean;
}

export interface PaceContext {
  atPark: boolean; now: number; appOpenId: string; firstCoinTodayAt: number | null;
  /** When this app open began (epoch ms). Rungs opened before it were opened on an earlier open. */
  appOpenAt?: number;
}

/** Ladder order (rungs 1 to 9 of blueprint 4.4). */
export const RUNG_ORDER: readonly Rung[] = ['team', 'lineplay', 'coin_levels', 'daily', 'shark_pass', 'trail', 'keys', 'pins', 'events'];

/**
 * The production switch(es) each rung needs. Any one listed switch being on is
 * enough (rung 4 is Daily 3 and level chests). A rung with no switch is always on.
 * A switch missing from the flags object counts as off.
 */
export const RUNG_SWITCHES: Readonly<Record<Rung, readonly string[]>> = {
  team: [],
  lineplay: [],
  coin_levels: [],
  daily: ['daily_three', 'level_chests'],
  shark_pass: ['shark_pass'],
  trail: ['trail_boxes'],
  keys: [],
  pins: ['pin_of_the_day'],
  events: ['live_events'],
};

/** Rungs that show while you hold something and never take a turn (their opening is not a NEW). */
export const PRESENCE_RUNGS: readonly Rung[] = ['keys', 'pins'];
/** Rungs that open at once at a park, outside the hourly pace (the place itself). */
export const PARK_EXEMPT_RUNGS: readonly Rung[] = ['team', 'lineplay'];

export const VETERAN_COINS = 5;
export const PARK_PACE_MS = 60 * 60 * 1000;
/** Player level that adds the one NEW tag to the Pins door. */
export const PINS_NEW_LEVEL = 3;

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Whether the rung's production switch is on for this player. */
export function switchOn(rung: Rung, p: Pick<Progress, 'ownsPin'>, flags: Record<string, boolean>): boolean {
  const names = RUNG_SWITCHES[rung];
  if (rung === 'pins' && p.ownsPin) return true;         // pins you own never disappear
  if (!names.length) return true;
  return names.some(name => flags?.[name] === true);
}

/** Whether a rung's trigger is met and its switch is on. Pure. Pacing is nextToOpen's job. */
export function eligible(rung: Rung, p: Progress, flags: Record<string, boolean>): boolean {
  if (!p || !switchOn(rung, p, flags ?? {})) return false;
  if (p.revealAll) return true;
  switch (rung) {
    case 'team': return num(p.coinsWon) >= 1 || p.hasTeam === true;
    case 'lineplay': return num(p.linesPlayed) >= 1 || p.inLineNow === true;
    case 'coin_levels': return p.levelUpReady === true || num(p.linePartsOnOwned) >= 1 || num(p.coinsWon) >= 3;
    case 'daily': return num(p.parkDaysDone) >= 1 || num(p.homeDays) >= 3;
    case 'shark_pass': return num(p.coinsWon) >= 3;          // plus daily opened on an earlier open (nextToOpen)
    case 'trail': return num(p.trailBoxes) >= 1;             // the server gives the first box on the 2nd park day
    case 'keys': return num(p.keysHeld) >= 1;
    case 'pins': return true;                                 // the door: Pin of the Day is on, or you own a pin
    case 'events': return p.eventScheduled !== false;        // plus daily open (nextToOpen)
    default: return false;
  }
}

type Opened = Partial<Record<Rung, number>>;

/** A rung that needs a turn of its own right now (it would be a NEW). */
function wantsTurn(rung: Rung, opened: Opened, p: Progress, flags: Record<string, boolean>, appOpenAt: number): boolean {
  if (opened[rung] != null) return false;
  if (rung === 'keys') return false;                        // presence only
  if (!eligible(rung, p, flags)) return false;
  if (rung === 'pins') return num(p.level) >= PINS_NEW_LEVEL; // the door is presence; only its level 3 NEW takes a turn
  if (rung === 'shark_pass') return opened.daily != null && opened.daily < appOpenAt;
  if (rung === 'events') return opened.daily != null;
  return true;
}

/**
 * The one rung to open now, or null. Pure. `opened` maps a rung to when it
 * opened (epoch ms; 0 means "before this build", which never counts toward a
 * pace). Returns null for reveal_all players: every rung is already open.
 */
export function nextToOpen(opened: Partial<Record<Rung, number>>, p: Progress,
  flags: Record<string, boolean>, ctx: PaceContext): Rung | null {
  if (!p || !ctx || p.revealAll) return null;
  const done: Opened = opened ?? {};
  const now = num(ctx.now);
  const appOpenAt = typeof ctx.appOpenAt === 'number' && Number.isFinite(ctx.appOpenAt) ? ctx.appOpenAt : now;
  const waiting = RUNG_ORDER.filter(rung => wantsTurn(rung, done, p, flags ?? {}, appOpenAt));
  if (!waiting.length) return null;

  if (ctx.atPark) {
    const exempt = waiting.find(rung => PARK_EXEMPT_RUNGS.includes(rung));
    if (exempt) return exempt;
    if (ctx.firstCoinTodayAt == null || !Number.isFinite(ctx.firstCoinTodayAt)) return null;
    if (now - ctx.firstCoinTodayAt < PARK_PACE_MS) return null;
    const pacedRecently = RUNG_ORDER.some(rung => !PARK_EXEMPT_RUNGS.includes(rung) && rung !== 'keys' &&
      typeof done[rung] === 'number' && done[rung]! > 0 && now - done[rung]! < PARK_PACE_MS);
    if (pacedRecently) return null;
    return waiting[0];
  }

  const openedThisOpen = RUNG_ORDER.some(rung => rung !== 'keys' &&
    typeof done[rung] === 'number' && done[rung]! > 0 && done[rung]! >= appOpenAt);
  return openedThisOpen ? null : waiting[0];
}

/**
 * Rungs to open quietly (no NEW) the first time this build sees a player.
 * Veterans (5+ coins) get every rung. Anyone else (an existing player on this
 * phone, a reinstall, a new phone) gets the rungs whose server-backed trigger
 * is already met. A brand-new player gets nothing. All marked opened at 0.
 */
export function initialOpened(p: Progress, flags: Record<string, boolean>): { opened: Opened; veteran: boolean } {
  const opened: Opened = {};
  const veteran = num(p?.coinsWon) >= VETERAN_COINS;
  if (veteran) {
    for (const rung of RUNG_ORDER) opened[rung] = 0;
    return { opened, veteran };
  }
  if (!p) return { opened, veteran };
  if (num(p.coinsWon) >= 1 || p.hasTeam) opened.team = 0;
  if (p.levelUpReady || num(p.coinsWon) >= 3) opened.coin_levels = 0;
  if (num(p.trailBoxes) >= 1 && switchOn('trail', p, flags ?? {})) opened.trail = 0;
  if (num(p.keysHeld) >= 1) opened.keys = 0;
  if (num(p.level) >= PINS_NEW_LEVEL && switchOn('pins', p, flags ?? {})) opened.pins = 0;
  return { opened, veteran };
}

/**
 * Whether the player sees a rung right now. Keys and Pins show while held or
 * switched on. Every other rung shows once opened and while its switch is on.
 * reveal_all shows every switched-on rung.
 */
export function rungVisible(rung: Rung, opened: Partial<Record<Rung, number>>, p: Progress,
  flags: Record<string, boolean>): boolean {
  if (!p) return false;
  if (PRESENCE_RUNGS.includes(rung)) return eligible(rung, p, flags);
  if (p.revealAll) return eligible(rung, p, flags);
  return opened?.[rung] != null && switchOn(rung, p, flags ?? {});
}

/**
 * The one rung that may wear a NEW tag in this app open, or null. Pure.
 * - Opened quietly (veteran, reinstall, reveal_all) never wears NEW, nor do Keys.
 * - Once a rung wore NEW in this app open, no other rung does until the next open.
 * - Otherwise the earliest-opened unseen rung goes first. Pins goes last: its NEW lives on Profile, so it
 *   never holds the slot from a tag the map can show.
 */
export function pickNewTag(opened: Partial<Record<Rung, number>>, seen: Partial<Record<Rung, boolean>>,
  shown: { rung: Rung; appOpenId: string } | null, appOpenId: string): Rung | null {
  if (shown && shown.appOpenId === appOpenId) return seen?.[shown.rung] ? null : shown.rung;
  let best: Rung | null = null;
  for (const rung of RUNG_ORDER) {
    const at = opened?.[rung];
    if (rung === 'keys' || typeof at !== 'number' || at <= 0 || seen?.[rung]) continue;
    if (best === null || best === 'pins' || (rung !== 'pins' && at < (opened[best] as number))) best = rung;
  }
  return best;
}

/** The phone-local day (YYYY-MM-DD) for a time. At a park the phone is in the park's time zone. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const EMPTY_PROGRESS: Readonly<Progress> = Object.freeze({
  coinsWon: 0, levelUpReady: false, level: 0, hasTeam: false,
  keysHeld: 0, trailBoxes: 0, ownsPin: false, revealAll: false,
  linesPlayed: 0, linePartsOnOwned: 0, parkDaysStarted: 0, parkDaysDone: 0, homeDays: 0,
});
