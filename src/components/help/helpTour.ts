/**
 * Dev-only capture tour for the "?" sheets (EXPO_PUBLIC_HELP_TOUR=1, or a comma
 * list of sheet ids). It opens each screen, then its sheet, steps through the
 * pages and closes it, so review recordings need no taps. Never runs outside __DEV__.
 */
import * as RootNavigation from '../../RootNavigation';
import type { HelpSheetId } from '../../services/help/helpSheets';

const RAW = process.env.EXPO_PUBLIC_HELP_TOUR;
export const HELP_TOUR_ON = __DEV__ && !!RAW && RAW !== '0';

type Stop = { readonly sheet: HelpSheetId | 'term'; readonly route?: string; readonly params?: Record<string, unknown> };

const STOPS: readonly Stop[] = [
  { sheet: 'standings', route: 'Leaderboard' },
  { sheet: 'pins', route: 'PinSwaps' },
  { sheet: 'shop', route: 'Store', params: { store: 'shark-shop' } },
  { sheet: 'park', route: 'Park', params: { park: Number(process.env.EXPO_PUBLIC_HELP_TOUR_PARK ?? 1) } },
  { sheet: 'park_map', route: 'Explore' },
  { sheet: 'redeem', route: 'RedeemCoinCode' },
  { sheet: 'social', route: 'Social' },
  { sheet: 'term', route: 'Explore' },
];

export interface TourHooks {
  readonly open: (id: HelpSheetId) => void;
  readonly explain: () => void;
  readonly close: () => void;
  readonly pages: (id: HelpSheetId) => number;
}

let pageListener: (() => void) | null = null;
/** HelpSheet registers here so the tour can press Next. */
export function onTourNext(listener: (() => void) | null): void { pageListener = listener; }

export function startHelpTour(hooks: TourHooks, playerId?: number | null): () => void {
  if (!HELP_TOUR_ON) return () => undefined;
  const wanted = RAW === '1' ? null : new Set(RAW!.split(",").map((value: string) => value.trim()));
  const stops = STOPS.filter(stop => !wanted || wanted.has(stop.sheet));
  const timers: ReturnType<typeof setTimeout>[] = [];
  let at = Number(process.env.EXPO_PUBLIC_HELP_TOUR_DELAY ?? 9000);
  const step = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, at)); at += ms; };
  for (const stop of stops) {
    if (stop.route) step(6500, () => RootNavigation.navigate(stop.route!, { ...(stop.params ?? {}), ...(stop.route === 'Park' ? { player: playerId } : {}) }));
    step(4200, () => (stop.sheet === 'term' ? hooks.explain() : hooks.open(stop.sheet)));
    const pages = stop.sheet === 'term' ? 1 : hooks.pages(stop.sheet);
    for (let i = 1; i < pages; i += 1) step(4200, () => pageListener?.());
    step(1500, hooks.close);
  }
  return () => timers.forEach(clearTimeout);
}
