/**
 * Compact counts for tight UI: exact up to 9,999 (a player's 351 coins should
 * read 351, not 0.4K), then 12.4K, 3.2M and so on.
 */
export default function shortenNumber(number: number): string {
  const n = Math.round(Number(number) || 0);
  const abs = Math.abs(n);
  if (abs < 10_000) return n.toLocaleString('en-US');
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const value = n / size;
      const shown = Math.abs(value) >= 100 ? Math.floor(value).toString() : (Math.floor(value * 10) / 10).toString();
      return `${shown}${suffix}`;
    }
  }
  return String(n);
}
