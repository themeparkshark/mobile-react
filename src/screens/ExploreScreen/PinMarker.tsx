import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Marker } from 'react-native-maps';

export default function PinMarker({
  item,
}: {
  readonly item: { id: number; latitude: number; longitude: number };
}) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Playful bounce
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -6, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 400, easing: Easing.bounce, useNativeDriver: true }),
        Animated.delay(200),
      ])
    ).start();

    // Subtle wiggle
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, { toValue: 5, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: -5, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(1000),
      ])
    ).start();
  }, []);

  return (
    <Marker
      coordinate={{
        latitude: item.latitude,
        longitude: item.longitude,
      }}
      tappable={false}
      flat={true}
      tracksViewChanges={true}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View pointerEvents="none">
        <Animated.View style={{
          transform: [
            { translateY: bounceAnim },
            { rotate: rotateAnim.interpolate({
              inputRange: [-5, 5],
              outputRange: ['-5deg', '5deg'],
            })},
          ],
        }}>
          <Image
            source={require('../../../assets/images/screens/explore/pin_animation.gif')}
            contentFit="contain"
            style={{ width: 70, height: 70 }}
          />
        </Animated.View>
      </View>
    </Marker>
  );
}
