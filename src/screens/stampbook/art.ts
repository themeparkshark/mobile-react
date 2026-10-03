/**
 * Stamp art source. Art comes from the server asset store (uploaded by
 * `php artisan stamps:import-art`) in four variants: 768 px for the big card,
 * 256 px thumbs for tiles, and a navy "ghost" of each for locked stamps. The
 * bundle and the EAS OTA asset count never grow with the stamp list.
 *
 * One small bundled passport is the last-resort fallback, so a missing or
 * failed image never leaves a hole (see `<StampArt>`).
 */
import type { ImageSource } from 'expo-image';
import type { BookStamp } from './model';

export const FALLBACK_ART = require('../../../assets/images/stamps/stamp-fallback.png');

/** Dev-only preview: serve generated art from a local folder (simulator file:// paths). */
const PREVIEW_ART_BASE = __DEV__ ? process.env.EXPO_PUBLIC_STAMP_ART_BASE : undefined;

export type ArtSize = 'thumb' | 'full';

type ArtFields = Pick<BookStamp, 'iconUrl' | 'thumbUrl' | 'lockedUrl' | 'lockedThumbUrl' | 'slug' | 'earned'> & { readonly imageKey?: string | null };

/**
 * Preview build: the production API sends no art URLs yet, only the classic
 * image_key. These are the bundled classic stamps for those keys.
 */
const CLASSIC_ART: Readonly<Record<string, number>> = {
  'stamp-01': require('../../../assets/images/stamps/stamp-01.png'),
  'stamp-02': require('../../../assets/images/stamps/stamp-02.png'),
  'stamp-03': require('../../../assets/images/stamps/stamp-03.png'),
  'stamp-04': require('../../../assets/images/stamps/stamp-04.png'),
  'stamp-05': require('../../../assets/images/stamps/stamp-05.png'),
  'stamp-06': require('../../../assets/images/stamps/stamp-06.png'),
  'stamp-07': require('../../../assets/images/stamps/stamp-07.png'),
  'stamp-08': require('../../../assets/images/stamps/stamp-08.png'),
  'stamp-09': require('../../../assets/images/stamps/stamp-09.png'),
  'ride-passport-complete-v1': require('../../../assets/images/stamps/ride-passport-complete-v1.png'),
  'first-ride-coin-v1': require('../../../assets/images/stamps/first-ride-coin-v1.png'),
};

/**
 * The art to show. Locked stamps use the ghost when the server has one; with no
 * ghost, the screen dims the full-colour art instead (`ghostIsReal` false).
 */
export function stampArt(stamp: ArtFields, size: ArtSize, locked = !stamp.earned): { source: ImageSource | number; ghostIsReal: boolean } {
  if (locked) {
    const ghost = size === 'thumb' ? stamp.lockedThumbUrl : stamp.lockedUrl;
    if (ghost) return { source: { uri: ghost, cacheKey: ghost }, ghostIsReal: true };
    if (PREVIEW_ART_BASE) return { source: { uri: `${PREVIEW_ART_BASE}/${stamp.slug}@${size === 'thumb' ? 'ghost-thumb' : 'ghost'}.png` }, ghostIsReal: true };
  }
  const url = size === 'thumb' ? stamp.thumbUrl : stamp.iconUrl;
  if (url) return { source: { uri: url, cacheKey: url }, ghostIsReal: false };
  if (PREVIEW_ART_BASE) return { source: { uri: `${PREVIEW_ART_BASE}/${stamp.slug}${size === 'thumb' ? '@thumb' : ''}.png` }, ghostIsReal: false };
  const classic = stamp.imageKey ? CLASSIC_ART[stamp.imageKey] : undefined;
  if (classic) return { source: classic, ghostIsReal: false };
  return { source: FALLBACK_ART, ghostIsReal: false };
}

/** Thumbs worth prefetching after the book loads (disk cache, no decode). */
export function prefetchList(stamps: readonly ArtFields[]): string[] {
  const urls = stamps.map(s => (s.earned ? s.thumbUrl : s.lockedThumbUrl ?? s.thumbUrl)).filter((u): u is string => !!u);
  return Array.from(new Set(urls));
}
