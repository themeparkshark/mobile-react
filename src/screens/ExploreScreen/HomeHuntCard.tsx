import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import prepItemImage from '../../helpers/prepItemImages';
import type { HomeHuntTarget } from './homeHuntTarget';
import { HOME_PREP_PICKUP_RADIUS_METERS } from './homePickupRange';

export default function HomeHuntCard({ target, onPress, findsUntilTicket }: {
  readonly target: HomeHuntTarget;
  readonly onPress: () => void;
  readonly findsUntilTicket?: number;
}) {
  const distance = target.distanceMeters >= 1000
    ? `${(target.distanceMeters / 1000).toFixed(1)} km`
    : `${Math.round(target.distanceMeters)} m`;
  const nearby = target.distanceMeters <= HOME_PREP_PICKUP_RADIUS_METERS;
  const spare = target.kind === 'spare';
  const ticketFinds = findsUntilTicket == null ? null
    : Math.max(1, Math.min(3, Math.round(findsUntilTicket)));
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`${spare ? 'Find spare' : 'Find new'} ${target.item.name} for ${target.item.set_name ?? 'your collection'}, ${distance} away${ticketFinds == null ? '' : `. Park Ticket guaranteed within ${ticketFinds} ${ticketFinds === 1 ? 'find' : 'finds'}`}`}
    onPress={onPress} style={styles.card}>
    <Image source={prepItemImage(target.item.variant_slug) ||
      (target.item.icon_url ? { uri: target.item.icon_url } :
        require('../../../assets/images/screens/pin-collections/star.png'))}
      style={styles.image} contentFit="contain" />
    <View style={styles.copy}>
      <Text style={styles.kicker} numberOfLines={1}>✦  {spare ? 'SPARE FOR' : 'NEW FOR'} {target.item.set_name?.toUpperCase() ?? 'YOUR SET'}</Text>
      <Text style={styles.name} numberOfLines={1}>{target.item.name}</Text>
      <Text style={styles.action}>{distance} · {nearby ? spare ? 'COLLECT SPARE  →' : 'COLLECT NOW  →' : 'SHOW ON MAP  →'}</Text>
      {ticketFinds != null && <View style={styles.ticketRow}>
        <Image source={require('../../../assets/images/ticket-icon.png')}
          style={styles.ticketIcon} contentFit="contain" />
        <Text style={styles.ticket} numberOfLines={1}>TICKET WITHIN {ticketFinds} {ticketFinds === 1 ? 'FIND' : 'FINDS'}</Text>
      </View>}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { position: 'absolute', bottom: 207, alignSelf: 'center', zIndex: 10,
    flexDirection: 'row', alignItems: 'center', width: 235, minHeight: 66,
    paddingHorizontal: 8, borderRadius: 16, borderWidth: 3, borderColor: '#fff',
    backgroundColor: '#ffca30', shadowColor: '#003c7a', shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 4, elevation: 5 },
  image: { width: 46, height: 46, marginRight: 7 },
  copy: { flex: 1, minWidth: 0 },
  kicker: { color: '#07569e', fontFamily: 'Knockout', fontSize: 10, letterSpacing: 0.3 },
  name: { color: '#093d77', fontFamily: 'Shark', fontSize: 15, marginTop: 1 },
  action: { color: '#07569e', fontFamily: 'Knockout', fontSize: 11, marginTop: 2 },
  ticketRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ticketIcon: { width: 13, height: 13 },
  ticket: { color: '#07569e', fontFamily: 'Knockout', fontSize: 10 },
});
