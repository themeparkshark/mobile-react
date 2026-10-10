import { memo } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LiveEvent } from '../../api/endpoints/live-events';
import { chipState, goalWord } from '../../services/liveEvents/model';
import { BRAND } from '../../ui';
import { eventArt } from './eventArt';

/**
 * The event on the home map's small chip row (beside the free-Ticket pips and
 * the park story): the emblem and a tiny bar, or a red dot when a chest is ready.
 * Same 10 pt spacing and hit slop as the other home chips.
 */
function EventHomeChip({ event, onPress, now = Date.now() }: { readonly event: LiveEvent; readonly onPress: () => void; readonly now?: number }) {
  const art = eventArt(event.art_key);
  const s = chipState(event, now);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={styles.chip}
      accessibilityLabel={s.kind === 'open' ? `${event.title}: a chest is ready. Open.` : `${event.title}. Open event.`}>
      <Image source={s.kind === 'open' ? art.chestOpen : art.chestClosed} style={styles.emblem} contentFit="contain" />
      <Text style={styles.word}>{goalWord(event).replace(/^./, c => c.toUpperCase())}{s.kind === 'open' ? ': Open!' : ''}</Text>
      {s.kind === 'progress' && <View style={styles.bar}><View style={[styles.fill, { width: `${Math.max(6, s.fill * 100)}%` }]} /></View>}
      {s.kind === 'open' && <View style={styles.dot} />}
    </Pressable>
  );
}

export default memo(EventHomeChip);

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingLeft: 3, paddingRight: 8, borderRadius: 18,
    backgroundColor: BRAND.blue, borderWidth: 2.5, borderColor: BRAND.white,
    shadowColor: BRAND.shadow, shadowOpacity: 0.22, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  emblem: { width: 30, height: 30 },
  bar: { width: 34, height: 8, borderRadius: 4, backgroundColor: 'rgba(5,52,110,0.55)', borderWidth: 1.5, borderColor: BRAND.white, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: BRAND.gold },
  word: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: BRAND.red, borderWidth: 2, borderColor: BRAND.white },
});
