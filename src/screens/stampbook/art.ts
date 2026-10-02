/**
 * Stamp art source. Stamps v2 art comes from the server asset store
 * (`icon_url`, uploaded by `php artisan stamps:import-art`) so the bundle and
 * the EAS OTA asset count never grow with the stamp list. The bundled stamps
 * are only a fallback for an older server or a stamp without art yet.
 */
import type { ImageSource } from 'expo-image';
import type { BookStamp } from './model';

const BUNDLED: Record<string, number> = {
  'stamp-01': require('../../../assets/images/stamps/stamp-01.png'),
  'stamp-02': require('../../../assets/images/stamps/stamp-02.png'),
  'stamp-03': require('../../../assets/images/stamps/stamp-03.png'),
  'stamp-04': require('../../../assets/images/stamps/stamp-04.png'),
  'stamp-05': require('../../../assets/images/stamps/stamp-05.png'),
  'stamp-06': require('../../../assets/images/stamps/stamp-06.png'),
  'stamp-07': require('../../../assets/images/stamps/stamp-07.png'),
  'stamp-08': require('../../../assets/images/stamps/stamp-08.png'),
  'stamp-09': require('../../../assets/images/stamps/stamp-09.png'),
  'first-ride-coin-v1': require('../../../assets/images/stamps/first-ride-coin-v1.png'),
  'ride-passport-complete-v1': require('../../../assets/images/stamps/ride-passport-complete-v1.png'),
};

/** One bundled stand-in per section, so a stamp without art still fits its page. */
const SECTION_FALLBACK: Record<string, string> = {
  parks: 'stamp-07',
  hunt: 'stamp-01',
  rides: 'first-ride-coin-v1',
  friends: 'stamp-08',
  streaks: 'stamp-06',
  milestones: 'stamp-04',
  special: 'stamp-05',
};

/** Dev-only preview: serve generated art from a local folder (simulator file:// paths). */
const PREVIEW_ART_BASE = __DEV__ ? process.env.EXPO_PUBLIC_STAMP_ART_BASE : undefined;

export function stampArt(stamp: Pick<BookStamp, 'iconUrl' | 'imageKey' | 'section' | 'slug'>): ImageSource | number {
  if (stamp.iconUrl) return { uri: stamp.iconUrl, cacheKey: stamp.iconUrl };
  if (PREVIEW_ART_BASE) return { uri: `${PREVIEW_ART_BASE}/${stamp.slug}.png` };
  if (stamp.imageKey && BUNDLED[stamp.imageKey]) return BUNDLED[stamp.imageKey];
  return BUNDLED[SECTION_FALLBACK[stamp.section] ?? 'stamp-01'];
}
