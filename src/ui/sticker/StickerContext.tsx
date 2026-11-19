/**
 * Where a sticker part is mounted. Page sets it for its children; Card, StickerButton, Tag,
 * Spot, StickerText and the rest read it. The default is the world (level 1, on blue).
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { WORLD, decideEdge, warnRefusedEdge, type StickerLevel, type StickerPlace, type StickerSurface } from './level';

const StickerContext = createContext<StickerPlace>(WORLD);

export function useStickerPlace(): StickerPlace {
  return useContext(StickerContext);
}

/** Put parts on a ground: the world (blue), the map (tan streets) or inside a page. */
export function StickerGround({ level, surface, children }: {
  readonly level: StickerLevel;
  readonly surface?: StickerSurface;
  readonly children: ReactNode;
}) {
  const value = useMemo<StickerPlace>(() => ({
    level,
    surface: surface ?? (level === 'map' ? 'map' : 'blue'),
  }), [level, surface]);
  return <StickerContext.Provider value={value}>{children}</StickerContext.Provider>;
}

/** Internal: hand a computed place to children. */
export function PlaceProvider({ value, children }: { readonly value: StickerPlace; readonly children: ReactNode }) {
  return <StickerContext.Provider value={value}>{children}</StickerContext.Provider>;
}

/** The edge decision for a part, with the dev warning when a screen forces one inside a page. */
export function useEdge(part: string, asked?: boolean): { readonly edge: boolean; readonly place: StickerPlace } {
  const place = useStickerPlace();
  const decision = decideEdge(place.level, asked);
  if (decision.refused) warnRefusedEdge(part, __DEV__, message => console.warn(message));
  return { edge: decision.edge, place };
}
