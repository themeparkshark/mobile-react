import countText from './countText';

/**
 * Compact counts for tight UI: exact up to 9,999 (a player's 351 coins should
 * read 351, not 0.4K), then 12.4K, 3.2M and so on. Same rule as countText.
 */
export default function shortenNumber(number: number): string {
  return countText(number);
}
