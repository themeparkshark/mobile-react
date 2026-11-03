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
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';

let nextId = 1;
let layers: number[] = [];
// Layers whose sheet is hidden in JS but still being taken down by UIKit (useNativeModalLayer).
let leaving: number[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const modalLayers = {
  add(): number {
    const id = nextId++;
    layers = [...layers, id];
    note('add', id);
    emit();
    return id;
  },
  remove(id: number): void {
    if (!layers.includes(id)) return;
    layers = layers.filter(l => l !== id);
    leaving = leaving.filter(l => l !== id);
    note('remove', id);
    emit();
  },
  /** True when no layer registered before this one is still up. */
  isFront(id: number): boolean {
    return layers.indexOf(id) === 0;
  },
  count(): number { return layers.length; },
  /** Mark a registered layer as leaving: hidden in JS, still on screen natively until it is removed. */
  markLeaving(id: number): void {
    if (!layers.includes(id) || leaving.includes(id)) return;
    if (leaving.length === 0) leavingSince = Date.now();
    leaving = [...leaving, id];
    emit();
  },
  /** The sheet wants to show again before it was gone: it is no longer leaving. */
  clearLeaving(id: number): void {
    if (!leaving.includes(id)) return;
    leaving = leaving.filter(l => l !== id);
    emit();
  },
  /**
   * May a button on the map open its sheet now? False while another sheet is up or on its way (the first press wins):
   * a press beside PLAY! in the moment its card comes up does nothing, instead of opening a sheet after the game.
   * A sheet that is only leaving does not count, so a press right after a close still works.
   */
  pressClear(): boolean { return layers.every(id => leaving.includes(id)); },
  /** How many layers are hidden in JS but not yet gone natively (PLAY! holds presses only then). */
  leavingCount(): number { return leaving.length; },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  /** Tests only. */
  reset(): void { layers = []; leaving = []; emit(); },
};

/**
 * A tap that lands on a sheet that is on its way out. Its dim still covers the screen for a moment (longer on a busy
 * JS thread: up to about 1.5 s), so a kid's press on PLAY! landed on the leaving sheet and vanished, 20 of 20 in the
 * safety panel, while the guide said Tap PLAY!. DoorModal reports those taps here, and PLAY! claims one that falls on
 * it: the press is held and honored, never lost. A tap right at the start of the leaving is the same tap that closed
 * the sheet (a double tap on its button), so it does not count.
 */
export const LEAVING_TAP_MIN_MS = 200;
let leavingSince = 0;
const leavingTapListeners = new Set<(x: number, y: number) => void>();
export const leavingSheetTap = {
  /** PLAY! listens while it is drawn. */
  listen(fn: (x: number, y: number) => void): () => void {
    leavingTapListeners.add(fn);
    return () => { leavingTapListeners.delete(fn); };
  },
  /** `going`: this sheet's own native dismiss has started (it counts even with no layer listed as leaving). */
  note(x: number, y: number, now: number = Date.now(), going: boolean = false): void {
    if (!going && (leaving.length === 0 || now - leavingSince < LEAVING_TAP_MIN_MS)) return;
    leavingTapListeners.forEach(fn => fn(x, y));
  },
};

// Dev builds: the lane tools read the layer list over the debugger (never in a store or OTA bundle).
const devLog: { t: number; op: string; id: number }[] = [];
if (typeof __DEV__ !== 'undefined' && __DEV__) (globalThis as { __tpsModalLayers?: unknown }).__tpsModalLayers = { count: () => layers.length, ids: () => [...layers], log: () => devLog.splice(0) };
const note = (op: string, id: number) => { if (typeof __DEV__ !== 'undefined' && __DEV__) { devLog.push({ t: Date.now(), op, id }); if (devLog.length > 200) devLog.shift(); } };

/** True while any sheet, dialog or the grown-up gate is up: ambient stage loops behind it rest. */
export function useAnyModalLayer(): boolean {
  return useSyncExternalStore(modalLayers.subscribe, () => modalLayers.count() > 0);
}

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

/**
 * If a native sheet never reports its dismissal (never presented, or Android), its layer frees itself
 * after this. Long enough to outlast a react-native-modal exit animation on a busy JS thread (seen on
 * the simulator: a 300 ms zoom-out reported onModalHide after 1.4 s, so a 1.2 s fallback freed the
 * layer while the sheet was still up). A sheet that reports onHidden frees its layer long before this.
 */
export const NATIVE_DISMISS_FALLBACK_MS = 2500;
/**
 * Measured on the simulator (RN 0.76, Fabric): a native Modal's onDismiss never arrives, so every
 * layer waited the full fallback. A sheet that reports its JS hide (react-native-modal onModalHide,
 * or a dialog's own fade) is gone natively one mount transaction later: this much margin covers it.
 */
export const NATIVE_SETTLE_MS = 150;

/**
 * A layer that stays registered until UIKit says the sheet is really gone
 * (core loop blueprint 4.3 rule 10, the PLAY RIDE freeze, October 2026).
 *
 * The freeze: the Ride Control sheet was swiped closed, React flipped its
 * `visible` to false and dropped the layer at once, but UIKit was still
 * dismissing it, so the challenge card that presented next was refused and its
 * orphan swallowed every tap. Here the layer is held from the moment the sheet
 * wants to show until `onDismissed` runs (wire it to <Modal onDismiss> on iOS
 * or react-native-modal's onModalHide), with a short fallback for a sheet that
 * never reports back.
 *
 *   const layer = useNativeModalLayer(open, 'wait');
 *   <Modal visible={layer.present} onDismiss={layer.onDismissed} ...>
 *
 * 'wait' (the default) presents only once every layer registered before it is
 * gone; 'show' presents at once (a sheet the player opened on purpose). Nested
 * layers (inside another sheet's <Modal>) never register and always present.
 * Shared contract: owned by the guide-map lane; other lanes import it.
 */
export function useNativeModalLayer(wanted: boolean, mode: 'show' | 'wait' = 'wait', patienceMs?: number):
  { present: boolean; onDismissed: () => void; onHidden: () => void } {
  const nested = useContext(ModalLayerContext);
  const [id, setId] = useState<number | null>(null);
  const idRef = useRef<number | null>(null);
  const presentedRef = useRef(false);
  const dismissedRef = useRef(false);
  const wantedRef = useRef(wanted);
  wantedRef.current = wanted;
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (fallback.current) { clearTimeout(fallback.current); fallback.current = null; }
    const mine = idRef.current;
    idRef.current = null;
    presentedRef.current = false;
    dismissedRef.current = false;
    setId(null);
    if (mine != null) modalLayers.remove(mine);
  }, []);

  // Register when the sheet wants to show; hold the layer while UIKit dismisses it.
  useEffect(() => {
    if (nested) return;
    if (wanted) {
      dismissedRef.current = false;
      if (fallback.current) { clearTimeout(fallback.current); fallback.current = null; }
      if (idRef.current == null) {
        const mine = modalLayers.add();
        idRef.current = mine;
        setId(mine);
      } else modalLayers.clearLeaving(idRef.current);
      return;
    }
    if (idRef.current == null) return;
    // Never presented, or UIKit already said it is gone: free the layer now.
    if (!presentedRef.current || dismissedRef.current) { release(); return; }
    note('hidden', idRef.current);
    modalLayers.markLeaving(idRef.current);
    if (!fallback.current) fallback.current = setTimeout(release, NATIVE_DISMISS_FALLBACK_MS);
  }, [wanted, nested, release]);

  // Unmount: never leave a layer behind.
  useEffect(() => () => {
    if (fallback.current) clearTimeout(fallback.current);
    if (idRef.current != null) modalLayers.remove(idRef.current);
    idRef.current = null;
  }, []);

  const front = useSyncExternalStore(modalLayers.subscribe,
    () => (id != null ? modalLayers.isFront(id) : modalLayers.count() === 0));
  // A layer ahead that never goes away (a sheet that lost its presentation) must not hold a waiting sheet for good:
  // past its patience it presents anyway, and the app's native door (nativeModalDoor.ts) still keeps it from racing.
  const [outOfPatience, setOutOfPatience] = useState(false);
  useEffect(() => {
    setOutOfPatience(false);
    if (!wanted || !patienceMs || nested) return undefined;
    const timer = setTimeout(() => setOutOfPatience(true), patienceMs);
    return () => clearTimeout(timer);
  }, [wanted, patienceMs, nested]);
  const present = wanted && (nested || mode === 'show' || (id != null && (front || outOfPatience)));
  useEffect(() => {
    if (present) presentedRef.current = true;
  }, [present]);

  const onDismissed = useCallback(() => {
    if (idRef.current != null) note('dismissed', idRef.current);
    if (nested || idRef.current == null) return;
    dismissedRef.current = true;
    if (!wantedRef.current) release();
  }, [nested, release]);

  // The JS side finished hiding (react-native-modal onModalHide): UIKit is done one transaction later.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHidden = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => { settle.current = null; onDismissed(); }, NATIVE_SETTLE_MS);
  }, [onDismissed]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  return { present, onDismissed, onHidden };
}
