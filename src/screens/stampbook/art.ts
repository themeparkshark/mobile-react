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
import { CLASSIC_ART } from './artClassic';

export const FALLBACK_ART = require('../../../assets/images/stamps/stamp-fallback.png');

/** Dev-only preview: serve generated art from a local folder (simulator file:// paths). */
const PREVIEW_ART_BASE = __DEV__ ? process.env.EXPO_PUBLIC_STAMP_ART_BASE : undefined;

export type ArtSize = 'thumb' | 'full';

type ArtFields = Pick<BookStamp, 'iconUrl' | 'thumbUrl' | 'lockedUrl' | 'lockedThumbUrl' | 'slug' | 'earned'> & { readonly imageKey?: string | null };


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
