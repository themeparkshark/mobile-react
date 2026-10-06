/**
 * Marker-side half of the declutter: read this marker's placement and apply it
 * on the UI thread (fade, recede scale around the anchor). Markers stay
 * mounted when hidden: mounting and unmounting many MapLibre marker views at
 * once crashed the map's subview insert in testing.
 */
import { createContext, memo, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { BRAND } from '../../../ui';
import { VISIBLE, type Placement, type TagPlacement } from './solver';
import type { DeclutterStore } from './store';

export const DeclutterContext = createContext<DeclutterStore | null>(null);

const noop = () => () => undefined;

/** This marker's placement; always visible when no declutter runs (home map, tests). */
export function usePlacement(id: string): Placement {
  const store = useContext(DeclutterContext);
  return useSyncExternalStore(
    store ? listener => store.subscribe(id, listener) : noop,
    () => store?.get(id) ?? VISIBLE,
  );
}

const FADE_MS = 120;
/** Two frames' grace for art re-entering the screen (see Placed). */
const REENTRY_MS = 50;
/** Chip slides between sides over this long. */
const TAG_MOVE_MS = 140;

/**
 * Wraps a marker's art. `anchor` is the geo point inside this box (points), so
 * a receded marker shrinks toward the ground it stands on. `overlay` (the chip)
 * sits in the same box but is never scaled: the solver already placed it
 * around the scaled art. Only opacity and transforms change here, never what
 * is mounted, and never a prop of the art itself (Skia canvases inside map
 * markers crash when their props churn under a moving map).
 */
export const Placed = memo(function Placed({ placement, anchor, style, overlay, children }: {
  readonly placement: Placement;
  /** The geo point inside this box; the centre when left out. */
  readonly anchor?: { readonly x: number; readonly y: number };
  readonly style?: ViewStyle;
  /** Unscaled content over the art (the chip and its leader line). */
  readonly overlay?: ReactNode;
  readonly children: ReactNode;
}) {
  const reduced = useReducedGameMotion();
  const opacity = useSharedValue(placement.visible ? 1 : 0);
  const scale = useSharedValue(placement.scale);
  const pop = useSharedValue(1);
  const was = useRef<{ visible: boolean; reason: Placement['reason'] }>({ visible: placement.visible, reason: placement.reason });
  useEffect(() => {
    const fromOffscreen = placement.visible && !was.current.visible && was.current.reason === 'offscreen';
    // Art coming back from off screen waits two frames before it shows: iOS parks an
    // off-screen marker view at the top-left corner until the map places it again.
    const show = withTiming(placement.visible ? 1 : 0, { duration: FADE_MS });
    opacity.value = fromOffscreen ? withDelay(REENTRY_MS, show) : show;
    scale.value = reduced ? placement.scale : withTiming(placement.scale, { duration: FADE_MS });
    // Newly freed art arrives with a small settle (0.92 to 1), never a jump; Reduce Motion skips it.
    if (placement.visible && !was.current.visible && !reduced) {
      pop.value = 0.92;
      pop.value = withDelay(fromOffscreen ? REENTRY_MS : 0, withSpring(1, { damping: 14, stiffness: 320 }));
    }
    was.current = { visible: placement.visible, reason: placement.reason };
  }, [placement.visible, placement.reason, placement.scale, opacity, scale, pop, reduced]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const art = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * pop.value }] }));
  // Numbers, never a "px" string: RN parses transform-origin strings with an integer-only regex, so
  // "86.4px" read as 4 px and receded islands shrank toward their top, floating above their spot.
  const origin = { transformOrigin: anchor ? [anchor.x, anchor.y, 0] : 'center' } as ViewStyle;
  return (
    <Animated.View pointerEvents={placement.visible ? 'box-none' : 'none'} style={fade}>
      <Animated.View style={[style, origin, art]}>{children}</Animated.View>
      {overlay}
    </Animated.View>
  );
});

/**
 * Positions a marker's chip where the solver put it (relative to the anchor
 * point inside the marker box), with a thin leader line for a far slot. With
 * no solver result (`tag` undefined) the chip keeps its own default spot.
 */
export function TagSlot({ tag, anchor, width, height, fallback, children }: {
  readonly tag: TagPlacement | null | undefined;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  /** Where the chip sits without a solver result (relative to the anchor). */
  readonly fallback: { readonly x: number; readonly y: number };
  readonly children: ReactNode;
}) {
  // Always mounted: a hidden chip fades out where it was, a moved chip slides to its new side.
  const reduced = useReducedGameMotion();
  const last = useRef(tag ?? fallback);
  if (tag) last.current = tag;
  const at = tag ?? (tag === null ? last.current : fallback);
  const x = useSharedValue(at.x), y = useSharedValue(at.y), o = useSharedValue(tag === null ? 0 : 1);
  useEffect(() => {
    const move = (v: number) => (reduced ? v : withTiming(v, { duration: TAG_MOVE_MS }));
    x.value = move(at.x);
    y.value = move(at.y);
    o.value = withTiming(tag === null ? 0 : 1, { duration: FADE_MS });
  }, [at.x, at.y, tag === null, reduced, x, y, o]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateX: x.value }, { translateY: y.value }] }));
  return (
    <>
      <Leader anchor={anchor} leader={tag?.leader ?? null} reduced={reduced} />
      <Animated.View pointerEvents="none" style={[styles.slot, { left: anchor.x, top: anchor.y, width, height }, style]}>
        {children}
      </Animated.View>
    </>
  );
}

/**
 * Fixed art (gym, swords, community centre, boss, the encounter) is never folded or shrunk, but it
 * fades out where the solver hides it: under any inset (a button, the HUD row, the offline chip),
 * more than half off screen, or below its zoom. True while it is hidden. Art the solver does not
 * lay out (no store, or not in the layout) reads as shown.
 */
export function useUnderButton(id: string): boolean {
  return !usePlacement(id).visible;
}

/** Opacity-only fade for fixed art under a button: always the same view, so nothing remounts. */
export function ButtonFade({ hidden, children }: { readonly hidden: boolean; readonly children: ReactNode }) {
  const o = useSharedValue(hidden ? 0 : 1);
  useEffect(() => { o.value = withTiming(hidden ? 0 : 1, { duration: FADE_MS }); }, [hidden, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={style}>{children}</Animated.View>;
}

type LeaderLine = { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };

/**
 * The pointer line from the art to a far chip. Always mounted: it draws in with
 * the chip (fade and grow from the art end) and fades out where it was, so a chip
 * changing slot never makes a line pop in or out.
 */
function Leader({ anchor, leader, reduced }: { anchor: { x: number; y: number }; leader: LeaderLine | null; reduced: boolean }) {
  const shown = !!leader && Math.hypot(leader.x2 - leader.x1, leader.y2 - leader.y1) >= 4;
  const last = useRef<LeaderLine>(leader ?? { x1: 0, y1: 0, x2: 0, y2: 0 });
  if (shown) last.current = leader!;
  const { x1, y1, x2, y2 } = last.current;
  const k = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    k.value = reduced ? (shown ? 1 : 0) : withTiming(shown ? 1 : 0, { duration: shown ? TAG_MOVE_MS : FADE_MS });
  }, [shown, reduced, k]);
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  // Grows out of the art end (x1, y1): scale about the line's left edge.
  const style = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ rotate: `${angle}rad` }, { scaleX: 0.4 + 0.6 * k.value }] }));
  return <Animated.View pointerEvents="none" style={[styles.leader, {
    left: anchor.x + x1, top: anchor.y + y1 - 1, width: Math.max(1, length), transformOrigin: 'left center',
  } as ViewStyle, style]} />;
}

/** "+3", or "9+" past nine (a far zoom folds whole lands into one island). */
export function foldLabel(count: number): string {
  return count > 9 ? '9+' : `+${count}`;
}

export const FOLD_POP_MS = 120;

/**
 * "+N" for markers folded into this one. Always mounted: it scales in from 0.8
 * over 120 ms when markers fold in (no scale under Reduce Motion) and fades out
 * keeping its last count, never popping.
 */
export function FoldBadge({ count, style }: { readonly count: number; readonly style?: ViewStyle }) {
  const reduced = useReducedGameMotion();
  const last = useRef(count);
  if (count > 0) last.current = count;
  const k = useSharedValue(count > 0 ? 1 : 0);
  useEffect(() => {
    k.value = withTiming(count > 0 ? 1 : 0, { duration: count > 0 ? FOLD_POP_MS : FADE_MS });
  }, [count > 0, k]); // eslint-disable-line react-hooks/exhaustive-deps
  const anim = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ scale: reduced ? 1 : 0.8 + 0.2 * k.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.fold, style, anim]}>
      <Text style={styles.foldText}>{foldLabel(Math.max(1, last.current))}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', alignItems: 'center', justifyContent: 'center', zIndex: 24 },
  leader: { position: 'absolute', height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)', zIndex: 23,
    shadowColor: BRAND.navy, shadowOpacity: 0.5, shadowRadius: 1, shadowOffset: { width: 0, height: 0 } },
  fold: { position: 'absolute', minWidth: 26, height: 22, borderRadius: 11, paddingHorizontal: 5, zIndex: 26,
    backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  foldText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy },
});
