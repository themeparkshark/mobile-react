import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import Countdown, { zeroPad } from 'react-countdown';
import {
  Alert,
  Dimensions,
  Image,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import {useAsyncEffect, useTimeoutWhen} from 'rooks';
import holdPinSwap from '../api/endpoints/pin-swaps/hold';
import { PinSwapType } from '../models/pin-swap-type';
import Button from './Button';
import YellowButton from './YellowButton';
import {ItemType} from '../models/item-type';
import getItems from '../api/endpoints/me/inventory/items';
import Item from './Item';
import {FlashList} from '@shopify/flash-list';
import Loading from './Loading';
import deleteUser from '../api/endpoints/me/delete';
import * as RootNavigation from '../RootNavigation';

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

  const requestItems = async (page: number) => {
    const response = await getItems(8, page);
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
    },
    dayjs(heldTo).diff(dayjs()),
    modalVisible
  );

  useTimeoutWhen(
    () => {
      setModalVisible(false);
    },
    Date.parse(heldTo),
    modalVisible
  );

  useEffect(() => {
    if (!modalVisible) {
      onClose();
    }
  }, [modalVisible]);

  return (
    <>
      <View
        style={{
          width: '100%',
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
        swipeDirection="down"
        onSwipeComplete={() => setModalVisible(false)}
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
          <View
            style={{
              backgroundColor: 'white',
              width: Dimensions.get('window').width - 40,
              padding: 32,
              borderRadius: 20,
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
            <View
              style={{
                height: 300,
                paddingTop: 32,
                paddingBottom: 32,
              }}
            >
              {itemsLoading && <Loading />}
              {!itemsLoading && (
                <FlashList
                  data={items.filter((item) => item.id !== pinSwap.pin.item.id)}
                  renderItem={({ item }) => (
                    <View>
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedPin(item);
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <View>
                          <Text>
                            {selectedPin?.id === item.id ? <Text>Checked</Text> : <Text>Unchecked</Text>}
                          </Text>
                        </View>
                        <View>
                          <Image
                            source={{
                              uri: item.icon_url,
                            }}
                            resizeMode="contain"
                            style={{
                              width: 50,
                              height: 50,
                            }}
                          />
                        </View>
                        <View>
                          <Text>{item.name}</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}
                  estimatedItemSize={15}
                  keyExtractor={(item) => item.id.toString()}
                  onEndReached={() => {
                    setPage((prevState) => prevState + 1);
                  }}
                />
              )}
            </View>
            <View style={{
              alignItems: 'center',
            }}>
              <YellowButton
                onPress={() => {
                  Alert.alert(
                    'Are you sure you want to trade pins?',
                    '',
                    [
                      {
                        text: 'Cancel',
                        style: 'cancel',
                      },
                      {
                        text: 'Ok',
                        onPress: async () => {

                        },
                      },
                    ]
                  );
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
