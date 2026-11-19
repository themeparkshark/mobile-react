/**
 * A layer drawn above a sheet's own contents, in that sheet's own view (fix pass w4, lane press, N02).
 *
 * Read off the phase log in release-like JS: the grown-up gate asked from a row inside the coin card was a second
 * native sheet presented from the card. UIKit put it up 0.8 to 8.4 s after the tap, and 4 times in 20 never (no
 * onShow, no UIKit refusal in the device log, and no later props update made it present), so the gate was closed
 * unseen and the row seemed to do nothing. A layer in the sheet's own view draws on the next frame, every time, with
 * nothing for UIKit to refuse. ui/DoorModal.tsx (every iOS sheet) provides it; outside a sheet the hook gives null and
 * a caller presents its own Modal as before.
 */
import { createContext, useContext, type Context, type ReactNode } from 'react';

/** Draw `node` above this sheet's contents under `key` (null takes it away). */
export type SheetOverlaySet = (key: number, node: ReactNode | null) => void;
export type SheetOverlayList = readonly (readonly [number, ReactNode])[];

let context: Context<SheetOverlaySet | null> | null = null;
/** The one context, made on first use (so a module that only imports the gate never needs React's context API). */
export function sheetOverlayContext(): Context<SheetOverlaySet | null> {
  if (!context) context = createContext<SheetOverlaySet | null>(null);
  return context;
}

/** The nearest sheet's overlay setter, or null outside a sheet. */
export function useSheetOverlay(): SheetOverlaySet | null {
  return useContext(sheetOverlayContext());
}

/** Pure: the list after one set, in the order each key first arrived (a layer never jumps above a later one). */
export function withOverlay(list: SheetOverlayList, key: number, node: ReactNode | null): SheetOverlayList {
  const at = list.findIndex(([k]) => k === key);
  if (node == null) return at < 0 ? list : list.filter(([k]) => k !== key);
  if (at < 0) return [...list, [key, node] as const];
  const next = list.slice();
  next[at] = [key, node] as const;
  return next;
}
