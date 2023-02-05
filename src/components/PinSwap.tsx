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
import { useTimeoutWhen } from 'rooks';
import holdPinSwap from '../api/endpoints/pin-swaps/hold';
import { PinSwapType } from '../models/pin-swap-type';
import Button from './Button';

export default function PinSwap({
  pinSwap,
  onClose,
}: {
  readonly onClose: () => void;
  readonly pinSwap: PinSwapType;
}) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [heldTo, setHeldTo] = useState<string>('');

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
              }}
            >
              Please select a pin to trade for the {pinSwap.pin.item.name}.
            </Text>
            <TouchableOpacity>
              <Text>Trade Pin button</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
