import { Image } from 'expo-image';
import { View } from 'react-native';
import { Marker } from '../../components/map/Marker';
import { Placed, usePlacement } from '../../components/map/declutter/Placed';

/**
 * PinMarker — 100% STATIC children inside <Marker>.
 * All animations stripped to prevent teleporting.
 * The .gif asset itself still animates — just no Animated transforms.
 */
export default function PinMarker({
  item,
}: {
  readonly item: { id: number; latitude: number; longitude: number };
}) {
  // Declutter: steps back under a HUD inset or stronger art (parkMapLayout).
  const placement = usePlacement(`pin:${item.id}`);
  return (
    <Marker
      coordinate={{
        latitude: item.latitude,
        longitude: item.longitude,
      }}
      tappable={false}
      flat={true}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <Placed placement={placement}>
        <Image
          source={require('../../../assets/images/screens/explore/pin_animation.webp')}
          contentFit="contain"
          style={{ width: 70, height: 70 }}
        />
      </Placed>
    </Marker>
  );
}
