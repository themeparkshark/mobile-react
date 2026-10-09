/**
 * Profile titles in kid-simple words: what a title means, how it was earned,
 * and the list of titles the player can wear instead. Stamp titles carry the
 * stamp's own art (icon_thumb_url) so the sheet shows where the title came from.
 *
 * Titles come from two places on the server:
 *  - Collection Books (Home Hunt): the starter step ("Churro Finder" for the
 *    Churro Collection, after the first finds; "<Book name> Scout" before Nov 6) and the finish reward (the set's completion title).
 *    Worn with PUT /me/prep-item-sets/{slug}/title { equipped, tier }.
 *  - Stamps with a title reward (GET /me/stamps unlocked_titles).
 *    Worn with PUT /me/stamp-title { stamp_id }.
 * PUT /me/stamp-title { stamp_id: null } takes off ANY title (it clears
 * users.equipped_title), so "Remove title" always has a server path.
 */

export type TitleEquip =
  | { readonly kind: 'set'; readonly slug: string; readonly tier: 'starter' | 'complete' }
  | { readonly kind: 'stamp'; readonly stampId: number };

export interface EarnedTitle {
  readonly key: string;
  readonly title: string;
  /** One short sentence: how you earned it. */
  readonly meaning: string;
  readonly equip: TitleEquip;
  /** The book's own art (sets); stamps show the stamp seal. */
  readonly iconUrl: string | null;
}

type SetLike = {
  readonly slug: string;
  readonly name: string;
  readonly icon_url?: string | null;
  readonly total_items?: number;
  readonly rewards_claimed?: boolean;
  readonly is_complete?: boolean;
  readonly starter_milestone?: {
    readonly target?: number;
    readonly rewards_claimed?: boolean;
    readonly rewards?: { readonly title?: string | null } | null;
  } | null;
  readonly completion_rewards?: { readonly title?: string | null } | null;
};

type StampLike = {
  readonly id: number; readonly name: string; readonly goal?: string | null;
  readonly icon_thumb_url?: string | null; readonly icon_url?: string | null;
};
type StampsLike = {
  readonly stamps?: Record<string, readonly StampLike[]> | null;
  readonly unlocked_titles?: readonly { readonly stamp_id: number; readonly title: string }[] | null;
} | null | undefined;

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const count = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

/** "Churro Collection" -> "churros"; a book name without "Collection" -> "finds". */
export function bookNoun(bookName: string): string {
  const match = /^(.+?)\s+(collection|set)$/i.exec(clean(bookName));
  if (!match) return 'finds';
  const word = match[1].trim().toLowerCase();
  if (!word || /\s/.test(word)) return 'finds';
  if (/(s|x|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

export function starterMeaning(bookName: string, target: number): string {
  return `You found ${target} ${bookNoun(bookName)} in your ${clean(bookName)} book.`;
}

export function completeMeaning(bookName: string, total: number): string {
  return `You found all ${total} ${bookNoun(bookName)} and finished your ${clean(bookName)} book.`;
}

export function stampMeaning(stamp: StampLike | undefined): string {
  if (!stamp) return 'You earned it with a stamp in your Stamp Book.';
  const goal = clean(stamp.goal).replace(/[.!]+$/, '');
  return goal ? `You earned the ${clean(stamp.name)} stamp: ${goal}.` : `You earned the ${clean(stamp.name)} stamp.`;
}

/** Every title the player has earned and can wear, books first, no duplicates. */
export function earnedTitles(sets: readonly SetLike[] | null | undefined, stamps: StampsLike): EarnedTitle[] {
  const out: EarnedTitle[] = [];
  const seen = new Set<string>();
  const push = (entry: EarnedTitle) => {
    if (!entry.title || seen.has(entry.title)) return;
    seen.add(entry.title);
    out.push(entry);
  };
  for (const set of sets ?? []) {
    const starter = set.starter_milestone;
    const starterTitle = clean(starter?.rewards?.title);
    if (starter?.rewards_claimed && starterTitle) {
      push({ key: `set:${set.slug}:starter`, title: starterTitle, meaning: starterMeaning(set.name, count(starter.target, 8)),
        equip: { kind: 'set', slug: set.slug, tier: 'starter' }, iconUrl: set.icon_url ?? null });
    }
    const finishTitle = clean(set.completion_rewards?.title);
    if (set.rewards_claimed && finishTitle) {
      push({ key: `set:${set.slug}:complete`, title: finishTitle, meaning: completeMeaning(set.name, count(set.total_items, 1)),
        equip: { kind: 'set', slug: set.slug, tier: 'complete' }, iconUrl: set.icon_url ?? null });
    }
  }
  const byId = new Map<number, StampLike>();
  for (const group of Object.values(stamps?.stamps ?? {})) for (const stamp of group ?? []) byId.set(Number(stamp.id), stamp);
  for (const unlocked of stamps?.unlocked_titles ?? []) {
    const title = clean(unlocked.title);
    push({ key: `stamp:${unlocked.stamp_id}`, title, meaning: stampMeaning(byId.get(Number(unlocked.stamp_id))),
      equip: { kind: 'stamp', stampId: Number(unlocked.stamp_id) },
      iconUrl: byId.get(Number(unlocked.stamp_id))?.icon_thumb_url ?? byId.get(Number(unlocked.stamp_id))?.icon_url ?? null });
  }
  return out;
}

/**
 * How the worn title reads in the sheet. Uses the earned list when it knows the
 * title; otherwise a plain guess from the name ("... Scout" is a book's starter step).
 */
export function describeTitle(title: string, earned: readonly EarnedTitle[]): string {
  const name = clean(title);
  const known = earned.find(entry => entry.title === name);
  if (known) return known.meaning;
  // Starter book titles: "Churro Finder" (and the older "Churro Collection Scout").
  const finder = /^(.+?)\s+Finder$/i.exec(name);
  if (finder) return `You found your first ${bookNoun(`${finder[1]} Collection`)} in your ${finder[1]} book.`;
  const scout = /^(.+)\s+Scout$/i.exec(name);
  if (scout) return `You found your first ${bookNoun(scout[1])} in your ${scout[1]} book.`;
  return 'You earned this title in the game. It shows on your profile for everyone to see.';
}

/** The earned entry for the worn title, if the lists know it (Remove keeps it for Undo). */
export function findEarned(title: string | null | undefined, earned: readonly EarnedTitle[]): EarnedTitle | null {
  const name = clean(title);
  return name ? earned.find(entry => entry.title === name) ?? null : null;
}

/** Books with bundled badge art (SetCollection/DexParts LEGACY_BADGES). */
export const BADGE_BOOKS: readonly string[] = ['churro_collection', 'pretzel_collection', 'night_lights', 'rain_parade', 'camera_crew'];

/**
 * The book a starter title names, from the title alone (no network): "Churro Finder" is the Churro
 * Collection, "Night Lights Finder" is Night Lights. Only "<Book> Finder" titles match, by the whole
 * book name, so a stamp or event title that merely starts with "Night" never borrows a book's art.
 */
export function titleBadgeSlug(title: string | null | undefined): string | null {
  const match = /^(.+?)\s+Finder$/i.exec(clean(title));
  if (!match) return null;
  const base = match[1].trim().toLowerCase().replace(/\s+/g, '_');
  return BADGE_BOOKS.find(slug => slug === base || slug === `${base}_collection`) ?? null;
}
