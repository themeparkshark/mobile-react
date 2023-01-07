import { useContext, useEffect, useRef, useState } from 'react';
import * as Animatable from 'react-native-animatable';
import {
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  Pressable,
  View,
} from 'react-native';
import completeTask from '../api/endpoints/me/tasks/complete-task';
import Button from './Button';
import Lottie from 'lottie-react-native';
import { ParkType } from '../models/park-type';
import { RedeemableType } from '../models/redeemable-type';
import { TaskType } from '../models/task-type';
import redeemCoin from '../api/endpoints/me/coins/redeem-coin';
import { CoinType } from '../models/coin-type';
import YellowButton from './YellowButton';
import dayjs from 'dayjs';
import { SecretTaskType } from '../models/secret-task-type';
import completeSecretTask from '../api/endpoints/me/secret-tasks/complete-secret-task';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import { ItemType } from '../models/item-type';
import Box from './RedeemModal/Box';
import purchase from '../api/endpoints/me/inventory/purchase-item';
import Modal from 'react-native-modal';
import redeemItem from '../api/endpoints/me/items/redeem-item';

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
  const slideUp = () => {
    Animated.timing(animated, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };
  const slideDown = () => {
    Animated.timing(animated, {
      toValue: 120,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const backgrounds = {
    task: require('../../assets/images/screens/explore/redeem.png'),
    coin: require('../../assets/images/screens/explore/redeem_coin.png'),
    item: require('../../assets/images/screens/explore/redeem_item.png'),
    pin: require('../../assets/images/screens/explore/redeem_item.png'),
    secret_task: require('../../assets/images/screens/explore/redeem_secret_task.png'),
  }

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
    const isCoin =
      redeemable?.type === 'coin' &&
      dayjs().isBetween(
        dayjs((redeemable?.model as CoinType).active_from),
        dayjs((redeemable?.model as CoinType).active_to)
      );
    const isItem = redeemable?.type === 'item';
    const isPin = redeemable?.type === 'pin';
    const isTask = redeemable?.type === 'task';
    const isSecretTask = redeemable?.type === 'secret_task';

    if (redeemable && (isCoin || isItem || isTask || isSecretTask || isPin)) {
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
            <ImageBackground
              source={backgrounds[redeemable.type as keyof typeof backgrounds]}
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
                  width: Dimensions.get('window').width - 170,
                  height: 150,
                  marginTop: 95,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                <Box
                  background={require('../../assets/images/screens/explore/starburst.png')}
                  image={{
                    task: {
                      uri: (redeemable.model as SecretTaskType | TaskType)
                        .coin_url
                    },
                    secret_task: {
                      uri: (redeemable.model as SecretTaskType | TaskType)
                        .coin_url
                    },
                    item: {
                      uri: (redeemable.model as ItemType).icon_url,
                    },
                    pin: {
                      uri: (redeemable.model as ItemType).icon_url,
                    },
                    coin: require('../../assets/images/screens/explore/coins.png'),
                  }[redeemable.type]}
                  text={{
                    task: (redeemable.model as SecretTaskType | TaskType).name,
                    secret_task: (redeemable.model as SecretTaskType | TaskType).name,
                    coin: `${(redeemable.model as CoinType).coins} Shark Coins`,
                  }[redeemable.type]}
                  type={redeemable.type}
                />
              </View>
              <View
                style={{
                  width: Dimensions.get('window').width - 180,
                  height: 105,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  marginTop: 8,
                  flexDirection: 'row',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: '33.3333333%',
                  }}
                >
                  <Box
                    backgroundColor="#4cdcff"
                    image={require('../../assets/images/screens/explore/xp.png')}
                    text={
                      (redeemable.model as TaskType | SecretTaskType).experience
                    }
                    small
                    type={redeemable.type}
                  />
                  <View
                    style={{
                      marginTop: 8,
                    }}
                  >
                    <Animatable.View animation="pulse" iterationCount="infinite" direction="alternate">
                      <Button>
                        <Image
                          source={require('../../assets/images/screens/explore/watch.png')}
                          style={{
                            width: '100%',
                            height: 20,
                            resizeMode: 'contain',
                          }}
                        />
                      </Button>
                    </Animatable.View>
                  </View>
                </View>
                {redeemable.type !== 'coin' && (
                  <View
                    style={{
                      width: '33.3333333%',
                      marginLeft: 5,
                    }}
                  >
                    <Box
                      backgroundColor="#4cdcff"
                      image={require('../../assets/images/screens/explore/coins.png')}
                      text={(redeemable.model as TaskType | SecretTaskType).coins}
                      small
                      type={redeemable.type}
                    />
                    <View
                      style={{
                        marginTop: 8,
                      }}
                    >
                      <Animatable.View animation="pulse" iterationCount="infinite" direction="alternate">
                        <Button>
                          <Image
                            source={require('../../assets/images/screens/explore/watch.png')}
                            style={{
                              width: '100%',
                              height: 20,
                              resizeMode: 'contain',
                            }}
                          />
                        </Button>
                      </Animatable.View>
                    </View>
                  </View>
                )}
                <View
                  style={{
                    width: '33.3333333%',
                    marginLeft: 5,
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
              <View
                style={{
                  position: 'absolute',
                  bottom: 30,
                  alignSelf: 'center',
                }}
              >
                <Button
                  onPress={async () => {
                    if (redeemable.type === 'task') {
                      await completeTask(redeemable.model as TaskType);
                    } else if (redeemable.type === 'secret_task') {
                      await completeSecretTask(
                        redeemable.model as SecretTaskType
                      );
                    } else if (redeemable.type === 'coin') {
                      await redeemCoin(redeemable.model as CoinType);
                    } else if (redeemable.type === 'item' || redeemable.type === 'pin') {
                      await redeemItem(redeemable.model as ItemType)
                    }

                    onPress();
                    playSound(
                      require('../../assets/sounds/redeem_modal_close.mp3')
                    );
                    setModalVisible(false);
                  }}
                >
                  <Image
                    source={require('../../assets/images/screens/explore/collect.png')}
                    style={{
                      width: 280,
                      height: 73,
                      resizeMode: 'contain',
                    }}
                  />
                </Button>
              </View>
            </ImageBackground>
          </View>
        </Modal>
      )}
    </>
  );
}
