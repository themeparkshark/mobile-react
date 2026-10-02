/**
 * Home Hunt on the home map: the Hunt Points chip on a find, the one rank line
 * on the status card, "Report this spot" and the once-per-session safety line.
 * Pure helpers, unit tested in tools/tests/home-hunt-map.test.cjs.
 */
import type { HuntReportReason } from '../../api/endpoints/me/homeHunt';

export const NEUTRAL_ZERO_LINE = "This find didn't count toward Standings this week.";
export const SAFETY_LINE = 'Stay on sidewalks and paths. Never go onto private property.';

export interface HuntPointsChip { readonly kind: 'points' | 'line'; readonly text: string }

/**
 * The chip on the find card. Only when the server sent hunt_points: points
 * above zero read "+14 HUNT POINTS"; zero shows the server's `line` verbatim
 * (for example the neutral line), or the neutral line when it sent none.
 */
export function huntPointsChip(huntPoints: { readonly points?: number | null; readonly line?: string | null } | null | undefined): HuntPointsChip | null {
  if (!huntPoints || typeof huntPoints !== 'object') return null;
  const points = Number(huntPoints.points);
  if (Number.isFinite(points) && points > 0) return { kind: 'points', text: `+${Math.round(points)} HUNT POINTS` };
  const line = typeof huntPoints.line === 'string' && huntPoints.line.trim() ? huntPoints.line : NEUTRAL_ZERO_LINE;
  return { kind: 'line', text: line };
}

/** The one rank line, shown only when the server sent it. */
export function huntRankLine(huntWeek: { readonly rank_line?: string | null } | null | undefined): string | null {
  const line = huntWeek?.rank_line;
  return typeof line === 'string' && line.trim() ? line.trim() : null;
}

export const REPORT_REASONS: readonly { readonly reason: HuntReportReason; readonly label: string }[] = [
  { reason: 'unsafe', label: 'Unsafe' },
  { reason: 'private', label: 'Private property' },
  { reason: 'other', label: 'Other' },
];

/** The safety line shows once per session, on the first rare or better find on the map. */
export function shouldShowSafetyLine(rarity: number | null | undefined, alreadyShown: boolean): boolean {
  return !alreadyShown && Number.isFinite(rarity) && (rarity as number) >= 3;
}
