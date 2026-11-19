/**
 * Money copy, pure (tools/tests/money-offers.test.cjs): unit words and the top-up headline.
 */
import type { ShopCurrency, ShopGrants } from '../../api/endpoints/me/shop';
import countText from '../../helpers/countText';

const CURRENCY_WORD: Record<keyof ShopGrants, [string, string]> = {
  tickets: ['Ticket', 'Tickets'], coins: ['Shark Coin', 'Shark Coins'], energy: ['Energy', 'Energy'], rescue_passes: ['extra try', 'extra tries'], // one word per thing (4.5): held passes are extra tries (T218 sibling)
};

export function unitWord(kind: keyof ShopGrants, n: number): string {
  return n === 1 ? CURRENCY_WORD[kind][0] : CURRENCY_WORD[kind][1];
}

export type TopUpReason = 'gear' | 'mystery-box' | 'ride' | 'level-up' | 'raid' | (string & {});
export type TopUpCurrency = Extract<ShopCurrency, 'coins' | 'tickets' | 'energy'>;

/** The headline: what is missing, in the player's words. Exported for tests. */
export function topUpHeadline(need: number, kind: TopUpCurrency, reason: TopUpReason): string {
  const n = Math.max(1, Math.ceil(need));
  const amount = `${countText(n)} more ${unitWord(kind, n)}`;
  if (kind === 'tickets' && reason === 'ride') return n === 1 ? 'Out of Tickets?' : `Need ${amount}?`;
  switch (reason) {
    case 'gear': return `Need ${amount} for this?`;
    case 'mystery-box': return `Need ${amount} for this box?`;
    case 'level-up': return `Need ${amount} to level up?`;
    case 'raid': return `Need ${amount} to attack?`;
    default: return `Need ${amount}?`;
  }
}

