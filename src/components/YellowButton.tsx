import { ImageBackground, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import Animated from 'react-native-reanimated';
import { artButtonFontSize } from '../ui/artButtonText';
import { usePressScale } from '../ui/PressableScale';

/** The label area's width / height inside the button art. */
const LABEL_AREA_ASPECT = 4.4;

export default function YellowButton({
  disabled = false,
  text,
  onPress,
  estimatedWidth,
}: {
  readonly disabled?: boolean;
  readonly text: string;
  readonly onPress?: () => void;
  /**
   * The button's width when the caller knows it up front. The label then shows on the very first
   * frame (sized from width / 4.4) instead of waiting for a layout pass, which a busy JS thread can
   * hold back for a second (a blank yellow slab on the level-up success card). Layout still refines it.
   */
  readonly estimatedWidth?: number;
}) {
  // The shared squishy press (src/ui/PressableScale): squash, sink, spring back, a light haptic on touch-down.
  const press = usePressScale({ disabled });
  // Label size follows the button's height so every label on this button matches (was a fixed 72pt shrink-to-fit).
  const [labelAreaHeight, setLabelAreaHeight] = useState(() =>
    estimatedWidth && estimatedWidth > 0 ? estimatedWidth / LABEL_AREA_ASPECT : 0);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled }}
      onPress={() => {
        if (disabled) {
          // A greyed-out button says no with a little shake (no haptic, nothing fires).
          press.rejected();
          return;
        }

        onPress?.();
      }}
      onPressIn={press.pressIn}
      onPressOut={press.pressOut}
    >
      <Animated.View style={press.style}>
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
                opacity: labelAreaHeight > 0 ? 1 : 0,
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
