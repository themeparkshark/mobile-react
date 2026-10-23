/**
 * One way to write a count on screen, for every number a kid reads.
 *
 * The game's display font (Shark) draws a comma almost exactly like a period, so
 * "4,881" read as "4.881", and a space-grouped "12 500" reads as two numbers. So:
 * - under 10,000 the digits stand alone: 4881, 1500, 350;
 * - from 10,000 it is the same short form the header pills use: 12.5K, 250K, 1.2M.
 * It rounds down, so it never shows more than you really have.
 * VoiceOver labels keep toLocaleString; this is only for drawn text.
 */
export default function countText(n: number): string {
  'worklet';
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs < 10000) return `${sign}${abs}`;
  let size = 1e3;
  let suffix = 'K';
  if (abs >= 1e12) { size = 1e12; suffix = 'T'; }
  else if (abs >= 1e9) { size = 1e9; suffix = 'B'; }
  else if (abs >= 1e6) { size = 1e6; suffix = 'M'; }
  const value = abs / size;
  const shown = value >= 100 ? String(Math.floor(value)) : String(Math.floor(value * 10) / 10);
  return `${sign}${shown}${suffix}`;
}
