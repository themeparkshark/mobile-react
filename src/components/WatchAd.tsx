import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import * as Animatable from 'react-native-animatable';
import RedButton from './RedButton';

// Expo Go compatible version - ads disabled
// Full version with ads is in git history (branch: master)

export default function WatchAd({ onClose }: { readonly onClose: () => void }) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // Simulate ad watch with countdown in Expo Go
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onClose]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
      }}
    >
      <Animatable.Text
        animation="pulse"
        iterationCount="infinite"
        style={{
          fontSize: 48,
          color: 'white',
          fontFamily: 'Shark',
          marginBottom: 20,
        }}
      >
        {countdown}
      </Animatable.Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Knockout' }}>
        [Ads disabled in test mode]
      </Text>
    </View>
  );
}
