/**
 * Art for the fright map layer. Bundled pieces come from the art kit
 * (tps-prime-time-audit/next-wave/fright-nights/art/map-fx); everything else
 * is drawn in Skia as a placeholder until its sprite sheet lands.
 *
 * Dropping in a critter sheet: add `slug: require('./art/critter-<slug>.webp')`
 * to CRITTER_SHEETS. Sheet format: 4 columns x 3 rows of 64x64 frames, rows
 * idle, lurk, jump, feet at the bottom center of each frame. Shark critters
 * (`shark-*`) must use Alex's real shark composited by the art agent: the map
 * never draws a shark itself, so they show a pumpkin placeholder until then.
 * Haunt lanterns use `spot.art.icon` (server URL) when present.
 */

export const FRIGHT_ART = {
  fogFar: require('./art/fog-far.webp'),
  fogNear: require('./art/fog-near.webp'),
  groundMist: require('./art/ground-mist.webp'),
  bats: require('./art/bat-flap.webp'),
  eyes: require('./art/eyes-blink.webp'),
  moonClouds: require('./art/moon-clouds.webp'),
} as const;

/** Fog tiles are 512 px squares that repeat seamlessly. */
export const FOG_TILE = 512;
/** bat-flap.webp: 4 frames of 48 x 48 in a row. */
export const BAT_FRAME = 48;
export const BAT_FRAMES = 4;
/** eyes-blink.webp: 6 frames of 40 x 20 (open, open, half, shut, half, open). */
export const EYES_W = 40;
export const EYES_H = 20;
export const EYES_FRAMES = 6;
/** ground-mist.webp: 512 x 96 strip. moon-clouds.webp: two 160 x 64 clouds. */
export const MIST_W = 512;
export const MIST_H = 96;
export const CLOUDS_W = 320;
export const CLOUDS_H = 64;

export const CRITTER_FRAME = 64;
export const CRITTER_SHEETS: Readonly<Record<string, number>> = {};

export type CritterShape = 'fish' | 'round' | 'jelly' | 'crab' | 'octo' | 'eel' | 'pumpkin';

export interface CritterLook {
  readonly shape: CritterShape;
  readonly body: string;
  readonly belly: string;
  readonly accent: string;
}

/** Night palette (art/map-fx/night/night-tint.json). */
export const NIGHT = {
  ink: '#1E1838',
  midnight: '#2B2350',
  haunt: '#3B2A6B',
  dusk: '#5B3F9A',
  fog: '#B9A8E6',
  fogLight: '#E4DAFF',
  moon: '#FFF1B8',
  pumpkin: '#F28C28',
  pumpkinDark: '#B4561A',
  candy: '#FFC93C',
  lantern: '#FFB347',
  glow: '#9BFF4A',
} as const;

const LOOKS: Readonly<Record<string, CritterLook>> = {
  'barker-crab': { shape: 'crab', body: '#FF7F6B', belly: '#FFE2C8', accent: '#2BB3A8' },
  'juggler-octopus': { shape: 'octo', body: '#8E6BD8', belly: '#C8B4FF', accent: '#9BFF4A' },
  'little-minnow': { shape: 'eel', body: '#4FA88A', belly: '#C9F2C2', accent: '#FFC93C' },
  'windup-fish': { shape: 'fish', body: '#36B7B0', belly: '#C8F4EE', accent: '#FFC93C' },
  'ghost-jelly': { shape: 'jelly', body: '#D9CCFF', belly: '#FFFFFF', accent: '#B9A8E6' },
  'pumpkin-puffer': { shape: 'round', body: '#F28C28', belly: '#FFD08A', accent: '#4F8A3A' },
  'whoopee-blowfish': { shape: 'round', body: '#5FA8E8', belly: '#D2ECFF', accent: '#FF8FB8' },
  'balloon-jelly': { shape: 'jelly', body: '#FF9CC8', belly: '#FFE3F0', accent: '#FFFFFF' },
  chuckles: { shape: 'fish', body: '#2BB3A8', belly: '#E8FF8A', accent: '#D7F05A' },
  riptide: { shape: 'octo', body: '#2E9C9C', belly: '#FFB4A0', accent: '#FF7F6B' },
};

const FALLBACK: readonly CritterLook[] = [LOOKS['windup-fish'], LOOKS['ghost-jelly'], LOOKS['pumpkin-puffer'], LOOKS['barker-crab']];
const PUMPKIN: CritterLook = { shape: 'pumpkin', body: '#F28C28', belly: '#FFC93C', accent: '#4F8A3A' };

/** A critter family's placeholder look. Shark critters get a pumpkin until real art lands. */
export function critterLook(slug: string | null | undefined, index = 0): CritterLook {
  if (slug && slug.startsWith('shark-')) return PUMPKIN;
  if (slug && LOOKS[slug]) return LOOKS[slug];
  return FALLBACK[Math.abs(index) % FALLBACK.length];
}

/** The reef's critter roster: fx.critter can name one slug or a comma list. */
export function critterSlugs(value: string | null | undefined): string[] {
  return (value ?? '').split(',').map(s => s.trim()).filter(Boolean);
}
