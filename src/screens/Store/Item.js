import { Alert, Image, ImageBackground, Pressable, Text, View } from 'react-native';
import coins from '../../../assets/images/coins.png';
import gradient from '../../../assets/images/screens/store/gradient.png';
import shark from '../../../assets/images/screens/inventory/shark.png';
import { AuthContext } from '../../context/AuthProvider';
import search from '../../api/endpoints/me/inventory/search';
import purchaseItem from '../../api/endpoints/me/inventory/purchase-item';
import { useContext } from 'react';

export default function Item({ item }) {
  const { user } = useContext(AuthContext);

  return (
    <Pressable
      onPress={async () => {
        const response = await search(item);

        if (response.has_purchased) {
          return Alert.alert(
            '',
            'You have already purchased this item.',
            [
              {
                text: 'Ok',
                style: 'cancel',
              },
            ]
          );
        }

        const text = item.cost === 0
          ? `You have found ${item.name}. Would you like to pick it up?`
          : `Would you like to buy ${item.name} for ${item.cost} coins? You currently have ${user.coins} coins.`;

        Alert.alert(
          '',
          text,
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Ok',
              onPress: async () => {
                const response = await purchaseItem(item);

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
              }
            },
          ]
        );
      }}
    >
      <View
        style={{
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 3,
          borderStyle: 'solid',
          shadowOffset: {
            width: 0,
            height: 3
          },
          shadowOpacity: .4,
          shadowRadius: 0,
        }}
      >
        <ImageBackground
          source={gradient}
          style={{
            width: 100,
            resizeMode: 'cover',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              padding: 10,
            }}
          >
            { item.item_type.name === 'Body item' ? (
              <ImageBackground
                source={shark}
                style={{
                  margin: -12,
                }}
              >
                <Image
                  source={{
                    uri: item.paper_url,
                  }}
                  style={{
                    aspectRatio: 1,
                    resizeMode: 'contain',
                  }}
                />
              </ImageBackground>
            ) : (
              <Image
                source={{
                  uri: item.icon_url,
                }}
                style={{
                  width: '100%',
                  height: 80,
                  resizeMode: 'contain',
                }}
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
              source={coins}
              style={{
                width: 15,
                height: 15,
                resizeMode: 'contain',
                marginRight: 8,
              }}
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
