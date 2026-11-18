/**
 * The ride line (fix w3 T124, T137): a land badge (map picture plus the land's name) and one fan
 * note, on the coin card and, mounted by the win card's owner, under the won coin. Draws nothing
 * for a ride with no written note. Built from the kit: GameIcon, BRAND colors, the two house fonts.
 */
import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import { rideFact } from '../../services/collection/rideFacts';

export default memo(function RideFactLine({ rideName, parkId = null, style, onDark = false }: {
  readonly rideName: string | null | undefined;
  /** The coin's park, for sight names that only mean one place there ("Castle" at Disneyland). */
  readonly parkId?: number | null;
  readonly style?: StyleProp<ViewStyle>;
  /** On a blue panel: white note text. */
  readonly onDark?: boolean;
}) {
  const fact = rideFact(rideName, parkId);
  if (!fact) return null;
  return (
    <View style={[styles.wrap, style]} accessible accessibilityRole="text"
      accessibilityLabel={`${fact.land}. ${fact.note}`}>
      <View style={styles.badge}>
        <GameIcon name="map" size={16} />
        <Text style={styles.land} numberOfLines={1} maxFontSizeMultiplier={1.2}>{fact.land}</Text>
      </View>
      <Text style={[styles.note, onDark && { color: BRAND.white }]} numberOfLines={2} maxFontSizeMultiplier={1.25}>{fact.note}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.gold, borderColor: BRAND.navy,
    borderWidth: 2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 1 },
  land: { fontFamily: FONT.display, fontSize: 13, color: BRAND.navy, paddingTop: 2 },
  note: { fontFamily: FONT.body, fontSize: 14, lineHeight: 17, color: BRAND.navy, textAlign: 'center', paddingHorizontal: 8 },
});
