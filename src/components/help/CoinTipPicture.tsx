import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { GameIcon } from '../../ui';

const RIDE_COIN = require('../../../assets/images/map/ride-coin.png');

/** "Tap PLAY RIDE!" with no reading: a Ticket, an arrow, the ride coin you win. */
export default function CoinTipPicture() {
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <GameIcon name="ticket" size={26} />
      <GameIcon name="arrow" size={18} />
      <Image source={RIDE_COIN} style={styles.coin} contentFit="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coin: { width: 28, height: 28 },
});
