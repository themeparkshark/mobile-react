import { Image } from 'expo-image';
import { View } from 'react-native';
import config from '../config';
import { PlayerType } from '../models/player-type';

export default function Avatar({
  player,
  size = 'md',
}: {
  readonly size?: 'sm' | 'md' | 'lg' | 'xl';
  readonly player: PlayerType;
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
  const inventory = player.inventory;

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
              {inventory.background_item?.paper_url && (
                <Image source={{ uri: inventory.background_item.paper_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              )}
              {/* Skin */}
              <Image source={{ uri: inventory.skin_item.no_eye_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              {/* Eyes */}
              <Image source={require('../../assets/images/screens/inventory/blink.png')} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              {/* Items */}
              {inventory.body_item?.paper_url && (
                <Image source={{ uri: inventory.body_item.paper_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              )}
              {inventory.face_item?.paper_url && (
                <Image source={{ uri: inventory.face_item.paper_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              )}
              {inventory.neck_item?.paper_url && (
                <Image source={{ uri: inventory.neck_item.paper_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              )}
              {inventory.hand_item?.paper_url && (
                <Image source={{ uri: inventory.hand_item.paper_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              )}
              {inventory.head_item?.paper_url && (
                <Image source={{ uri: inventory.head_item.paper_url }} style={{ width: '100%', height: '100%', position: 'absolute' }} contentFit="contain" />
              )}
            </View>
          ) : (
            <Image
              source={player.avatar_url}
              style={{ width: s * 1.2, height: s * 1.2, position: 'absolute', left: '-10%' }}
            />
          )}
        </View>
      </View>
    </View>
  );
}
