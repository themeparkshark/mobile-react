import { useState } from 'react';
import {
  Dimensions,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import theme from '../config/theme';
import { PinCollectionType } from '../models/pin-collection-type';

export default function pinCollectionModal({
  pinCollection,
}: {
  readonly pinCollection: PinCollectionType;
}) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={{
          width: '33.333333%',
        }}
      >
        <View
          style={{
            position: 'relative',
            marginTop: 16,
          }}
        >
          {pinCollection.collected_pins_count === pinCollection.pins.length && (
            <Image
              source={require('../../assets/images/screens/pin-collections/star.png')}
              style={{
                width: 30,
                height: 30,
                resizeMode: 'contain',
                position: 'absolute',
                zIndex: 10,
                right: -15,
                top: -15,
                transform: [
                  {
                    rotate: '25deg',
                  },
                ],
              }}
            />
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
              source={require('../../assets/images/screens/store/gradient.png')}
              resizeMode={'cover'}
              style={{
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  padding: 10,
                }}
              >
                <Image
                  source={{
                    uri: pinCollection.pin.item.paper_url,
                  }}
                  style={{
                    width: '100%',
                    height: 80,
                    resizeMode: 'contain',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                />
              </View>
            </ImageBackground>
            <View
              style={{
                padding: 6,
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                backgroundColor: theme.secondary,
              }}
            >
              {[...Array(pinCollection.collected_pins_count)].map(
                (element, index) => {
                  return (
                    <View
                      key={index}
                      style={{
                        paddingLeft: 1,
                        paddingRight: 1,
                        width: '20%',
                      }}
                    >
                      <Image
                        source={require('../../assets/images/screens/pin-collections/star.png')}
                        style={{
                          width: '100%',
                          height: 20,
                          resizeMode: 'contain',
                        }}
                      />
                    </View>
                  );
                }
              )}
              {[
                ...Array(
                  pinCollection.pins.length - pinCollection.collected_pins_count
                ),
              ].map((element, index) => {
                return (
                  <View
                    key={index}
                    style={{
                      paddingLeft: 1,
                      paddingRight: 1,
                      width: '20%',
                    }}
                  >
                    <Image
                      source={require('../../assets/images/screens/pin-collections/darkstar.png')}
                      style={{
                        width: '100%',
                        height: 20,
                        resizeMode: 'contain',
                      }}
                    />
                  </View>
                );
              })}
            </View>
            <View
              style={{
                padding: 10,
                backgroundColor: theme.primary,
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  textAlign: 'center',
                  fontSize: 18,
                  textTransform: 'uppercase',
                  fontFamily: 'Knockout',
                  textShadowColor: theme.primary,
                  textShadowRadius: 5,
                }}
              >
                {pinCollection.name}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Pressable
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
            }}
            onPress={() => setModalVisible(false)}
          >
            <View
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                alignSelf: 'center',
                backgroundColor: 'rgba(0, 0, 0, .7)',
              }}
            />
          </Pressable>
          <ImageBackground
            source={require('../../assets/images/screens/explore/redeem.png')}
            resizeMode="contain"
            style={{
              width: Dimensions.get('window').width - 40,
              height: 500,
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              margin: 'auto',
              position: 'relative',
              zIndex: 20,
            }}
          >
            <Text
              style={{
                position: 'absolute',
                top: 25,
                fontSize: 28,
                alignSelf: 'center',
                textTransform: 'uppercase',
              }}
            >
              {pinCollection.name}
            </Text>
          </ImageBackground>
        </View>
      </Modal>
    </>
  );
}
