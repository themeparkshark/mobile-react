import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, ImageURISource, Text, View } from 'react-native';
import Reanimated, { Easing as REasing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import useAmbientLoop from '../../power/useAmbientLoop';

/**
 * The coin's gentle pulse on the card (scale 1 to 1.05 and back, a second each way), on the UI thread (fix pass w5,
 * lane host). It was a react-native-animatable loop driven from JS: one setNativeProps per frame, and on this build
 * each one re-commits the whole screen through Reanimated's commit hook. With the coin card open the JS and UI threads
 * stayed busy, so a tap reached the app 3 to 12 s late (sampled on the simulator). It rests with Reduce Motion,
 * Battery Saver and an idle phone, like every ambient loop.
 */
export const BOX_PULSE_SCALE = 1.05;
export const BOX_PULSE_MS = 1000;

export default function Box({
  background,
  image,
  text,
  number,
  small,
  type,
  pulse,
}: {
  readonly backgroundColor?: string;
  readonly background?: ImageURISource;
  readonly image: ImageURISource;
  readonly number?: number;
  readonly text?: string | number;
  readonly small?: boolean;
  readonly type: string;
  readonly pulse?: boolean;
}) {
  const rotate = useRef(new Animated.Value(0)).current;
  const pulseScale = useSharedValue(1);
  useAmbientLoop(
    () => { pulseScale.value = withRepeat(withTiming(BOX_PULSE_SCALE, { duration: BOX_PULSE_MS, easing: REasing.inOut(REasing.quad) }), -1, true); },
    () => { cancelAnimation(pulseScale); pulseScale.value = 1; },
    !!pulse,
  );
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Bright cards with the navy cartoon outline (no purple, no muddy black strips).
  const backgrounds = {
    task: '#bfe5ff',
    coin: '#fff4cc',
    item: '#fff8e4',
    pin: '#fff8e4',
    secret_task: '#dff4ff',
  };

  const borders = {
    task: '#05346e',
    coin: '#05346e',
    item: '#05346e',
    pin: '#05346e',
    secret_task: '#05346e',
  };

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  return (
    <View
      style={{
        backgroundColor: backgrounds[type as keyof typeof backgrounds],
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: borders[type as keyof typeof borders],
        borderWidth: 3,
        shadowColor: '#05346e',
        shadowOffset: {
          width: 0,
          height: 3,
        },
        shadowOpacity: 0.3,
        shadowRadius: 0,
      }}
    >
      <View
        style={{
          width: '100%',
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          position: 'relative',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {pulse && (
          <Reanimated.View style={[{ justifyContent: 'center', padding: 16 }, pulseStyle]}>
            <Image
              source={image}
              style={{
                width: 120,
                height: 120,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
              contentFit="contain"
            />
          </Reanimated.View>
        )}
        {!pulse && (
          <View style={{ padding: 8 }}>
            <Image
              source={image}
              style={{
                width: '100%',
                aspectRatio: 1,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
              contentFit="contain"
            />
          </View>
        )}
        {number && (
          <View
            style={{
              top: 4,
              right: 4,
              position: 'absolute',
            }}
          >
            <Text
              style={{
                textShadowColor: '#05346e',
                textShadowOffset: {
                  width: 2,
                  height: 2,
                },
                textShadowRadius: 0,
                color: 'white',
                fontFamily: 'Knockout',
                fontSize: 28,
              }}
            >
              {number}
            </Text>
          </View>
        )}
        {background && (
          <Animated.Image
            source={background}
            style={{
              width: '100%',
              position: 'absolute',
              zIndex: -10,
              opacity: 0.04,
              transform: [
                {
                  rotate: spin,
                },
              ],
            }}
            resizeMode="contain"
          />
        )}
      </View>
      {text && (
        <View
          style={{
            backgroundColor: '#0768b9',
            borderBottomLeftRadius: 7,
            borderBottomRightRadius: 7,
            padding: 4,
            width: '100%',
          }}
        >
          <Text
            style={{
              color: 'white',
              textAlign: 'center',
              fontFamily: 'Shark',
              fontSize: small ? 18 : 22,
              textShadowColor: '#05346e',
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 0.1,
              paddingLeft: 8,
              paddingRight: 8,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
          >
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}
