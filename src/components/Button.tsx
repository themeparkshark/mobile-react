import { Animated, Pressable, View } from 'react-native';
import { ReactNode, useContext, useState } from 'react';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';

export default function Button({
  children,
  onPress,
  onPressSound,
  showRedCircle,
}: {
  children: ReactNode;
  onPress: () => void;
  onPressSound: any;
  showRedCircle?: boolean;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const animated = new Animated.Value(1);
  const [hasPressed, setHasPressed] = useState<boolean>(false);
  const zoomOut = () => {
    Animated.timing(animated, {
      toValue: 0.95,
      duration: 25,
      useNativeDriver: true,
    }).start();
  };
  const zoomIn = () => {
    Animated.timing(animated, {
      toValue: 1,
      duration: 25,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={async () => {
        if (hasPressed) {
          return;
        }

        setHasPressed(true);
        playSound(onPressSound ?? require('../../assets/sounds/button-press.mp3'));
        await onPress();
        setHasPressed(false);
      }}
      onPressIn={zoomOut}
      onPressOut={zoomIn}
      style={{
        position: 'relative',
      }}
    >
      {showRedCircle && (
        <View
          style={{
            width: 10,
            height: 10,
            backgroundColor: 'red',
            borderRadius: 5,
            position: 'absolute',
            right: 10,
            zIndex: 10,
          }}
        />
      )}
      <Animated.View
        style={{
          transform: [
            {
              scale: animated,
            },
          ],
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
