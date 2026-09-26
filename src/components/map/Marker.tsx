import { MarkerView } from '@maplibre/maplibre-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

type LatLng = { readonly latitude: number | string; readonly longitude: number | string };

/**
 * Drop-in for react-native-maps' <Marker> on the MapLibre game map: same
 * coordinate/anchor/onPress props, children are live RN views pinned to the
 * coordinate. Legacy-only props (tracksViewChanges, flat, stopPropagation,
 * tappable, zIndex) are accepted and ignored.
 */
export function Marker({ coordinate, anchor, onPress, children, accessibilityLabel }: {
  readonly coordinate: LatLng;
  readonly anchor?: { x: number; y: number };
  readonly onPress?: () => void;
  readonly children?: ReactNode;
  readonly tracksViewChanges?: boolean;
  readonly flat?: boolean;
  readonly stopPropagation?: boolean;
  readonly tappable?: boolean;
  readonly zIndex?: number;
  readonly accessibilityLabel?: string;
}) {
  const lng = Number(coordinate.longitude);
  const lat = Number(coordinate.latitude);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return (
    <MarkerView coordinate={[lng, lat]} anchor={anchor ?? { x: 0.5, y: 0.5 }} allowOverlap>
      {onPress
        ? <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>{children}</Pressable>
        : <View pointerEvents="none">{children}</View>}
    </MarkerView>
  );
}
