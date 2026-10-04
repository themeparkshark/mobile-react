import { MarkerView } from '@maplibre/maplibre-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';

const HIDDEN = { opacity: 0 } as const;
const CENTER = { x: 0.5, y: 0.5 } as const;
/** A thousandth of a point on a 96 pt marker: invisible, but a different prop value. */
const ANCHOR_NUDGE = 1e-5;

type LatLng = { readonly latitude: number | string; readonly longitude: number | string };

/**
 * Drop-in for react-native-maps' <Marker> on the MapLibre game map: same
 * coordinate/anchor/onPress props, children are live RN views pinned to the
 * coordinate. Legacy-only props (tracksViewChanges, flat, stopPropagation,
 * tappable, zIndex) are accepted and ignored.
 */
export function Marker({ coordinate, anchor, onPress, onLongPress, children, accessibilityLabel, touchEnabled = true, hidden = false }: {
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
  /**
   * With onPress: false keeps the same Pressable mounted but takes no touches
   * (a hidden spot). Toggling it never swaps the element inside the MarkerView.
   */
  readonly touchEnabled?: boolean;
  /** Mounted but invisible and untouchable (a feature flag is off): the marker list never mounts or unmounts. */
  readonly hidden?: boolean;
}) {
  // iOS applies the anchor (MLRNPointAnnotation centerOffset) only when the anchor prop arrives after
  // the view has a size. Under the new architecture's interop it arrives first, on a zero frame, and is
  // dropped: the art draws centred on its point. So the first anchor is nudged by a hair and the real one
  // is sent once the view is laid out (ported from the map declutter fix, 9c0ecce2).
  const [laidOut, setLaidOut] = useState(false);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    if (e.nativeEvent.layout.width > 0 && e.nativeEvent.layout.height > 0) setLaidOut(true);
  }, []);
  const lng = Number(coordinate.longitude);
  const lat = Number(coordinate.latitude);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const a = anchor ?? CENTER;
  return (
    <MarkerView coordinate={[lng, lat]} anchor={laidOut ? a : { x: a.x, y: a.y + ANCHOR_NUDGE }} allowOverlap>
      {onPress
        ? <Pressable onLayout={onLayout} onPress={onPress} onLongPress={onLongPress} delayLongPress={450} hitSlop={6} accessibilityRole="button"
            accessibilityLabel={accessibilityLabel} disabled={!touchEnabled || hidden} pointerEvents={touchEnabled && !hidden ? 'auto' : 'none'}
            accessibilityElementsHidden={!touchEnabled || hidden} importantForAccessibility={touchEnabled && !hidden ? 'auto' : 'no-hide-descendants'}
            style={hidden ? HIDDEN : undefined}>{children}</Pressable>
        : <View onLayout={onLayout} pointerEvents="none" style={hidden ? HIDDEN : undefined}>{children}</View>}
    </MarkerView>
  );
}
