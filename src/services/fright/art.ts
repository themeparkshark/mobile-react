/**
 * Fin-ister card art: one normalized set of URLs, learned from whichever
 * payload arrives first (tonight's `assets.card`, or a card's `art`), so any
 * surface (pill, tutorial, Marquee) can draw the real art. Every URL may be
 * missing: callers draw their fallback. Pure apart from a module cache.
 */
import type { FrightCardArt, FrightFrameKey } from '../../api/endpoints/fright/types';

export interface FrightArtSet {
  readonly title: string | null;
  readonly chip: string | null;
  readonly header: string | null;
  readonly recapBg: string | null;
  readonly tutorial: string | null;
  readonly frames: Readonly<Partial<Record<FrightFrameKey, string>>>;
}

export const NO_ART: FrightArtSet = { title: null, chip: null, header: null, recapBg: null, tutorial: null, frames: {} };

const url = (value: unknown): string | null => typeof value === 'string' && /^https?:\/\//.test(value) ? value : null;

/** From GET /parks/{id}/fright `assets.card` (file name -> URL). */
export function artFromAssets(card: Readonly<Record<string, string | null>> | null | undefined): Partial<FrightArtSet> {
  if (!card) return {};
  const frames: Partial<Record<FrightFrameKey, string>> = {};
  for (const key of ['frame-gold', 'frame-silver', 'frame-glow', 'frame-locked'] as const) {
    const value = url(card[`${key}.webp`]);
    if (value) frames[key] = value;
  }
  return { title: url(card['header-title.webp']), header: url(card['header-blank.webp']), recapBg: url(card['recap-bg.webp']),
    tutorial: url(card['tutorial-hero.webp']), frames };
}

/** From a FrightCardSummary `art`. */
export function artFromCard(art: FrightCardArt | null | undefined): Partial<FrightArtSet> {
  if (!art) return {};
  const frames: Partial<Record<FrightFrameKey, string>> = {};
  for (const [key, value] of Object.entries(art.frames ?? {})) {
    const u = url(value);
    if (u) frames[key as FrightFrameKey] = u;
  }
  return { title: url(art.card), chip: url(art.chip), header: url(art.header), recapBg: url(art.recap_bg),
    tutorial: url(art.tutorial), frames };
}

/** Merge: known URLs win over nulls; newer non-null values replace older ones. */
export function mergeArt(base: FrightArtSet, next: Partial<FrightArtSet>): FrightArtSet {
  const pick = (a: string | null, b: string | null | undefined) => b ?? a;
  return {
    title: pick(base.title, next.title), chip: pick(base.chip, next.chip), header: pick(base.header, next.header),
    recapBg: pick(base.recapBg, next.recapBg), tutorial: pick(base.tutorial, next.tutorial),
    frames: { ...base.frames, ...(next.frames ?? {}) },
  };
}

/** Which frame the Deep Lantern wears: gold for Ten-in-One, glow when completed, locked when empty, else silver. */
export function frameFor(card: { readonly ten_in_one: boolean; readonly completed: boolean; readonly haunts_done: number;
  readonly pins_earned: number; readonly case_files_found: number }): FrightFrameKey {
  if (card.ten_in_one) return 'frame-gold';
  if (card.completed) return 'frame-glow';
  if (card.haunts_done + card.pins_earned + card.case_files_found === 0) return 'frame-locked';
  return 'frame-silver';
}

/** Pin image for a slot: the earned art, the locked silhouette, or null (draw the fallback). */
export function pinImage(slot: { readonly earned: boolean; readonly pin_art?: { image: string | null; locked: string | null } | null;
  readonly pin?: { image: string | null; earned_on: string | null } | null }): { uri: string | null; earned: boolean } {
  const earned = slot.earned || !!slot.pin?.earned_on;
  // Real pin items (slot.pin.image) win once earned; pin_art is the fallback and the locked silhouette.
  const uri = earned ? url(slot.pin?.image) ?? url(slot.pin_art?.image) : url(slot.pin_art?.locked);
  return { uri, earned };
}

let cache: FrightArtSet = NO_ART;
export function rememberFrightArt(next: Partial<FrightArtSet>): FrightArtSet {
  cache = mergeArt(cache, next);
  return cache;
}
export function frightArt(): FrightArtSet {
  return cache;
}

/** "Pins N of M" from what the card actually shows (slots with pin or pin_art); server counts only as a fallback. */
export function pinCounts(card: { readonly pins_earned: number; readonly pins_total: number;
  readonly slots: readonly { readonly earned: boolean; readonly pin?: { image: string | null; earned_on: string | null } | null;
    readonly pin_art?: { image: string | null; locked: string | null } | null }[] }): { earned: number; total: number } {
  const pinSlots = card.slots.filter(slot => slot.pin || slot.pin_art?.image || slot.pin_art?.locked);
  if (!pinSlots.length) return { earned: Math.max(0, card.pins_earned), total: Math.max(0, card.pins_total) };
  return { earned: pinSlots.filter(slot => pinImage(slot).earned).length, total: pinSlots.length };
}

/** Case Files for the Lantern: found first (deck order), then the locked ones as small silhouettes. */
export function orderCaseFiles<T extends { readonly found: boolean; readonly number: number }>(files: readonly T[]): { found: T[]; locked: T[] } {
  const sorted = files.slice().sort((a, b) => a.number - b.number);
  return { found: sorted.filter(file => file.found), locked: sorted.filter(file => !file.found) };
}

/** The Team tally shows only once encounters ship (flag on, or any side has points). */
export function showTally(tally: { readonly chaos: number; readonly control: number } | null | undefined,
  encountersEnabled?: boolean | null): boolean {
  if (encountersEnabled) return true;
  return !!tally && tally.chaos + tally.control > 0;
}
