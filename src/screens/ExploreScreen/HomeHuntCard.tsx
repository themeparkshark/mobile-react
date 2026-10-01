import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import prepItemImage from '../../helpers/prepItemImages';
import type { HomeHuntTarget } from './homeHuntTarget';
import { BRAND, GameIcon } from '../../ui';
import { findActionLine, findDisplayName, isInPickupRange, setProgressLabel, ticketLine } from './homeFindCopy';

/**
 * The one find worth doing next, in plain words:
 *   CHURRO COLLECTION: 3/40 · NEW
 *   Snickerdoodle Churro
 *   75 m away · Walk closer to grab it
 *   2 more finds = free Ticket
 * Tapping it grabs the find in range, or shows it on the map.
 */
export default function HomeHuntCard({ target, onPress, findsUntilTicket, ticketsCapped = false, setProgress }: {
  readonly target: HomeHuntTarget;
  readonly onPress: () => void;
  readonly findsUntilTicket?: number;
  readonly ticketsCapped?: boolean;
  /** Collected/total for the find's set when known. */
  readonly setProgress?: { readonly collected: number; readonly total: number } | null;
}) {
  const item = target.item;
  const inRange = isInPickupRange(target.distanceMeters);
  const spare = target.kind === 'spare';
  const name = findDisplayName(item.name, item.set_name);
  const setLabel = setProgressLabel(item.set_name ?? 'Your collection', setProgress?.collected, setProgress?.total) ?? 'Your collection';
  const action = findActionLine(target.distanceMeters);
  const ticket = ticketLine(findsUntilTicket, ticketsCapped);
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`${name}. ${setLabel}. ${spare ? 'You have this one, a spare.' : 'New for your book.'} ${action}${ticket ? `. ${ticket}` : ''}`}
    accessibilityHint={inRange ? 'Grabs this find' : 'Shows this find on the map'}
    onPress={onPress} style={({ pressed }) => [styles.card, inRange && styles.cardInRange, pressed && styles.pressed]}>
    <View style={styles.art}>
      <Image source={prepItemImage(item.variant_slug) ||
        (item.icon_url ? { uri: item.icon_url } :
          require('../../../assets/images/screens/pin-collections/star.png'))}
        style={styles.image} contentFit="contain" />
    </View>
    <View style={styles.copy}>
      <View style={styles.kickerRow}>
        <Text style={styles.kicker} numberOfLines={1}>{setLabel.toUpperCase()}</Text>
        <View style={[styles.tag, spare && styles.tagSpare]}>
          <Text style={[styles.tagText, spare && styles.tagTextSpare]}>{spare ? 'SPARE' : 'NEW'}</Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      <Text style={[styles.action, inRange && styles.actionInRange]} numberOfLines={1}>{action}</Text>
      {ticket && <View style={styles.ticketRow}>
        <GameIcon name="ticket" size={14} />
        <Text style={styles.ticket} numberOfLines={1}>{ticket}</Text>
      </View>}
    </View>
    <View style={[styles.go, inRange && styles.goInRange]}>
      {inRange ? <Text style={styles.goText}>GRAB</Text> : <GameIcon name="map" size={22} />}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', minHeight: 84, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 18, borderWidth: 3, borderColor: BRAND.white, backgroundColor: BRAND.cream,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 6, elevation: 6 },
  cardInRange: { borderColor: BRAND.gold, backgroundColor: '#fff3c4' },
  pressed: { transform: [{ scale: 0.98 }] },
  art: { width: 56, height: 56, borderRadius: 14, backgroundColor: BRAND.sky, alignItems: 'center',
    justifyContent: 'center', marginRight: 10, borderWidth: 2, borderColor: BRAND.white },
  image: { width: 46, height: 46 },
  copy: { flex: 1, minWidth: 0 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { flexShrink: 1, color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.3 },
  tag: { backgroundColor: BRAND.gold, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  tagSpare: { backgroundColor: BRAND.sky },
  tagText: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 10 },
  tagTextSpare: { color: BRAND.navySoft },
  name: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 18, marginTop: 1 },
  action: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 13, marginTop: 1 },
  actionInRange: { color: BRAND.greenLip },
  ticketRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  ticket: { flexShrink: 1, color: BRAND.navy, fontFamily: 'Knockout', fontSize: 12 },
  go: { width: 44, height: 44, borderRadius: 22, marginLeft: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blueBright, borderWidth: 2, borderColor: BRAND.white },
  goInRange: { width: 58, borderRadius: 14, backgroundColor: BRAND.gold, borderColor: BRAND.goldLip },
  goText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 14 },
});
