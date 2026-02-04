import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Marker } from 'react-native-maps';

export default function ItemMarker({
  item,
}: {
  readonly item: { id: number; latitude: number; longitude: number };
}) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Gentle float
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -5, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Subtle pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.05, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
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
            { translateY: floatAnim },
            { scale: scaleAnim },
          ],
        }}>
          <Image
            source={require('../../../assets/images/screens/explore/item_animation.gif')}
            contentFit="contain"
            style={{ width: 70, height: 70 }}
          />
        </Animated.View>
      </View>
    </Marker>
  );
}
