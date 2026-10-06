/**
 * Ride Photo v2: the catch reveal, as pure rules. The component plays the beats; this module decides
 * which beats there are, how long each one runs, what a tap does, and what the numbers count up to,
 * so the order and timing are tested without a renderer.
 *
 * The moment, beat by beat (Dustin, Oct 4: "the congrats / collection wasn't notable enough"):
 *   lift     the developed print rises to the middle of a dark stage
 *   charge   Legendary only: the stage goes dark, the print rumbles, a riser builds
 *   wobble   the print shivers 1 to 3 times (rarer = more), a rising tick each time: will it pop?
 *   burst    the find bursts out of the photo in rarity-coloured rays, with sound and a heavy haptic
 *   title    the catch title and the name ribbon, with the rarity chip and the photo grade
 *   tally    XP (with the photo bonus called out), coins, Energy and Tickets count up from 0
 *   book     the Collection Book page: the slot fills, the count ticks, and NEW! stamps on (new finds)
 *   actions  SHARE and CONTINUE
 *
 * A tier's first reveal always plays in full; after that a tap jumps straight to the actions.
 * Reduce Motion keeps every beat's content but drops the wobble, the charge and the rays, and fades.
 */

export type RevealBeat = 'lift' | 'charge' | 'wobble' | 'burst' | 'title' | 'tally' | 'book' | 'actions';
export type RevealGrade = 'good' | 'great' | 'frame_it';

export interface RevealRewards {
  readonly experience: number;
  readonly coins: number;
  readonly energy: number;
  readonly tickets: number;
  /** The part of `experience` that is the photo bonus (server `photo.bonus_xp`). */
  readonly bonusXp: number;
}

export interface RevealInput {
  readonly tier: 2 | 3 | 4 | 5;
  readonly grade: RevealGrade;
  readonly isNew: boolean;
  readonly golden: boolean;
  readonly reducedMotion: boolean;
  readonly rewards: RevealRewards;
  /**
   * A repeat: this tier's reveal was seen in full before and the find is already in the book. The moment
   * stays (pop, title, counts) but runs short (about 2.5 s to the buttons) and continues on its own.
   */
  readonly compact?: boolean;
  /** R6: a repeat whose photo beat the stored best (the server's answer): NEW BEST! on its book slot. */
  readonly newBest?: boolean;
}

export interface BeatSlot {
  readonly beat: RevealBeat;
  readonly at: number;
  readonly ms: number;
}

/** Wobbles before the pop, by tier: Uncommon 1, Rare 2, Epic 3, Legendary 3 (after its charge). */
export const WOBBLES: Readonly<Record<2 | 3 | 4 | 5, number>> = { 2: 1, 3: 2, 4: 3, 5: 3 };
/** The shot earns a quicker pop: Frame It! 1 wobble, Great at most 2, Good the tier's full count. */
export function wobblesFor(tier: 2 | 3 | 4 | 5, grade: RevealGrade): number {
  const full = WOBBLES[tier];
  return grade === 'frame_it' ? 1 : grade === 'great' ? Math.min(2, full) : full;
}
export const WOBBLE_MS = 430;
export const CHARGE_MS = 900;
/** The burst grows with rarity: the bigger the find, the longer the light holds. */
export const BURST_MS: Readonly<Record<2 | 3 | 4 | 5, number>> = { 2: 760, 3: 860, 4: 1000, 5: 1400 };
export const TALLY_ROW_MS = 360;

/** The tally rows that are shown, in order (XP always first). Zero rows are left out. */
export function tallyRows(rewards: RevealRewards): { readonly key: 'xp' | 'coins' | 'energy' | 'ticket'; readonly to: number }[] {
  const rows: { key: 'xp' | 'coins' | 'energy' | 'ticket'; to: number }[] = [];
  const add = (key: 'xp' | 'coins' | 'energy' | 'ticket', value: number) => {
    const n = Math.max(0, Math.round(Number(value) || 0));
    if (n > 0) rows.push({ key, to: n });
  };
  add('xp', rewards.experience);
  add('coins', rewards.coins);
  add('energy', rewards.energy);
  add('ticket', rewards.tickets);
  return rows;
}

/** One tally row's count, ms: a bigger number counts longer (200 to 500 ms). */
export function rowMs(value: number): number {
  return Math.max(200, Math.min(500, 200 + value * 2.5));
}
/** The photo bonus's flight into the XP plaque, then its count-on (ms). */
export const BONUS_MS = 420 + 260;
/**
 * The tally beat's length, the same sum the component plays: a 100 ms lead, each row (60 ms in, its count,
 * a 40 ms gap), then the bonus, and 160 ms of air before the book. The bonus always lands before the book.
 */
export const COMPACT_TALLY_MS = 300;
export function tallyMs(rewards: RevealRewards, compact = false): number {
  // A repeat counts every row at once and folds the bonus in (no fly-in).
  if (compact) return 100 + 60 + COMPACT_TALLY_MS + 160;
  const rows = tallyRows(rewards);
  const counted = rows.reduce((sum, row) => sum + 60 + rowMs(row.to) + 40, 100);
  return counted + (rewards.bonusXp > 0 && rows.some(row => row.key === 'xp') ? BONUS_MS : 0) + 160;
}

/** The beat list with start times (ms from the reveal's start). The last beat is always `actions`. */
export function revealPlan(input: RevealInput): BeatSlot[] {
  const rm = input.reducedMotion;
  const rows = Math.max(1, tallyRows(input.rewards).length);
  const beats: [RevealBeat, number][] = [];
  if (input.compact) {
    beats.push(['lift', rm ? 120 : 200]);
    if (!rm) beats.push(['wobble', WOBBLE_MS]);
    beats.push(['burst', rm ? 240 : 520]);
    beats.push(['title', rm ? 200 : 300]);
    beats.push(['tally', rm ? 200 : tallyMs(input.rewards, true)]);
    beats.push(['book', rm ? 260 : input.newBest && !input.isNew ? NEW_BEST_BOOK_MS.compact : 420]);
    beats.push(['actions', 0]);
    return slots(beats);
  }
  beats.push(['lift', rm ? 160 : 300]);
  if (!rm && input.tier === 5) beats.push(['charge', CHARGE_MS]);
  if (!rm) beats.push(['wobble', wobblesFor(input.tier, input.grade) * WOBBLE_MS]);
  beats.push(['burst', rm ? 320 : BURST_MS[input.tier] + (input.grade === 'frame_it' ? 120 : 0)]);
  beats.push(['title', rm ? 260 : 560]);
  beats.push(['tally', rm ? 260 : tallyMs(input.rewards)]);
  beats.push(['book', rm ? 420 : input.isNew ? 1150 : input.newBest ? NEW_BEST_BOOK_MS.full : 760]);
  beats.push(['actions', 0]);
  return slots(beats);
}

/**
 * R6 NEW BEST!: the book slot flips to gold and its stars step up (NEW_BEST_SWAP_MS), then the gold stamp.
 * The book beat makes room for it so it is never cut off by the buttons or a compact repeat's auto-continue.
 */
export const NEW_BEST_SWAP_MS = 600;
export const NEW_BEST_BOOK_MS = { compact: 1000, full: 1150 } as const;
/** A grade's stars on a book slot (0 when there is no photo). */
export function bestStars(grade: string | null | undefined): 0 | 1 | 2 | 3 {
  return grade === 'frame_it' ? 3 : grade === 'great' ? 2 : grade === 'good' ? 1 : 0;
}
/** NEW BEST! only on the server's word, and never on a new find (that is NEW!). */
export function isNewBest(isNew: boolean, photo: { readonly new_best?: boolean } | null | undefined): boolean {
  return !isNew && photo?.new_best === true;
}

function slots(beats: readonly [RevealBeat, number][]): BeatSlot[] {
  let at = 0;
  return beats.map(([beat, ms]) => {
    const slot = { beat, at, ms };
    at += ms;
    return slot;
  });
}

/** A repeat continues on its own this long after its buttons arrive (a tap on SHARE stops it). */
export const COMPACT_AUTO_CONTINUE_MS = 900;
export function autoContinueMs(input: Pick<RevealInput, 'compact'>): number | null {
  return input.compact ? COMPACT_AUTO_CONTINUE_MS : null;
}

/** The Legendary roll: while the server decides, the print keeps shivering, one wobble at a time, up to this long. */
export const PENDING_WOBBLE_CAP_MS = 6000;

export function revealLength(plan: readonly BeatSlot[]): number {
  const last = plan[plan.length - 1];
  return last ? last.at + last.ms : 0;
}

/** Which beat is playing at `ms` into the reveal. */
export function beatAt(plan: readonly BeatSlot[], ms: number): RevealBeat {
  let current: RevealBeat = plan[0]?.beat ?? 'actions';
  for (const slot of plan) if (ms >= slot.at) current = slot.beat;
  return current;
}

export interface RevealState {
  readonly beat: RevealBeat;
  /** A new find: a skip still lands on the book page, so the NEW! stamp is never skipped. */
  readonly isNew?: boolean;
  /** A tap jumps to the actions (this tier's reveal was seen in full before). */
  readonly skippable: boolean;
  readonly skipped: boolean;
  readonly done: boolean;
}

export type RevealEvent =
  | { readonly type: 'advance'; readonly beat: RevealBeat }
  | { readonly type: 'tap' }
  | { readonly type: 'continue' };

export function revealStart(skippable: boolean, isNew = false): RevealState {
  return { beat: 'lift', skippable, skipped: false, done: false, isNew };
}

/**
 * The reveal's state machine. Beats only move forward. A tap before the actions skips to them when the
 * reveal is skippable, and is ignored otherwise (the first viewing plays through). CONTINUE ends it, and
 * only from the actions (the button is not there before).
 */
export function revealStep(state: RevealState, event: RevealEvent, plan: readonly BeatSlot[]): RevealState {
  if (state.done) return state;
  const order = plan.map(slot => slot.beat);
  if (event.type === 'advance') {
    if (order.indexOf(event.beat) <= order.indexOf(state.beat)) return state;
    return { ...state, beat: event.beat };
  }
  if (event.type === 'tap') {
    if (state.beat === 'actions' || !state.skippable) return state;
    // A new find skips to its book page (the NEW! stamp still slams); anything else to the buttons.
    if (state.isNew && order.includes('book') && order.indexOf(state.beat) < order.indexOf('book')) {
      return { ...state, beat: 'book', skipped: true };
    }
    if (state.beat === 'book' && state.isNew) return state;
    return { ...state, beat: 'actions', skipped: true };
  }
  if (state.beat !== 'actions') return state;
  return { ...state, done: true };
}

/** A count-up value: whole numbers, never past the target, ease-out. Worklet. */
export function tallyValue(to: number, progress: number): number {
  'worklet';
  const p = Math.max(0, Math.min(1, progress));
  const eased = 1 - (1 - p) * (1 - p) * (1 - p);
  return Math.min(to, Math.round(to * eased));
}

/** The Collection Book page: the slot grid (up to 15 slots) or a bar for big sets. */
export function bookPage(collected: number | null, total: number | null, isNew: boolean): {
  readonly grid: boolean; readonly total: number; readonly before: number; readonly after: number; readonly newIndex: number | null;
} {
  const t = total != null && Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
  const after = t > 0 && collected != null && Number.isFinite(collected) ? Math.max(0, Math.min(t, Math.round(collected))) : 0;
  const before = isNew ? Math.max(0, after - 1) : after;
  return { grid: t > 0 && t <= 15, total: t, before, after, newIndex: isNew && after > 0 ? after - 1 : null };
}

/** The headline over the name ribbon. */
export function revealTitle(tier: 2 | 3 | 4 | 5): string {
  return tier === 5 ? 'LEGENDARY!' : tier === 4 ? 'EPIC CATCH!' : 'CAUGHT!';
}

export const GRADE_BONUS_LABEL: Readonly<Record<RevealGrade, string>> = { good: 'Good!', great: 'Great shot!', frame_it: 'Frame It!' };

/** Tiers whose reveal was seen in full (persisted by the component; this is the rule). */
export function canSkip(seen: ReadonlySet<number>, tier: number): boolean {
  return seen.has(tier);
}

/** The repeat (compact) reveal: a tier seen in full before, for a find already in the book. */
export function isCompact(seen: ReadonlySet<number>, tier: number, isNew: boolean): boolean {
  return seen.has(tier) && !isNew;
}

/**
 * The XP plaque counts the find's own XP first, then the photo bonus flies in from the grade chip and the
 * count jumps on to the total: the bonus is a visible prize, never a sum a kid has to check.
 * Returns the count-up progress where the base XP is reached (the eased count lands exactly on it).
 */
export function xpSplit(total: number, bonus: number): { readonly base: number; readonly bonus: number; readonly baseProgress: number } {
  const t = Math.max(0, Math.round(total));
  const b = Math.max(0, Math.min(t, Math.round(bonus)));
  const base = t - b;
  if (t === 0 || b === 0) return { base, bonus: b, baseProgress: 1 };
  // tallyValue eases out cubically: solve 1 - (1 - p)^3 = base / total.
  const f = base / t;
  return { base, bonus: b, baseProgress: 1 - Math.cbrt(1 - f) };
}

/**
 * The book page's ownership, honest to the server's count: the page read at the ride's start plus the caught
 * find. When that does not equal the server's count (another device caught something, or the page is stale),
 * the art is never guessed: null, and the reveal draws the count with plain slots instead.
 */
export function ownedSlots(page: readonly { readonly id: number; readonly owned: boolean }[], caughtId: number,
  collected: number | null, total: number | null): { readonly id: number; readonly owned: boolean; readonly caught: boolean }[] | null {
  if (total == null || page.length !== total || page.length > 15 || !page.some(entry => entry.id === caughtId)) return null;
  const owned = new Set(page.filter(entry => entry.owned || entry.id === caughtId).map(entry => entry.id));
  if (collected != null && owned.size !== collected) return null;
  return page.map(entry => ({ id: entry.id, owned: owned.has(entry.id), caught: entry.id === caughtId }));
}
