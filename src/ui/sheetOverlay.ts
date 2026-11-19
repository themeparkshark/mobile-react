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

/** One layer: its node, a generation (a layer asked for again while leaving mounts fresh), and whether it is leaving. */
export type SheetOverlayItem = { readonly key: number; readonly gen: number; readonly node: ReactNode; readonly leaving: boolean };
export type SheetOverlayList = readonly SheetOverlayItem[];

/**
 * Pure: the list after one set, in the order each key first arrived (a layer never jumps above a later one).
 * null marks the layer leaving (it keeps its last look while it fades out); overlayDrop removes it after the fade.
 */
export function withOverlay(list: SheetOverlayList, key: number, node: ReactNode | null): SheetOverlayList {
  const at = list.findIndex(item => item.key === key);
  const item = at < 0 ? null : list[at];
  if (node == null) {
    if (!item || item.leaving) return list;
    const next = list.slice(); next[at] = { ...item, leaving: true }; return next;
  }
  if (!item) return [...list, { key, gen: 1, node, leaving: false }];
  if (item.leaving) return [...list.filter(i => i.key !== key), { key, gen: item.gen + 1, node, leaving: false }];
  const next = list.slice(); next[at] = { ...item, node }; return next;
}

/** Pure: the list once a leaving layer's fade has ended (a layer asked for again meanwhile stays). */
export function overlayDrop(list: SheetOverlayList, key: number): SheetOverlayList {
  return list.some(item => item.key === key && item.leaving) ? list.filter(item => !(item.key === key && item.leaving)) : list;
}
