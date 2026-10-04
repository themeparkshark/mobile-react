import { Image } from 'expo-image';
import { View } from 'react-native';
import { Marker, PARKED } from '../../components/map/Marker';
import { useMapAlive } from '../../components/map/alive/MapAliveContext';
import { Placed, usePlacement } from '../../components/map/declutter/Placed';

/**
 * VaultMarker — 100% STATIC children inside <Marker>.
 * All animations stripped to prevent teleporting.
 */
export default function VaultMarker({
  vault,
}: {
  /** Null: an empty pool slot (mounted, parked, draws nothing). */
  readonly vault: { id: number; latitude: string; longitude: string } | null;
}) {
  // The GIF stops decoding frames while the map is off screen or calm.
  const { running } = useMapAlive();
  const placement = usePlacement(vault ? `vault:${vault.id}` : '');
  return (
    <Marker
      coordinate={vault ? { latitude: Number(vault.latitude), longitude: Number(vault.longitude) } : PARKED}
      hidden={!vault}
      tappable={false}
      flat={true}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <Placed placement={placement} style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
        {/* Static golden glow behind vault */}
        <View style={{
          position: 'absolute',
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: '#FFD700',
          opacity: 0.5,
        }} />

        <Image
          source={require('../../../assets/images/screens/explore/vault_animation.gif')}
          autoplay={running && placement.visible && !!vault}
          style={{ width: 70, height: 70 }}
          contentFit="contain"
        />
      </Placed>
    </Marker>
  );
}
