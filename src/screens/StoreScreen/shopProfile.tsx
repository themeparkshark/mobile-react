/**
 * Dev-only render counter for the Shark Shop (EXPO_PUBLIC_SHOP_PROFILE=1).
 * Wraps a subtree in React.Profiler and logs commits per id, so "a heart tap
 * re-renders one tile" is a number, not a claim. Inert in release builds.
 */
import { Profiler, type ReactNode } from 'react';

const ENABLED = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_SHOP_PROFILE === '1';
const counts = new Map<string, number>();
let flush: ReturnType<typeof setTimeout> | undefined;

function onRender(id: string) {
  counts.set(id, (counts.get(id) ?? 0) + 1);
  if (flush) clearTimeout(flush);
  flush = setTimeout(() => {
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const tiles = rows.filter(([k]) => k.startsWith('tile-'));
    // One line per burst of commits: total tile commits, then every id that committed.
    console.log(`[shop-profile] tiles=${tiles.reduce((n, [, c]) => n + c, 0)} tileIds=${tiles.length} ${rows.map(([k, c]) => `${k}:${c}`).join(' ')}`);
    counts.clear();
  }, 700);
}

export function ShopProfile({ id, children }: { id: string; children: ReactNode }) {
  if (!ENABLED) return <>{children}</>;
  return <Profiler id={id} onRender={onRender}>{children}</Profiler>;
}
