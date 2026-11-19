/**
 * Where the calm, grown-up-gated offer rows sit (fix round W3, T220 and T230; wired by the integrator):
 * - NEED A TICKET card, under the free ways: the Park Day Pack row (need_ticket). When the card follows a
 *   lost try (the loss card's way on at 0 Tickets), it is a loss moment and nothing shows.
 * - The win card, under the rewards: on the first win card the Starter Pack card (first_win, once ever);
 *   otherwise, and only when the Starter card did not show, one calm VIP line (win_vip) with this win's
 *   own numbers. One offer at most per card.
 * Every rule lives in CalmOffer and services/money/naturalOffers.ts: the served natural_offers switch, never
 * on a loss card, never on a kid path (Family with kids, Picture games), once per placement per day, a
 * remembered "Not now", the grown-up gate before any price. The VIP line also keeps the win-card pacing
 * of services/money/vipNudge.ts (never on the first 3 wins on this phone, at most once every 3 days).
 */
import { useContext, useEffect, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import CalmOffer from '../money/CalmOffer';
import { AuthContext } from '../../context/AuthProvider';
import { vipWinOffer } from '../../services/money/offers';
import { markVipNudgeShown, useVipNudge } from '../../services/money/vipNudge';
import { vipRideMultiplierNow, warmVipPerks } from '../../services/money/vipPerks';

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
  return <CalmOffer placement="need_ticket" loss={loss} style={{ marginTop: 10 }} />;
}

export interface WinOfferSlotProps {
  /** This is the first win card (the player's first coin ever): the Starter Pack card may show. */
  readonly firstWin: boolean;
  /** This win's own Shark Coins and XP (the VIP line says what VIP would add, from these). */
  readonly coins: number;
  readonly xp: number;
  /** One key per win shown (the attempt id), so each win counts once for the VIP line's pacing. */
  readonly winKey: string | number | null;
  /** Close the win card before VIP opens (the card sits in a native sheet). */
  readonly closeCard?: () => void;
}

/** The one VIP line's words for this win, or null (VIP, nothing to double, or no multiplier from the server). */
export function winVipLine(input: { coins: number; xp: number; multiplier: number | null; isVip: boolean }): string | null {
  return vipWinOffer({ coins: input.coins, xp: input.xp, multiplier: input.multiplier, isVip: input.isVip })?.line ?? null;
}

/** Under the rewards on the win card: the Starter Pack card on the first win, else at most one VIP line. */
export function WinOfferSlot({ firstWin, coins, xp, winKey, closeCard }: WinOfferSlotProps): ReactElement | null {
  const { player } = useContext(AuthContext);
  const isVip = !!player?.is_subscribed;
  // null while the Starter card is still deciding, so the VIP line never pops in under it first.
  const [starterShown, setStarterShown] = useState<boolean | null>(firstWin ? null : false);
  useEffect(() => { setStarterShown(firstWin ? null : false); }, [firstWin, winKey]);
  const [multiplier, setMultiplier] = useState<number | null>(() => vipRideMultiplierNow());
  useEffect(() => {
    if (isVip || multiplier != null) return undefined;
    let live = true;
    void warmVipPerks().then(() => { if (live) setMultiplier(vipRideMultiplierNow()); });
    return () => { live = false; };
  }, [isVip, multiplier]);
  const nudge = useVipNudge(!isVip && winKey != null ? winKey : null);
  const line = winVipLine({ coins, xp, multiplier, isVip });
  const vipLine = starterShown === false && nudge && !!line;
  if (!firstWin && !vipLine) return null;
  return (
    <View style={{ alignSelf: 'stretch', marginTop: 10 }}>
      {firstWin && <CalmOffer placement="first_win" onShown={setStarterShown} />}
      {vipLine && <CalmOffer placement="win_vip" vipLine={line} beforeLeave={closeCard}
        onShown={shown => { if (shown) markVipNudgeShown(winKey); }} />}
    </View>
  );
}
