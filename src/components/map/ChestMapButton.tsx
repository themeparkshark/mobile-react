import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, SHADOW } from '../../ui';

const CHEST = require('../../../assets/images/daily/chest-closed.png');

/**
 * The daily chest on the map, under the recenter button and in its style.
 * It is only on the map while today's chest is unclaimed, with a gold dot,
 * so "Back to map" never loses the day's reward.
 */
export default function ChestMapButton({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable onPress={() => { haptic('tapLight'); onPress(); }} accessibilityRole="button"
      accessibilityLabel="Daily chest, ready to open" hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Image source={CHEST} style={styles.chest} contentFit="contain" />
      <View style={styles.dot} accessibilityElementsHidden />
    </Pressable>
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
