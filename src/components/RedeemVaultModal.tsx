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
import { vsprintf } from 'sprintf-js';
import redeemVault from '../api/endpoints/me/vaults/redeem-vault';
import { AuthContext } from '../context/AuthProvider';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import useCrumbs from '../hooks/useCrumbs';
import { RedeemableType } from '../models/redeemable-type';
import { VaultType } from '../models/vault-type';
import YellowButton from './YellowButton';

export default function RedeemVaultModal({
  open,
  close,
  redeemable,
  onPress,
}: {
  readonly close: () => void;
  readonly open?: boolean;
  readonly redeemable: RedeemableType;
  readonly onPress: () => void;
}) {
  const { labels } = useCrumbs();
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const progress = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const { user } = useContext(AuthContext);
  const [isOpen, setIsOpen] = useState<boolean>(false);

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

  if (!redeemable || !user) {
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
          position: 'relative',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={require('../../assets/images/screens/pin-collections/close.png')}
          style={{
            width: 50,
            height: 53,
            position: 'absolute',
            bottom: 0,
          }}
          contentFit="contain"
        />
        <Pressable
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
          }}
          onPress={async () => {
            playSound(require('../../assets/sounds/redeem_modal_close.mp3'));

            if (isOpen) {
              await redeemVault(redeemable.model as VaultType);
              onPress();
            }

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
              {vsprintf(labels.vault_cost, [
                (redeemable.model as VaultType).item.cost,
              ])}
            </Text>
            {isOpen ? (
              <ImageBackground
                source={require('../../assets/images/screens/explore/vault_opened.png')}
                style={{
                  maxWidth: 400,
                  aspectRatio: 1,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  marginBottom: 32,
                  justifyContent: 'center',
                }}
                resizeMode="contain"
              >
                <Image
                  source={(redeemable.model as VaultType).item.icon_url}
                  style={{
                    width: 75,
                    height: 75,
                    marginLeft: 40,
                  }}
                />
              </ImageBackground>
            ) : (
              <ImageBackground
                source={require('../../assets/images/screens/explore/vault_closed.png')}
                style={{
                  maxWidth: 400,
                  aspectRatio: 1,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  marginBottom: 32,
                }}
                resizeMode="contain"
              />
            )}
            <YellowButton
              disabled={
                (redeemable.model as VaultType).item.cost > user.keys || isOpen
              }
              text="Unlock"
              onPress={async () => {
                setIsOpen(true);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
