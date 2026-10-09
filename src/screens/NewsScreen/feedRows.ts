/**
 * News v2 feed layout as plain rows for FlashList (pure, unit tested):
 * lead story, the cream sheet edge, day dividers, story rows with a big
 * photo story every FEATURE_EVERY rows, then paging and the site card.
 */
import { isFresh, isScreenStory, isShopStory, newsTime, type NewsEntry } from './newsModel';

export type FeedRow =
  | { readonly type: 'hero' | 'row' | 'feature'; readonly key: string; readonly entry: NewsEntry; readonly fresh: boolean }
  | { readonly type: 'day' | 'search'; readonly key: string; readonly label: string }
  | { readonly type: 'sheet' | 'skeleton' | 'retry' | 'site' | 'stale'; readonly key: string };

export const FEATURE_EVERY = 6;
/** NEW goes on at most this many stories (the newest park stories under 12 hours old). */
export const MAX_NEW = 3;

/** "Today", "Yesterday", "This week" or "Earlier", in the phone's own calendar. */
export function dayLabel(date: string, now: number): string {
  const ms = newsTime(date);
  if (!Number.isFinite(ms)) return 'Earlier';
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  if (ms >= today) return 'Today';
  if (ms >= today - 86400000) return 'Yesterday';
  if (ms >= today - 6 * 86400000) return 'This week';
  return 'Earlier';
}

/** Inside each day, park stories lead and shopping stories (collections, watches, decor) are spread out after them. */
/**
 * The newest day can still grow while pages load (the last day in the list may continue
 * on the next page), so only days that are complete are reshuffled: rows already on
 * screen never move when page 2 arrives.
 */
export function shopLast(list: readonly NewsEntry[], now: number, lastDayComplete = true): NewsEntry[] {
  const days: string[] = [];
  const groups = new Map<string, { park: NewsEntry[]; shop: NewsEntry[] }>();
  for (const entry of list) {
    // One calendar day at a time, so dates never run backwards.
    const ms = newsTime(entry.date);
    const d = new Date(Number.isFinite(ms) ? ms : now);
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let group = groups.get(day);
    if (!group) { groups.set(day, (group = { park: [], shop: [] })); days.push(day); }
    (isShopStory(entry) ? group.shop : group.park).push(entry);
  }
  // Never a wall of shopping: one shopping story after every three park stories, the rest at the day's end.
  return days.flatMap((day, index) => {
    const { park, shop } = groups.get(day)!;
    if (index === days.length - 1 && !lastDayComplete) {
      return list.filter(e => park.includes(e) || shop.includes(e));
    }
    const out: NewsEntry[] = [];
    park.forEach((entry, i) => {
      out.push(entry);
      if ((i + 1) % 3 === 0 && shop.length) out.push(shop.shift()!);
    });
    return [...out, ...shop];
  });
}

export function buildFeedRows({ entries, lead, now, searchLabel, loadingMore, failed, end, stale }: {
  readonly entries: readonly NewsEntry[];
  /** Show the first story as the big lead card (not for search results). */
  readonly lead: boolean;
  readonly now: number;
  readonly searchLabel: string | null;
  readonly loadingMore: boolean;
  readonly failed: boolean;
  readonly end: boolean;
  readonly stale: boolean;
}): FeedRow[] {
  const rows: FeedRow[] = [];
  const fresh = new Set(entries.filter(e => isFresh(e.date, now) && !isScreenStory(e)).slice(0, MAX_NEW).map(e => e.id));
  let rest: readonly NewsEntry[] = entries;
  if (lead && entries.length) {
    rows.push({ type: 'hero', key: `hero-${entries[0].id}`, entry: entries[0], fresh: false });
    rest = entries.slice(1);
  }
  rows.push({ type: 'sheet', key: 'sheet' });
  if (stale) rows.push({ type: 'stale', key: 'stale' });
  if (searchLabel) {
    rows.push({ type: 'search', key: 'search', label: `${entries.length} ${entries.length === 1 ? 'story' : 'stories'} for "${searchLabel}"` });
  }
  let lastDay = '';
  let sinceFeature = 0;
  for (const entry of rest) {
    if (!searchLabel) {
      const day = dayLabel(entry.date, now);
      if (day !== lastDay) {
        // A label can only repeat if the list is out of order; the index keeps keys unique regardless.
        rows.push({ type: 'day', key: `day-${day}-${rows.length}`, label: day });
        lastDay = day;
      }
    }
    sinceFeature += 1;
    // The big photo frame is for park and ride stories, never a shopping story.
    const feature = !searchLabel && sinceFeature > FEATURE_EVERY && !!entry.featured_image && !isShopStory(entry);
    if (feature) sinceFeature = 0;
    rows.push({ type: feature ? 'feature' : 'row', key: `${feature ? 'f' : 'r'}-${entry.id}`, entry, fresh: fresh.has(entry.id) });
  }
  if (loadingMore) {
    rows.push({ type: 'skeleton', key: 'sk-1' }, { type: 'skeleton', key: 'sk-2' });
  } else if (failed) {
    rows.push({ type: 'retry', key: 'retry' });
  }
  if (end || failed) rows.push({ type: 'site', key: 'site' });
  return rows;
}

/**
 * Paging keeps rows still: when a list only grew at the end (same first story,
 * nothing removed), every story already shown keeps its place and the new ones
 * follow. A refresh with new stories on top or a new filter starts fresh.
 */
export function keepOrder(previous: readonly number[], next: readonly NewsEntry[]): NewsEntry[] {
  if (!previous.length || !next.length || next[0].id !== previous[0]) return [...next];
  const byId = new Map(next.map(e => [e.id, e] as const));
  if (!previous.every(id => byId.has(id))) return [...next];
  const kept = previous.map(id => byId.get(id)!);
  const seen = new Set(previous);
  const added = next.filter(e => !seen.has(e.id));
  // Only a true "more at the bottom": every added story is no newer than the last one shown.
  // A story that belongs higher up (late categories, a filter's own page) means a fresh order.
  const lastMs = newsTime(kept[kept.length - 1].date);
  if (added.some(e => (newsTime(e.date) || 0) > (lastMs || 0))) return [...next];
  return [...kept, ...added];
}
