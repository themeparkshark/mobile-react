/**
 * The night show's slot under the team bar (only when no Rush, raid or boss
 * moment needs it): a gentle "Fireworks tonight at 9:30 PM" in the hour
 * before, then "Fireworks now!" with a button that swings the map to the
 * launch area. Times are the park's own, whatever the phone's time zone.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND, GameIcon } from '../../../ui';
import { liveText, teaserText, type NightShow, type ShowPhase } from './nightShow';

export default function NightShowPill({ show, phase, onSee }: {
  readonly show: NightShow;
  readonly phase: ShowPhase;
  readonly onSee: () => void;
}) {
  if (phase !== 'teaser' && phase !== 'live') return null;
  const live = phase === 'live';
  const text = live ? liveText(show) : teaserText(show);
  return (
    <Pressable accessibilityRole="button" onPress={onSee} style={styles.shadow}
      accessibilityLabel={`${text}. Show it on the map.`}>
      <LinearGradient colors={live ? ['#3a2b8f', '#1b2f7a'] : ['#24407f', '#16306b']} style={styles.pill}>
        <View style={[styles.star, live && styles.starLive]}><GameIcon name="sparkle" size={18} /></View>
        <Text style={[styles.title, live && styles.titleLive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{text}</Text>
        <Text style={styles.go}>{live ? 'SEE' : 'WHERE'}</Text>
        <GameIcon name="arrow" size={16} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: { marginHorizontal: 12, marginTop: 8, borderRadius: 16, shadowColor: BRAND.shadow, shadowOpacity: 0.25,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 3, borderColor: BRAND.white,
    paddingVertical: 5, paddingLeft: 6, paddingRight: 10, minHeight: 44 },
  star: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  starLive: { backgroundColor: 'rgba(255,207,59,0.3)' },
  title: { flex: 1, fontFamily: 'Shark', fontSize: 14, color: '#e4f0ff' },
  titleLive: { color: BRAND.gold },
  go: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
});
