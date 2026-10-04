import { MarkerView } from '@maplibre/maplibre-react-native';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, type LayoutChangeEvent } from 'react-native';

type LatLng = { readonly latitude: number | string; readonly longitude: number | string };

/**
 * Drop-in for react-native-maps' <Marker> on the MapLibre game map: same
 * coordinate/anchor/onPress props, children are live RN views pinned to the
 * coordinate. Legacy-only props (tracksViewChanges, flat, stopPropagation,
 * tappable, zIndex) are accepted and ignored.
 *
 * Always one MapLibre marker view with one child, whatever the props: a
 * `hidden` marker (an empty pool slot, a parked singleton) or one with a bad
 * coordinate keeps its view at the last good spot, draws nothing and takes no
 * touches. Mounting, unmounting or swapping MapView children mid-list crashes
 * MapLibre (-[MLRNMapView insertReactSubview:atIndex:]).
 */
export function Marker({ coordinate, anchor, onPress, onLongPress, children, accessibilityLabel, hidden = false, touchEnabled = true }: {
  readonly coordinate: LatLng;
  readonly anchor?: { x: number; y: number };
  readonly onPress?: () => void;
  /** Long-press, for example "Report this spot" on a home find. */
  readonly onLongPress?: () => void;
  readonly children?: ReactNode;
  readonly tracksViewChanges?: boolean;
  readonly flat?: boolean;
  readonly stopPropagation?: boolean;
  readonly tappable?: boolean;
  readonly zIndex?: number;
  readonly accessibilityLabel?: string;
  /** Mounted but not drawn and not tappable (a parked marker). */
  readonly hidden?: boolean;
  /**
   * With onPress: false keeps the same Pressable mounted but takes no touches
   * (a hidden spot). Toggling it never swaps the element inside the MarkerView.
   */
  readonly touchEnabled?: boolean;
}) {
  const lng = Number(coordinate.longitude);
  const lat = Number(coordinate.latitude);
  const valid = Number.isFinite(lng) && Number.isFinite(lat);
  const last = useRef<[number, number]>([0, 0]);
  if (valid) last.current = [lng, lat];
  const off = hidden || !valid;
  const tappable = !off && !!onPress && touchEnabled;
  // iOS applies the anchor (MLRNPointAnnotation centerOffset) only when the anchor prop arrives
  // after the view has a size. Under the new architecture's interop the anchor arrives first, on a
  // zero frame, and is dropped: the art draws centred on its point (islands sat ~38 pt low). So the
  // first anchor is nudged by a hair and the real one is sent once the view is laid out.
  const [laidOut, setLaidOut] = useState(false);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    if (e.nativeEvent.layout.width > 0 && e.nativeEvent.layout.height > 0) setLaidOut(true);
  }, []);
  const a = anchor ?? CENTER;
  return (
    <MarkerView coordinate={last.current} anchor={laidOut ? a : { x: a.x, y: a.y + ANCHOR_NUDGE }} allowOverlap>
      <Pressable onLayout={onLayout} disabled={!tappable} onPress={onPress} onLongPress={onLongPress} delayLongPress={450} hitSlop={6}
        pointerEvents={tappable ? 'auto' : 'none'} style={off ? HIDDEN : undefined}
        accessibilityRole={tappable ? 'button' : undefined} accessibilityLabel={tappable ? accessibilityLabel : undefined}
        accessibilityElementsHidden={off} importantForAccessibility={off ? 'no-hide-descendants' : 'auto'}>
        {children}
      </Pressable>
    </MarkerView>
  );
}

const HIDDEN = { opacity: 0 } as const;
const CENTER = { x: 0.5, y: 0.5 } as const;
/** A thousandth of a point on a 96 pt marker: invisible, but a different prop value. */
const ANCHOR_NUDGE = 1e-5;

/** Where a parked marker waits (it draws nothing). */
export const PARKED = { latitude: 0, longitude: 0 } as const;
