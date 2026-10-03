/**
 * The collection book's Events shelf (fright-nights CONTRACT 6): one Deep
 * Lantern tile per yearly card the player has earned anything on, visible all
 * season (not just during live phases). Nothing renders when the list is
 * empty or the endpoint is missing. Tapping a tile opens FrightCardScreen.
 * Data comes from SetCollection/eventCards.ts (same file as claude/release-rc).
 */
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import { getEventShelf, type EventShelf } from '../../screens/SetCollection/eventCards';
import { NIGHT } from '../../services/fright/theme';
import ArtImage from './ArtImage';

const LANTERN = require('./art/lantern.webp');

export default function FrightEventShelf() {
  const [shelf, setShelf] = useState<EventShelf>({ cards: [], lifetimeHaunts: 0 });
  useFocusEffect(useCallback(() => {
    let live = true;
    void getEventShelf().then(next => { if (live) setShelf(next); });
    return () => { live = false; };
  }, []));
  if (!shelf.cards.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>EVENTS</Text>
      {shelf.cards.map((card, index) => {
        const haunts = card.total > 0 ? `${card.done} of ${card.total} haunts` : `${card.done} ${card.done === 1 ? 'haunt' : 'haunts'}`;
        const lifetime = index === 0 && shelf.lifetimeHaunts > 0
          ? `${shelf.lifetimeHaunts} ${shelf.lifetimeHaunts === 1 ? 'haunt' : 'haunts'} all time` : null;
        return (
          <Pressable key={card.eventSlug} accessibilityRole="button"
            accessibilityLabel={`${card.cardTitle}. ${haunts}${lifetime ? `. ${lifetime}` : ''}. Open the Deep Lantern.`}
            onPress={() => RootNavigation.navigate('FrightCard', { eventSlug: card.eventSlug })}
            style={({ pressed }) => [styles.tile, card.tenInOne && styles.gold, pressed && { opacity: 0.88 }]}>
            <View style={styles.artWell}>
              <ArtImage uri={card.art} style={styles.art} fallback={<Image source={LANTERN} style={styles.art} contentFit="contain" />} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>DEEP LANTERN</Text>
              <Text style={styles.title} numberOfLines={1}>{card.cardTitle}</Text>
              <Text style={styles.meta} numberOfLines={1}>{[haunts, lifetime].filter(Boolean).join(' · ')}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${card.total > 0 ? Math.round((card.done / card.total) * 100) : 0}%` }]} />
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 },
  section: { fontFamily: 'Shark', fontSize: 17, color: '#05346e', marginBottom: 8, marginLeft: 4 },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 3, borderColor: NIGHT.fog,
    backgroundColor: NIGHT.midnight, padding: 12, marginBottom: 10 },
  gold: { borderColor: NIGHT.candy, borderWidth: 4 },
  artWell: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,179,71,0.2)', alignItems: 'center', justifyContent: 'center' },
  art: { width: 64, height: 64 },
  kicker: { fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1, color: NIGHT.lantern },
  title: { fontFamily: 'Shark', fontSize: 18, color: NIGHT.candy },
  meta: { fontFamily: 'Knockout', fontSize: 14, color: NIGHT.fogLight, marginTop: 2 },
  track: { height: 8, borderRadius: 4, backgroundColor: NIGHT.haunt, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', backgroundColor: NIGHT.lantern },
});
