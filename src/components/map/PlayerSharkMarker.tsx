import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, runOnUI, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { Marker } from './Marker';
import { glideDurationMs, glideEaseWorklet, type GlidePoint } from './glide';
import { metersEastNorth, screenOffset, SWAP_SETTLE_MS } from './playerMotion';

/** Room around the 100 x 110 shark box for its glide offset, wake and weak-signal ring (points). */
export const PLAYER_MARGIN = 140;
/** A glide longer than this on screen (points) is a jump instead: it would leave the clip box. */
export const PLAYER_MAX_GLIDE_PT = PLAYER_MARGIN - 60;

/**
 * The player's shark on the map, moved on the UI thread at the display rate.
 *
 * A MapLibre marker's coordinate can only change through a React commit, which
 * lands a frame or two later than a Reanimated update, so animating it from JS
 * stepped at ~30 Hz. Here each marker coordinate stays put while the shark
 * glides inside it as a Reanimated offset (metres from the marker's point,
 * turned into points with the camera's zoom and bearing).
 *
 * Two marker copies take turns (slot 0 and 1). On each new fix the hidden copy
 * is moved to the new point; once that move has surely landed (SWAP_SETTLE_MS)
 * the copies swap in one UI frame. Both draw the shark at the same animated
 * position, so the swap is invisible and the visible copy's offset never grows
 * past one step. Neither copy ever mounts, unmounts or changes layout:
 *  - the marker root is a 1 x 1 point (the location), so the native marker is
 *    tiny and never steals taps from finds next to the shark;
 *  - the art sits in a fixed clip box (overflow hidden) hung off that point, so
 *    the bob, wake and glide (Reanimated transforms) never change the marker's
 *    layout. A layout change made iOS re-place the marker at the map's top-left
 *    corner for a frame: the "hop" this replaces.
 */
export function PlayerSharkMarker({ target, visible, glide, zoomPpm, bearingDeg, groundX, groundY, children }: {
  /** The filtered location; null parks the shark hidden at its last spot. */
  readonly target: GlidePoint | null;
  /** Shown (panned away and on screen). */
  readonly visible: boolean;
  /** Ease between fixes (off under Reduce Motion: it jumps). */
  readonly glide: boolean;
  /** Map points per metre at the current zoom (Reanimated value, from the camera). */
  readonly zoomPpm: SharedValue<number>;
  /** Camera bearing in degrees (Reanimated value, from the camera). */
  readonly bearingDeg: SharedValue<number>;
  /** The shark's ground point inside its 100 x 110 box. */
  readonly groundX: number;
  readonly groundY: number;
  readonly children: ReactNode;
}) {
  // Every hook runs on every render, before anything can return.
  const origin = useRef<GlidePoint | null>(null);
  const [anchors, setAnchors] = useState<[GlidePoint | null, GlidePoint | null]>([target, target]);
  const activeRef = useRef(0);
  const pendingRef = useRef<{ slot: number; at: number } | null>(null);
  const lastTargetAt = useRef(0);
  const lastTarget = useRef<GlidePoint | null>(target);
  const active = useSharedValue(0);
  // The shark's drawn position and each copy's point, in metres east/north of `origin`.
  const visE = useSharedValue(0), visN = useSharedValue(0);
  const a0E = useSharedValue(0), a0N = useSharedValue(0), a1E = useSharedValue(0), a1N = useSharedValue(0);
  const shown = useSharedValue(visible && target ? 1 : 0);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { shown.value = visible && target ? 1 : 0; }, [visible, !!target]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!target) return;
    if (!origin.current) origin.current = { latitude: target.latitude, longitude: target.longitude };
    const prev = lastTarget.current;
    lastTarget.current = target;
    const now = Date.now();
    const since = now - lastTargetAt.current;
    lastTargetAt.current = now;
    const [tE, tN] = metersEastNorth(origin.current, target);
    const hidden = 1 - activeRef.current;
    // Move the hidden copy to the new point (a React commit), then swap once it has landed.
    setAnchors(current => {
      const next: [GlidePoint | null, GlidePoint | null] = [current[0], current[1]];
      next[hidden] = { latitude: target.latitude, longitude: target.longitude };
      return next;
    });
    const step = prev ? glideDurationMs(prev, target, since) : 0;
    const stepPt = prev ? Math.hypot(...metersEastNorth(prev, target)) * zoomPpm.value : 0;
    const jump = !glide || step <= 0 || stepPt > PLAYER_MAX_GLIDE_PT;
    runOnUI((slot: number, e: number, n: number, ms: number, isJump: boolean) => {
      'worklet';
      if (slot === 0) { a0E.value = e; a0N.value = n; } else { a1E.value = e; a1N.value = n; }
      if (!isJump) {
        visE.value = withTiming(e, { duration: ms, easing: glideEaseWorklet });
        visN.value = withTiming(n, { duration: ms, easing: glideEaseWorklet });
      }
    })(hidden, tE, tN, step, jump);
    pendingRef.current = { slot: hidden, at: now };
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => {
      swapTimer.current = null;
      const pending = pendingRef.current;
      if (!pending || pending.slot !== hidden) return;
      pendingRef.current = null;
      activeRef.current = hidden;
      // One UI frame: the jump (if any) and the swap together, so nothing flickers.
      runOnUI((slot: number, e: number, n: number, isJump: boolean) => {
        'worklet';
        if (isJump) {
          cancelAnimation(visE); cancelAnimation(visN);
          visE.value = e; visN.value = n;
        }
        active.value = slot;
      })(hidden, tE, tN, jump);
    }, SWAP_SETTLE_MS);
  }, [target?.latitude, target?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (swapTimer.current) clearTimeout(swapTimer.current); }, []);

  return (
    <>
      {[0, 1].map(slot => (
        <PlayerSlot key={slot} slot={slot} coordinate={anchors[slot] ?? target} active={active} shown={shown}
          visE={visE} visN={visN} aE={slot === 0 ? a0E : a1E} aN={slot === 0 ? a0N : a1N}
          zoomPpm={zoomPpm} bearingDeg={bearingDeg} groundX={groundX} groundY={groundY}>{children}</PlayerSlot>
      ))}
    </>
  );
}

/** Where a copy waits before the first fix (never shown: the marker is hidden). */
const PARKED: GlidePoint = { latitude: 34.1381, longitude: -118.3534 };

function PlayerSlot({ slot, coordinate, active, shown, visE, visN, aE, aN, zoomPpm, bearingDeg, groundX, groundY, children }: {
  readonly slot: number;
  readonly coordinate: GlidePoint | null;
  readonly active: SharedValue<number>;
  readonly shown: SharedValue<number>;
  readonly visE: SharedValue<number>; readonly visN: SharedValue<number>;
  readonly aE: SharedValue<number>; readonly aN: SharedValue<number>;
  readonly zoomPpm: SharedValue<number>;
  readonly bearingDeg: SharedValue<number>;
  readonly groundX: number;
  readonly groundY: number;
  readonly children: ReactNode;
}) {
  const clip = useAnimatedStyle(() => ({ opacity: active.value === slot ? shown.value : 0 }));
  const art = useAnimatedStyle(() => {
    const [x, y] = screenOffset(visE.value - aE.value, visN.value - aN.value, zoomPpm.value, bearingDeg.value);
    return { transform: [{ translateX: x }, { translateY: y }] };
  });
  return (
    <Marker coordinate={coordinate ?? PARKED} hidden={!coordinate}>
      <View style={styles.point}>
        <Animated.View pointerEvents="none" style={[styles.clip, { left: 0.5 - PLAYER_MARGIN - groundX, top: 0.5 - PLAYER_MARGIN - groundY }, clip]}>
          <Animated.View style={[styles.art, art]}>{children}</Animated.View>
        </Animated.View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  // The marker itself is one point: the location. Everything hangs off it.
  point: { width: 1, height: 1 },
  clip: { position: 'absolute', width: 100 + 2 * PLAYER_MARGIN, height: 110 + 2 * PLAYER_MARGIN, overflow: 'hidden' },
  art: { position: 'absolute', left: PLAYER_MARGIN, top: PLAYER_MARGIN, width: 100, height: 110 },
});
