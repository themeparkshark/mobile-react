import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, runOnUI, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { Marker } from './Marker';
import { glideDurationMs, glideEaseWorklet, GLIDE_MIN_MS, type GlidePoint } from './glide';
import { catchUpStart, metersEastNorth, screenOffset, SWAP_SETTLE_MS } from './playerMotion';

/** Room around the 100 x 110 shark box for its glide offset, wake and weak-signal ring (points). */
export const PLAYER_MARGIN = 140;
/** The longest glide drawn on screen (points). A longer step jumps most of the way, then glides this last stretch. */
export const PLAYER_MAX_GLIDE_PT = PLAYER_MARGIN - 60;

type Pending = { slot: number; e: number; n: number; mode: 'glide' | 'jump' | 'catch-up'; startE: number; startN: number; ms: number };

/**
 * The player's shark on the map, moved on the UI thread at the display rate.
 *
 * A MapLibre marker's coordinate can only change through a React commit, which
 * lands a frame or two after a Reanimated update, so animating it from JS
 * stepped at ~30 Hz. Here each marker coordinate stays put while the shark
 * glides inside it as a Reanimated offset (metres from the marker's point,
 * turned into points with the camera's zoom and bearing).
 *
 * Two marker copies take turns (slot 0 and 1, `activeSlot`). On each new fix
 * the hidden copy is moved to the new point; after that commit, two frames and
 * SWAP_SETTLE_MS (the native move has landed), the copies swap in one UI frame.
 * Both draw the shark at the same animated position, so the swap is invisible
 * and the visible offset never grows past one step. Neither copy ever mounts,
 * unmounts or changes layout:
 *  - the marker root is a 1 x 1 point (the location), so the native marker is
 *    tiny and never steals taps from finds next to the shark;
 *  - the art hangs off it in a fixed clip box (overflow hidden), so the bob,
 *    wake and glide (Reanimated transforms) never change the marker's layout.
 *    A layout change made iOS re-place the marker at the map's top-left corner
 *    for a frame: the "hop" this replaces.
 * `renderArt(slot)` draws a copy; the parent freezes the hidden copy's
 * animations with the same `activeSlot` and `shown` values.
 */
export function PlayerSharkMarker({ target, visible, glide, zoomPpm, bearingDeg, groundX, groundY, activeSlot, shown, renderArt }: {
  /** The filtered location; null parks the shark hidden. */
  readonly target: GlidePoint | null;
  /** Shown (panned away and on screen). */
  readonly visible: boolean;
  /** Ease between fixes (off under Reduce Motion: it jumps). */
  readonly glide: boolean;
  /** Map points per metre at the current zoom (from the camera). */
  readonly zoomPpm: SharedValue<number>;
  /** Camera bearing in degrees (from the camera). */
  readonly bearingDeg: SharedValue<number>;
  /** The shark's ground point inside its 100 x 110 box. */
  readonly groundX: number;
  readonly groundY: number;
  /** Which copy is on screen (owned by the parent so it can freeze the other). */
  readonly activeSlot: SharedValue<number>;
  /** 1 while the marker shark is shown at all. */
  readonly shown: SharedValue<number>;
  readonly renderArt: (slot: number) => ReactNode;
}) {
  // Every hook runs on every render; this component never returns early.
  const origin = useRef<GlidePoint | null>(null);
  const [anchors, setAnchors] = useState<[GlidePoint | null, GlidePoint | null]>([target, target]);
  const activeRef = useRef(0);
  const pendingRef = useRef<Pending | null>(null);
  const lastTargetAt = useRef(0);
  const lastTarget = useRef<GlidePoint | null>(target);
  // The shark's drawn position and each copy's point, in metres east/north of `origin`.
  const visE = useSharedValue(0), visN = useSharedValue(0);
  const a0E = useSharedValue(0), a0N = useSharedValue(0), a1E = useSharedValue(0), a1N = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => { shown.value = visible && target ? 1 : 0; }, [visible, !!target]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new fix: move the hidden copy there (a React commit) and start the glide.
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
    setAnchors(current => {
      const next: [GlidePoint | null, GlidePoint | null] = [current[0], current[1]];
      next[hidden] = { latitude: target.latitude, longitude: target.longitude };
      return next;
    });
    const ms = prev ? glideDurationMs(prev, target, since) : 0;
    const ppm = zoomPpm.value > 0 ? zoomPpm.value : 3;
    const maxM = PLAYER_MAX_GLIDE_PT / ppm;
    // How far the visible copy would have to draw the shark from its own point. Measured from that
    // point (not the last fix), so a burst of fixes faster than the swap can never outgrow the clip box.
    const active = activeRef.current;
    const reachM = Math.hypot(tE - (active === 0 ? a0E.value : a1E.value), tN - (active === 0 ? a0N.value : a1N.value));
    const mode: Pending['mode'] = !glide || !prev ? 'jump' : ms > 0 && reachM * ppm <= PLAYER_MAX_GLIDE_PT ? 'glide' : 'catch-up';
    const [startE, startN] = catchUpStart(tE, tN, visE.value, visN.value, maxM);
    pendingRef.current = { slot: hidden, e: tE, n: tN, mode, startE, startN, ms: Math.max(GLIDE_MIN_MS, ms) };
    runOnUI((slot: number, e: number, n: number, glideMs: number, glides: boolean) => {
      'worklet';
      if (slot === 0) { a0E.value = e; a0N.value = n; } else { a1E.value = e; a1N.value = n; }
      // A normal step starts gliding at once on the visible copy (within its clip margin).
      if (glides) {
        visE.value = withTiming(e, { duration: glideMs, easing: glideEaseWorklet });
        visN.value = withTiming(n, { duration: glideMs, easing: glideEaseWorklet });
      }
    })(hidden, tE, tN, ms, mode === 'glide');
  }, [target?.latitude, target?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // After the hidden copy's new point is committed: two frames, then the settle time, then swap.
  // Gated on the commit (not a wall clock from the fix), so a busy JS thread never swaps early.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (timer.current) clearTimeout(timer.current);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        timer.current = setTimeout(() => {
          timer.current = null;
          const p = pendingRef.current;
          if (!p || p.slot !== pending.slot) return;
          pendingRef.current = null;
          activeRef.current = p.slot;
          runOnUI((slot: number, e: number, n: number, mode: string, sE: number, sN: number, ms: number) => {
            'worklet';
            if (mode === 'jump') {
              cancelAnimation(visE); cancelAnimation(visN);
              visE.value = e; visN.value = n;
            } else if (mode === 'catch-up') {
              // Too far to glide all the way: jump to the last stretch, then glide it.
              cancelAnimation(visE); cancelAnimation(visN);
              visE.value = sE; visN.value = sN;
              visE.value = withTiming(e, { duration: ms, easing: glideEaseWorklet });
              visN.value = withTiming(n, { duration: ms, easing: glideEaseWorklet });
            }
            activeSlot.value = slot;
          })(p.slot, p.e, p.n, p.mode, p.startE, p.startN, p.ms);
        }, SWAP_SETTLE_MS);
      });
    });
  }, [anchors]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  return (
    <>
      {[0, 1].map(slot => (
        <PlayerSlot key={slot} slot={slot} coordinate={anchors[slot] ?? target} active={activeSlot} shown={shown}
          visE={visE} visN={visN} aE={slot === 0 ? a0E : a1E} aN={slot === 0 ? a0N : a1N}
          zoomPpm={zoomPpm} bearingDeg={bearingDeg} groundX={groundX} groundY={groundY}>{renderArt(slot)}</PlayerSlot>
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
    // The hidden copy holds still (no per-frame work for a view nobody sees).
    if (active.value !== slot || shown.value === 0) return { transform: [{ translateX: 0 }, { translateY: 0 }] };
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
