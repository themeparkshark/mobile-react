/**
 * Fin-ister Nights activation tutorial and coach marks. Pure, unit tested
 * (tools/tests/fright-tutorial.test.cjs).
 *
 * - First activation each season: the cinematic intro, then 5 swipe cards.
 *   Returning players (marks in a past season) get a short Welcome back card.
 * - Coach marks: first time each moment happens, queued, max one visible,
 *   never two closer than 20 s, never inside a phones-down window. Once per
 *   player per season.
 * - Persistence: the server's `me.seen` (per player per season) merged with a
 *   local mirror keyed by event slug, so a new season (new slug) resets and a
 *   pending POST never re-shows a card.
 */
import { FRIGHT_DEFAULTS } from './config';

export const FRIGHT_SEEN_KEYS = ['intro', 'welcome_back', 'haunt_near', 'reef_first', 'case_file_first', 'rank_first',
  'chaos_hour', 'recap', 'exit'] as const;
export type FrightSeenKey = typeof FRIGHT_SEEN_KEYS[number];
export type FrightCoachKey = 'haunt_near' | 'reef_first' | 'case_file_first' | 'rank_first' | 'chaos_hour' | 'recap';

export type SeenMap = Readonly<Record<string, string>>;

/** The local mirror (AsyncStorage). One season at a time: a new slug starts empty. */
export interface SeenStore {
  readonly slug: string;
  readonly keys: SeenMap;
}

export function isSeenKey(key: string): key is FrightSeenKey {
  return (FRIGHT_SEEN_KEYS as readonly string[]).includes(key);
}

/** Server seen plus the local mirror for the same season. */
export function mergeSeen(slug: string, server: SeenMap | null | undefined, local: SeenStore | null | undefined): SeenMap {
  return { ...(local && local.slug === slug ? local.keys : {}), ...(server ?? {}) };
}

export function markSeenLocal(local: SeenStore | null | undefined, slug: string, key: FrightSeenKey, atIso: string): SeenStore {
  const keys = local && local.slug === slug ? local.keys : {};
  return { slug, keys: { ...keys, [key]: keys[key] ?? atIso } };
}

export function parseSeenStore(raw: string | null | undefined): SeenStore | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value.slug === 'string' && value.keys && typeof value.keys === 'object' ? value as SeenStore : null;
  } catch {
    return null;
  }
}

export type IntroPlan = 'intro' | 'welcome_back' | null;

/** What to show at the first activation of a season. */
export function introPlan(input: { readonly seen: SeenMap; readonly returning?: boolean | null }): IntroPlan {
  if (input.seen.intro || input.seen.welcome_back) return null;
  return input.returning ? 'welcome_back' : 'intro';
}

/** The 5 swipe cards (one short line each). Kid-safe, COPY.md voice. */
export const TUTORIAL_CARDS: readonly { readonly key: string; readonly title: string; readonly line: string }[] = [
  { key: 'haunts', title: 'Survive the haunts', line: 'Step into a haunt line, tap I\'m in line, and it counts.' },
  { key: 'rank', title: 'Rank every haunt', line: 'One tap: 1 to 5 fins. See what the fans think.' },
  { key: 'reefs', title: 'Hunt Case Files', line: 'Stand still in a Fright Reef. A new Case File finds you.' },
  { key: 'chaos', title: 'Chaos Hour', line: 'Watch for Chuckles and Riptide. Chaos Hour is 11:11 PM.' },
  { key: 'marquee', title: 'Your night, in lights', line: 'Your Marquee recap and the Deep Lantern card keep it all.' },
];

export interface CoachState {
  readonly queue: readonly FrightCoachKey[];
  readonly visible: FrightCoachKey | null;
  /** When the last coach mark was hidden (ms). */
  readonly lastHiddenAt: number | null;
}

export const EMPTY_COACH: CoachState = { queue: [], visible: null, lastHiddenAt: null };

/** Queue a coach mark the first time its moment happens (skipped if seen, queued or showing). */
export function coachEnqueue(state: CoachState, key: FrightCoachKey, seen: SeenMap): CoachState {
  if (seen[key] || state.visible === key || state.queue.includes(key)) return state;
  return { ...state, queue: [...state.queue, key] };
}

/**
 * Show the next coach mark if allowed: none visible, 20 s since the last one
 * hid, and `canShow` (not phones-down, no dialog, map focused).
 */
export function coachTick(state: CoachState, now: number, canShow: boolean, seen: SeenMap = {},
  gapMs: number = FRIGHT_DEFAULTS.coachGapMs): CoachState {
  const queue = state.queue.filter(key => !seen[key]);
  if (state.visible || !canShow || !queue.length) return queue.length === state.queue.length ? state : { ...state, queue };
  if (state.lastHiddenAt != null && now - state.lastHiddenAt < gapMs) return { ...state, queue };
  return { queue: queue.slice(1), visible: queue[0], lastHiddenAt: state.lastHiddenAt };
}

export function coachDismiss(state: CoachState, now: number): CoachState {
  return state.visible ? { ...state, visible: null, lastHiddenAt: now } : state;
}

/** Ms until the next coach mark may show (for a timer), or null when nothing waits. */
export function coachWaitMs(state: CoachState, now: number, gapMs: number = FRIGHT_DEFAULTS.coachGapMs): number | null {
  if (state.visible || !state.queue.length) return null;
  return state.lastHiddenAt == null ? 0 : Math.max(0, state.lastHiddenAt + gapMs - now);
}

/** One line per coach mark, with the thing it points at. */
export const COACH_LINES: Readonly<Record<FrightCoachKey, { readonly line: string; readonly target: string }>> = {
  haunt_near: { line: 'A haunt line! Tap I\'m in line when you join it.', target: 'pill' },
  reef_first: { line: 'Fright Reef. Stand still. Listen.', target: 'map' },
  case_file_first: { line: 'Case Files live on your Deep Lantern card.', target: 'pill' },
  rank_first: { line: 'Rate it fast. The next line won\'t wait.', target: 'rank' },
  chaos_hour: { line: 'Chaos Hour! Something is giggling near a reef.', target: 'map' },
  recap: { line: 'Share your Marquee. Your night, in lights.', target: 'share' },
};

/** Chaos Hour: the encounter window that contains 11:11 PM park time. */
export function isChaosHour(encounterStartIso: string | null | undefined, encounterEndIso: string | null | undefined): boolean {
  const start = /T(\d{2}):(\d{2})/.exec(encounterStartIso ?? '');
  const end = /T(\d{2}):(\d{2})/.exec(encounterEndIso ?? '');
  if (!start || !end) return false;
  const s = Number(start[1]) * 60 + Number(start[2]);
  const e = Number(end[1]) * 60 + Number(end[2]);
  const chaos = 23 * 60 + 11;
  return s <= chaos && chaos < (e > s ? e : e + 24 * 60);
}
