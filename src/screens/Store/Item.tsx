import { ImageBackground, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import purchaseItem from '../../helpers/purchase-item';
import { AuthContext } from '../../context/AuthProvider';
import { useContext } from 'react';

export default function Item({ item }) {
  const { user, refreshUser } = useContext(AuthContext);

  return (
    <Pressable
      onPress={async () => {
        await purchaseItem(item, {
          user,
          refreshUser,
        });
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
