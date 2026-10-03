/**
 * Runs the declutter solver for a map: on camera change (region did change,
 * never per frame), on marker data change and on inset change, throttled to
 * one pass per 300 ms. Results go to the store, which wakes only the markers
 * whose placement moved.
 */
import { useCallback, useEffect, useRef } from 'react';
import { resolveInsets, solveLayout, type CameraFrame, type EdgeInset, type LayoutItem, type Rect } from './solver';
import type { DeclutterStore } from './store';

export interface MapDeclutterInput {
  readonly store: DeclutterStore;
  /** Every marker's footprint and rules (rebuilt on data change only). */
  readonly items: readonly LayoutItem[];
  /** HUD and button columns over the map, anchored to the map view's edges. */
  readonly insets: readonly EdgeInset[];
}

const THROTTLE_MS = 300;

export default function useMapDeclutter(input: MapDeclutterInput | null | undefined, view: { width: number; height: number } | null,
  extra: readonly LayoutItem[], extraInsets: readonly Rect[]) {
  const frame = useRef<Omit<CameraFrame, 'width' | 'height'> | null>(null);
  const latest = useRef({ input, view, extra, extraInsets });
  latest.current = { input, view, extra, extraInsets };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRun = useRef(0);

  const run = useCallback(() => {
    timer.current = null;
    lastRun.current = Date.now();
    const { input: current, view: size, extra: more, extraInsets: moreInsets } = latest.current;
    if (!current || !size || !frame.current || size.width <= 0 || size.height <= 0) return;
    const full: CameraFrame = { ...frame.current, width: size.width, height: size.height };
    const insets = [...resolveInsets(current.insets, size.width, size.height), ...moreInsets];
    const items = more.length ? [...current.items, ...more] : current.items;
    current.store.publish(solveLayout(items, full, { insets, previous: current.store.snapshot() }));
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) return;
    const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastRun.current));
    timer.current = setTimeout(run, wait);
  }, [run]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Data, insets or view size changed.
  useEffect(() => { if (input) schedule(); }, [input?.items, input?.insets, input?.store, view?.width, view?.height, extra, extraInsets, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Feed the camera after a move settles. */
  const onCamera = useCallback((camera: { latitude: number; longitude: number; zoom: number; bearing: number }) => {
    if (![camera.latitude, camera.longitude, camera.zoom, camera.bearing].every(Number.isFinite)) return;
    frame.current = camera;
    if (latest.current.input) schedule();
  }, [schedule]);

  return onCamera;
}
