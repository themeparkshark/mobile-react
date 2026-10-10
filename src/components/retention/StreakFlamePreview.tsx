import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../ui';
import StreakFlame from './StreakFlame';

/** Dev only (EXPO_PUBLIC_STREAK_FLAME_PREVIEW=1): the flame badge in the places it will be wired. */
export default function StreakFlamePreview() {
  return (
    <ScrollView style={{ backgroundColor: BRAND.blue }} contentContainerStyle={styles.page}>
      <Text style={styles.h}>Profile header</Text>
      <View style={styles.card}><Text style={styles.name}>ParkHopper</Text><StreakFlame streak={12} best={12} size={34} /></View>
      <Text style={styles.h}>Friend rows</Text>
      {[['towergal13', 9, 12], ['captaindax', 0, 6], ['toons', 0, 0], ['tpdude', 31, 31]].map(([n, s, b]) => (
        <View key={n as string} style={styles.row}><Text style={styles.rowName}>{n}</Text><StreakFlame streak={s as number} best={b as number} size={24} /></View>
      ))}
      <Text style={styles.h}>Standings row (subtle, still)</Text>
      <View style={styles.row}><Text style={styles.rowName}>#3 ParkHopper</Text><StreakFlame streak={12} size={18} still /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 70, gap: 10 },
  h: { fontFamily: 'Shark', fontSize: 16, color: BRAND.gold, marginTop: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, padding: 12 },
  name: { fontFamily: 'Shark', fontSize: 24, color: BRAND.white, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.white, borderRadius: 14, padding: 10 },
  rowName: { flex: 1, fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
});
