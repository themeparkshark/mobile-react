/**
 * Bundled art for the fright map layer, from the art kit
 * (tps-prime-time-audit/next-wave/fright-nights/art/map-fx): fog, mist, bats,
 * eyes and moon clouds draw before (or without) the server catalog. Every
 * character (the reef scareactors and the encounter) is server-hosted
 * (`assets.scareactors`); the old sea critters are deprecated and never drawn.
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
