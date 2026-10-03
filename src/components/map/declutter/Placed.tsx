/**
 * Marker-side half of the declutter: read this marker's placement and apply it
 * on the UI thread (fade, recede scale around the anchor). Markers stay
 * mounted when hidden: mounting and unmounting many MapLibre marker views at
 * once crashed the map's subview insert in testing.
 */
import { createContext, memo, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
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
  const opacity = useSharedValue(placement.visible ? 1 : 0);
  const scale = useSharedValue(placement.scale);
  const pop = useSharedValue(1);
  const wasVisible = useRef(placement.visible);
  useEffect(() => {
    opacity.value = withTiming(placement.visible ? 1 : 0, { duration: FADE_MS });
    scale.value = withTiming(placement.scale, { duration: FADE_MS });
    // Newly freed art arrives with a small settle (0.92 to 1), never a jump.
    if (placement.visible && !wasVisible.current) {
      pop.value = 0.92;
      pop.value = withSpring(1, { damping: 14, stiffness: 320 });
    }
    wasVisible.current = placement.visible;
  }, [placement.visible, placement.scale, opacity, scale, pop]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const art = useAnimatedStyle(() => ({ transform: [{ scale: scale.value * pop.value }] }));
  const origin = { transformOrigin: anchor ? `${anchor.x}px ${anchor.y}px 0px` : 'center' } as ViewStyle;
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
  if (tag === null) return null;
  const at = tag ?? fallback;
  return (
    <>
      {tag?.leader && <Leader anchor={anchor} {...tag.leader} />}
      <View pointerEvents="none" style={[styles.slot, { left: anchor.x + at.x, top: anchor.y + at.y, width, height }]}>
        {children}
      </View>
    </>
  );
}

function Leader({ anchor, x1, y1, x2, y2 }: { anchor: { x: number; y: number }; x1: number; y1: number; x2: number; y2: number }) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 4) return null;
  const angle = Math.atan2(dy, dx);
  return <View pointerEvents="none" style={[styles.leader, {
    left: anchor.x + (x1 + x2) / 2 - length / 2, top: anchor.y + (y1 + y2) / 2 - 1, width: length,
    transform: [{ rotate: `${angle}rad` }],
  }]} />;
}

/** "+N" for markers folded into this one (haunts; rides draw their own). */
export function FoldBadge({ count, style }: { readonly count: number; readonly style?: ViewStyle }) {
  if (count <= 0) return null;
  return (
    <View pointerEvents="none" style={[styles.fold, style]}>
      <Text style={styles.foldText}>+{count}</Text>
    </View>
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
