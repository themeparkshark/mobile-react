/**
 * News v2 feed layout as plain rows for FlashList (pure, unit tested):
 * lead story, the cream sheet edge, day dividers, story rows with a big
 * photo story every FEATURE_EVERY rows, then paging and the site card.
 */
import { newsTime, type NewsEntry } from './newsModel';

export type FeedRow =
  | { readonly type: 'hero' | 'row' | 'feature'; readonly key: string; readonly entry: NewsEntry }
  | { readonly type: 'day' | 'search'; readonly key: string; readonly label: string }
  | { readonly type: 'sheet' | 'skeleton' | 'retry' | 'site' | 'stale'; readonly key: string };

export const FEATURE_EVERY = 6;

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
  let rest = entries;
  if (lead && entries.length) {
    rows.push({ type: 'hero', key: `hero-${entries[0].id}`, entry: entries[0] });
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
        rows.push({ type: 'day', key: `day-${day}`, label: day });
        lastDay = day;
      }
    }
    sinceFeature += 1;
    const feature = !searchLabel && sinceFeature > FEATURE_EVERY && !!entry.featured_image;
    if (feature) sinceFeature = 0;
    rows.push({ type: feature ? 'feature' : 'row', key: `${feature ? 'f' : 'r'}-${entry.id}`, entry });
  }
  if (loadingMore) {
    rows.push({ type: 'skeleton', key: 'sk-1' }, { type: 'skeleton', key: 'sk-2' });
  } else if (failed) {
    rows.push({ type: 'retry', key: 'retry' });
  }
  if (end || failed) rows.push({ type: 'site', key: 'site' });
  return rows;
}
