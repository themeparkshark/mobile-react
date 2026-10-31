/**
 * LinePlay's two tabs (core loop 4.5 and 5.5): Story and Games.
 *
 * Story is the ride's line story (its chapter page and its three clues) plus,
 * for a crew of 2 or more, the crew pages. Games is every free round: the queue
 * games, the free trivia cards, Signal Repair and the wait guess. One word per
 * tab replaces RIDE MISSION, QUEUE QUEST, QUEUE ARCADE and SHARK FAN MISSION.
 *
 * Pure helpers over the page list the screen already builds.
 */

export type LinePlayTab = 'story' | 'games';

export interface TabPage {
  readonly id: string;
  readonly kind: string;
}

/** Crew Relay, Crew Prompts and the relay's route game: shown only for a crew of 2 or more. */
export function isCrewOnlyPage(page: TabPage, chapterId?: string | null): boolean {
  if (page.kind === 'crew_relay' || page.kind === 'crew_grid') return true;
  return chapterId != null && (page.id === `${chapterId}-route-alpha` || page.id === `${chapterId}-route-omega`);
}

/** Which tab a page belongs to. */
export function pageTab(page: TabPage | null | undefined, chapterId?: string | null): LinePlayTab {
  if (!page) return 'games';
  if (page.kind === 'chapter_intro') return 'story';
  if (isCrewOnlyPage(page, chapterId)) return 'story';
  if (chapterId != null && page.id.startsWith(`${chapterId}-`)) return 'story';
  return 'games';
}

/** The page the Story tab opens: the chapter page (or null when this ride has no line story). */
export function storyTabIndex(pages: readonly TabPage[], chapterId?: string | null): number | null {
  const index = pages.findIndex(page => pageTab(page, chapterId) === 'story');
  return index >= 0 ? index : null;
}

/**
 * The rail's one Next offer, inside the tab the guest is on: the next page of the
 * same tab (wrapping to that tab's first page). Pages the chapter page's PLAY NOW
 * already opens are skipped (one game, one button). Null when the tab has one page.
 */
export function nextInTab(pages: readonly TabPage[], index: number, chapterId?: string | null,
  skipId?: string | null): number | null {
  if (index < 0 || index >= pages.length) return null;
  const tab = pageTab(pages[index], chapterId);
  const same = pages.map((page, i) => ({ page, i }))
    .filter(({ page, i }) => pageTab(page, chapterId) === tab && (i === index || page.id !== skipId));
  if (same.length <= 1) return null;
  const at = same.findIndex(entry => entry.i === index);
  return same[(at + 1) % same.length].i;
}

/** New rounds were added to Games (an encore wave): a dot on the Games tab until the guest looks. */
export function gamesDot(newRoundIndex: number, visibleIndex: number, visibleTab: LinePlayTab): boolean {
  return newRoundIndex >= 0 && !(visibleTab === 'games' && visibleIndex >= newRoundIndex);
}
