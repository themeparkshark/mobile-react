/**
 * Native map queries (bounds, zoom, point in view, rendered features, snapshot) only reach a map
 * view that the native side has shown is alive.
 *
 * Why: with the new architecture the JS ref of a freshly mounted MapView is set before UIKit has
 * created the native view, and an unmounting map keeps its JS ref a moment after the native view
 * is gone. A query in either gap makes MLRNMapViewManager log "Invalid react tag, could not find
 * MLRNMapView" (a red box in debug) and its promise never settles. Coming back from iOS Settings
 * remounts the map on a busy main thread, which is exactly that gap (T187).
 *
 * The gate opens on the first native map event (that event came from the view, so the view is
 * registered) and closes for good when the map unmounts. Every query reads the view through
 * `gate.ref`, which is null while the gate is shut.
 */
export interface NativeMapGate<T> {
  /** The map view, or null until the native view has reported in (and again after unmount). */
  readonly ref: { readonly current: T | null };
  /** A native map event arrived: the view is in the registry. */
  ready(): void;
  /** The map unmounted: never query it again. */
  gone(): void;
  isOpen(): boolean;
}

export function createNativeMapGate<T>(view: { readonly current: T | null }): NativeMapGate<T> {
  let seen = false;
  let unmounted = false;
  const open = () => seen && !unmounted && view.current !== null;
  return {
    ref: { get current() { return open() ? view.current : null; } },
    ready() { if (!unmounted) seen = true; },
    gone() { unmounted = true; },
    isOpen: open,
  };
}
