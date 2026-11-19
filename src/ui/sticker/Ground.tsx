/**
 * World and MapGround: the two public roots of level 1 for kit pieces that are not inside a Screen
 * (a live screen moving onto the kit one area at a time, the dev gallery). World is the blue
 * background; MapGround is the map (the caller draws the map itself). Asked for inside a page they
 * are refused (dev warning) and their children stay level 2: the two-level rule cannot be broken
 * from a screen.
 */
import type { ReactNode } from 'react';
import { Ground } from './StickerContext';

export function World({ children }: { readonly children: ReactNode }) {
  return <Ground level="world">{children}</Ground>;
}

export function MapGround({ children }: { readonly children: ReactNode }) {
  return <Ground level="map">{children}</Ground>;
}
