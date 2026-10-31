/**
 * PLAY! waits for the screen to be clear (core loop blueprint 4.3 rule 10, the PLAY RIDE freeze).
 *
 * The freeze: a sheet (Ride Control, the Adventure Ticket, Too Far, a dialog) was swiped or
 * tapped closed, React hid it at once, but UIKit was still taking it down. PLAY RIDE tapped in
 * that moment asked UIKit to present the coin challenge card into the leaving sheet; UIKit
 * refused ("already presenting"), the card's open state stuck, and every later PLAY tap was dead
 * (lc-dustin 85 to 91, reproduced on cl-guide-map: 1 of 4 runs opened the card).
 *
 * Every sheet on the map path holds its modal layer until UIKit reports it gone
 * (useNativeModalLayer), and marks it "leaving" from the moment it hides in JS. PLAY! holds a
 * press only while a layer is leaving: a sheet that is up covers PLAY! anyway, and a dialog that
 * waits its turn is not on screen, so neither holds PLAY!. The hold is short-lived on purpose: it
 * ends HOLD_MAX_MS after the leaving started even if a layer leaks somewhere, so PLAY! can never be
 * blocked for good.
 *
 * In the merged build the challenge card itself waits its turn on the layer list and re-presents if
 * UIKit refuses it (RedeemRedeemableModal), so the hold is off: a press after a loss card or a leaving
 * sheet queues the card instead of being swallowed. The hold stays here, off, as the documented guard.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { modalLayers } from '../../ui/modalLayers';

/** Longest a press waits on a leaving sheet. UIKit takes a sheet down in well under this. */
export const HOLD_MAX_MS = 1500;
/** Off: the challenge card waits its turn on the layer list, so a press in a sheet's last 150 ms queues it. */
export const HOLD_PLAY_FOR_LEAVING_SHEETS = false;

/** Pure: whether PLAY! should hold presses right now. `layers` counts only leaving layers. */
export function holdPlayTaps(input: { readonly layers: number; readonly sinceChangeMs: number; readonly flowOpen: boolean }): boolean {
  if (!HOLD_PLAY_FOR_LEAVING_SHEETS) return false;
  if (input.flowOpen) return false;          // the challenge flow itself is up: its own sheet owns the screen
  if (!(input.layers > 0)) return false;
  return input.sinceChangeMs < HOLD_MAX_MS;
}

const leavingCount = () => modalLayers.leavingCount();

/** True while a sheet or dialog is still leaving (hidden in JS, not yet gone in UIKit) and the challenge flow is not open. */
export function usePlayTapHold(flowOpen: boolean): boolean {
  const leaving = useSyncExternalStore(modalLayers.subscribe, leavingCount, leavingCount);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (leaving === 0) return undefined;
    const timer = setTimeout(() => setExpired(true), HOLD_MAX_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  return holdPlayTaps({ layers: leaving, sinceChangeMs: expired ? HOLD_MAX_MS : 0, flowOpen });
}
