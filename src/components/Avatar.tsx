import { Image } from 'expo-image';
import { useContext } from 'react';
import { Text, View } from 'react-native';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { liveOutfitFor, outfitLayerUrls } from '../helpers/wardrobe';
import { PlayerType } from '../models/player-type';

export const DEFAULT_PORTRAIT = require('../../assets/images/screens/pin-collections/shark.png');

export default function Avatar({
  player,
  size = 'md',
  showLevel = false,
  showOnline = false,
}: {
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
  readonly player: PlayerType;
  readonly showLevel?: boolean;
  readonly showOnline?: boolean;
}) {
  const sizes = {
    sm: 50,
    md: 60,
    lg: 70,
    xl: 80,
  };

  const borderWidths = {
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4,
  };

  const s = sizes[size];
  const { player: signedInPlayer } = useContext(AuthContext);
  const inventory = liveOutfitFor(player, signedInPlayer);

  // Build layered avatar URL — use skin + eyes + items for live outfit
  // The circle container clips it so background is fine
  const hasSkin = inventory?.skin_item?.no_eye_url;

  return (
    <View
      style={{
        width: s,
        height: s,
        position: 'relative',
        marginLeft: size === 'md' ? 0 : 'auto',
        marginRight: size === 'md' ? 0 : 'auto',
      }}
    >
      {/* Online indicator */}
      {showOnline && (
        <View
          style={{
            width: s / 4.5,
            height: s / 4.5,
            borderRadius: 999,
            backgroundColor: '#22c55e',
            borderWidth: 2,
            borderColor: 'white',
            position: 'absolute',
            top: 2,
            left: 2,
            zIndex: 15,
          }}
        />
      )}
      {/* Level badge */}
      {showLevel && player.experience_level && (
        <View
          style={{
            position: 'absolute',
            bottom: -2,
            alignSelf: 'center',
            backgroundColor: config.secondary,
            borderRadius: 8,
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderWidth: 1.5,
            borderColor: 'white',
            zIndex: 15,
            minWidth: 22,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: size === 'sm' ? 8 : 10,
              color: 'white',
              textAlign: 'center',
            }}
          >
            {player.experience_level.level}
          </Text>
        </View>
      )}
      {!!player.verified_at && (
        <Image
          source={require('../../assets/images/screens/profile/verified.png')}
          style={{
            width: s / 4,
            height: s / 4,
            position: 'absolute',
            top: 0,
            right: 0,
            zIndex: 10,
          }}
          contentFit="cover"
        />
      )}
      {player.is_subscribed && (
        <Image
          source={require('../../assets/images/screens/profile/subscribed.png')}
          style={{
            width: s / 4,
            height: s / 4,
            position: 'absolute',
            bottom: 0,
            right: 0,
            zIndex: 10,
          }}
          contentFit="cover"
        />
      )}
      {inventory?.pin_item && (
        <Image
          source={{ uri: inventory.pin_item.icon_url }}
          style={{
            width: s / 4,
            height: s / 4,
            position: 'absolute',
            bottom: 0,
            left: 0,
            zIndex: 10,
          }}
          contentFit="contain"
        />
      )}
      <View
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: borderWidths[size] },
          shadowRadius: 0,
          shadowOpacity: 0.35,
        }}
      >
        <View
          style={{
            borderWidth: borderWidths[size],
            borderColor: config.lightBlue,
            overflow: 'hidden',
            borderRadius: 50,
            width: s,
            height: s,
          }}
        >
          {hasSkin ? (
            <View style={{ width: s * 1.2, height: s * 1.2, position: 'absolute', left: '-10%' }}>
              {/* Background */}
              {inventory?.background_item?.paper_url && (
                <Image source={{ uri: inventory.background_item.paper_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              )}
              {/* Skin */}
              <Image source={{ uri: inventory!.skin_item.no_eye_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              {/* Eyes */}
              <Image source={require('../../assets/images/screens/inventory/blink.png')} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              {/* Items */}
              {outfitLayerUrls(inventory).map((uri) => (
                <Image key={uri} source={{ uri }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              ))}
            </View>
          ) : (
            <Image
              // No outfit or photo yet: Dustin's TPS shark instead of an empty ring.
              source={player.avatar_url ? player.avatar_url : DEFAULT_PORTRAIT}
              placeholder={DEFAULT_PORTRAIT}
              contentFit="contain"
              style={{ width: s * 1.2, height: s * 1.2, position: 'absolute', left: '-10%' }}
            />
          )}
        </View>
      </View>
    </View>
  );
}
