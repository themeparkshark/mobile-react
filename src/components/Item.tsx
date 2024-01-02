import { faCircleCheck } from '@fortawesome/pro-light-svg-icons/faCircleCheck';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { Image } from 'expo-image';
import { useContext } from 'react';
import { Alert, ImageBackground, Pressable, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import updateInventory from '../api/endpoints/me/inventory/update-inventory';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import useCrumbs from '../hooks/useCrumbs';
import { ItemType } from '../models/item-type';
import config from "../config";

export default function Item({ item }: { readonly item: ItemType }) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const { warnings } = useCrumbs();

  return (
    <View
      style={{
        flex: 1,
        padding: 8,
        opacity: item.is_wearable ? 1 : 0.5,
      }}
    >
      <Pressable
        style={{
          backgroundColor: config.lightBlue,
          borderWidth: 3,
          borderColor: 'white',
          borderRadius: 12,
          alignSelf: 'center',
          shadowOffset: {
            width: 0,
            height: 3,
          },
          shadowOpacity: 0.4,
          shadowRadius: 0,
          position: 'relative',
          width: '100%',
        }}
        onPress={async () => {
          if (
            player?.inventory &&
            (player.inventory.skin_item.id === item.id ||
              player.inventory.background_item.id === item.id)
          ) {
            return false;
          }

          if (!item.is_wearable) {
            Alert.alert(warnings.must_be_a_member_to_wear_item, '', [
              {
                text: 'Cancel',
                style: 'cancel',
              },
              {
                text: 'Ok',
                onPress: async () => {
                  RootNavigation.navigate('Membership');
                },
              },
            ]);
            return;
          }

          playSound(require('../../assets/sounds/inventory_item_tap.mp3'));

          await updateInventory(item);
          await refreshPlayer();
        }}
      >
        {item.is_coin_code_item && (
          <View
            style={{
              zIndex: 20,
              position: 'absolute',
              top: -12,
              right: -12,
            }}
          >
            <Image
              source={require('../../assets/images/modals/brown_closed.png')}
              style={{
                width: 25,
                height: 25,
              }}
              contentFit="contain"
            />
          </View>
        )}
        <View
          style={{
            position: 'absolute',
            display: Object.values(player?.inventory)
              .map((inventoryItem) => inventoryItem?.id)
              .includes(item.id)
              ? 'flex'
              : 'none',
            backgroundColor: 'rgba(0, 0, 0, .6)',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            zIndex: 10,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
          }}
        >
          <FontAwesomeIcon icon={faCircleCheck} size={56} color={'white'} />
        </View>
        <View
          style={{
            padding: 12,
          }}
        >
          {item.item_type.id === 4 && (
            <ImageBackground
              source={require('../../assets/images/screens/inventory/shark.png')}
              style={{
                margin: -12,
              }}
            >
              <Image
                source={item.paper_url}
                style={{
                  aspectRatio: 1,
                }}
                contentFit="cover"
              />
            </ImageBackground>
          )}
          {item.item_type.id !== 4 && (
            <Image
              source={item.icon_url}
              style={{
                aspectRatio: 1,
              }}
              contentFit="contain"
            />
          )}
        </View>
      </Pressable>
    </View>
  );
}
