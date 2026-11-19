/**
 * Kit context (internal). Where a part is mounted (its place on the two levels), how wide the
 * frame it sits in is, and the one-gold-per-screen counter. Only kit parts set these: Screen,
 * World and MapGround set level 1, Page sets level 2, Card sets paper, WaveFoot marks the foot.
 * None of these providers is exported from the kit's index.
 *
 * With no kit root above it a part sits at DEFAULT_PLACE: level 2 on blue (no white edge), and it
 * counts its gold in the root scope. So a kit part dropped into a legacy screen in step 2 can never
 * put white edges or a glinting gold on an old box without a warning.
 */
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { DEFAULT_PLACE, groundFor, tooManyEdgeKinds, tooManyPrimaries, warnOnce, type EdgeKind, type StickerPlace } from './level';
import { screenFrameWidth } from './layout';

const PlaceContext = createContext<StickerPlace>(DEFAULT_PLACE);
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

/** Warn (dev) and say no when a part that belongs on the world (Header, Footer, a layer host) is mounted inside a kit page. */
export function useRefuseInPage(part: string): boolean {
  const place = useStickerPlace();
  const grounded = useContext(GroundedContext);
  const refused = grounded && place.level === 'page';
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

/** The room inside the nearest Page (its width less its line and padding), or null outside a page. */
const PageWidthContext = createContext<number | null>(null);

export function PageWidthProvider({ width, children }: { readonly width: number; readonly children: ReactNode }) {
  return <PageWidthContext.Provider value={width}>{children}</PageWidthContext.Provider>;
}

/**
 * The width a part inside a page has to fill (Stage, ProgressBar, a grid), from the page itself,
 * so a screen never re-derives it from LINE and SPACE. Outside a page: the frame's width.
 */
export function usePageWidth(): number {
  const inner = useContext(PageWidthContext);
  const frame = useFrameWidth();
  return inner ?? frame;
}

/** Whether a Page is already above (a Page inside a page draws as a Card instead, with a dev warning). */
export function useInsidePage(): boolean {
  return useContext(PageWidthContext) !== null;
}

/** One gold per screen: Screen and each floating layer count the primaries mounted in them, and the kinds of white edge. */
type PrimaryScope = { count: number; readonly key: string; readonly name: string; readonly kinds: Map<EdgeKind, number> };
/** The root scope: parts outside any Screen or layer still count their gold (step 2's legacy screens). */
const ROOT_SCOPE: { current: PrimaryScope } = { current: { count: 0, key: 'primary-root', name: 'root', kinds: new Map() } };
const PrimaryContext = createContext<{ current: PrimaryScope }>(ROOT_SCOPE);

export function PrimaryScopeProvider({ name, warnKey, children }: { readonly name: string; readonly warnKey?: string; readonly children: ReactNode }) {
  const ref = useRef<PrimaryScope>({ count: 0, key: warnKey ?? `primary-${name}`, name, kinds: new Map() });
  return <PrimaryContext.Provider value={ref}>{children}</PrimaryContext.Provider>;
}

/** A primary button registers while mounted; a second one in the same screen warns once per screen in development. */
export function useCountPrimary(active: boolean, label: string): void {
  const scope = useContext(PrimaryContext);
  useEffect(() => {
    if (!active) return undefined;
    scope.current.count += 1;
    if (tooManyPrimaries(scope.current.count)) {
      warnOnce(scope.current.key, __DEV__, m => console.warn(m), `${scope.current.name}: a second gold primary ("${label}") mounted. One gold button per screen (DIRECTION.md); make it 'second' or 'third'.`);
    }
    return () => { scope.current.count -= 1; };
  }, [active, label, scope]);
}

/** A part wearing the white edge registers its kind; a third kind on one screen warns once per screen (dev). */
export function useCountEdge(kind: EdgeKind | null): void {
  const scope = useContext(PrimaryContext);
  useEffect(() => {
    if (!kind) return undefined;
    const kinds = scope.current.kinds;
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    if (tooManyEdgeKinds(kinds.keys())) {
      warnOnce(`edges-${scope.current.key}`, __DEV__, m => console.warn(m), `${scope.current.name}: three kinds of white edge on one screen (${[...kinds.keys()].join(', ')}). The board allows two: the page and the primary.`);
    }
    return () => {
      const n = (kinds.get(kind) ?? 1) - 1;
      if (n <= 0) kinds.delete(kind); else kinds.set(kind, n);
    };
  }, [kind, scope]);
}
