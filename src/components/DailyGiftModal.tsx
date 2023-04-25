import { useState } from 'react';
import {
  Dimensions,
  Image,
  ImageBackground,
  Pressable,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { useTimeoutWhen } from 'rooks';
import { DailyGiftType } from '../models/daily-gift-type';
import Button from './Button';
import Ribbon from './Ribbon';

function Chest({
  color,
  onPress,
}: {
  readonly color: 'blue' | 'red' | 'brown' | 'purple';
  readonly onPress: () => void;
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const closedImage = {
    blue: require('../../assets/images/modals/blue_closed.png'),
    red: require('../../assets/images/modals/red_closed.png'),
    brown: require('../../assets/images/modals/brown_closed.png'),
    purple: require('../../assets/images/modals/purple_closed.png'),
  }[color];

  const openedImage = {
    blue: require('../../assets/images/modals/blue_opened.png'),
    red: require('../../assets/images/modals/red_opened.png'),
    brown: require('../../assets/images/modals/brown_opened.png'),
    purple: require('../../assets/images/modals/purple_opened.png'),
  }[color];

  useTimeoutWhen(
    () => {
      onPress();
    },
    3000,
    isOpen
  );

  return (
    <Button
      onPress={() => {
        setIsOpen(true);
      }}
    >
      <ImageBackground
        source={require('../../assets/images/modals/box.png')}
        style={{
          aspectRatio: 1,
          position: 'relative',
          justifyContent: 'center',
        }}
        resizeMode="contain"
      >
        <Image
          source={isOpen ? openedImage : closedImage}
          resizeMode="contain"
          style={{
            height: 70,
            width: '100%',
          }}
        />
      </ImageBackground>
    </Button>
  );
}

export default function DailyGiftModal({
  dailyGift,
}: {
  readonly dailyGift: DailyGiftType;
}) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  useTimeoutWhen(
    () => {
      setModalVisible(true);
    },
    5000,
    !dailyGift.redeemed_at
  );

  const claimReward = async () => {
    setModalVisible(false);
  };

  return (
    <Modal animationIn="zoomIn" animationOut="zoomOut" isVisible={modalVisible}>
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
          onPress={() => {
            setModalVisible(false);
          }}
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
          <Ribbon text="Daily Reward" />
          <View
            style={{
              backgroundColor: '#0788e4',
              marginTop: '-10%',
              width: '85%',
              zIndex: 10,
              shadowColor: '#000',
              shadowOffset: {
                width: 2,
                height: 2,
              },
              shadowRadius: 0,
              shadowOpacity: 0.4,
              borderColor: 'rgba(0, 0, 0, .4)',
              borderWidth: 2,
              borderRadius: 16,
            }}
          >
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <ImageBackground
                source={require('../../assets/images/modals/daily_gift.png')}
                resizeMode="cover"
                style={{
                  width: '100%',
                }}
              >
                <View
                  style={{
                    paddingTop: 32,
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      paddingBottom: 8,
                      fontFamily: 'Shark',
                      color: 'white',
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      textShadowColor: 'rgba(0, 0, 0, .5)',
                      textShadowOffset: {
                        width: 1,
                        height: 1,
                      },
                      textShadowRadius: 0,
                    }}
                  >
                    Choose one of the rewards below!
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                    }}
                  >
                    <View
                      style={{
                        width: '50%',
                        padding: 8,
                      }}
                    >
                      <Chest color="red" onPress={() => claimReward()} />
                    </View>
                    <View
                      style={{
                        width: '50%',
                        padding: 8,
                      }}
                    >
                      <Chest color="blue" onPress={() => claimReward()} />
                    </View>
                    <View
                      style={{
                        width: '50%',
                        padding: 8,
                      }}
                    >
                      <Chest color="brown" onPress={() => claimReward()} />
                    </View>
                    <View
                      style={{
                        width: '50%',
                        padding: 8,
                      }}
                    >
                      <Chest color="purple" onPress={() => claimReward()} />
                    </View>
                  </View>
                </View>
              </ImageBackground>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
