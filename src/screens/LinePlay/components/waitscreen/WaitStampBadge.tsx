/**
 * A small mark on the wait screen coin for how it was earned: MARATHON (60+
 * minutes in line) or NIGHT (after 8 PM). Code-drawn in the house style, a
 * navy-inked gold tab with a tiny glyph, so it needs no new art. Display only:
 * a mark on the existing coin, not an item.
 */
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GameIcon } from '../../../../ui';
import { BRAND } from '../../../../ui/tokens';
import type { WaitStamp } from '../../../../services/lineplay/waitScreen';

function Moon() {
  return (
    <View style={styles.moon}>
      <View style={styles.moonCut} />
    </View>
  );
}

function WaitStampBadge({ stamp }: { stamp: WaitStamp }) {
  const night = stamp.kind === 'night';
  return (
    <View style={[styles.badge, night && styles.badgeNight]} accessible
      accessibilityLabel={night ? 'Night wait mark' : 'Marathon wait mark, an hour or more in line'}>
      {night ? <Moon /> : <GameIcon name="timer" size={10} />}
      <Text style={[styles.text, night && styles.textNight]}>{stamp.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 0,
    borderRadius: 6, backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy, transform: [{ rotate: '-8deg' }] },
  badgeNight: { backgroundColor: '#1f5fbf' },
  text: { fontFamily: 'Knockout', fontSize: 9, color: BRAND.navy, letterSpacing: 0.4 },
  textNight: { color: '#fff4d6' },
  moon: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#fff4d6', overflow: 'hidden' },
  moonCut: { position: 'absolute', width: 8, height: 8, borderRadius: 4, left: 3, top: -2, backgroundColor: '#1f5fbf' },
});

export default memo(WaitStampBadge);
