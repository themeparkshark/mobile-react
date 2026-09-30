import { Camera, MapView } from '@maplibre/maplibre-react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { TPS_MAP_STYLE } from '../components/map/tpsMapStyle';

type Region = {
  readonly latitude: number;
  readonly longitude: number;
  readonly latitudeDelta: number;
  readonly longitudeDelta: number;
};

/** Web-mercator zoom that shows roughly `longitudeDelta` degrees across the screen. */
export function zoomForDelta(longitudeDelta: number): number {
  return Math.max(1, Math.min(20, Math.log2(360 / Math.max(longitudeDelta, 1e-6))));
}

/**
 * Dev previews render on the same cartoon MapLibre map as the game, with the
 * react-native-maps `initialRegion` shape they were written against. Children
 * are MapLibre markers (components/map/Marker).
 */
export default function PreviewMap({ style, initialRegion, children }: {
  readonly style?: StyleProp<ViewStyle>;
  readonly initialRegion: Region;
  readonly children?: ReactNode;
}) {
  return (
    <MapView style={style} mapStyle={TPS_MAP_STYLE} logoEnabled={false} attributionEnabled={false} compassEnabled={false}>
      <Camera
        defaultSettings={{
          centerCoordinate: [initialRegion.longitude, initialRegion.latitude],
          zoomLevel: zoomForDelta(initialRegion.longitudeDelta),
        }}
      />
      {children}
    </MapView>
  );
}
