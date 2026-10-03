/**
 * Profile chip (CONTRACT 5): shown only when GET /fright/cards is non-empty
 * for the profile's player. Latest card art (or a lantern glyph) plus
 * "{haunts_done} haunts". Tap opens the read-only Deep Lantern.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getFrightCards, type FrightCardSummary } from '../../api/endpoints/fright';
import * as RootNavigation from '../../RootNavigation';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon } from '../../ui';

export default function FrightCardChip({ playerId, cards: given }: {
  /** The profile's player (omit for the signed-in player). */
  readonly playerId?: number | null;
  /** Pass already-fetched cards to skip the request. */
  readonly cards?: readonly FrightCardSummary[] | null;
}) {
  const [cards, setCards] = useState<readonly FrightCardSummary[] | null>(given ?? null);
  useEffect(() => {
    if (given) { setCards(given); return; }
    let current = true;
    void getFrightCards(playerId).then(result => { if (current) setCards(result?.cards ?? []); });
    return () => { current = false; };
  }, [playerId, given]);
  const latest = cards?.slice().sort((a, b) => b.year - a.year || (b.last_night_on ?? '').localeCompare(a.last_night_on ?? ''))[0];
  if (!latest) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${latest.card_title}. ${latest.haunts_done} haunts. Open the card.`}
      onPress={() => RootNavigation.navigate('FrightCard', { eventSlug: latest.event_slug, playerId: playerId ?? undefined })}
      style={({ pressed }) => [styles.chip, latest.ten_in_one && styles.gold, pressed && { opacity: 0.85 }]}>
      <View style={styles.icon}>
        {latest.art.chip ? <Image source={{ uri: latest.art.chip }} style={{ width: 24, height: 24 }} contentFit="contain" />
          : <GameIcon name="sparkle" size={20} />}
      </View>
      <Text style={styles.text}>{`${latest.haunts_done} haunt${latest.haunts_done === 1 ? '' : 's'}`}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, borderRadius: 18,
    backgroundColor: NIGHT.haunt, borderWidth: 2, borderColor: NIGHT.fog, paddingLeft: 4, paddingRight: 12 },
  gold: { borderColor: NIGHT.candy },
  icon: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,179,71,0.3)', alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: 'Shark', fontSize: 14, color: NIGHT.candy },
});
