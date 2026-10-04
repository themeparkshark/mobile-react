/**
 * Runs the declutter solver for a map. While a finger moves the map it solves
 * every 100 ms in `hold` mode (what is on screen stays exactly as it is; art
 * reaching an inset fades before it slides under the HUD, art coming into view
 * takes the free space), and once more as soon as the camera settles. Marker
 * data and inset changes solve too. Never per frame. Results go to the store,
 * which wakes only the markers whose placement moved.
 */
import { useCallback, useEffect, useRef } from 'react';
import { resolveInsets, solveLayout, type CameraFrame, type EdgeInset, type InsetRect, type LayoutItem, type Rect } from './solver';
import type { DeclutterStore } from './store';

export interface MapDeclutterInput {
  readonly store: DeclutterStore;
  /** Every marker's footprint and rules (rebuilt on data change only). */
  readonly items: readonly LayoutItem[];
  /** HUD and button columns over the map, anchored to the map view's edges. */
  readonly insets: readonly EdgeInset[];
}

/** Gesture passes run at most this often. */
export const HOLD_MS = 100;

type Camera = { latitude: number; longitude: number; zoom: number; bearing: number };

export default function useMapDeclutter(input: MapDeclutterInput | null | undefined, view: { width: number; height: number } | null,
  extra: readonly LayoutItem[], extraInsets: readonly InsetRect[],
  debug?: (rects: Map<string, { body: Rect; tag: Rect | null; point?: { x: number; y: number } }>) => void) {
  const frame = useRef<Camera | null>(null);
  const holding = useRef(false);
  const lastZoom = useRef<number | null>(null);
  const latest = useRef({ input, view, extra, extraInsets, debug });
  latest.current = { input, view, extra, extraInsets, debug };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRun = useRef(0);

  const run = useCallback(() => {
    timer.current = null;
    lastRun.current = Date.now();
    const { input: current, view: size, extra: more, extraInsets: moreInsets, debug: onRects } = latest.current;
    if (!current || !size || !frame.current || size.width <= 0 || size.height <= 0) return;
    const full: CameraFrame = { ...frame.current, width: size.width, height: size.height };
    const insets = [...resolveInsets(current.insets, size.width, size.height), ...moreInsets];
    const items = more.length ? [...current.items, ...more] : current.items;
    const rects = onRects ? new Map<string, { body: Rect; tag: Rect | null; point?: { x: number; y: number } }>() : undefined;
    current.store.publish(solveLayout(items, full, {
      insets, previous: current.store.snapshot(), previousZoom: lastZoom.current, hold: holding.current, rects,
    }));
    // A held pass keeps the zoom it started from, so the settle after a pinch re-solves by priority.
    if (!holding.current) lastZoom.current = full.zoom;
    if (rects && onRects) onRects(rects);
  }, []);

  const schedule = useCallback((wait: number) => {
    if (timer.current) {
      if (wait > 0) return;
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(run, wait);
  }, [run]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Data, insets or view size changed.
  useEffect(() => { if (input) schedule(0); }, [input?.items, input?.insets, input?.store, view?.width, view?.height, extra, extraInsets, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Feed the camera: `moving` while a finger drags or pinches (held passes), else a settled camera. */
  const onCamera = useCallback((camera: Camera, moving = false) => {
    if (![camera.latitude, camera.longitude, camera.zoom, camera.bearing].every(Number.isFinite)) return;
    frame.current = camera;
    holding.current = moving;
    if (!latest.current.input) return;
    schedule(moving ? Math.max(0, HOLD_MS - (Date.now() - lastRun.current)) : 0);
  }, [schedule]);

  return onCamera;
}
