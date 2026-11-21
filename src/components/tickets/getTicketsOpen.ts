/**
 * One door to the coinless Get Tickets sheet (fix pass 1, Nov 20 2026): the map's top card GET TICKETS and the
 * header Ticket pill open the same sheet the coin card shows when a player is short, with no coin price.
 * The map mounts the one host (GetTicketsSheet, inside RedeemModal); with no host up, openGetTickets() says false
 * and the caller keeps its own older way (an alert, the glossary card). Pure, no React beyond the store hook.
 */
import { useSyncExternalStore } from 'react';

let hosts = 0;
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* keep going */ } });

/** Open the sheet. False when no map is up to draw it (the caller falls back). */
export function openGetTickets(): boolean {
  if (hosts === 0) return false;
  if (!open) { open = true; emit(); }
  return true;
}

export function closeGetTickets(): void {
  if (open) { open = false; emit(); }
}

export function getTicketsIsOpen(): boolean { return open; }

/** The host mounts once; it returns its own release. */
export function registerGetTicketsHost(): () => void {
  hosts += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hosts = Math.max(0, hosts - 1);
    if (hosts === 0) closeGetTickets();
  };
}

export function useGetTicketsOpen(): boolean {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getTicketsIsOpen, getTicketsIsOpen);
}
