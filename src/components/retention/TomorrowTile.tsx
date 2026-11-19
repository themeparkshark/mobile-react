import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import type { TomorrowChest } from '../../services/retention/chestDay';
import { BRAND, GameIcon } from '../../ui';

const DAILY_CHEST = require('../../../assets/images/daily/chest-closed.png');

/**
 * Tomorrow's daily chest, pictured (fix pass w4, T103 and N13): the moon over the closed chest, "Day 2 chest:
 * Thursday" and that day's prize from the 7-day ladder. Shown wherever today is done, so a kid sees what tomorrow
 * brings with zero reading. A day in words, never a clock.
 */
export default function TomorrowTile({ chest, tone = 'blue' }: { readonly chest: TomorrowChest; readonly tone?: 'blue' | 'navy' }) {
  return (
    <View style={[styles.tile, tone === 'navy' && styles.tileNavy]} accessible accessibilityLabel={`Tomorrow: ${chest.line}`}>
      <View style={styles.art}>
        <Image source={DAILY_CHEST} style={styles.chest} contentFit="contain" />
        <View style={styles.moon}><GameIcon name="moon" size={24} /></View>
      </View>
      <Text style={styles.line} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{chest.line}</Text>
      {chest.prize && (
        <View style={styles.prize}>
          <GameIcon name={chest.prize.kind} size={20} />
          <Text style={styles.prizeText}>{chest.prize.amount}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  tileNavy: { backgroundColor: BRAND.navy },
  art: { width: 50, height: 44, justifyContent: 'flex-end' },
  chest: { width: 44, height: 40 },
  moon: { position: 'absolute', top: -6, right: -2 },
  line: { flex: 1, fontFamily: 'Shark', fontSize: 17, color: BRAND.white },
  prize: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.navy, borderRadius: 10, paddingHorizontal: 7,
    paddingVertical: 3, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  prizeText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white, marginTop: 1 },
});
