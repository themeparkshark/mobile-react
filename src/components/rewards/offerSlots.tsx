/**
 * Two places a calm, grown-up-gated offer row may sit (fix round W3): under
 * the free ways on the NEED A TICKET card, and under the rewards on the first
 * win card. Lane shop builds the offer component; a later step mounts it here.
 * Until then both render nothing, so no card changes size. Rules for whatever
 * lands here: never on a loss card, never on a kid path, no urgency, and every
 * real-money step goes through the grown-up gate.
 */
import type { ReactElement } from 'react';

export interface OfferSlotProps {
  /** Where the row sits, for the offer's own rules and analytics. */
  readonly placement: 'need_ticket' | 'first_win';
  /** The coin the card is about (its task id), when there is one. */
  readonly taskId?: number | null;
  /** Close the card first when the row opens another screen. */
  readonly closeCard?: () => void;
}

/** Under the free ways on the NEED A TICKET card. Renders nothing until the offer is mounted. */
export function NeedTicketOfferSlot(_props: OfferSlotProps): ReactElement | null {
  return null;
}

/** Under the rewards on the first win card. Renders nothing until the offer is mounted. */
export function FirstWinOfferSlot(_props: OfferSlotProps): ReactElement | null {
  return null;
}
