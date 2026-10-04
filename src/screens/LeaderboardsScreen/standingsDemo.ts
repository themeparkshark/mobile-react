/**
 * Dev-only capture driver for Standings v2 (EXPO_PUBLIC_STANDINGS_DEMO=1).
 * It plays a fixed tour (scroll to you, switch boards, pick a park) so screen
 * recordings need no taps. Never active outside __DEV__.
 */
type DemoEvent = { readonly type: 'tab'; readonly index: number } | { readonly type: 'scrollMe' } | { readonly type: 'park'; readonly parkId: number | null }
  | { readonly type: 'dismiss' } | { readonly type: 'card' } | { readonly type: 'myCard' } | { readonly type: 'refresh' };

const listeners = new Set<(event: DemoEvent) => void>();

export const STANDINGS_DEMO_ON = __DEV__ && process.env.EXPO_PUBLIC_STANDINGS_DEMO === '1';

export function onStandingsDemo(listener: (event: DemoEvent) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const TOUR: readonly (readonly [number, DemoEvent])[] = [
  [5000, { type: 'dismiss' }],
  [8000, { type: 'scrollMe' }],
  // v3: your own card carries the weekly goals that left the pinned row.
  [10000, { type: 'myCard' }],
  [11500, { type: 'dismiss' }],
  [12000, { type: 'tab', index: 1 }],
  [17000, { type: 'tab', index: 2 }],
  [22000, { type: 'park', parkId: 8 }],
  [26000, { type: 'scrollMe' }],
  [29000, { type: 'card' }],
  [33000, { type: 'dismiss' }],
  [35000, { type: 'tab', index: 0 }],
  // A second climb in the same session (the capture script adds rides meanwhile).
  [42000, { type: 'refresh' }],
];

export function startStandingsDemo(): () => void {
  if (!STANDINGS_DEMO_ON) return () => undefined;
  console.log('standings-demo-start');
  const timers = TOUR.map(([at, event]) => setTimeout(() => listeners.forEach(listener => listener(event)), at));
  return () => timers.forEach(clearTimeout);
}
