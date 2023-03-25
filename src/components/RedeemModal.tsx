import dayjs from 'dayjs';
import Lottie from 'lottie-react-native';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, View } from 'react-native';
import Modal from 'react-native-modal';
import redeemCoin from '../api/endpoints/me/coins/redeem-coin';
import redeemItem from '../api/endpoints/me/items/redeem-item';
import completeSecretTask from '../api/endpoints/me/secret-tasks/complete-secret-task';
import completeTask from '../api/endpoints/me/tasks/complete-task';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import { CoinType } from '../models/coin-type';
import { ItemType } from '../models/item-type';
import { ParkType } from '../models/park-type';
import { RedeemableType } from '../models/redeemable-type';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import Box from './RedeemModal/Box';
import Ribbon from './Ribbon';
import WatchAd from './WatchAd';
import YellowButton from './YellowButton';

export default function RedeemModal({
  redeemable,
  park,
  onPress,
}: {
  readonly redeemable?: RedeemableType;
  readonly park: ParkType;
  readonly onPress: () => void;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const progress = useRef(new Animated.Value(0)).current;
  const animated = useRef(new Animated.Value(0)).current;
  const [doubleXP, setDoubleXP] = useState<boolean>(false);
  const [doubleCoins, setDoubleCoins] = useState<boolean>(false);

  const slideUp = () => {
    Animated.timing(animated, {
      toValue: -120,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };
  const slideDown = () => {
    Animated.timing(animated, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const backgrounds = {
    task: '#0788e4',
    coin: '#ffaa4a',
    item: '#b680e9',
    pin: '#b680e9',
    secret_task: '#023493',
  };

  useEffect(() => {
    if (modalVisible) {
      playSound(require('../../assets/sounds/redeem_modal_open.mp3'));

      Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: 2250,
          useNativeDriver: true,
        })
      ).start();
    } else {
      Animated.loop(
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [modalVisible]);

  useEffect(() => {
    const isActive =
      (redeemable?.type === 'coin' &&
        dayjs().isBetween(
          dayjs((redeemable?.model as CoinType).active_from),
          dayjs((redeemable?.model as CoinType).active_to)
        )) ||
      !!redeemable?.type;

    if (redeemable && isActive) {
      playSound(require('../../assets/sounds/in_redeem_zone.mp3'));
      slideUp();
    } else {
      slideDown();
    }
  }, [redeemable?.model.id]);

  return (
    <>
      <Animated.View
        style={{
          transform: [
            {
              translateY: animated,
            },
          ],
        }}
      >
        <YellowButton
          onPress={async () => {
            setModalVisible(true);
          }}
          text={'Redeem'}
        />
      </Animated.View>
      {redeemable && (
        <Modal
          animationIn="zoomIn"
          animationOut="zoomOut"
          swipeDirection="down"
          isVisible={modalVisible}
          onSwipeComplete={() => setModalVisible(false)}
          onModalWillHide={() => {
            playSound(require('../../assets/sounds/redeem_modal_close.mp3'));
          }}
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
              onPress={() => {
                playSound(
                  require('../../assets/sounds/redeem_modal_close.mp3')
                );
                setModalVisible(false);
              }}
            >
              <Lottie
                source={require('../../assets/animations/confetti.json')}
                progress={progress}
                style={{
                  position: 'absolute',
                  width: 900,
                  height: 400,
                  top: 15,
                  zIndex: 20,
                  left: -80,
                }}
              />
            </Pressable>
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
              <Ribbon text="Congratulations" />
              <View
                style={{
                  backgroundColor:
                    backgrounds[redeemable.type as keyof typeof backgrounds],
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
                    paddingTop: 16,
                    paddingBottom: 16,
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
                  <Box
                    background={require('../../assets/images/screens/explore/starburst.png')}
                    image={
                      {
                        task: {
                          uri: (redeemable.model as SecretTaskType | TaskType)
                            .coin_url,
                        },
                        secret_task: {
                          uri: (redeemable.model as SecretTaskType | TaskType)
                            .coin_url,
                        },
                        item: {
                          uri: (redeemable.model as ItemType).icon_url,
                        },
                        pin: {
                          uri: (redeemable.model as ItemType).icon_url,
                        },
                        coin: require('../../assets/images/screens/explore/coins.png'),
                      }[redeemable.type]
                    }
                    text={
                      {
                        task: (redeemable.model as SecretTaskType | TaskType)
                          .name,
                        secret_task: (
                          redeemable.model as SecretTaskType | TaskType
                        ).name,
                        coin: `${
                          (redeemable.model as CoinType).coins
                        } Shark Coins`,
                        item: (redeemable.model as ItemType).name,
                        pin: (redeemable.model as ItemType).name,
                      }[redeemable.type]
                    }
                    type={redeemable.type}
                    pulse
                  />
                  <View
                    style={{
                      marginLeft: -4,
                      marginRight: -4,
                      marginTop: 8,
                      flexDirection: 'row',
                      justifyContent: 'center',
                    }}
                  >
                    <View
                      style={{
                        width: '33.3333333%',
                        paddingLeft: 4,
                        paddingRight: 4,
                      }}
                    >
                      <Box
                        backgroundColor="#4cdcff"
                        image={require('../../assets/images/screens/explore/xp.png')}
                        text={
                          doubleXP
                            ? (redeemable.model as TaskType | SecretTaskType)
                                .experience * 2
                            : (redeemable.model as TaskType | SecretTaskType)
                                .experience
                        }
                        small
                        type={redeemable.type}
                      />
                      <View
                        style={{
                          marginTop: 8,
                        }}
                      >
                        <WatchAd onClose={() => setDoubleXP(true)} />
                      </View>
                    </View>
                    {redeemable.type !== 'coin' && (
                      <View
                        style={{
                          width: '33.3333333%',
                          paddingLeft: 4,
                          paddingRight: 4,
                        }}
                      >
                        <Box
                          backgroundColor="#4cdcff"
                          image={require('../../assets/images/screens/explore/coins.png')}
                          text={
                            doubleCoins
                              ? (redeemable.model as TaskType | SecretTaskType)
                                  .coins * 2
                              : (redeemable.model as TaskType | SecretTaskType)
                                  .coins
                          }
                          small
                          type={redeemable.type}
                        />
                        <View
                          style={{
                            marginTop: 8,
                          }}
                        >
                          <WatchAd onClose={() => setDoubleCoins(true)} />
                        </View>
                      </View>
                    )}
                    <View
                      style={{
                        width: '33.3333333%',
                        paddingLeft: 4,
                        paddingRight: 4,
                      }}
                    >
                      <Box
                        backgroundColor="#4cdcff"
                        image={{
                          uri: park.coin_url,
                        }}
                        text={1}
                        small
                        type={redeemable.type}
                      />
                    </View>
                  </View>
                </View>
                <View
                  style={{
                    marginTop: 8,
                  }}
                >
                  <YellowButton
                    text="Collect"
                    onPress={async () => {
                      if (redeemable.type === 'task') {
                        await completeTask(
                          redeemable.model as TaskType,
                          doubleXP,
                          doubleCoins
                        );
                      } else if (redeemable.type === 'secret_task') {
                        await completeSecretTask(
                          redeemable.model as SecretTaskType,
                          doubleXP,
                          doubleCoins
                        );
                      } else if (redeemable.type === 'coin') {
                        await redeemCoin(
                          redeemable.model as CoinType,
                          doubleXP
                        );
                      } else if (
                        redeemable.type === 'item' ||
                        redeemable.type === 'pin'
                      ) {
                        await redeemItem(
                          redeemable.model as ItemType,
                          doubleXP,
                          doubleCoins
                        );
                      }

                      onPress();
                      playSound(
                        require('../../assets/sounds/redeem_modal_close.mp3')
                      );
                      setModalVisible(false);
                    }}
                  />
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
