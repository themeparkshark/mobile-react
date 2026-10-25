import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, SHADOW } from '../../ui';
import { useCoverArt } from './mapCover';

const CHEST = require('../../../assets/images/daily/chest-closed.png');

/**
 * The chest pops in once per app session. If anything ever remounts the button later (a rail
 * rebuilt, the map screen coming back), it stands at full at once: it never blinks out and
 * pops a second time.
 */
let poppedThisSession = false;
/** Tests only: the next mount pops again. */
export function resetChestPopForTests(): void { poppedThisSession = false; }

/**
 * The daily chest on the map, under the recenter button and in its style.
 * It is only on the map while today's chest is unclaimed, with a gold dot,
 * so "Back to map" never loses the day's reward.
 */
export default function ChestMapButton({ onPress }: { readonly onPress: () => void }) {
  // The map's loading cover waits for the chest art, so the button is never an empty blue circle.
  const artDrawn = useCoverArt();
  // The button shows only once its chest has drawn: when today's chest arrives after the map, it never
  // flashes an empty blue circle first.
  const [drawn, setDrawn] = useState(false);
  const onArt = () => { artDrawn(); setDrawn(true); };
  // It joins the end of the rail (nothing above it moves) and pops in on the UI thread once drawn:
  // a quick fade and a small spring from 0.7, never a hard blink. Reduce Motion places it at once.
  const reduced = useReducedGameMotion();
  // Already popped this session: the button mounts at full (its art is in the memory cache).
  const [settled] = useState(poppedThisSession);
  const shown = useSharedValue(settled ? 1 : 0);
  const fade = useSharedValue(settled ? 1 : 0);
  useEffect(() => {
    if (!drawn || settled) return;
    poppedThisSession = true;
    shown.value = reduced ? 1 : withSpring(1, { stiffness: 320, damping: 18, mass: 0.8 });
    fade.value = reduced ? 1 : withTiming(1, { duration: 160 });
  }, [drawn, reduced, settled, shown, fade]);
  const pop = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: 0.7 + 0.3 * shown.value }] }));
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
