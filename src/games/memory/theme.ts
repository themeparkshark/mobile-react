/**
 * Memory Match palette and timings (design v4, 6.x). Bright world only.
 * Coral means one thing: you slipped. Urgency is sunny orange with a white stroke.
 */
export const MM = {
  gold: '#fec90e',
  goldDeep: '#d99a00',
  cream: '#fff8e4',
  creamWarm: '#FFF4D6',
  coral: '#ff6b5c',
  urgent: '#FF8A00',
  blue: '#2E9BFF',
  scout: '#1f8fff',
  ink: '#0B5CAD',
  navyText: '#05346e',
  felt: '#0a7fd6',
  feltDeep: '#0768b9',
  well: '#0768b9',
  wood: '#c9803f',
  woodDark: '#8a4b1c',
  woodLight: '#e6a764',
  white: '#ffffff',
} as const;

/** Flip lengths (ms). Showtime flips are 25% faster. */
export const FLIP_MS = 220;
export const FLIP_SHOWTIME_MS = 165;
export const DEAL_STAGGER_MS = 38;

/** Pair hit-stop by chain tier (Hades): 50/70/90, Showtime 110. */
export function hitStopFor(chain: number, showtime: boolean): number {
  if (showtime) return 110;
  if (chain >= 4) return 90;
  if (chain >= 3) return 70;
  return 50;
}

/** Stars particles per match tier (6.4). */
export function starsFor(chain: number, showtime: boolean): number {
  if (showtime) return 24;
  if (chain >= 3) return 16;
  if (chain === 2) return 12;
  return 8;
}

/** G major ladder step for a chain (0..7), stays on G' past chain 8. */
export function ladderStep(chain: number): number {
  return Math.max(0, Math.min(7, chain - 1));
}
