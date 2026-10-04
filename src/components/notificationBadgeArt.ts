/**
 * Bell badge art, bundled, plus a warm-up so the first painted frame of the
 * bell already has its pictures (expo-image decodes bundled art async, which
 * showed one empty-disc frame on open).
 *
 * The first five are Alex's notification art (the same pictures the server
 * stores), cut off their square tiles, trimmed and centred with even padding
 * so every glyph sits dead centre in its circle. Prize and news reuse the
 * kit's gift and bell. The server image is never drawn: its tiles carried
 * their own off-centre backgrounds.
 */
import { Image } from 'expo-image';
import { Image as RNImage } from 'react-native';
import { ICON_SOURCES } from '../ui/GameIcon';
import type { NotificationKind } from '../screens/social/socialModel';

export const BADGE_ART: Readonly<Record<NotificationKind, number>> = {
  compliment: require('../../assets/images/screens/notifications/badges/compliment.png'),
  park_coins: require('../../assets/images/screens/notifications/badges/park_coins.png'),
  reply: require('../../assets/images/screens/notifications/badges/reply.png'),
  friend_request: require('../../assets/images/screens/notifications/badges/friend_request.png'),
  friend_accepted: require('../../assets/images/screens/notifications/badges/friend_accepted.png'),
  prize: ICON_SOURCES.gift,
  news: ICON_SOURCES.bell,
};

let warmed = false;

/** Decode the bell's art into memory once (badges, header icons, chip coin, arrow, Yes/No). Cheap: about 30 KB. */
export function warmBadgeArt(): void {
  if (warmed) return;
  warmed = true;
  const sources = [...Object.values(BADGE_ART), ICON_SOURCES.coin, ICON_SOURCES.arrow, ICON_SOURCES.timer, ICON_SOURCES.check, ICON_SOURCES.close];
  const uris = sources.map(source => RNImage.resolveAssetSource(source)?.uri).filter((uri): uri is string => !!uri);
  if (uris.length) Image.prefetch(uris, 'memory-disk').catch(() => { warmed = false; });
}
