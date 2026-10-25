import { Image } from 'expo-image';
import { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BRAND, GameIcon } from '../../ui';
import { TipArtLoaded } from './CoachTip';

const RIDE_COIN = require('../../../assets/images/map/ride-coin.png');

/** The picture's width: ticket, arrow and coin with their gaps (the card sizes itself from it). */
export const COIN_TIP_PICTURE_WIDTH = 36 + 30 + 40 + 2 * 4;
/** The pictures it draws (ticket, ride coin, sparkle): Finn's card waits for all of them before it shows. */
export const COIN_TIP_PICTURE_IMAGES = 3;

/**
 * "Tap PLAY RIDE!" with no reading: a big Ticket, a chunky gold arrow, then the ride coin you win
 * (with a sparkle), so a 7-year-old reads "ticket, then coin" at a glance. Static art only.
 */
export default function CoinTipPicture() {
  // Each picture tells the card it drew, so the card's first frame is the whole picture.
  const loaded = useContext(TipArtLoaded);
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <GameIcon name="ticket" size={36} onLoad={() => loaded('ticket')} />
      <GoldArrow />
      <View style={styles.coinWrap}>
        <Image source={RIDE_COIN} style={styles.coin} contentFit="contain" onLoad={() => loaded('coin')} onError={() => loaded('coin')} />
        <View style={styles.sparkle}><GameIcon name="sparkle" size={16} onLoad={() => loaded('sparkle')} /></View>
      </View>
    </View>
  );
}

/** The same dark ink as the game icons' outlines, so the arrow sits in their hand-drawn set. */
const ICON_INK = '#1f232b';
const GOLD_SHADE = '#f0a01e';

/** A thick drawn arrow in the game's gold with an ink outline and a shaded lower half (not a blue circle like the coin). */
function GoldArrow() {
  return (
    <Svg width={30} height={26} viewBox="0 0 30 26">
      <Path d="M3 9.5 H15 V3.5 L27 13 L15 22.5 V16.5 H3 Z" fill={BRAND.gold} />
      <Path d="M3 13 H27 L15 22.5 V16.5 H3 Z" fill={GOLD_SHADE} />
      <Path d="M3 9.5 H15 V3.5 L27 13 L15 22.5 V16.5 H3 Z" fill="none" stroke={ICON_INK} strokeWidth={2.4}
        strokeLinejoin="round" />
      <Path d="M5.5 11.3 H15.5" stroke={BRAND.white} strokeWidth={1.6} strokeLinecap="round" opacity={0.85} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coinWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  coin: { width: 38, height: 38 },
  sparkle: { position: 'absolute', top: -4, right: -5 },
});
