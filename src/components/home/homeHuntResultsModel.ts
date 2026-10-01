/**
 * Monday results (spec 5.5). Pure logic for HomeHuntResultsModal and its host,
 * unit tested in tools/tests/home-hunt-results.test.cjs.
 *
 * Full-screen cap: the presentation queue (kind 'home_hunt_results', after the
 * daily chest) allows at most 2 full-screen moments per app open. Results past
 * the cap become a badge dot on the Standings tab, never a stacked modal.
 * Team result, stamps and the Perfect Week count are rows inside this modal.
 */
import type { HomeHuntResult } from '../../api/endpoints/me/homeHunt';

export const HOME_HUNT_MODAL_CAP = 2;
export const RANK_COUNTDOWN_MS = 900;
export const HELD_COPY = 'Your reward is being checked. It arrives within 72 hours.';

/** Stable queue id, so a re-fetched result is never queued twice. */
export function resultPresentationId(result: Pick<HomeHuntResult, 'week_key' | 'status'>): string {
  return `home-hunt-results:${result.week_key}:${result.status}`;
}

/** Claimable and held results show; claimed ones never do. Oldest week first. */
export function presentableResults(results: readonly HomeHuntResult[] | null | undefined): readonly HomeHuntResult[] {
  const list = Array.isArray(results) ? results : [];
  return list
    .filter(result => result && typeof result.week_key === 'string' && (result.status === 'claimable' || result.status === 'held'))
    .slice()
    .sort((a, b) => a.week_key.localeCompare(b.week_key));
}

export type ResultRowIcon = 'energy' | 'ticket' | 'xp' | 'trophy' | 'crown' | 'star' | 'info';
export interface ResultRow { readonly key: string; readonly icon: ResultRowIcon; readonly label: string; readonly value: string }

/** Currency rows that fly to the counters on claim. */
export function rewardRows(result: HomeHuntResult | null | undefined): readonly ResultRow[] {
  const rewards = result?.rewards ?? {};
  const rows: ResultRow[] = [];
  if ((rewards.energy ?? 0) > 0) rows.push({ key: 'energy', icon: 'energy', label: 'Energy', value: `+${rewards.energy}` });
  if ((rewards.tickets ?? 0) > 0) rows.push({ key: 'tickets', icon: 'ticket', label: (rewards.tickets ?? 0) === 1 ? 'Ticket' : 'Tickets', value: `+${rewards.tickets}` });
  if ((rewards.experience ?? 0) > 0) rows.push({ key: 'xp', icon: 'xp', label: 'XP', value: `+${rewards.experience}` });
  return rows;
}

interface ExtraResult extends HomeHuntResult {
  readonly team_result?: { readonly label?: string; readonly won?: boolean } | null;
  readonly stamps?: readonly { readonly name?: string }[] | null;
}

/** Rows inside the modal (never separate modals): ribbon, Perfect Week count, team, stamps. */
export function extraRows(result: HomeHuntResult | null | undefined): readonly ResultRow[] {
  if (!result) return [];
  const extra = result as ExtraResult;
  const rows: ResultRow[] = [];
  if (result.cosmetic?.label) rows.push({ key: 'cosmetic', icon: 'star', label: 'Ribbon', value: result.cosmetic.label });
  if ((result.perfect_week_count ?? 0) > 0) {
    rows.push({ key: 'perfect', icon: 'trophy', label: 'Perfect Weeks', value: String(result.perfect_week_count) });
  }
  if (extra.team_result?.label) rows.push({ key: 'team', icon: 'crown', label: 'Team', value: extra.team_result.label });
  const stamps = Array.isArray(extra.stamps) ? extra.stamps.filter(stamp => stamp?.name) : [];
  if (stamps.length > 0) rows.push({ key: 'stamps', icon: 'star', label: stamps.length === 1 ? 'New stamp' : 'New stamps', value: stamps.map(stamp => stamp.name).join(', ') });
  if (result.ticket_note) rows.push({ key: 'ticket_note', icon: 'info', label: 'Note', value: result.ticket_note });
  return rows;
}

/** The label on the ribbon that drops in: the tier, or the board when there is no tier. */
export function ribbonLabel(result: HomeHuntResult | null | undefined): string {
  return (result?.tier_label || result?.board_label || 'Weekly results').trim();
}

/** Rank line under the ribbon, "#12 in the Orlando Area". */
export function rankLabel(result: HomeHuntResult | null | undefined): string {
  if (!result) return '';
  const place = result.board_label ? ` in the ${result.board_label}` : '';
  if (result.rank != null && Number.isFinite(result.rank)) return `#${result.rank}${place}`;
  return result.board_label ?? '';
}

export function isHeld(result: HomeHuntResult | null | undefined): boolean {
  return result?.status === 'held';
}

export function canClaim(result: HomeHuntResult | null | undefined): boolean {
  return result?.status === 'claimable';
}

/** The number the rank countdown starts from; it lands on the real rank. */
export function rankCountdownStart(rank: number): number {
  return rank + Math.min(40, Math.max(10, rank));
}

/** The shown rank at `elapsedMs` of the 900 ms countdown (eased, lands exactly on rank). */
export function rankCountdownValue(rank: number, elapsedMs: number, durationMs: number = RANK_COUNTDOWN_MS): number {
  if (!Number.isFinite(rank)) return 0;
  if (elapsedMs >= durationMs) return rank;
  const start = rankCountdownStart(rank);
  const t = Math.max(0, elapsedMs / durationMs);
  return Math.max(rank, Math.round(start - (start - rank) * (1 - Math.pow(1 - t, 3))));
}

/** Reveal timings in ms from open. Reduced motion shows everything at once. */
export function revealTimeline(reduced: boolean): { readonly podium: number; readonly countdown: number; readonly ribbon: number; readonly chest: number; readonly rewards: number; readonly claim: number } {
  if (reduced) return { podium: 0, countdown: 0, ribbon: 0, chest: 0, rewards: 0, claim: 0 };
  return { podium: 0, countdown: 350, ribbon: 350 + RANK_COUNTDOWN_MS, chest: 350 + RANK_COUNTDOWN_MS + 350, rewards: 350 + RANK_COUNTDOWN_MS + 350 + 450, claim: 350 + RANK_COUNTDOWN_MS + 350 + 450 + 300 };
}

/** Where a result lands in the queue: the Standings tab badge dot when the cap is spent. */
export const RESULTS_BADGE_TARGET = 'standings' as const;
export const RESULTS_QUEUE_KIND = 'home_hunt_results' as const;
