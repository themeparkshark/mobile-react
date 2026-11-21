/**
 * Where the calm, grown-up-gated offer rows sit (fix round W3, T220 and T230; wired by the integrator):
 * - NEED A TICKET card, under the free ways: the Park Day Pack row (need_ticket). When the card follows a
 *   lost try (the loss card's way on at 0 Tickets), it is a loss moment and nothing shows.
 * - The win card: no offer at all (P20, Nov 20: no pack and no VIP line inside a win). Only the shelf gift bar.
 * Every rule lives in CalmOffer and services/money/naturalOffers.ts: the served natural_offers switch, never
 * on a loss card, never on a kid path (Family with kids, Picture games), once per placement per day, a
 * remembered "Not now", the grown-up gate before any price.
 */
import { type ReactElement } from 'react';
import { View } from 'react-native';
import CalmOffer from '../money/CalmOffer';
import ShelfGiftBar from '../tickets/ShelfGiftBar';
import { shelfGiftFor } from '../tickets/shelfGift';

export interface OfferSlotProps {
  /** Where the row sits, for the offer's own rules and analytics. */
  readonly placement: 'need_ticket' | 'first_win';
  /** The coin the card is about (its task id), when there is one. */
  readonly taskId?: number | null;
  /** Close the card first when the row opens another screen. */
  readonly closeCard?: () => void;
  /** The card follows a lost try: a loss moment, so no offer. */
  readonly loss?: boolean;
}

/** Under the free ways on the NEED A TICKET card. */
export function NeedTicketOfferSlot({ loss = false }: OfferSlotProps): ReactElement | null {
  // One slim row: the card is narrow, and the free ways stay the big thing on it.
  return <CalmOffer placement="need_ticket" loss={loss} compact style={{ marginTop: 10 }} />;
}

export interface WinOfferSlotProps {
  /** This is the first win card (the player's first coin ever). Kept for callers; a win never carries an offer. */
  readonly firstWin: boolean;
  /** This win's own Shark Coins and XP. Kept for callers; a win never carries an offer. */
  readonly coins: number;
  readonly xp: number;
  /** One key per win shown (the attempt id): the shelf gift bar's key. */
  readonly winKey: string | number | null;
  /** Kept for callers. */
  readonly closeCard?: () => void;
}

/**
 * Under the rewards on the win card: only the shelf gift bar ("10 of 40 · 1 more: +3 Tickets", T5).
 * P20 (bug 7): no Starter Pack and no VIP line inside a win, on any card (CalmOffer refuses both placements too).
 */
export function WinOfferSlot({ winKey }: WinOfferSlotProps): ReactElement | null {
  const gift = shelfGiftFor(winKey);
  if (!gift) return null;
  return (
    <View style={{ alignSelf: 'stretch', marginTop: 10 }}>
      <ShelfGiftBar gift={gift} flyKey={winKey} />
    </View>
  );
}
