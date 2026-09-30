import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlayerStatsType } from '../../models/player-stats-type';
import { GameIcon, GameRichText } from '../../ui';

type FocusedSet = NonNullable<PlayerStatsType['focused_prep_set']>;

export default function HomeFocusCard({ set, onPress, topOffset = 55 }: {
  readonly set: FocusedSet;
  readonly onPress: () => void;
  readonly topOffset?: number;
}) {
  const waiting = !set.available_now;
  const reason = set.theme === 'night' ? 'BACK AFTER SUNSET'
    : set.theme === 'weather' ? 'BACK WHEN IT RAINS' : 'RETURNS SOON';
  const hasProgress = Number.isFinite(set.collected_count) && Number.isFinite(set.total_items)
    && (set.total_items ?? 0) > 0;
  const collected = Math.max(0, Math.min(set.collected_count ?? 0, set.total_items ?? 0));
  const progress = hasProgress ? `${collected}/${set.total_items}` : null;
  const kicker = waiting
    ? progress ? `${progress} · ${set.theme === 'night' ? 'AFTER SUNSET' : set.theme === 'weather' ? 'WAIT FOR RAIN' : 'RETURNS SOON'}` : reason
    : progress ? `FOCUSED · ${progress} FOUND` : '[icon:sparkle] FOCUSED HUNT';
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`Focused collection: ${set.name}. ${progress ? `${collected} of ${set.total_items} found. ` : ''}${waiting ? reason : 'New finds favor this set'}. Open collection.`}
    onPress={onPress} style={[styles.card, { top: topOffset }]}>
    <Image source={require('../../../assets/images/screens/profile/pin_collections.png')}
      style={styles.icon} contentFit="contain" />
    <View style={styles.copy}>
      <GameRichText style={styles.kicker} iconSize={11} numberOfLines={1}>{kicker}</GameRichText>
      <Text style={styles.name} numberOfLines={1}>{set.name}</Text>
    </View>
    <GameIcon name="arrow" size={18} style={styles.arrow} />
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 14, zIndex: 19,
    flexDirection: 'row', alignItems: 'center', width: '43%', minHeight: 48,
    paddingHorizontal: 7, borderRadius: 14, borderWidth: 2, borderColor: '#fff',
    backgroundColor: '#0879ca', shadowColor: '#003c7a', shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 4, elevation: 5 },
  icon: { width: 30, height: 30, marginRight: 5 },
  copy: { flex: 1, minWidth: 0 },
  kicker: { color: '#ffdb61', fontFamily: 'Knockout', fontSize: 9, letterSpacing: 0.5 },
  name: { color: '#fff', fontFamily: 'Shark', fontSize: 13, marginTop: 1 },
  arrow: { marginLeft: 2 },
});
