/**
 * Dev-only capture driver for Standings v2 (EXPO_PUBLIC_STANDINGS_DEMO=1).
 * It plays a fixed tour (scroll to you, switch boards, pick a park) so screen
 * recordings need no taps. Never active outside __DEV__.
 */
type DemoEvent = { readonly type: 'tab'; readonly index: number } | { readonly type: 'scrollMe' } | { readonly type: 'park'; readonly parkId: number | null };

const listeners = new Set<(event: DemoEvent) => void>();

export const STANDINGS_DEMO_ON = __DEV__ && process.env.EXPO_PUBLIC_STANDINGS_DEMO === '1';

export function onStandingsDemo(listener: (event: DemoEvent) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const TOUR: readonly (readonly [number, DemoEvent])[] = [
  [6000, { type: 'scrollMe' }],
  [10000, { type: 'tab', index: 1 }],
  [16000, { type: 'scrollMe' }],
  [20000, { type: 'tab', index: 2 }],
  [26000, { type: 'park', parkId: 8 }],
  [31000, { type: 'scrollMe' }],
  [36000, { type: 'tab', index: 0 }],
];

export function startStandingsDemo(): () => void {
  if (!STANDINGS_DEMO_ON) return () => undefined;
  const timers = TOUR.map(([at, event]) => setTimeout(() => listeners.forEach(listener => listener(event)), at));
  return () => timers.forEach(clearTimeout);
}
