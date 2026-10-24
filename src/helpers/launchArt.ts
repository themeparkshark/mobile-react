import { Asset } from 'expo-asset';
import { Image } from 'expo-image';

/**
 * The art the map paints in its first frame: header and footer bars, the five footer icons,
 * the coin and ticket, the loading sky's shark and cloud, and the help, energy and wait-times buttons. The loading screen warms them (and the theme's own bar and coin art)
 * before it hands off, so the map never shows a frame of empty boxes. On a real install the
 * bundled files are local, so this finishes in a few milliseconds; it never waits past the cap.
 */
export const LAUNCH_ART: number[] = [
  require('../../assets/images/original-top-bar.png'),
  require('../../assets/images/original-bottom-bar.png'),
  require('../../assets/images/toolbar/news.png'),
  require('../../assets/images/toolbar/leaderboard.png'),
  require('../../assets/images/toolbar/explore.png'),
  require('../../assets/images/toolbar/social.png'),
  require('../../assets/images/toolbar/profile.png'),
  require('../../assets/images/coingold.png'),
  require('../../assets/images/ticket-icon.png'),
  // The map's loading sky and the first map buttons, so the cover and the HUD never show an empty white circle.
  require('../../assets/icons/game/shark.png'),
  require('../../assets/images/screens/explore/cloud.png'),
  require('../../assets/images/faq.png'),
  require('../../assets/images/energy.png'),
  require('../../assets/images/screens/explore/queuetimes.png'),
];

/** Warm the launch art, waiting at most `capMs`. Never throws. */
export async function warmLaunchArt(remote: readonly (string | null | undefined)[], capMs = 1500): Promise<void> {
  const urls = remote.filter((u): u is string => typeof u === 'string' && u.length > 0);
  const work = Promise.allSettled([
    Asset.loadAsync(LAUNCH_ART),
    urls.length ? Image.prefetch(urls, 'disk') : Promise.resolve(true),
  ]);
  await Promise.race([work, new Promise((done) => setTimeout(done, capMs))]);
}
