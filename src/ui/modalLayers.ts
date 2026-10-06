/**
 * One full-screen layer at a time (root fix for the Secret Shop freeze, October 2026).
 *
 * iOS presents an RN <Modal> from the root view controller. When another modal is
 * already up there, UIKit refuses the second one ("already presenting"), but React
 * still thinks it is visible: nothing shows, and when the first sheet goes away the
 * orphan keeps the screen from taking taps. That froze the shop when the first
 * wishlist heart asked "Want a heads-up?" from inside the try-on sheet.
 *
 * So every top-level layer registers here, in order:
 * - Sheets (try-on, wishlist, set reveal) register while mounted and show at once.
 * - Dialogs and the grown-up gate register when they want to open and only present
 *   once every layer registered before them is gone (they wait their turn, never stack).
 * A dialog drawn inside a sheet's own <Modal> is nested (ModalLayerContext): UIKit
 * presents it from that sheet, so it neither waits nor blocks.
 */
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';

let nextId = 1;
let layers: number[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const modalLayers = {
  add(): number {
    const id = nextId++;
    layers = [...layers, id];
    emit();
    return id;
  },
  remove(id: number): void {
    if (!layers.includes(id)) return;
    layers = layers.filter(l => l !== id);
    emit();
  },
  /** True when no layer registered before this one is still up. */
  isFront(id: number): boolean {
    return layers.indexOf(id) === 0;
  },
  count(): number { return layers.length; },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Tests only. */
  reset(): void { layers = []; emit(); },
};

/** True inside a sheet's own <Modal>: anything presented there is nested, not a sibling. */
export const ModalLayerContext = createContext(false);

/**
 * Register a layer while `active`. Returns whether it may present now: always for a
 * sheet ('show'), and for a dialog ('wait') only once it is the oldest layer up.
 * Nested layers never register and always present.
 */
export function useModalLayer(active: boolean, mode: 'show' | 'wait'): boolean {
  const nested = useContext(ModalLayerContext);
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    if (!active || nested) return;
    const mine = modalLayers.add();
    setId(mine);
    return () => {
      modalLayers.remove(mine);
      setId(null);
    };
  }, [active, nested]);
  // Before its effect registers it, a waiting layer may show at once only when nothing else is up.
  const front = useSyncExternalStore(modalLayers.subscribe,
    () => (id != null ? modalLayers.isFront(id) : modalLayers.count() === 0));
  if (!active) return false;
  if (nested || mode === 'show') return true;
  return front;
}
