import { Image } from 'expo-image';
import { View } from 'react-native';
import { Marker, PARKED } from '../../components/map/Marker';
import { Placed, usePlacement } from '../../components/map/declutter/Placed';

/**
 * ItemMarker — 100% STATIC children inside <Marker>.
 * All animations stripped to prevent teleporting.
 */
export default function ItemMarker({
  item,
}: {
  /** Null: an empty pool slot (mounted, parked, draws nothing). */
  readonly item: { id: number; latitude: number; longitude: number } | null;
}) {
  // Declutter: steps back under a HUD inset or stronger art (parkMapLayout).
  const placement = usePlacement(item ? `item:${item.id}` : '');
  return (
    <Marker
      coordinate={item ?? PARKED}
      hidden={!item}
      tappable={false}
      flat={true}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <Placed placement={placement}>
        <Image
          source={require('../../../assets/images/screens/explore/item_animation.webp')}
          contentFit="contain"
          style={{ width: 70, height: 70 }}
        />
      </Placed>
    </Marker>
  );
}
