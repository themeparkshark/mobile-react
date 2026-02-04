import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, View, Easing } from 'react-native';
import { Marker } from 'react-native-maps';

export default function VaultMarker({
  vault,
}: {
  readonly vault: { id: number; latitude: string; longitude: string };
}) {
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Mysterious glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.8, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    // Subtle breathing scale
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.03, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Occasional shake (like something wants out!)
    Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.timing(shakeAnim, { toValue: 3, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -3, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 3, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Marker
      coordinate={{
        latitude: Number(vault.latitude),
        longitude: Number(vault.longitude),
      }}
      tappable={false}
      flat={true}
      tracksViewChanges={true}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View pointerEvents="none" style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
        {/* Golden glow behind vault */}
        <Animated.View style={{
          position: 'absolute',
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: '#FFD700',
          opacity: glowAnim,
        }} />
        
        <Animated.View style={{
          transform: [
            { scale: scaleAnim },
            { translateX: shakeAnim },
          ],
        }}>
          <Image
            source={require('../../../assets/images/screens/explore/vault_animation.gif')}
            style={{ width: 70, height: 70 }}
            contentFit="contain"
          />
        </Animated.View>
      </View>
    </Marker>
  );
}
