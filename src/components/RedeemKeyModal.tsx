import { Image } from 'expo-image';
import Lottie from 'lottie-react-native';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  Pressable,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import redeemKey from '../api/endpoints/me/keys/redeem-key';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import { KeyType } from '../models/key-type';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import WatchAd from './WatchAd';
import YellowButton from './YellowButton';

export default function RedeemKeyModal({
  open,
  close,
  redeemable,
  onPress,
}: {
  readonly close: () => void;
  readonly open?: boolean;
  readonly redeemable: CurrentRedeemableType;
  readonly onPress: () => void;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const progress = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const [doubleKey, setDoubleKey] = useState<boolean>(false);
  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    if (open) {
      playSound(require('../../assets/sounds/redeem_modal_open.mp3'));

      Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: 2250,
          useNativeDriver: true,
        })
      ).start();

      Animated.loop(
        Animated.timing(rotate, {
          toValue: 1,
          duration: 20000,
          easing: Easing.linear,
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
  }, [open]);

  if (!redeemable) {
    return <></>;
  }

  return (
    <Modal
      animationIn="zoomIn"
      animationOut="zoomOut"
      swipeDirection="down"
      isVisible={open}
      onSwipeComplete={() => close()}
      onModalWillHide={() => {
        playSound(require('../../assets/sounds/redeem_modal_close.mp3'));
        setDoubleKey(false);
      }}
      backdropOpacity={0.95}
      customBackdrop={
        <ImageBackground
          source={require('../../assets/images/screens/explore/gradient.png')}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.Image
            source={require('../../assets/images/screens/explore/starburst.png')}
            style={{
              width: '100%',
              height: 400,
              opacity: 0.04,
              transform: [
                {
                  rotate: spin,
                },
              ],
            }}
            resizeMode="contain"
          />
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
        </ImageBackground>
      }
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
            playSound(require('../../assets/sounds/redeem_modal_close.mp3'));
            close();
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
          <View
            style={{
              width: '80%',
            }}
          >
            <Text
              style={{
                fontFamily: 'Shark',
                textTransform: 'uppercase',
                fontSize: 42,
                color: 'white',
                textShadowColor: 'rgba(0, 0, 0, .5)',
                textShadowOffset: {
                  width: 1,
                  height: 1,
                },
                textShadowRadius: 0,
                textAlign: 'center',
                paddingBottom: 32,
              }}
            >
              {doubleKey ? '2 Shark Keys' : '1 Shark Key'}
            </Text>
            <Image
              source={require('../../assets/images/keys.png')}
              style={{
                width: '60%',
                aspectRatio: 1.23,
                marginLeft: 'auto',
                marginRight: 'auto',
                marginBottom: 32,
              }}
              contentFit="contain"
            />
            <YellowButton
              text="Collect"
              onPress={async () => {
                await redeemKey(redeemable.model as KeyType, doubleKey);

                onPress();
                playSound(
                  require('../../assets/sounds/redeem_modal_close.mp3')
                );
                close();
              }}
            />
            <View
              style={{
                width: '60%',
                marginLeft: 'auto',
                marginRight: 'auto',
                marginTop: 16,
              }}
            >
              <WatchAd onClose={() => setDoubleKey(true)} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
