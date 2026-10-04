import { MarkerView } from '@maplibre/maplibre-react-native';
import { useRef, type ReactNode } from 'react';
import { Pressable } from 'react-native';

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
  return (
    <MarkerView coordinate={last.current} anchor={anchor ?? { x: 0.5, y: 0.5 }} allowOverlap>
      <Pressable disabled={!tappable} onPress={onPress} onLongPress={onLongPress} delayLongPress={450} hitSlop={6}
        pointerEvents={tappable ? 'auto' : 'none'} style={off ? HIDDEN : undefined}
        accessibilityRole={tappable ? 'button' : undefined} accessibilityLabel={tappable ? accessibilityLabel : undefined}
        accessibilityElementsHidden={off} importantForAccessibility={off ? 'no-hide-descendants' : 'auto'}>
        {children}
      </Pressable>
    </MarkerView>
  );
}

const HIDDEN = { opacity: 0 } as const;

/** Where a parked marker waits (it draws nothing). */
export const PARKED = { latitude: 0, longitude: 0 } as const;
