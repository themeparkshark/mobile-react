import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  Pressable,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import Tooltip from 'rn-tooltip';
import config from '../config';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { PinCollectionType } from '../models/pin-collection-type';
import Button from './Button';

export default function pinCollectionModal({
  pinCollection,
}: {
  readonly pinCollection: PinCollectionType;
}) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const { playSound } = useContext(SoundEffectContext);

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={{
          width: '100%',
          padding: 8,
        }}
      >
        <View
          style={{
            position: 'relative',
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
            <View
              style={{
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <ImageBackground
                source={
                  pinCollection.collected_pins_count ===
                  pinCollection.pins.length
                    ? require('../../assets/images/screens/pin-collections/yellow_gradiant.png')
                    : require('../../assets/images/screens/store/gradient.png')
                }
                resizeMode="cover"
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
                    source={pinCollection.pin.item.icon_url}
                    style={{
                      width: '100%',
                      height: 80,
                      marginLeft: 'auto',
                      marginRight: 'auto',
                    }}
                    contentFit="contain"
                  />
                </View>
              </ImageBackground>
              <View
                style={{
                  padding: 6,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  backgroundColor: config.secondary,
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
                          }}
                          contentFit="contain"
                        />
                      </View>
                    );
                  }
                )}
                {[
                  ...Array(
                    pinCollection.pins.length -
                      pinCollection.collected_pins_count
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
                        }}
                        contentFit="contain"
                      />
                    </View>
                  );
                })}
              </View>
              <View
                style={{
                  padding: 10,
                  backgroundColor: config.primary,
                }}
              >
                <Text
                  style={{
                    color: '#fff',
                    textAlign: 'center',
                    fontSize: 18,
                    textTransform: 'uppercase',
                    fontFamily: 'Knockout',
                  }}
                >
                  {pinCollection.name}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
      <Modal
        animationIn="zoomIn"
        animationOut="zoomOut"
        swipeDirection="down"
        onSwipeComplete={() => setModalVisible(false)}
        isVisible={modalVisible}
        onModalWillHide={() => {
          playSound(require('../../assets/sounds/modal_close.mp3'));
        }}
        hideModalContentWhileAnimating={true}
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
          />
          <View
            style={{
              position: 'absolute',
              bottom: '5%',
              right: '5%',
            }}
          >
            <Button onPress={() => setModalVisible(false)}>
              <Image
                source={require('../../assets/images/screens/pin-collections/close.png')}
                style={{
                  width: 30,
                  height: 30,
                }}
              />
            </Button>
          </View>
          <ImageBackground
            source={require('../../assets/images/redeem.png')}
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
            <View
              style={{
                top: 50,
                marginLeft: 'auto',
                marginRight: 'auto',
                width: '80%',
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  fontSize: 28,
                  alignSelf: 'center',
                  textTransform: 'uppercase',
                  fontFamily: 'Knockout',
                  color: 'white',
                  textShadowColor: 'rgba(0, 0, 0, .5)',
                  textShadowOffset: {
                    width: 2,
                    height: 2,
                  },
                  textShadowRadius: 0,
                }}
              >
                {pinCollection.name}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                top: 130,
                marginLeft: 'auto',
                marginRight: 'auto',
                width: '70%',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              {pinCollection.pins.map((pin) => {
                return (
                  <View
                    key={pin.item.id}
                    style={{
                      padding: 8,
                      width: '30%',
                    }}
                  >
                    <Tooltip
                      actionType="press"
                      height="auto"
                      popover={
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 20,
                          }}
                        >
                          {pin.item.name}
                        </Text>
                      }
                      withOverlay={false}
                      backgroundColor="white"
                      pointerColor="white"
                    >
                      <Image
                        source={pin.item.icon_url}
                        style={{
                          width: '100%',
                          height: 70,
                          opacity: pin.item.has_purchased ? 1 : 0.4,
                        }}
                        contentFit="contain"
                      />
                    </Tooltip>
                  </View>
                );
              })}
            </View>
            <View
              style={{
                width: '100%',
                bottom: '16%',
                position: 'absolute',
              }}
            >
              <View
                style={{
                  width: '70%',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  flexDirection: 'row',
                  justifyContent: 'center',
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
                            height: 40,
                          }}
                          contentFit="contain"
                        />
                      </View>
                    );
                  }
                )}
                {[
                  ...Array(
                    pinCollection.pins.length -
                      pinCollection.collected_pins_count
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
                          height: 40,
                        }}
                        contentFit="contain"
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          </ImageBackground>
        </View>
      </Modal>
    </>
  );
}
