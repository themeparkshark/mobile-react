/**
 * "?" sheet content for the Home Hunt board and the set page's drop odds. The
 * server writes every line and number, so the copy cannot drift from the
 * spawner or the board rules. This only decides which pages show and in what order.
 */
import type { HomeHuntInfo } from '../../api/endpoints/me/homeHunt';

const clean = (lines: readonly string[] | undefined | null): string[] =>
  Array.isArray(lines) ? lines.filter(line => typeof line === 'string' && line.trim().length > 0) : [];

/** Rarity percents from the server's odds block, in Common to Legendary order. */
export function oddsRows(info: HomeHuntInfo | null | undefined): { tier: 1 | 2 | 3 | 4 | 5; percent: number }[] {
  const odds = info?.odds;
  if (!odds) return [];
  const values = [odds.common, odds.uncommon, odds.rare, odds.epic, odds.legendary];
  return values.map((percent, i) => ({ tier: (i + 1) as 1 | 2 | 3 | 4 | 5, percent: Number(percent) || 0 }));
}

type SheetPoint = { readonly icon: 'star' | 'trophy' | 'sparkle' | 'info' | 'dice'; readonly text: string };
const points = (lines: readonly string[], icon: SheetPoint['icon']): SheetPoint[] => lines.map(text => ({ icon, text }));

/**
 * The set page's "How rare is each find?" sheet: bars for the five rarities (the
 * server's numbers), then the server's other odds lines. The first odds line
 * repeats the bars as a sentence, so it is dropped when the bars can show.
 */
export function oddsInfoSheet(info: HomeHuntInfo | null | undefined) {
  const rows = oddsRows(info);
  const lines = clean(info?.odds_lines);
  return {
    id: 'odds', name: 'Drop odds',
    pages: [{ key: 'odds', hero: 'odds' as const, headline: 'How rare is each find?', heroData: { odds: rows },
      points: points(rows.length ? lines.slice(1) : lines, 'dice') }],
  };
}

/** The Home Hunt board's sheet: points (and ties), weekly rewards, then the odds. Lines are the server's, verbatim. */
export function homeHuntInfoSheet(info: HomeHuntInfo | null | undefined) {
  const fairness = typeof info?.fairness_line === 'string' && info.fairness_line.trim() ? [info.fairness_line] : [];
  const pages = [
    { key: 'points', hero: 'rules' as const, headline: 'How points work', heroData: { icon: 'star' as const },
      points: [...points(clean(info?.point_lines), 'star'), ...points(clean(info?.tiebreak_lines), 'trophy')] },
    { key: 'tiers', hero: 'rules' as const, headline: 'Weekly rewards', heroData: { icon: 'trophy' as const },
      points: [...points(clean(info?.tier_lines), 'trophy'), ...points(fairness, 'info')] },
    { ...oddsInfoSheet(info).pages[0], key: 'odds', headline: 'Drop odds' },
  ];
  return { id: 'home_hunt', name: 'Home Hunt', pages: pages.filter(page => page.points.length > 0 || page.key === 'odds' && oddsRows(info).length > 0) };
}
