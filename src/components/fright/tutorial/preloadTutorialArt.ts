/**
 * Warm the Fin-ister intro art before the first card mounts, so card 1 never
 * shows as an empty purple card while the hero decodes (panel ship #1, se-01).
 * Called when the mode turns on (FrightLayer), when the tutorial mounts and
 * before a replay opens. expo-image keys its memory cache by URI, so the card's
 * <Image source={HERO}> hits the decoded copy. Never throws.
 */
import { Image } from 'expo-image';
import { Image as RNImage } from 'react-native';

/** Card 1's hero (the first card shown), the shared card sky, and the cinematic lantern. */
export const TUTORIAL_HERO = require('../art/tutorial-hero.webp');
export const TUTORIAL_SKY = require('../art/card-sky.webp');
export const TUTORIAL_LANTERN = require('../art/lantern.webp');

const FIRST_ART = [TUTORIAL_HERO, TUTORIAL_SKY, TUTORIAL_LANTERN] as const;

let warmed: Promise<boolean> | null = null;

function uriOf(source: number): string | null {
  try {
    return RNImage.resolveAssetSource(source)?.uri ?? null;
  } catch {
    return null;
  }
}

/** Prefetch the intro art into memory once per session (retries after a failure). */
export function preloadFrightTutorialArt(): Promise<boolean> {
  if (warmed) return warmed;
  const uris = FIRST_ART.map(uriOf).filter((uri): uri is string => !!uri);
  if (!uris.length) return Promise.resolve(false);
  try {
    warmed = Image.prefetch(uris, 'memory-disk').then(ok => {
      if (!ok) warmed = null;
      return ok;
    }, () => {
      warmed = null;
      return false;
    });
  } catch {
    warmed = null;
    return Promise.resolve(false);
  }
  return warmed;
}

/** How long a card waits, invisible, for its art before it shows anyway (never stuck hidden). */
export const CARD_ART_WAIT_MS = 900;
