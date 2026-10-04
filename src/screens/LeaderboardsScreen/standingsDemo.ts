/**
 * Dev-only capture driver for Standings v2 (EXPO_PUBLIC_STANDINGS_DEMO=1).
 * It plays a fixed tour (scroll to you, switch boards, pick a park) so screen
 * recordings need no taps. Never active outside __DEV__.
 */
type DemoEvent = { readonly type: 'tab'; readonly index: number } | { readonly type: 'scrollMe' } | { readonly type: 'park'; readonly parkId: number | null }
  | { readonly type: 'dismiss' } | { readonly type: 'card' } | { readonly type: 'myCard' } | { readonly type: 'refresh' }
  | { readonly type: 'scrollBy'; readonly dy: number };

const listeners = new Set<(event: DemoEvent) => void>();

export const STANDINGS_DEMO_ON = __DEV__ && process.env.EXPO_PUBLIC_STANDINGS_DEMO === '1';

export function onStandingsDemo(listener: (event: DemoEvent) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const TOUR: readonly (readonly [number, DemoEvent])[] = [
  [5000, { type: 'dismiss' }],
  // This Week: a stranger's safe card, then show my row and my card (goals).
  [6000, { type: 'tab', index: 0 }],
  [7500, { type: 'card' }],
  [9500, { type: 'dismiss' }],
  [10500, { type: 'scrollMe' }],
  [13000, { type: 'myCard' }],
  [15500, { type: 'dismiss' }],
  // Scroll up from Your spot into the grey rows: a held page lands, nothing jumps.
  [16500, { type: 'scrollBy', dy: -700 }],
  [18500, { type: 'scrollBy', dy: -700 }],
  [21000, { type: 'tab', index: 1 }],
  [25000, { type: 'tab', index: 2 }],
  [29000, { type: 'park', parkId: 8 }],
  [32000, { type: 'card' }],
  [34500, { type: 'dismiss' }],
  [36000, { type: 'tab', index: 0 }],
  // A second climb in the same session (the capture script adds rides meanwhile).
  [42000, { type: 'refresh' }],
];

export function startStandingsDemo(): () => void {
  if (!STANDINGS_DEMO_ON) return () => undefined;
  console.log('standings-demo-start');
  const timers = TOUR.map(([at, event]) => setTimeout(() => listeners.forEach(listener => listener(event)), at));
  return () => timers.forEach(clearTimeout);
}
