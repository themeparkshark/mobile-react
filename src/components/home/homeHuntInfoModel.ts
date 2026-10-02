/**
 * Info sheet content (Standings "i" button and the Set odds sheet). The server
 * writes every line, so the copy cannot drift from the spawner or the board
 * rules. This only decides which sections show and in what order.
 */
import type { HomeHuntInfo } from '../../api/endpoints/me/homeHunt';

export interface InfoSection { readonly key: string; readonly title: string; readonly lines: readonly string[] }

const clean = (lines: readonly string[] | undefined | null): string[] =>
  Array.isArray(lines) ? lines.filter(line => typeof line === 'string' && line.trim().length > 0) : [];

/** Standings sheet: points, tiebreak, tiers, fairness, then the drop odds. */
export function standingsInfoSections(info: HomeHuntInfo | null | undefined): readonly InfoSection[] {
  const sections: InfoSection[] = [
    { key: 'points', title: 'How points work', lines: clean(info?.point_lines) },
    { key: 'tiebreak', title: 'If you tie', lines: clean(info?.tiebreak_lines) },
    { key: 'tiers', title: 'Weekly rewards', lines: clean(info?.tier_lines) },
    { key: 'fairness', title: 'Fair for everyone',
      lines: typeof info?.fairness_line === 'string' && info.fairness_line.trim() ? [info.fairness_line] : [] },
    { key: 'odds', title: 'Drop odds', lines: clean(info?.odds_lines) },
  ];
  return sections.filter(section => section.lines.length > 0);
}

/** Set screen sheet: the odds lines, verbatim. */
export function oddsInfoSections(info: HomeHuntInfo | null | undefined): readonly InfoSection[] {
  return [{ key: 'odds', title: 'Drop odds', lines: clean(info?.odds_lines) }].filter(section => section.lines.length > 0);
}
