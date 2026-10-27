/**
 * One way to write a count on screen, for every number a kid reads.
 *
 * The game's display font (Shark) draws a comma almost exactly like a period, so
 * "4,881" read as "4.881", and a space-grouped "12 500" reads as two numbers. So:
 * - under 100,000 the digits stand alone: 4881, 12590, 350. A price of 12590 never
 *   reads "12.5K" next to a wallet of 12540, and two leaders at 12540 and 12510 stay apart;
 * - from 100,000 it is the short form: 125K, 1.2M (rounds down).
 * The header pills are tighter, so they switch to the short form at 10,000 (shortenNumber).
 * VoiceOver labels keep toLocaleString; this is only for drawn text.
 */
/** Where drawn counts switch to the short form. */
export const SHORT_FROM = 100000;

export default function countText(n: number, shortFrom: number = SHORT_FROM): string {
  'worklet';
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs < shortFrom) return `${sign}${abs}`;
  let size = 1e3;
  let suffix = 'K';
  if (abs >= 1e12) { size = 1e12; suffix = 'T'; }
  else if (abs >= 1e9) { size = 1e9; suffix = 'B'; }
  else if (abs >= 1e6) { size = 1e6; suffix = 'M'; }
  const value = abs / size;
  const shown = value >= 100 ? String(Math.floor(value)) : String(Math.floor(value * 10) / 10);
  return `${sign}${shown}${suffix}`;
}
