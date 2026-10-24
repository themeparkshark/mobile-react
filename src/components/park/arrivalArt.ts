/**
 * The park arrival's art (all existing assets) and a warm-up that decodes it
 * while the arrival waits its turn, so the moment's first visible frame never
 * waits on an image decode (round 1 showed a 500 ms frozen frame at mount).
 */
import { Image } from 'expo-image';
import { Image as NativeImage } from 'react-native';

export const ARRIVAL_ART = {
  ribbon: require('../../../assets/images/ribbon.png'),
  finn: require('../../assets/games/boss/shark_cheer.png'),
  goldCoin: require('../../../assets/images/coingold.png'),
  mapCoin: require('../../../assets/images/map/ride-coin.png'),
  boss: require('../../../assets/images/boss/kraken.png'),
  sparkle: require('../../../assets/images/map/fx/sparkle.png'),
  soft: require('../../../assets/images/reveal/soft-spot.webp'),
  rays: require('../../../assets/images/reveal/rays-gold-fade.webp'),
} as const;

/** Finn's hello poses (existing art): the cheer, the fist pump and the cap wave. */
export const FINN_ART = [
  ARRIVAL_ART.finn,
  require('../../assets/games/boss/shark_fist_pump.png'),
  require('../../assets/games/current-quest/cq_shark_cheer.png'),
] as const;

let warmed = false;

/** Decode every arrival image into memory once per app run (cheap, never throws). */
export function warmArrivalArt(): void {
  if (warmed) return;
  warmed = true;
  try {
    const uris = [...Object.values(ARRIVAL_ART), ...FINN_ART]
      .map(source => NativeImage.resolveAssetSource(source)?.uri)
      .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
    void Image.prefetch(uris, 'memory').catch(() => { warmed = false; });
  } catch {
    warmed = false;
  }
}
