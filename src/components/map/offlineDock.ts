import { useEffect, useState } from 'react';

/**
 * Where the offline chip docks on the map screen: under the compass column (on a tall phone that is
 * the whole rail: the compass, Daily 3 and the chest, planned for all three so a late chest never
 * collides with it; on a short phone the extras stand in their own column, so it is the slot under
 * the compass, beside the chest), centred under the compass. With no room there, it stands to the
 * rail's left instead.
 * Map publishes it from its own layout; OfflineBanner reads it, so the chip never touches a button.
 */
export type OfflineChipDock = { readonly top: number; readonly right: number };

const CHIP = 44;
const GAP = 8;
const BUTTON = 54;
const RIGHT = 16;

export function offlineChipDock({ viewTop, viewHeight, controlsTop, railHeight, railWidth, railFloor }: {
  /** The map view's top in window points. */
  readonly viewTop: number;
  readonly viewHeight: number;
  /** The rail's top, from the map view's top. */
  readonly controlsTop: number;
  /** The compass column's planned height (every button it can hold). */
  readonly railHeight: number;
  /** The rail's width (one column, or two on a short phone). */
  readonly railWidth: number;
  /** Room kept at the map's bottom right for the screen's own buttons (0: none). */
  readonly railFloor: number;
}): OfflineChipDock {
  const under = controlsTop + railHeight + GAP;
  const floor = railFloor > 0 ? viewHeight - railFloor - GAP : viewHeight - GAP;
  if (under + CHIP <= floor) return { top: Math.round(viewTop + under), right: RIGHT + (BUTTON - CHIP) / 2 };
  return { top: Math.round(viewTop + controlsTop + (BUTTON - CHIP) / 2), right: RIGHT + railWidth + GAP };
}

let current: { readonly owner: object; readonly dock: OfflineChipDock } | null = null;
const listeners = new Set<(dock: OfflineChipDock | null) => void>();

function emit(): void { for (const fn of listeners) fn(current?.dock ?? null); }

/** The map publishes its dock (the newest map on screen wins). */
export function publishOfflineChipDock(owner: object, dock: OfflineChipDock): void {
  if (current && current.owner === owner && current.dock.top === dock.top && current.dock.right === dock.right) return;
  current = { owner, dock };
  emit();
}

/** A map going away takes its dock with it (only its own). */
export function clearOfflineChipDock(owner: object): void {
  if (current?.owner !== owner) return;
  current = null;
  emit();
}

export function currentOfflineChipDock(): OfflineChipDock | null { return current?.dock ?? null; }

export function useOfflineChipDock(): OfflineChipDock | null {
  const [dock, setDock] = useState(currentOfflineChipDock);
  useEffect(() => {
    listeners.add(setDock);
    setDock(currentOfflineChipDock());
    return () => { listeners.delete(setDock); };
  }, []);
  return dock;
}
