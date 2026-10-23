/**
 * One way to write a count on screen, for every number a kid reads.
 *
 * The game's display font (Shark) draws a comma almost exactly like a period, so
 * "4,881" read as "4.881" (and next to "12.5K" that looks like a decimal). So:
 * - under 10,000 the digits stand alone: 4881, 1500, 350;
 * - from 10,000 the groups are split by a plain space: 12 500, 1 250 000.
 * VoiceOver labels can keep toLocaleString; this is only for drawn text.
 */
export default function countText(n: number): string {
  'worklet';
  const v = Math.round(Number(n) || 0);
  const s = String(Math.abs(v));
  if (s.length <= 4) return v < 0 ? `-${s}` : s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return v < 0 ? `-${out}` : out;
}
