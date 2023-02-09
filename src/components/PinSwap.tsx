import { faCircleCheck } from '@fortawesome/pro-light-svg-icons/faCircleCheck';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { FlashList } from '@shopify/flash-list';
import dayjs from 'dayjs';

import { useContext, useState } from 'react';

import Countdown, { zeroPad } from 'react-countdown';
import {
  Alert,
  Dimensions,
  Image,
  ImageBackground,
  Pressable,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { useAsyncEffect, useTimeoutWhen } from 'rooks';
import getInventory from '../api/endpoints/me/inventory';
import getPins from '../api/endpoints/me/pins';
import acceptPinSwap from '../api/endpoints/pin-swaps/accept';
import holdPinSwap from '../api/endpoints/pin-swaps/hold';

import unHoldPinSwap from '../api/endpoints/pin-swaps/unhold';

import { AuthContext } from '../context/AuthProvider';
import { ItemType } from '../models/item-type';
import { PinSwapType } from '../models/pin-swap-type';
import Button from './Button';
import Loading from './Loading';
import YellowButton from './YellowButton';

export default function PinSwap({
  pinSwap,
  onClose,
}: {
  readonly onClose: () => void;
  readonly pinSwap: PinSwapType;
}) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [heldTo, setHeldTo] = useState<string>('');
  const [items, setItems] = useState<ItemType[]>([]);
  const [page, setPage] = useState<number>(1);
  const [itemsLoading, setItemsLoading] = useState<boolean>(true);
  const [selectedPin, setSelectedPin] = useState<ItemType>();
  const { setInventory } = useContext(AuthContext);

  const requestItems = async (page: number) => {
    const response = await getPins(page);
    setItems((prevState) => {
      return [...prevState, ...response];
    });
    setItemsLoading(false);
  };

  useAsyncEffect(async () => {
    if (!modalVisible) {
      return;
    }

    await requestItems(page);
  }, [modalVisible]);

  const hold = async () => {
    try {
      const response = await holdPinSwap(pinSwap.id);
      setHeldTo(response.held_to);

      setModalVisible(true);
    } catch {
      Alert.alert('', 'Sorry, this pin is unavailable right now.', [
        {
          text: 'Ok',
          onPress: () => {
            setModalVisible(false);
            onClose();
          },
        },
      ]);
    }
  };

  useTimeoutWhen(
    () => {
      setModalVisible(false);
      onClose();
    },
    dayjs(heldTo).diff(dayjs()),
    modalVisible
  );

  return (
    <>
      <View
        style={{
          padding: 16,
        }}
      >
        <Button
          onPress={async () => {
            await hold();
          }}
        >
          <Image
            source={{
              uri: pinSwap.pin.item.icon_url,
            }}
            style={{
              width: '100%',
              height: 80,
            }}
            resizeMode="contain"
          />
        </Button>
      </View>
      <Modal
        animationIn="zoomIn"
        animationOut="zoomOut"
        isVisible={modalVisible}
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
            onPress={async () => {
              await unHoldPinSwap(pinSwap.id);
              setModalVisible(false);
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: '5%',
              right: '5%',
            }}
          >
            <Button
              onPress={async () => {
                await unHoldPinSwap(pinSwap.id);
                setModalVisible(false);
              }}
            >
              <Image
                source={require('../../assets/images/screens/pin-collections/close.png')}
                style={{
                  width: 30,
                  height: 30,
                }}
              />
            </Button>
          </View>
          <View
            style={{
              backgroundColor: 'white',
              width: Dimensions.get('window').width - 40,
              borderRadius: 20,
            }}
          >
            <View
              style={{
                padding: 32,
              }}
            >
              <Countdown
                date={Date.parse(heldTo)}
                renderer={({ minutes, seconds }) => {
                  return (
                    <Text
                      style={{
                        textAlign: 'center',
                        fontFamily: 'Knockout',
                        fontSize: 24,
                      }}
                    >
                      Your trade will expire in {minutes}:{zeroPad(seconds)}
                    </Text>
                  );
                }}
              />
              <Text
                style={{
                  paddingTop: 16,
                  fontSize: 24,
                  fontFamily: 'Knockout',
                  textAlign: 'center',
                }}
              >
                Please select a pin to trade for the {pinSwap.pin.item.name}.
              </Text>
            </View>
            <ImageBackground
              source={require('../../assets/images/shark_background.png')}
              resizeMode="cover"
              style={{
                width: '100%',
                height: 300,
              }}
            >
              <View style={{ padding: 8, flex: 1 }}>
                {itemsLoading && <Loading />}
                {!itemsLoading && (
                  <FlashList
                    data={items.filter(
                      (item) => item.id !== pinSwap.pin.item.id
                    )}
                    renderItem={({ item }) => (
                      <View
                        key={item.id}
                        style={{
                          padding: 8,
                          width: '100%',
                        }}
                      >
                        <Pressable
                          onPress={() => {
                            setSelectedPin(item);
                          }}
                          style={{
                            backgroundColor: 'lightblue',
                            borderWidth: 6,
                            borderColor: 'white',
                            borderRadius: 10,
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
                        >
                          <View
                            style={{
                              position: 'absolute',
                              display:
                                selectedPin?.id === item.id ? 'flex' : 'none',
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
                              borderRadius: 4,
                            }}
                          >
                            <FontAwesomeIcon
                              icon={faCircleCheck}
                              size={56}
                              color={'white'}
                            />
                          </View>
                          <View
                            style={{
                              padding: 12,
                            }}
                          >
                            <Image
                              source={{
                                uri: item.icon_url,
                              }}
                              style={{
                                aspectRatio: 1,
                              }}
                              resizeMode="contain"
                            />
                          </View>
                        </Pressable>
                      </View>
                    )}
                    numColumns={3}
                    estimatedItemSize={15}
                    keyExtractor={(item) => item.id.toString()}
                    onEndReached={() => {
                      setPage((prevState) => prevState + 1);
                    }}
                  />
                )}
              </View>
            </ImageBackground>
            <View
              style={{
                alignItems: 'center',
                padding: 32,
              }}
            >
              <YellowButton
                onPress={() => {
                  if (!selectedPin) {
                    Alert.alert('You must select a pin to trade.', '', [
                      {
                        text: 'Ok',
                      },
                    ]);

                    return;
                  }

                  Alert.alert('Are you sure you want to trade pins?', '', [
                    {
                      text: 'Cancel',
                      style: 'cancel',
                    },
                    {
                      text: 'Ok',
                      onPress: async () => {
                        if (!selectedPin) {
                          return;
                        }

                        await acceptPinSwap(pinSwap.id, selectedPin.id);

                        Alert.alert('You have successfully traded pins.', '', [
                          {
                            text: 'Ok',
                          },
                        ]);

                        setModalVisible(false);
                        onClose();
                        setInventory(await getInventory());
                      },
                    },
                  ]);
                }}
                text="Trade Pin"
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
