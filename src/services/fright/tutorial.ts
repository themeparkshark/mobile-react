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

/**
 * The 5 swipe cards: a short title and ONE line of 7 words or fewer (How to
 * Play style). Kid-safe, COPY.md voice. Chaos Hour joins when the encounter
 * ships (it is off in tranche 1, so the intro never promises it).
 */
export const TUTORIAL_CARDS: readonly { readonly key: string; readonly title: string; readonly line: string }[] = [
  { key: 'haunts', title: 'Survive the haunts', line: 'In line? Tap I\'m in line.' },
  { key: 'rank', title: 'Rank every haunt', line: 'One tap. One to five fins.' },
  { key: 'reefs', title: 'Hunt Case Files', line: 'Stand still in a Fright Reef.' },
  { key: 'marquee', title: 'Your night, in lights', line: 'Every haunt lands on your Marquee.' },
  { key: 'lantern', title: 'The Deep Lantern', line: 'Your whole season on one card.' },
];

/** Card 4 when Chaos Hour (the encounter) is switched on server-side. */
export const CHAOS_CARD = { key: 'chaos', title: 'Chaos Hour', line: 'Watch for Chuckles at 11:11 PM.' } as const;

/**
 * The 5 cards for tonight: card 4 becomes Chaos Hour ONLY when
 * config.encounters_enabled is true (never promise an encounter that is off).
 */
export function tutorialCards(encountersEnabled: boolean | null | undefined): readonly { readonly key: string; readonly title: string; readonly line: string }[] {
  if (!encountersEnabled) return TUTORIAL_CARDS;
  return TUTORIAL_CARDS.map(card => card.key === 'marquee' ? CHAOS_CARD : card);
}

/**
 * Where card copy goes on the tutorial hero (720x1080): the clear sky band
 * between the moon and stars above and the shark's head below, as fractions
 * of the card height. Nothing decorative sits in this band.
 */
export const HERO_COPY_BAND = { top: 0.31, bottom: 0.47 } as const;

/** Top bar (Skip) and bottom band (dots + Next) heights, in points, outside the safe area. */
export const TUTORIAL_TOP_BAR = 6 + 44 + 10;
export const TUTORIAL_BOTTOM_BAND = 14 + 56 + 36 + 12;

/**
 * Card size for a screen: the hero keeps its 2:3 shape, fits between the top
 * bar (below the Dynamic Island / status bar) and the bottom band (above the
 * home indicator), and never runs wider than the screen minus 20 pt gutters.
 */
export function cardLayout({ width, height, insetTop, insetBottom }: {
  readonly width: number; readonly height: number; readonly insetTop: number; readonly insetBottom: number;
}): { top: number; cardWidth: number; cardHeight: number; titleSize: number; lineSize: number; bottomBand: number } {
  const top = insetTop + TUTORIAL_TOP_BAR;
  const bottomBand = insetBottom + TUTORIAL_BOTTOM_BAND;
  const available = Math.max(200, height - top - bottomBand - 8);
  const cardHeight = Math.floor(Math.min(available, (width - 40) * 1.5));
  const cardWidth = Math.floor(cardHeight / 1.5);
  return { top, cardWidth, cardHeight, bottomBand, titleSize: Math.round(cardWidth * 0.092), lineSize: Math.round(cardWidth * 0.062) };
}

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
