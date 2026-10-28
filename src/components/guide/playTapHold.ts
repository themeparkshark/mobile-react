/**
 * PLAY! waits for the screen to be clear (core loop blueprint 4.3 rule 10, the PLAY RIDE freeze).
 *
 * The freeze: a sheet (Ride Control, the Adventure Ticket, Too Far, a dialog) was swiped or
 * tapped closed, React hid it at once, but UIKit was still taking it down. PLAY RIDE tapped in
 * that moment asked UIKit to present the coin challenge card into the leaving sheet; UIKit
 * refused ("already presenting"), the card's open state stuck, and every later PLAY tap was dead
 * (lc-dustin 85 to 91, reproduced on cl-guide-map: 1 of 4 runs opened the card).
 *
 * Every sheet on the map path now holds its modal layer until UIKit reports it gone
 * (useNativeModalLayer). While any layer is still held, PLAY! takes no new press, so a press can
 * never start the card into a half-dismissed sheet; once the layer frees, the next press opens
 * the card. The hold is short-lived on purpose: it ends HOLD_MAX_MS after the last layer change
 * even if a layer leaks somewhere, so PLAY! can never be blocked for good.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { modalLayers } from '../../ui/modalLayers';

/** Longest a press waits on a leaving sheet. UIKit takes a sheet down in well under this. */
export const HOLD_MAX_MS = 1500;

/** Pure: whether PLAY! should hold presses right now. */
export function holdPlayTaps(input: { readonly layers: number; readonly sinceChangeMs: number; readonly flowOpen: boolean }): boolean {
  if (input.flowOpen) return false;          // the challenge flow itself is up: its own sheet owns the screen
  if (!(input.layers > 0)) return false;
  return input.sinceChangeMs < HOLD_MAX_MS;
}

const count = () => modalLayers.count();

/** True while a sheet or dialog is still leaving (or up) and the challenge flow is not open. */
export function usePlayTapHold(flowOpen: boolean): boolean {
  const layers = useSyncExternalStore(modalLayers.subscribe, count, count);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (layers === 0) return undefined;
    const timer = setTimeout(() => setExpired(true), HOLD_MAX_MS);
    return () => clearTimeout(timer);
  }, [layers]);
  return holdPlayTaps({ layers, sinceChangeMs: expired ? HOLD_MAX_MS : 0, flowOpen });
}
