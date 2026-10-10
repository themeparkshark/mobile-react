/**
 * Which status pill leads the map's single HUD row. Pure, unit tested
 * (map-declutter-hud). One row over the map, ever: the most important pill
 * shows, the rest wait behind a "+N" stack button.
 */

export type StatusKey = 'live' | 'show' | 'fright' | 'control' | 'event';

export interface StatusState {
  /** A boss raid, a Rush, a boss map receipt or a saved brawl to confirm. */
  readonly live: boolean;
  /** Tonight's show: teaser in the hour before, live while it runs. */
  readonly show: 'teaser' | 'live' | null;
  /** Fin-ister Nights (or another night mode) is on. */
  readonly nightMode: boolean;
  /** Ride Control is available (signed in at a park). */
  readonly control: boolean;
  /** Shark Events: a chest is ready to open, the event is on, or none (optional so older callers stay the same). */
  readonly event?: 'ready' | 'on' | null;
}

/** Most important first: right now beats tonight beats always-on. */
export function statusOrder(state: StatusState): StatusKey[] {
  const ranked: [StatusKey, number][] = [];
  if (state.live) ranked.push(['live', 100]);
  if (state.show === 'live') ranked.push(['show', 95]);
  if (state.nightMode) ranked.push(['fright', 90]);
  if (state.event === 'ready') ranked.push(['event', 98]);
  else if (state.event) ranked.push(['event', 60]);
  if (state.show === 'teaser') ranked.push(['show', 40]);
  if (state.control) ranked.push(['control', 30]);
  return ranked.sort((a, b) => b[1] - a[1]).map(([key]) => key);
}

/** The HUD row: 12 pt from the map top, one pill tall (54), then a 10 pt gap. */
export const HUD_TOP = 12;
export const HUD_ROW_HEIGHT = 54;
export const HUD_BOTTOM = HUD_TOP + HUD_ROW_HEIGHT + 10;
/** Expanded stack closes itself after this long. */
export const HUD_EXPAND_MS = 8000;
