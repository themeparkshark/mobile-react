/**
 * ResultsPodium: the scene above the shared results card, so every game ends
 * the way Sharky, the Duel and the Boss do (a picture standing on the card,
 * never a flat panel over a dimmed game).
 *
 *   - A star or a new best: Alex's cheering shark hops on the podium a few
 *     times, then rests (no loop left running in a pocket).
 *   - Anything else: the shark swims calmly, off the podium (a 0-star run is
 *     never a podium moment and never a sad face).
 *
 * The shark and podium scale with the room the card leaves (like Sharky).
 * A tall card (a big Whack win) leaves no room for the podium, so the
 * cheering shark peeks up from behind the ribbon's right end instead (clear of
 * the close button on the left): the best runs never lose their moment. The
 * peek is drawn by the card itself (ResultsCard `peek`), so it is anchored to
 * the card's real top edge; this zone only measures the room and reports the
 * peek's size through `onPeek`. A run with no star and no room shows
 * nothing. All motion is Reanimated on the UI thread; Reduce Motion shows the
 * pose with no hop.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

const ART = {
  cheer: require('../../assets/games/sharky/tide/shark_cheer.png'),
  swim: require('../../assets/games/sharky/tide/shark_swim_side.png'),
  podium: require('../../assets/games/sharky/tide/v71/podium.png'),
};

/** Height of the full shark-on-podium pose (podium step at 70 pt + a 160 pt shark), like Sharky's. */
export const PODIUM_POSE_PT = 230;
/** Below this much room the scene hides (a squashed shark reads worse than none). */
export const PODIUM_MIN_PT = 96;
/** The cheer hops this many times, then rests. */
export const PODIUM_HOPS = 3;

/** The most the peeking shark draws at when there is no room for the podium. */
export const PEEK_SCALE = 0.5;
/** Below this the peek hides (a tiny shark reads as a smudge). */
export const PEEK_MIN_SCALE = 0.3;
/**
 * Room above the zone the peek may use (the stage's top padding is about 56
 * pt under the safe area), so on an iPhone SE it never climbs into the
 * status bar.
 */
export const PEEK_HEADROOM_PT = 48;
/** The zone must keep at least this much room for the peek to show. */
export const PEEK_MIN_ROOM_PT = 12;

/** How big the peeking shark draws in a zone of height h (0 = no peek): it never climbs past the safe top. */
export function peekScale(h: number): number {
  // No room at all (the card already reaches the top padding, as on an SE): no peek.
  if (!(h >= PEEK_MIN_ROOM_PT)) return 0;
  const k = Math.min(PEEK_SCALE, (Math.max(0, h) + PEEK_HEADROOM_PT) / 160);
  return k >= PEEK_MIN_SCALE ? Math.floor(k * 100) / 100 : 0;
}

/** How the scene draws in a zone of height h: the podium, the peek over the ribbon, or nothing. */
export function podiumMode(h: number, cheer: boolean): 'podium' | 'peek' | 'none' {
  if (podiumScale(h) > 0) return 'podium';
  return cheer && peekScale(h) > 0 ? 'peek' : 'none';
}

/** How big the scene draws in a zone of height h (0 = hidden). */
export function podiumScale(h: number): number {
  if (!(h >= PODIUM_MIN_PT)) return 0;
  return Math.max(0.42, Math.min(1, h / PODIUM_POSE_PT));
}

export function ResultsPodium({ cheer, reducedMotion = false, delayMs = 120, onPeek }: {
  cheer: boolean;
  reducedMotion?: boolean;
  delayMs?: number;
  /** The peek's scale when the card should draw it (0 = no peek): the card anchors it to its ribbon. */
  onPeek?: (scale: number) => void;
}) {
  const [zoneH, setZoneH] = useState(-1);
  const mode = zoneH < 0 ? 'none' : podiumMode(zoneH, cheer);
  const peekK = mode === 'peek' ? peekScale(zoneH) : 0;
  const k = mode === 'podium' ? podiumScale(zoneH) : 0;
  const onPeekRef = React.useRef(onPeek);
  onPeekRef.current = onPeek;
  useEffect(() => { onPeekRef.current?.(peekK); }, [peekK]);
  const rise = useSharedValue(reducedMotion ? 0 : 40);
  const o = useSharedValue(reducedMotion ? 1 : 0);
  const hop = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion || k === 0) return undefined;
    o.value = withDelay(delayMs, withTiming(1, { duration: 200 }));
    rise.value = withDelay(delayMs, withSpring(0, { damping: 12, stiffness: 200 }));
    if (cheer) {
      hop.value = withDelay(delayMs + 380, withRepeat(withSequence(
        withTiming(-14, { duration: 220, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }),
      ), PODIUM_HOPS));
    }
    return () => { cancelAnimation(hop); cancelAnimation(rise); cancelAnimation(o); };
  }, [k === 0, cheer, reducedMotion, delayMs, hop, rise, o]); // eslint-disable-line react-hooks/exhaustive-deps
  const sceneSt = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: rise.value }] }));
  const sharkSt = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }] }));
  const onLayout = (e: LayoutChangeEvent) => setZoneH(Math.round(e.nativeEvent.layout.height));
  return (
    <View style={styles.zone} onLayout={onLayout} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      {k > 0 ? (
        <Animated.View style={[styles.scene, { width: 210 * k, height: cheer ? 110 * k : 150 * k }, sceneSt]}>
          <Animated.View style={[styles.shark, { bottom: (cheer ? 70 : 18) * k }, sharkSt]}>
            <Image source={cheer ? ART.cheer : ART.swim} style={cheer ? { width: 130 * k, height: 160 * k } : { width: 190 * k, height: 130 * k }} resizeMode="contain" />
          </Animated.View>
          {cheer ? <Image source={ART.podium} style={{ width: 210 * k, height: 110 * k }} resizeMode="contain" /> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The podium tucks behind the card's ribbon, so the shark stands on the card.
  zone: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center', minHeight: 0, marginBottom: 22 },
  scene: { alignItems: 'center', justifyContent: 'flex-end' },
  shark: { position: 'absolute', alignSelf: 'center' },
});
