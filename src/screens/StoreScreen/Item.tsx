import { Image } from 'expo-image';
import { useContext } from 'react';
import { Alert, ImageBackground, Pressable, Text, View } from 'react-native';
import { AuthContext } from '../../context/AuthProvider';
import useCrumbs from '../../hooks/useCrumbs';
import usePurchaseItem from '../../hooks/usePurchaseItem';
import { ItemType } from '../../models/item-type';
import { SoundEffectContext } from "../../context/SoundEffectProvider";
import { vsprintf } from 'sprintf-js';

export default function Item({ item }: { readonly item: ItemType }) {
  const { user } = useContext(AuthContext);
  const { purchaseItem } = usePurchaseItem();
  const { errors, labels } = useCrumbs();
  const { playSound } = useContext(SoundEffectContext);

  return (
    <Pressable
      onPress={async () => {
        if (item.has_purchased) {
          playSound(require('../../../assets/sounds/purchase_item_cancel.mp3'));

          return Alert.alert(
            item.cost
              ? vsprintf(errors.item_purchased, [item.name])
              : vsprintf(errors.item_redeemed, [item.name]),
            '',
            [
              {
                text: 'Ok',
              },
            ]
          );
        }

        await purchaseItem(item);
      }}
      style={{
        position: 'relative',
      }}
    >
      {item.item_type.id === 8 && (
        <Image
          source={require('../../../assets/images/screens/store/pin_badge.png')}
          style={{
            width: 25,
            height: 25,
            zIndex: 10,
            position: 'absolute',
            top: -10,
            right: -10,
          }}
          contentFit="contain"
        />
      )}
      {item.is_clearance && (
        <View
          style={{
            backgroundColor: 'red',
            borderColor: 'white',
            borderWidth: 3,
            borderRadius: 12,
            position: 'absolute',
            padding: 4,
            zIndex: 10,
            left: '-5%',
            top: -10,
            transform: [
              {
                rotate: '-15deg',
              },
            ],
            shadowOffset: {
              width: 0,
              height: 3,
            },
            shadowOpacity: 0.4,
            shadowRadius: 0,
          }}
        >
          <Text
            style={{
              color: 'white',
              fontFamily: 'Shark',
              textTransform: 'uppercase',
            }}
          >
            {labels.clearance}
          </Text>
        </View>
      )}
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
              source={{
                uri: item.currency.icon_url,
              }}
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
