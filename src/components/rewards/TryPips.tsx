/**
 * How far a ride try got, as a picture (fix round W3, T053): one gold pip per
 * bonk, pair or right answer the coin needed, the ones got filled. A kid who
 * cannot read "8 of 13 bonks" sees the row almost full. Up to 13 pips fit one
 * row on an iPhone SE; a longer goal draws as one bar with the same fill.
 * Static drawing, BRAND colors only, nothing animates.
 */
import { StyleSheet, View } from 'react-native';
import { BRAND } from '../../ui/tokens';
import { pipFill } from './tryPipsModel';

export default function TryPips({ have, need }: { readonly have: number; readonly need: number }) {
  const fill = pipFill(have, need);
  if (!fill) return null;
  if (fill.bar) {
    return (
      <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.fill, { width: `${Math.round(fill.share * 100)}%` }]} />
      </View>
    );
  }
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: fill.need }, (_, i) => (
        <View key={i} style={[styles.pip, fill.need > 8 && styles.pipSmall, i < fill.have ? styles.on : styles.off]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'center', gap: 4, marginBottom: 10 },
  pip: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: BRAND.navy },
  pipSmall: { width: 14, height: 14, borderRadius: 7 },
  on: { backgroundColor: BRAND.gold },
  off: { backgroundColor: BRAND.sky, opacity: 0.6 },
  track: { alignSelf: 'stretch', height: 14, borderRadius: 8, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.navy,
    overflow: 'hidden', marginBottom: 10 },
  fill: { height: '100%', backgroundColor: BRAND.gold },
});
