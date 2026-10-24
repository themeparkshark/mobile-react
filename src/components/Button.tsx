import { Image } from 'expo-image';
import { ReactNode, useContext, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { usePressScale } from '../ui/PressableScale';
import type { HapticIntent } from '../gamekit/Haptics';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';

export default function Button({
  children,
  hasPermission = true,
  onPress,
  onPressSound,
  showRedCircle,
  accessibilityLabel,
  pressHaptic = 'tapLight',
}: {
  children: ReactNode;
  hasPermission?: boolean;
  onPress: () => void;
  onPressSound?: any;
  showRedCircle?: boolean;
  accessibilityLabel?: string;
  /** The touch-down haptic (the footer tabs use a selection tick). */
  pressHaptic?: HapticIntent | false;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  // The shared squishy press (src/ui/PressableScale): squash, sink, spring back, a light haptic on touch-down.
  const press = usePressScale({ haptic: pressHaptic });
  const [hasPressed, setHasPressed] = useState<boolean>(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={async () => {
        if (hasPressed) {
          return;
        }

        setHasPressed(true);
        playSound(
          onPressSound ?? require('../../assets/sounds/button_press.mp3')
        );
        await onPress();
        setHasPressed(false);
      }}
      onPressIn={press.pressIn}
      onPressOut={press.pressOut}
    >
      <View
        style={{
          position: 'relative',
        }}
      >
        {!hasPermission && (
          <Image
            source={require('../../assets/images/locked.png')}
            contentFit="contain"
            style={{
              width: 20,
              height: 20,
              position: 'absolute',
              bottom: 0,
              right: 0,
              zIndex: 10,
            }}
          />
        )}
        {showRedCircle && (
          <View
            style={{
              width: 12,
              height: 12,
              backgroundColor: 'red',
              borderRadius: 8,
              position: 'absolute',
              borderColor: 'white',
              borderWidth: 2,
              right: 0,
              zIndex: 10,
              shadowColor: '#000',
              shadowOffset: {
                width: 1,
                height: 1,
              },
              shadowRadius: 0,
              shadowOpacity: 0.4,
            }}
          />
        )}
        <Animated.View style={press.style}>
          {children}
        </Animated.View>
      </View>
    </Pressable>
  );
}
