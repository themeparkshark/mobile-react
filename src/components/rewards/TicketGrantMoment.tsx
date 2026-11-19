/**
 * Fix w4 T101: plays announced Ticket grants (services/rewards/ticketGrants) on the map: the Tickets fly from the
 * middle of the screen into the header pill and one reward toast says why ("+2 Tickets: Park day starter"). One at a
 * time, only while the map is calm (no Finn card, game, win card or sheet over it), so the moment is seen.
 * Draws nothing itself: the fly and the toast are the shared kit's (CurrencyFlyProvider, ToastProvider).
 */
import { useEffect, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import { useToast } from '../Toast';
import { haptic } from '../../gamekit/Haptics';
import { onTicketGrant, pendingTicketGrants, takeTicketGrant, ticketGrantLine } from '../../services/rewards/ticketGrants';

const TICKET_ART = require('../../../assets/images/ticket-icon.png');
/** The gap between two grants, so each toast is read before the next. */
export const TICKET_GRANT_GAP_MS = 2800;
/** How long the map stays calm before a grant plays (a cover that is about to come up cancels it). */
export const TICKET_GRANT_SETTLE_MS = 1500;

export default function TicketGrantMoment({ calm }: { readonly calm: boolean }) {
  const { triggerFly, getTarget } = useCurrencyFly();
  const { showToast } = useToast();
  const [waiting, setWaiting] = useState(pendingTicketGrants());
  const [busy, setBusy] = useState(false);
  const gap = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => onTicketGrant(() => setWaiting(pendingTicketGrants())), []);
  useEffect(() => () => { if (gap.current) clearTimeout(gap.current); }, []);
  useEffect(() => {
    if (!calm || busy || waiting === 0) return undefined;
    // The map must stay calm for a beat first: the grant arrives with the park check-in, a moment before the
    // walking-in sky covers the map, and it must play after that cover, on the map (device run, Nov 19).
    const settle = setTimeout(() => {
      if (!getTarget('tickets')) return;
      const grant = takeTicketGrant();
      setWaiting(pendingTicketGrants());
      if (!grant) return;
      setBusy(true);
      const { width, height } = Dimensions.get('window');
      triggerFly({ imageSource: TICKET_ART, amount: Math.min(grant.amount, 6), startX: width / 2, startY: height * 0.45, targetPosition: 'tickets' });
      showToast({ type: 'reward', icon: 'ticket', message: ticketGrantLine(grant), duration: 2600 });
      haptic('success');
      // The gap timer lives in a ref: a re-render never cancels it (the next grant always gets its turn).
      gap.current = setTimeout(() => { gap.current = null; setBusy(false); }, TICKET_GRANT_GAP_MS);
    }, TICKET_GRANT_SETTLE_MS);
    return () => clearTimeout(settle);
  }, [calm, busy, waiting, getTarget, triggerFly, showToast]);
  return null;
}
