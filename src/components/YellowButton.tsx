import { Animated, ImageBackground, Pressable, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { artButtonFontSize } from '../ui/artButtonText';

/** Set once the pill art has drawn anywhere: later buttons know it is in the image cache. */
let pillArtSeen = false;

export default function YellowButton({
  disabled = false,
  text,
  onPress,
  onArtReady,
}: {
  readonly disabled?: boolean;
  readonly text: string;
  readonly onPress?: () => void;
  /** The pill art has drawn: a caller can show the button, its label and anything under it together. */
  readonly onArtReady?: () => void;
}) {
  const animated = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedGameMotion();
  // Label size follows the button's height so every label on this button matches (was a fixed 72pt shrink-to-fit).
  const [labelAreaHeight, setLabelAreaHeight] = useState(0);
  // The label never draws on its own: it waits for the pill art, so a kid never sees words with no button.
  const [artReady, setArtReady] = useState(false);
  const readyRef = useRef(onArtReady); readyRef.current = onArtReady;
  const reported = useRef(false);
  const markArtReady = () => {
    if (reported.current) return;
    reported.current = true;
    pillArtSeen = true;
    setArtReady(true);
    readyRef.current?.();
  };
  // A safety: if the image never reports (an old cache), show the button anyway after a beat.
  useEffect(() => {
    const t = setTimeout(markArtReady, pillArtSeen ? 120 : 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
          onLoadEnd={markArtReady}
          style={{
            width: '100%',
            aspectRatio: 3.8,
            opacity: disabled ? 0.5 : 1,
          }}
          resizeMode="contain"
        >
          <View
            onLayout={event => setLabelAreaHeight(event.nativeEvent.layout.height)}
            style={{
              justifyContent: 'center',
              aspectRatio: 4.4,
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              maxFontSizeMultiplier={1.2}
              style={{
                opacity: labelAreaHeight > 0 && artReady ? 1 : 0,
                textAlign: 'center',
                fontSize: artButtonFontSize(labelAreaHeight),
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
