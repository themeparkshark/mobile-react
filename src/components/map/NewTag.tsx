/**
 * The small NEW tag a map surface wears the first app open after its rung unlocks (core loop 4.4:
 * at most one NEW per app open; the ladder's pickNewTag chooses which). White pill, gold border,
 * navy word, the house style. It clears when the player taps the surface (markSeen).
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BRAND } from '../../ui';

export default function NewTag({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" testID="map-new-tag" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.tag, style]}>
    <Text style={styles.text}>NEW</Text>
  </View>;
}

const styles = StyleSheet.create({
  tag: { position: 'absolute', backgroundColor: BRAND.white, borderRadius: 8, borderWidth: 2, borderColor: BRAND.gold,
    paddingHorizontal: 4, paddingVertical: 0, zIndex: 3 },
  text: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 10, letterSpacing: 0.4 },
});
