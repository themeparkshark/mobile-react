import { FillLayer, LineLayer, ShapeSource } from '@maplibre/maplibre-react-native';
import { useId, useMemo } from 'react';

/** Geographic circle (radius in meters), replacing react-native-maps' <Circle>. */
export function Circle({ center, radius, fillColor, strokeColor, strokeWidth = 1 }: {
  readonly center: { latitude: number; longitude: number };
  readonly radius: number;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
}) {
  const id = `circle-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const shape = useMemo(() => {
    const ring: number[][] = [];
    const dLat = radius / 111320;
    const dLng = radius / (111320 * Math.cos((center.latitude * Math.PI) / 180));
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ring.push([center.longitude + dLng * Math.cos(a), center.latitude + dLat * Math.sin(a)]);
    }
    return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [ring] } };
  }, [center.latitude, center.longitude, radius]);
  return (
    <ShapeSource id={id} shape={shape}>
      <FillLayer id={`${id}-fill`} style={{ fillColor: fillColor ?? 'transparent' }} />
      <LineLayer id={`${id}-line`} style={{ lineColor: strokeColor ?? 'transparent', lineWidth: strokeWidth }} />
    </ShapeSource>
  );
}
