import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';

interface FlyingCoin {
  id: number;
  imageUrl?: string;
  imageSource?: number; // local require() asset
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  animValue: Animated.Value;
  delay: number;
}

interface CurrencyFlyContextType {
  triggerFly: (params: {
    imageUrl?: string;
    imageSource?: number; // local require() asset
    amount: number;
    startX: number;
    startY: number;
    targetPosition?: string;
  }) => void;
  registerTarget: (name: string, x: number, y: number) => void;
}

export const CurrencyFlyContext = createContext<CurrencyFlyContextType>({
  triggerFly: () => {},
  registerTarget: () => {},
});

export function useCurrencyFly() {
  return useContext(CurrencyFlyContext);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const HEADER_Y = Constants.statusBarHeight + 45;

// Coin landing sound
const COIN_SOUND = require('../../assets/sounds/purchase_item_success.mp3');

interface CurrencyFlyProviderProps {
  children: React.ReactNode;
}

export default function CurrencyFlyProvider({ children }: CurrencyFlyProviderProps) {
  const [flyingCoins, setFlyingCoins] = useState<FlyingCoin[]>([]);
  const coinIdRef = useRef(0);
  const soundRef = useRef<Audio.Sound | null>(null);
  
  // Target positions for different currency slots
  const targets = useRef<Record<string, { x: number; y: number }>>({
    left: { x: SCREEN_WIDTH * 0.15, y: HEADER_Y },
    center: { x: SCREEN_WIDTH * 0.5, y: HEADER_Y },
    right: { x: SCREEN_WIDTH * 0.85, y: HEADER_Y },
  });

  const registerTarget = useCallback((name: string, x: number, y: number) => {
    targets.current[name] = { x, y };
  }, []);

  // Play coin landing sound
  const playCoinSound = useCallback(async () => {
    try {
      // Unload previous sound if exists
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      
      const { sound } = await Audio.Sound.createAsync(COIN_SOUND, {
        volume: 0.6,
        rate: 1.1, // Slightly faster for snappier feel
      });
      soundRef.current = sound;
      await sound.playAsync();
    } catch (error) {
      console.log('Coin sound error:', error);
    }
  }, []);

  const triggerFly = useCallback(({
    imageUrl,
    imageSource,
    amount,
    startX,
    startY,
    targetPosition = 'left',
  }: {
    imageUrl?: string;
    imageSource?: number;
    amount: number;
    startX: number;
    startY: number;
    targetPosition?: string;
  }) => {
    const target = targets.current[targetPosition] || targets.current['left'];
    const numCoins = Math.min(Math.max(amount, 1), 10); // 1-10 coins max
    
    const newCoins: FlyingCoin[] = [];
    
    for (let i = 0; i < numCoins; i++) {
      const id = coinIdRef.current++;
      const animValue = new Animated.Value(0);
      
      // More controlled scatter - coins start in a small cluster
      const angle = (i / numCoins) * Math.PI * 2;
      const radius = 20 + Math.random() * 15;
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      
      newCoins.push({
        id,
        imageUrl,
        imageSource,
        startX: startX + offsetX,
        startY: startY + offsetY,
        endX: target.x,
        endY: target.y,
        animValue,
        delay: i * 40, // Tighter stagger for premium feel
      });
    }
    
    setFlyingCoins(prev => [...prev, ...newCoins]);
    
    // Track when first coin lands to play sound
    let soundPlayed = false;
    
    // Animate each coin with premium easing
    newCoins.forEach((coin, index) => {
      setTimeout(() => {
        Animated.timing(coin.animValue, {
          toValue: 1,
          duration: 500, // Faster, snappier
          easing: Easing.bezier(0.25, 0.1, 0.25, 1), // Premium ease-out curve
          useNativeDriver: true,
        }).start(() => {
          // Play sound when first coin lands
          if (!soundPlayed) {
            soundPlayed = true;
            playCoinSound();
          }
          
          // Remove coin after animation
          setFlyingCoins(prev => prev.filter(c => c.id !== coin.id));
        });
      }, coin.delay);
    });
  }, [playCoinSound]);

  return (
    <CurrencyFlyContext.Provider value={{ triggerFly, registerTarget }}>
      {children}
      
      {/* Flying coins overlay */}
      <View style={styles.overlay} pointerEvents="none">
        {flyingCoins.map((coin) => {
          // Premium arc trajectory - smooth parabolic curve
          const deltaX = coin.endX - coin.startX;
          const deltaY = coin.endY - coin.startY;
          
          // Horizontal movement - smooth linear
          const translateX = coin.animValue.interpolate({
            inputRange: [0, 1],
            outputRange: [coin.startX - 20, coin.endX - 20],
          });
          
          // Vertical movement - parabolic arc (goes up then curves down)
          // Peak height is proportional to distance
          const arcHeight = Math.min(Math.abs(deltaY) * 0.4, 150);
          const translateY = coin.animValue.interpolate({
            inputRange: [0, 0.3, 0.6, 1],
            outputRange: [
              coin.startY - 20,
              coin.startY - arcHeight - 20, // Rise up
              coin.endY - arcHeight * 0.3 - 20, // Start descending
              coin.endY - 20, // Land
            ],
          });
          
          // Scale: start big, stay consistent, slight squash on land
          const scale = coin.animValue.interpolate({
            inputRange: [0, 0.1, 0.8, 0.95, 1],
            outputRange: [0.3, 1.15, 1.0, 1.1, 0.9],
          });
          
          // Opacity: fade in fast, stay solid, slight fade at end
          const opacity = coin.animValue.interpolate({
            inputRange: [0, 0.05, 0.85, 1],
            outputRange: [0, 1, 1, 0.7],
          });
          
          // Rotation: gentle spin as it flies
          const rotate = coin.animValue.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', `${360 + Math.random() * 180}deg`],
          });
          
          // Glow/shadow intensity peaks mid-flight
          const glowOpacity = coin.animValue.interpolate({
            inputRange: [0, 0.4, 0.7, 1],
            outputRange: [0, 0.8, 0.5, 0],
          });

          return (
            <Animated.View
              key={coin.id}
              style={[
                styles.coinContainer,
                {
                  opacity,
                  transform: [
                    { translateX },
                    { translateY },
                    { scale },
                    { rotate },
                  ],
                },
              ]}
            >
              {/* Glow effect behind coin */}
              <Animated.View
                style={[
                  styles.coinGlow,
                  { opacity: glowOpacity },
                ]}
              />
              {/* Coin image */}
              <Image
                source={coin.imageSource ? coin.imageSource : { uri: coin.imageUrl }}
                style={styles.coinImage}
                contentFit="contain"
              />
            </Animated.View>
          );
        })}
      </View>
    </CurrencyFlyContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  coinContainer: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinGlow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
  },
  coinImage: {
    width: 40,
    height: 40,
  },
});
