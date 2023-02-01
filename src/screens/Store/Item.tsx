import { Image } from 'expo-image';
import { useContext } from 'react';
import { Alert, ImageBackground, Pressable, Text, View } from 'react-native';
import purchase from '../../api/endpoints/me/inventory/purchase-item';
import search from '../../api/endpoints/me/inventory/search';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { ItemType } from '../../models/item-type';

export default function Item({ item }: { readonly item: ItemType }) {
  const { user, refreshUser } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);

  return (
    <Pressable
      onPress={async () => {
        if (!user) {
          return;
        }

        const response = await search(item);

        if (response.has_purchased) {
          playSound(require('../../../assets/sounds/purchase_item_cancel.mp3'));

          return Alert.alert(
            '',
            `You have already ${
              item.cost === 0 ? 'redeemed' : 'purchased'
            } this item.`,
            [
              {
                text: 'Ok',
                style: 'cancel',
              },
            ]
          );
        }

        if (user.coins < item.cost) {
          playSound(require('../../../assets/sounds/purchase_item_cancel.mp3'));

          return Alert.alert('', 'You need more coins.', [
            {
              text: 'Ok',
              style: 'cancel',
            },
          ]);
        }

        const text =
          item.cost === 0
            ? `You have found a ${item.name}. Would you like to pick it up?`
            : `Would you like to buy the ${item.name} for ${item.cost} coins? You currently have ${user.coins} coins.`;

        playSound(require('../../../assets/sounds/purchase_item_prompt.mp3'));

        Alert.alert('', text, [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: async () => {
              playSound(
                require('../../../assets/sounds/purchase_item_cancel.mp3')
              );
            },
          },
          {
            text: 'Ok',
            onPress: async () => {
              const response = await purchase(item);
              await refreshUser();

              playSound(
                require('../../../assets/sounds/purchase_item_success.mp3')
              );

              Alert.alert(
                '',
                `${response.name} has been added to your inventory.`,
                [
                  {
                    text: 'Ok',
                    style: 'cancel',
                  },
                ]
              );
            },
          },
        ]);
      }}
    >
      <View
        style={{
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 3,
          shadowOffset: {
            width: 0,
            height: 3,
          },
          shadowOpacity: 0.4,
          shadowRadius: 0,
        }}
      >
        <ImageBackground
          source={require('../../../assets/images/screens/store/gradient.png')}
          resizeMode="cover"
          style={{
            borderRadius: 3,
            width: 100,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              padding: 10,
            }}
          >
            {item.item_type.name === 'Body item' ? (
              <ImageBackground
                source={require('../../../assets/images/screens/inventory/shark.png')}
                style={{
                  margin: -12,
                }}
              >
                <Image
                  source={item.paper_url}
                  style={{
                    aspectRatio: 1,
                  }}
                  contentFit="contain"
                />
              </ImageBackground>
            ) : (
              <Image
                source={item.icon_url}
                style={{
                  width: '100%',
                  height: 80,
                }}
                contentFit="contain"
              />
            )}
          </View>
          <View
            style={{
              backgroundColor: 'rgba(0, 0, 0, .5)',
              paddingLeft: 8,
              paddingRight: 8,
              paddingTop: 4,
              paddingBottom: 4,
              flexDirection: 'row',
              justifyContent: 'center',
            }}
          >
            <Image
              source={require('../../../assets/images/coins.png')}
              style={{
                width: 15,
                height: 15,
                marginRight: 8,
              }}
              contentFit="contain"
            />
            <Text
              style={{
                textAlign: 'center',
                color: '#fff',
                fontFamily: 'Knockout',
                fontSize: 16,
              }}
            >
              {item.cost}
            </Text>
          </View>
        </ImageBackground>
      </View>
    </Pressable>
  );
}
