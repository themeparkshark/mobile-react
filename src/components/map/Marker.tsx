import { MarkerView } from '@maplibre/maplibre-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

const HIDDEN = { opacity: 0 } as const;

type LatLng = { readonly latitude: number | string; readonly longitude: number | string };

/**
 * Drop-in for react-native-maps' <Marker> on the MapLibre game map: same
 * coordinate/anchor/onPress props, children are live RN views pinned to the
 * coordinate. Legacy-only props (tracksViewChanges, flat, stopPropagation,
 * tappable, zIndex) are accepted and ignored.
 */
export function Marker({ coordinate, anchor, onPress, onLongPress, children, accessibilityLabel, hidden = false }: {
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
  /** Mounted but invisible and untouchable (a feature flag is off): the marker list never mounts or unmounts. */
  readonly hidden?: boolean;
}) {
  const lng = Number(coordinate.longitude);
  const lat = Number(coordinate.latitude);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return (
    <MarkerView coordinate={[lng, lat]} anchor={anchor ?? { x: 0.5, y: 0.5 }} allowOverlap>
      {onPress
        ? <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={450} hitSlop={6} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
          pointerEvents={hidden ? 'none' : 'auto'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
          style={hidden ? HIDDEN : undefined}>{children}</Pressable>
        : <View pointerEvents="none" style={hidden ? HIDDEN : undefined}>{children}</View>}
    </MarkerView>
  );
}
