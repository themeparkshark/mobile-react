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
  coin: require('../../assets/icons/game/coin.png'),
  coins: require('../../assets/icons/game/coins.png'),
  // Alex's originals
  close: require('../../assets/icons/game/close.png'),
  check: require('../../assets/images/screens/notifications/mark_all_as_read.png'),
  back: require('../../assets/images/screens/explore/back.png'),
  bell: require('../../assets/images/screens/profile/notifications.png'),
  settings: require('../../assets/images/screens/profile/settings.png'),
  info: require('../../assets/images/faq.png'),
  edit: require('../../assets/images/screens/profile/edit.png'),
  lock: require('../../assets/images/locked.png'),
  star: require('../../assets/images/screens/pin-collections/star.png'),
  heart: require('../../assets/images/screens/player/compliment.png'),
  gift: require('../../assets/icons/game/gift.png'),
  chest: require('../../assets/images/screens/redeem/chest_closed.png'),
  chestOpen: require('../../assets/images/screens/redeem/chest_opened.png'),
  trophy: require('../../assets/images/screens/park/gold.png'),
  trophySilver: require('../../assets/images/screens/park/silver.png'),
  trophyBronze: require('../../assets/images/screens/park/bronze.png'),
  map: require('../../assets/icons/game/map.png'),
  xp: require('../../assets/images/screens/explore/xp.png'),
  shark: require('../../assets/icons/game/shark.png'),
  fin: require('../../assets/icons/game/fin.png'),
  search: require('../../assets/icons/game/search.png'),
  new: require('../../assets/icons/game/new.png'),
  member: require('../../assets/images/screens/profile/subscribed.png'),
  queue: require('../../assets/images/screens/explore/queuetimes.png'),
  // Drawn with GPT Image 2.5 from Alex's references (no original existed)
  crown: require('../../assets/icons/game/crown.png'),
  streak: require('../../assets/icons/game/streak.png'),
  timer: require('../../assets/icons/game/timer.png'),
  rush: require('../../assets/icons/game/rush.png'),
  wrench: require('../../assets/icons/game/wrench.png'),
  pin: require('../../assets/icons/game/pin.png'),
  medal1: require('../../assets/icons/game/medal1.png'),
  medal2: require('../../assets/icons/game/medal2.png'),
  medal3: require('../../assets/icons/game/medal3.png'),
  dice: require('../../assets/icons/game/dice.png'),
  sparkle: require('../../assets/icons/game/sparkle.png'),
  moon: require('../../assets/icons/game/moon.png'),
  ride: require('../../assets/icons/game/ride.png'),
  camera: require('../../assets/icons/game/camera.png'),
  pause: require('../../assets/icons/game/pause.png'),
  play: require('../../assets/icons/game/play.png'),
  retry: require('../../assets/icons/game/retry.png'),
  arrow: require('../../assets/icons/game/arrow.png'),
  swap: require('../../assets/icons/game/swap.png'),
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
