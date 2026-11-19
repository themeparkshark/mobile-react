/**
 * Kit context (internal). Where a part is mounted (its place on the two levels), how wide the
 * frame it sits in is, and the one-gold-per-screen counter. Only kit parts set these: Screen,
 * World and MapGround set level 1, Page sets level 2, Card sets paper, WaveFoot marks the foot.
 * None of these providers is exported from the kit's index.
 */
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { WORLD, groundFor, tooManyPrimaries, warnOnce, type StickerPlace } from './level';
import { screenFrameWidth } from './layout';

const PlaceContext = createContext<StickerPlace>(WORLD);
/** True once any kit ground is mounted above (so a nested ground can be refused). */
const GroundedContext = createContext(false);

export function useStickerPlace(): StickerPlace {
  return useContext(PlaceContext);
}

/** Internal: hand a computed place to children. */
export function PlaceProvider({ value, children }: { readonly value: StickerPlace; readonly children: ReactNode }) {
  return <PlaceContext.Provider value={value}><GroundedContext.Provider value>{children}</GroundedContext.Provider></PlaceContext.Provider>;
}

/**
 * Internal: a root ground (level 1). Inside a page it is refused: the children keep level 2 and a
 * dev warning says so, so `<Page><Ground level="world"><Card/></Ground></Page>` draws no white edge.
 */
export function Ground({ level, children }: { readonly level: 'world' | 'map'; readonly children: ReactNode }) {
  const parent = useStickerPlace();
  const nested = useContext(GroundedContext);
  const decision = groundFor(parent, level, nested);
  if (decision.refused) {
    warnOnce(`ground-${level}`, __DEV__, m => console.warn(m), `a ${level} ground was asked for inside a page. Level 1 is set only by Screen, World and MapGround at the root; the children stay level 2.`);
  }
  return <PlaceProvider value={decision.place}>{children}</PlaceProvider>;
}

/** Warn (dev) and say no when a part that belongs on the world (Header, Footer, a layer host) is mounted inside a page. */
export function useRefuseInPage(part: string): boolean {
  const place = useStickerPlace();
  const refused = place.level === 'page';
  if (refused) warnOnce(`inpage-${part}`, __DEV__, m => console.warn(m), `${part} was mounted inside a page. It belongs on the world; nothing was drawn.`);
  return refused;
}

/** The width pages get where they are mounted: the screen's frame or a floating layer's. */
type Frame = { readonly width: number };
const FrameContext = createContext<Frame | null>(null);

export function FrameProvider({ width, children }: { readonly width: number; readonly children: ReactNode }) {
  const value = useMemo(() => ({ width }), [width]);
  return <FrameContext.Provider value={value}>{children}</FrameContext.Provider>;
}

/** The frame's width (default: the window less the 16 pt screen margins). */
export function useFrameWidth(): number {
  const frame = useContext(FrameContext);
  const { width } = useWindowDimensions();
  return frame?.width ?? screenFrameWidth(width);
}

/** One gold per screen: Screen and each floating layer count the primaries mounted in them. */
type PrimaryScope = { count: number; readonly name: string };
const PrimaryContext = createContext<{ current: PrimaryScope } | null>(null);

export function PrimaryScopeProvider({ name, children }: { readonly name: string; readonly children: ReactNode }) {
  const ref = useRef<PrimaryScope>({ count: 0, name });
  return <PrimaryContext.Provider value={ref}>{children}</PrimaryContext.Provider>;
}

/** A primary button registers while mounted; a second one in the same scope warns once in development. */
export function useCountPrimary(active: boolean, label: string): void {
  const scope = useContext(PrimaryContext);
  useEffect(() => {
    if (!active || !scope) return undefined;
    scope.current.count += 1;
    if (tooManyPrimaries(scope.current.count)) {
      warnOnce(`primary-${scope.current.name}`, __DEV__, m => console.warn(m), `${scope.current.name}: a second gold primary ("${label}") mounted. One gold button per screen (DIRECTION.md); make it 'second' or 'third'.`);
    }
    return () => { scope.current.count -= 1; };
  }, [active, label, scope]);
}
