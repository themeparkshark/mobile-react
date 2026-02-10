import { Image } from 'expo-image';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';

/**
 * VaultMarker — 100% STATIC children inside <Marker>.
 * All animations stripped to prevent teleporting.
 */
export default function VaultMarker({
  vault,
}: {
  readonly vault: { id: number; latitude: string; longitude: string };
}) {
  return (
    <Marker
      coordinate={{
        latitude: Number(vault.latitude),
        longitude: Number(vault.longitude),
      }}
      tappable={false}
      flat={true}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View pointerEvents="none" style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
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
          style={{ width: 70, height: 70 }}
          contentFit="contain"
        />
      </View>
    </Marker>
  );
}
