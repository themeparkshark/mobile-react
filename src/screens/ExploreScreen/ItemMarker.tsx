import { Image } from 'expo-image';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';

/**
 * ItemMarker — 100% STATIC children inside <Marker>.
 * All animations stripped to prevent teleporting.
 */
export default function ItemMarker({
  item,
}: {
  readonly item: { id: number; latitude: number; longitude: number };
}) {
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
      <View pointerEvents="none">
        <Image
          source={require('../../../assets/images/screens/explore/item_animation.gif')}
          contentFit="contain"
          style={{ width: 70, height: 70 }}
        />
      </View>
    </Marker>
  );
}
