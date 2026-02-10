import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import config from '../../config';
import { AuthContext } from '../../context/AuthProvider';

export default function UsernameBanner() {
  const { player } = useContext(AuthContext);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const scaleIn = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 400,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.spring(scaleIn, {
        toValue: 1,
        tension: 80,
        friction: 8,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  if (!player) return null;

  return (
    <Animated.View
      style={{
        opacity: fadeIn,
        transform: [{ scale: scaleIn }],
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LinearGradient
        colors={['#0a1a4a', '#0d2266', '#0a1a4a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 6,
          paddingVertical: 6,
          borderRadius: 18,
          borderWidth: 2.5,
          borderColor: 'rgba(255,255,255,0.25)',
          width: '100%',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        {/* Username - centered */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: 20,
              color: 'white',
              textTransform: 'uppercase',
              letterSpacing: 1,
              textShadowColor: 'rgba(0,0,0,0.5)',
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 0,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {player.screen_name}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
