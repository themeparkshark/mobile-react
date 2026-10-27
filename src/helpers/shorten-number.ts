import countText from './countText';

/**
 * Compact counts for tight UI: exact up to 9,999 (a player's 351 coins should
 * read 351, not 0.4K), then 12.4K, 3.2M and so on. The header pills are narrow, so they
 * switch to the short form at 10,000; everything else waits until 100,000 (countText).
 */
export default function shortenNumber(number: number): string {
  return countText(number, 10000);
}
