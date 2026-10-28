/**
 * The home map's Shelf button (core loop 5.7): your shark, labeled "Shelf", in the spot the avatar
 * stats menu used. It opens your shelf for the next park day's park, the same as the park map's
 * Shelf button. Tickets live in the header and the guide card, the flame on the Rewards button and
 * Energy on the coin card, so the stats menu folds away.
 */
import { useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Avatar from '../Avatar';
import Button from '../Button';
import { AuthContext } from '../../context/AuthProvider';
import * as RootNavigation from '../../RootNavigation';
import { BRAND } from '../../ui';

/** The park the home Shelf opens: the player's last park, else Disneyland. */
export const DEFAULT_SHELF_PARK = 8;

export function homeShelfPark(currentParkId: number | null | undefined): number {
  return typeof currentParkId === 'number' && currentParkId > 0 ? currentParkId : DEFAULT_SHELF_PARK;
}

export default function HomeShelfButton() {
  const { player } = useContext(AuthContext);
  if (!player) return null;
  const park = homeShelfPark(player.current_park_id);
  return (
    <View pointerEvents="box-none" style={styles.slot}>
      <Button accessibilityLabel="Shelf: your coins for your next park day"
        onPress={() => RootNavigation.navigate('Park', { park, player: player.id })}>
        <Avatar player={player} size="lg" />
      </Button>
      <View pointerEvents="none" style={styles.label}><Text style={styles.labelText}>Shelf</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', right: 16, bottom: 100, alignItems: 'center', zIndex: 20 },
  label: { position: 'absolute', bottom: -14, alignSelf: 'center', backgroundColor: BRAND.white, borderRadius: 9,
    borderWidth: 2, borderColor: BRAND.blueBright, paddingHorizontal: 8, paddingVertical: 1 },
  labelText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 13 },
});
