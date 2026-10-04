import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Marker } from './Marker';
import { glideDurationMs, glidePoint, type GlidePoint } from './glide';

/** About 30 updates a second: smooth on the map, light on the bridge. */
const FRAME_MS = 33;

/**
 * A map Marker that eases to each new coordinate instead of jumping (the
 * player's shark while the map is panned away from it). Only this component
 * re-renders during a glide; the marker stays the same mounted MarkerView and
 * only its coordinate prop changes. With `glide` off (the marker is hidden, or
 * reduced motion) the coordinate is applied at once.
 */
export const GlidingMarker = memo(function GlidingMarker({ coordinate, glide, hidden = false, anchor, children }: {
  readonly coordinate: GlidePoint;
  readonly glide: boolean;
  /** Mounted but invisible and untouchable (no location yet). */
  readonly hidden?: boolean;
  readonly anchor?: { x: number; y: number };
  readonly children: ReactNode;
}) {
  const [shown, setShown] = useState<GlidePoint>(coordinate);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const frameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const lastTargetAtRef = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    const to = { latitude: coordinate.latitude, longitude: coordinate.longitude };
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    const arrived = Date.now();
    const sinceLast = arrived - lastTargetAtRef.current;
    lastTargetAtRef.current = arrived;
    const duration = glide && !hidden ? glideDurationMs(from, to, sinceLast) : 0;
    if (duration <= 0) {
      if (from.latitude !== to.latitude || from.longitude !== to.longitude) setShown(to);
      return;
    }
    const start = Date.now();
    let lastCommit = 0;
    const step = () => {
      const now = Date.now();
      const t = Math.min(1, (now - start) / duration);
      if (t >= 1 || now - lastCommit >= FRAME_MS) {
        lastCommit = now;
        setShown(glidePoint(from, to, t));
      }
      frameRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frameRef.current = requestAnimationFrame(step);
    return () => { if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; } };
  }, [coordinate.latitude, coordinate.longitude, glide, hidden]);

  return <Marker coordinate={shown} hidden={hidden} anchor={anchor}>{children}</Marker>;
});
