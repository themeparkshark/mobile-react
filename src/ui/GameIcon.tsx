/**
 * <GameIcon name="ticket" size={24} /> (WS0 UI kit)
 *
 * One icon set for the whole game, so no screen needs an emoji, a dingbat or a
 * bracket code. Every icon is hand-drawn PNG art: Alex's originals and the art
 * players already know are reused as they are, and the few icons that had no
 * original were drawn with GPT Image 2.5 from Alex's references (see
 * iconNames.ts and src/ui/README.md). Never swap in vector shapes or icon fonts.
 *
 * Icons are decorative by default (hidden from VoiceOver). Pass
 * accessibilityLabel when the icon carries meaning on its own. `mono` tints the
 * art to a single-colour silhouette (for example a white glyph on a button).
 */
import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { GAME_ICON_NAMES, isGameIconName, resolveIconName, type GameIconName } from './iconNames';

export const ICON_SOURCES: Record<GameIconName, number> = {
  // Currencies exactly as players see them today
  energy: require('../../assets/images/energy.png'),
  ticket: require('../../assets/images/ticket-icon.png'),
  swords: require('../../assets/images/sword-icon.png'),
  parts: require('../../assets/images/ride-parts.png'),
  coin: require('../../assets/images/icons/coin.png'),
  coins: require('../../assets/images/icons/coins.png'),
  // Alex's originals
  close: require('../../assets/images/icons/close.png'),
  check: require('../../assets/images/screens/notifications/mark_all_as_read.png'),
  back: require('../../assets/images/screens/explore/back.png'),
  bell: require('../../assets/images/screens/profile/notifications.png'),
  settings: require('../../assets/images/screens/profile/settings.png'),
  info: require('../../assets/images/faq.png'),
  edit: require('../../assets/images/screens/profile/edit.png'),
  lock: require('../../assets/images/locked.png'),
  star: require('../../assets/images/screens/pin-collections/star.png'),
  heart: require('../../assets/images/screens/player/compliment.png'),
  gift: require('../../assets/images/icons/gift.png'),
  chest: require('../../assets/images/screens/redeem/chest_closed.png'),
  chestOpen: require('../../assets/images/screens/redeem/chest_opened.png'),
  trophy: require('../../assets/images/screens/park/gold.png'),
  trophySilver: require('../../assets/images/screens/park/silver.png'),
  trophyBronze: require('../../assets/images/screens/park/bronze.png'),
  map: require('../../assets/images/icons/map.png'),
  xp: require('../../assets/images/screens/explore/xp.png'),
  shark: require('../../assets/images/icons/shark.png'),
  fin: require('../../assets/images/icons/fin.png'),
  search: require('../../assets/images/icons/search.png'),
  new: require('../../assets/images/icons/new.png'),
  member: require('../../assets/images/screens/profile/subscribed.png'),
  queue: require('../../assets/images/screens/explore/queuetimes.png'),
  // Drawn with GPT Image 2.5 from Alex's references (no original existed)
  crown: require('../../assets/images/icons/crown.png'),
  streak: require('../../assets/images/icons/streak.png'),
  timer: require('../../assets/images/icons/timer.png'),
  rush: require('../../assets/images/icons/rush.png'),
  wrench: require('../../assets/images/icons/wrench.png'),
  pin: require('../../assets/images/icons/pin.png'),
  medal1: require('../../assets/images/icons/medal1.png'),
  medal2: require('../../assets/images/icons/medal2.png'),
  medal3: require('../../assets/images/icons/medal3.png'),
  dice: require('../../assets/images/icons/dice.png'),
  sparkle: require('../../assets/images/icons/sparkle.png'),
  ride: require('../../assets/images/icons/ride.png'),
  camera: require('../../assets/images/icons/camera.png'),
  pause: require('../../assets/images/icons/pause.png'),
  play: require('../../assets/images/icons/play.png'),
  retry: require('../../assets/images/icons/retry.png'),
  arrow: require('../../assets/images/icons/arrow.png'),
};

export { GAME_ICON_NAMES, isGameIconName };
export type { GameIconName };

export type GameIconProps = {
  /** An icon name (or a legacy alias such as 'faq'). Unknown names render an empty box. */
  readonly name: GameIconName;
  readonly size?: number;
  /** Tint the art to one colour. */
  readonly mono?: string;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

function GameIcon({ name, size = 24, mono, accessibilityLabel, style, testID }: GameIconProps) {
  const a11y = accessibilityLabel
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
    : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };
  const resolved = resolveIconName(name);
  return <View {...a11y} testID={testID} pointerEvents="none" style={[{ width: size, height: size }, style]}>
    {resolved && <Image source={ICON_SOURCES[resolved]} contentFit="contain" tintColor={mono}
      cachePolicy="memory-disk" style={{ width: size, height: size }} />}
  </View>;
}

export default memo(GameIcon);
