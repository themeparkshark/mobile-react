import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, SHADOW } from '../../ui';
import { useCoverArt } from './mapCover';

const CHEST = require('../../../assets/images/daily/chest-closed.png');

/**
 * Each day's chest pops in once per app session. If anything remounts the button later (a rail
 * rebuilt, the map screen coming back), it never pops a second time: it snaps to full as soon as
 * its art has drawn. A new day's chest (a new gift id) pops again.
 */
let poppedGift: number | string | null = null;
/** Tests only: the next mount pops again. */
export function resetChestPopForTests(): void { poppedGift = null; }

/**
 * The daily chest on the map, under the recenter button and in its style.
 * It is only on the map while today's chest is unclaimed, with a gold dot,
 * so "Back to map" never loses the day's reward.
 */
export default function ChestMapButton({ onPress, giftId }: { readonly onPress: () => void;
  /** Today's gift: a new one pops again in the same session. */
  readonly giftId: number | string }) {
  // The map's loading cover waits for the chest art, so the button is never an empty blue circle.
  const artDrawn = useCoverArt();
  // The button shows only once its chest has drawn: when today's chest arrives after the map, it never
  // flashes an empty blue circle first.
  const [drawn, setDrawn] = useState(false);
  const onArt = () => { artDrawn(); setDrawn(true); };
  // It joins the end of the rail (nothing above it moves) and pops in once drawn: a quick fade and a
  // small spring from 0.7, never a hard blink. Reduce Motion places it at once. The pop runs on the
  // native driver: its values live on the UI thread and a parent re-render never resets them (a
  // re-rendered Reanimated style could drop back to its mount value for a few frames: the blink).
  const reduced = useReducedGameMotion();
  // Already popped this session (same gift): no second pop. It still waits for its art, so a cold
  // image cache (memory purged after a long background) never shows an empty blue circle: invisible
  // until onLoad, then full in one step, no spring.
  const [settled] = useState(poppedGift === giftId);
  const fade = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(settled ? 1 : 0)).current;
  useEffect(() => {
    if (!drawn) return;
    if (settled || reduced) { fade.setValue(1); shown.setValue(1); poppedGift = giftId; return; }
    poppedGift = giftId;
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(shown, { toValue: 1, stiffness: 320, damping: 18, mass: 0.8, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, reduced, settled, shown, fade]);
  const pop = useRef({ opacity: fade, transform: [{ scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }).current;
  return (
    <Animated.View style={pop}>
      <Pressable onPress={() => { haptic('tapLight'); onPress(); }} accessibilityRole="button"
        accessibilityLabel="Daily chest, ready to open" hitSlop={6}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Image source={CHEST} style={styles.chest} contentFit="contain" transition={0} onLoad={onArt} onError={onArt} />
        <View style={styles.dot} accessibilityElementsHidden />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  pressed: { transform: [{ scale: 0.94 }] },
  chest: { width: 36, height: 36 },
  dot: { position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: 8,
    backgroundColor: BRAND.gold, borderWidth: 2.5, borderColor: BRAND.white },
});
