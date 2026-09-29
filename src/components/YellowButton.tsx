import { Animated, ImageBackground, Pressable, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
import useReducedGameMotion from '../hooks/useReducedGameMotion';

export default function YellowButton({
  disabled = false,
  text,
  onPress,
}: {
  readonly disabled?: boolean;
  readonly text: string;
  readonly onPress?: () => void;
}) {
  const animated = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedGameMotion();
  useEffect(() => {
    if (disabled || reducedMotion) { animated.stopAnimation(); animated.setValue(1); }
    return () => animated.stopAnimation();
  }, [animated, disabled, reducedMotion]);
  const zoomOut = () => {
    if (disabled || reducedMotion) {
      return;
    }

    Animated.timing(animated, {
      toValue: 0.97,
      duration: 65,
      useNativeDriver: true,
    }).start();
  };
  const zoomIn = () => {
    if (disabled || reducedMotion) {
      return;
    }

    Animated.timing(animated, {
      toValue: 1,
      duration: 95,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (disabled) {
          return;
        }

        onPress?.();
      }}
      onPressIn={zoomOut}
      onPressOut={zoomIn}
    >
      <Animated.View
        style={{
          transform: [
            {
              scale: animated,
            },
          ],
        }}
      >
        <ImageBackground
          source={require('../../assets/images/yellow_button.png')}
          style={{
            width: '100%',
            aspectRatio: 3.8,
            opacity: disabled ? 0.5 : 1,
          }}
          resizeMode="contain"
        >
          <View
            style={{
              justifyContent: 'center',
              aspectRatio: 4.4,
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              style={{
                textAlign: 'center',
                fontSize: 72,
                color: 'white',
                fontFamily: 'Shark',
                textTransform: 'uppercase',
                textShadowColor: 'rgba(0, 0, 0, .5)',
                textShadowOffset: {
                  width: 1,
                  height: 1,
                },
                textShadowRadius: 0,
                paddingTop: 4,
                paddingBottom: 4,
                paddingLeft: 24,
                paddingRight: 24,
              }}
            >
              {text}
            </Text>
          </View>
        </ImageBackground>
      </Animated.View>
    </Pressable>
  );
}
