import { Image } from 'expo-image';
import { useContext } from 'react';
import { ImageBackground, Pressable, Text, View } from 'react-native';
import { AuthContext } from '../../context/AuthProvider';
import useCrumbs from '../../hooks/useCrumbs';
import usePurchaseItem from '../../hooks/usePurchaseItem';
import { ItemType } from '../../models/item-type';

export default function Item({ item }: { readonly item: ItemType }) {
  const { player } = useContext(AuthContext);
  const { purchaseItem } = usePurchaseItem();
  const { labels } = useCrumbs();

  return (
    <Pressable
      onPress={async () => {
        if (!player) {
          return;
        }

        await purchaseItem(item);
      }}
      style={{
        position: 'relative',
        width: '100%',
      }}
    >
      {item.is_member_item && (
        <View
          style={{
            zIndex: 20,
            position: 'absolute',
            top: -12,
            right: -12,
          }}
        >
          <Image
            source={require('../../../assets/images/screens/profile/subscribed.png')}
            style={{
              width: 25,
              height: 25,
            }}
            contentFit="contain"
          />
        </View>
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
          width: '100%',
        }}
      >
        <ImageBackground
          source={require('../../../assets/images/screens/store/gradient.png')}
          resizeMode="cover"
          style={{
            borderRadius: 3,
            width: '100%',
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
              >
                <Image
                  source={item.paper_url}
                  style={{
                    aspectRatio: 1 / 0.8,
                  }}
                  contentFit="cover"
                />
              </ImageBackground>
            ) : (
              <Image
                source={item.icon_url}
                style={{
                  width: '100%',
                  aspectRatio: 1 / 0.8,
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
