/**
 * The Fin-ister Nights night palette (art/map-fx/night/night-tint.json). Only
 * fright surfaces use it (the pill, sheet, cards and the fright Line Play
 * chapter); everything else stays on the bright house palette. Never pure black.
 */
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
  /** Map overlay fallback tint. */
  overlay: 'rgba(30,24,70,0.46)',
  /** Scrim behind night sheets (navy-violet, never black). */
  scrim: 'rgba(30,24,70,0.55)',
  white: '#ffffff',
} as const;
