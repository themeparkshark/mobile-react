import { Image } from 'expo-image';
import { useContext } from 'react';
import { ImageBackground, Pressable, Text, View } from 'react-native';
import { AuthContext } from '../../context/AuthProvider';
import config from '../../config';
import useCrumbs from '../../hooks/useCrumbs';
import { ItemType } from '../../models/item-type';

export default function Item({
  item,
  onPurchase,
}: {
  readonly item: ItemType;
  readonly onPurchase?: (item: ItemType) => void;
}) {
  const { player } = useContext(AuthContext);
  const { labels } = useCrumbs();

  return (
    <>
    <Pressable
      onPress={async () => {
        if (!player) {
          return;
        }

        onPurchase?.(item);
      }}
      style={({ pressed }) => ({
        position: 'relative',
        width: '100%',
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {item.item_type.id === 8 && (
        <Image
          source={require('../../../assets/images/screens/store/pin_badge.png')}
          style={{
            width: 25,
            height: 25,
            zIndex: 10,
            position: 'absolute',
            top: -8,
            right: -8,
          }}
          contentFit="contain"
        />
      )}
      {item.is_clearance && (
        <View
          style={{
            backgroundColor: '#ef4444',
            borderRadius: 8,
            position: 'absolute',
            paddingHorizontal: 6,
            paddingVertical: 3,
            zIndex: 10,
            left: -4,
            top: -8,
            transform: [{ rotate: '-12deg' }],
            shadowColor: '#ef4444',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
          }}
        >
          <Text
            style={{
              color: 'white',
              fontFamily: 'Shark',
              textTransform: 'uppercase',
              fontSize: 10,
            }}
          >
            {labels.clearance}
          </Text>
        </View>
      )}
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: 16,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <View
          style={{
            padding: 10,
            backgroundColor: '#f8fafc',
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
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 8,
            paddingHorizontal: 6,
            borderTopWidth: 1,
            borderTopColor: '#f0f0f0',
          }}
        >
          <Image
            source={{
              uri: item.currency.icon_url,
            }}
            style={{
              width: 16,
              height: 16,
              marginRight: 4,
            }}
            contentFit="contain"
          />
          <Text
            style={{
              color: config.primary,
              fontFamily: 'Shark',
              fontSize: 14,
            }}
          >
            {item.cost}
          </Text>
        </View>
      </View>
    </Pressable>
    </>
  );
}
