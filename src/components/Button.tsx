import { ReactNode, useContext, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
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
  onPressSound?: any;
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
        playSound(
          onPressSound ?? require('../../assets/sounds/button_press.mp3')
        );
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
            width: 15,
            height: 15,
            backgroundColor: 'red',
            borderRadius: 8,
            position: 'absolute',
            borderColor: 'white',
            borderWidth: 2,
            right: 15,
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
