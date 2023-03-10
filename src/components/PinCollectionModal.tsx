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
import config from '../config';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { PinCollectionType } from '../models/pin-collection-type';
import Pin from './Pin';
import Ribbon from './Ribbon';
import Stars from './Stars';

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
                <Stars
                  size={20}
                  active={pinCollection.collected_pins_count}
                  total={pinCollection.pins.length}
                />
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
              width: Dimensions.get('window').width - 40,
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              margin: 'auto',
              position: 'relative',
              zIndex: 10,
              alignItems: 'center',
            }}
          >
            <Ribbon text={pinCollection.name} />
            <View
              style={{
                backgroundColor: '#0788e4',
                borderRadius: 16,
                marginTop: '-10%',
                width: '85%',
                zIndex: 10,
                paddingTop: 16,
                paddingLeft: 16,
                paddingRight: 16,
                paddingBottom: 8,
                shadowColor: '#000',
                shadowOffset: {
                  width: 2,
                  height: 2,
                },
                shadowRadius: 0,
                shadowOpacity: 0.4,
                borderColor: 'rgba(0, 0, 0, .4)',
                borderWidth: 2,
              }}
            >
              <View
                style={{
                  paddingTop: 32,
                  paddingBottom: 32,
                  paddingLeft: 16,
                  paddingRight: 16,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderColor: 'rgba(0, 0, 0, .6)',
                  borderLeftWidth: 2,
                  borderRightWidth: 2,
                  borderBottomWidth: 2,
                  borderBottomLeftRadius: 16,
                  borderBottomRightRadius: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                  }}
                >
                  {pinCollection.pins.map((pin) => (
                    <Pin key={pin.id} pin={pin} />
                  ))}
                </View>
                <View
                  style={{
                    width: '100%',
                    bottom: '16%',
                    position: 'absolute',
                  }}
                ></View>
              </View>
              <View
                style={{
                  padding: 16,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  flexDirection: 'row',
                  justifyContent: 'center',
                }}
              >
                <Stars
                  size={40}
                  active={pinCollection.collected_pins_count}
                  total={pinCollection.pins.length}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
