import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ReactElement, ReactNode, useContext, useRef, useState } from 'react';
import { Animated, Dimensions, ImageBackground, Pressable, SafeAreaView, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import { ThemeContext } from '../context/ThemeProvider';
import { SoundEffectContext, SoundEffectContextType } from '../context/SoundEffectProvider';
import Broadcasts from './Broadcasts';

const BACK_SOUND = require('../../assets/sounds/button_press.mp3');

export function BackButton({ onPress }: { readonly onPress?: () => void }) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const [hasPressed, setHasPressed] = useState(false);

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: 0.82,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 200,
      useNativeDriver: true,
    }).start();

    // Quick wiggle rotation
    Animated.sequence([
      Animated.timing(rotate, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(rotate, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(rotate, { toValue: -0.5, duration: 50, useNativeDriver: true }),
      Animated.timing(rotate, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = async () => {
    if (hasPressed) return;
    setHasPressed(true);
    playSound(BACK_SOUND);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) await onPress();
    RootNavigation.goBack();
    setHasPressed(false);
  };

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-8deg', '8deg'],
  });

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={{
          transform: [
            { scale },
            { rotate: rotateInterpolate },
          ],
        }}
      >
        <Image
          source={require('../../assets/images/screens/explore/back.png')}
          style={{
            width: 35,
            height: 35,
          }}
          contentFit="contain"
        />
      </Animated.View>
    </Pressable>
  );
}

export default function Topbar({
  children,
  purple = false,
}: {
  readonly children: ReactElement[];
  readonly informationModalId?: number | null;
  readonly rightButton?: ReactNode | null;
  readonly leftButton?: ReactNode | null;
  readonly text?: string | null;
  readonly purple?: boolean;
  readonly showBackButton?: boolean;
  readonly showCurrencies?: boolean;
  readonly parkCoin?: string | null;
  readonly parkCoins?: number | null;
}) {
  const { theme } = useContext(ThemeContext);

  return (
    <View
      style={{
        width: Dimensions.get('window').width,
        zIndex: 20,
        position: 'relative',
      }}
    >
      <SafeAreaView
        style={{
          marginTop: Constants.statusBarHeight,
          position: 'absolute',
        }}
      >
        <Broadcasts />
      </SafeAreaView>
      <ImageBackground
        source={
          purple
            ? require('../../assets/images/screens/store/purple_topbar.png')
            : { url: theme?.top_bar_url }
        }
        resizeMode="cover"
        style={{
          height: 70 + Constants.statusBarHeight,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <SafeAreaView>
          <View
            style={{
              paddingLeft: 12,
              paddingRight: 12,
              flexDirection: 'row',
              alignItems: 'center',
              width: Dimensions.get('window').width,
              height: 80,
              columnGap: 8,
            }}
          >
            {children}
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}
