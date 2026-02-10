import { Image, ImageSource } from 'expo-image';
import { useEffect, useState, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { PrepItemType } from '../../models/prep-item-type';
import config from '../../config';
import dayjs from 'dayjs';

/** Pulse cycle for in-range markers (toggles between two static visual states) */
function usePulse(enabled: boolean, intervalMs = 800): boolean {
  const [bright, setBright] = useState(true);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setBright(true);
      if (ref.current) clearInterval(ref.current);
      return;
    }
    ref.current = setInterval(() => setBright((b) => !b), intervalMs);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [enabled, intervalMs]);

  return bright;
}

// Local churro images map - React Native requires static imports
const CHURRO_IMAGES: Record<string, ImageSource> = {
  'classic cinnamon': require('../../../assets/images/prep-items/churros/churro_01.png'),
  'sugar dusted': require('../../../assets/images/prep-items/churros/churro_02.png'),
  'honey glazed': require('../../../assets/images/prep-items/churros/churro_03.png'),
  'brown sugar': require('../../../assets/images/prep-items/churros/churro_04.png'),
  'maple swirl': require('../../../assets/images/prep-items/churros/churro_05.png'),
  'vanilla bean': require('../../../assets/images/prep-items/churros/churro_06.png'),
  'caramel drizzle': require('../../../assets/images/prep-items/churros/churro_07.png'),
  'dulce de leche': require('../../../assets/images/prep-items/churros/churro_08.png'),
  'butterscotch': require('../../../assets/images/prep-items/churros/churro_09.png'),
  'toasted coconut': require('../../../assets/images/prep-items/churros/churro_10.png'),
  'churro original': require('../../../assets/images/prep-items/churros/churro_11.png'),
  'cinnamon toast': require('../../../assets/images/prep-items/churros/churro_12.png'),
  'golden crisp': require('../../../assets/images/prep-items/churros/churro_13.png'),
  'sweet cream': require('../../../assets/images/prep-items/churros/churro_14.png'),
  'salted caramel': require('../../../assets/images/prep-items/churros/churro_15.png'),
  'toffee crunch': require('../../../assets/images/prep-items/churros/churro_16.png'),
  'praline': require('../../../assets/images/prep-items/churros/churro_17.png'),
  'snickerdoodle': require('../../../assets/images/prep-items/churros/churro_18.png'),
  'biscoff': require('../../../assets/images/prep-items/churros/churro_19.png'),
  'cookie butter': require('../../../assets/images/prep-items/churros/churro_20.png'),
  'chocolate dipped': require('../../../assets/images/prep-items/churros/churro_21.png'),
  'strawberry frosted': require('../../../assets/images/prep-items/churros/churro_22.png'),
  'blueberry bliss': require('../../../assets/images/prep-items/churros/churro_23.png'),
  'matcha green tea': require('../../../assets/images/prep-items/churros/churro_24.png'),
  'ube purple yam': require('../../../assets/images/prep-items/churros/churro_25.png'),
  'red velvet': require('../../../assets/images/prep-items/churros/churro_26.png'),
  'orange creamsicle': require('../../../assets/images/prep-items/churros/churro_27.png'),
  'lemon zest': require('../../../assets/images/prep-items/churros/churro_28.png'),
  'mint chocolate': require('../../../assets/images/prep-items/churros/churro_29.png'),
  'cookies & cream': require('../../../assets/images/prep-items/churros/churro_30.png'),
  'pumpkin spice': require('../../../assets/images/prep-items/churros/churro_31.png'),
  'birthday cake': require('../../../assets/images/prep-items/churros/churro_32.png'),
  'cotton candy': require('../../../assets/images/prep-items/churros/churro_33.png'),
  'tropical mango': require('../../../assets/images/prep-items/churros/churro_34.png'),
  'galaxy swirl': require('../../../assets/images/prep-items/churros/churro_35.png'),
  'electric blue': require('../../../assets/images/prep-items/churros/churro_36.png'),
  'watermelon wave': require('../../../assets/images/prep-items/churros/churro_37.png'),
  'sunset orange': require('../../../assets/images/prep-items/churros/churro_38.png'),
  'golden churro': require('../../../assets/images/prep-items/churros/churro_39.png'),
  'rainbow galaxy': require('../../../assets/images/prep-items/churros/churro_40.png'),
  // Fallback base churro
  'classic': require('../../../assets/images/prep-items/churros/churro_01.png'),
  'default': require('../../../assets/images/prep-items/churros/base_churro.png'),
};

/**
 * Get local churro image based on item name
 */
function getChurroImage(name: string): ImageSource | null {
  const lowerName = name.toLowerCase().replace(' churro', '').trim();
  
  // Direct match
  if (CHURRO_IMAGES[lowerName]) {
    return CHURRO_IMAGES[lowerName];
  }
  
  // Partial match - find the best match
  for (const key of Object.keys(CHURRO_IMAGES)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return CHURRO_IMAGES[key];
    }
  }
  
  // Default churro if name contains "churro"
  if (name.toLowerCase().includes('churro')) {
    return CHURRO_IMAGES['default'];
  }
  
  return null;
}

interface Props {
  prepItem: PrepItemType;
  onExpire: () => void;
  inRange?: boolean;
}

/**
 * PrepItem — 100% STATIC layout (rendered inside <Marker>).
 * No Animated transforms — prevents teleporting on react-native-maps.
 */
export default function PrepItem({ prepItem, onExpire, inRange = false }: Props) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const bright = usePulse(inRange);

  // Get local image for churros
  const localImage = useMemo(() => getChurroImage(prepItem.name), [prepItem.name]);

  // Countdown timer
  useEffect(() => {
    if (!prepItem.active_to) return;

    const interval = setInterval(() => {
      const now = dayjs();
      const end = dayjs(prepItem.active_to);
      const diff = end.diff(now, 'second');

      if (diff <= 0) {
        clearInterval(interval);
        onExpire();
        return;
      }

      const minutes = Math.floor(diff / 60);
      const seconds = diff % 60;
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [prepItem.active_to, onExpire]);

  // Rarity config
  const rarityConfig = {
    1: { color: '#4CAF50', label: 'Common' },
    2: { color: config.secondary, label: 'Uncommon' },
    3: { color: '#9C27B0', label: 'Rare' },
    4: { color: '#FF9800', label: 'Epic' },
    5: { color: '#FFD700', label: 'Legendary' },
  }[prepItem.rarity] || { color: '#4CAF50', label: 'Common' };

  // Determine image source: local churro > remote icon_url > fallback
  const imageSource = localImage || (prepItem.icon_url ? { uri: prepItem.icon_url } : null);

  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 80,
        height: 80,
      }}
    >
      {/* Outer pulse ring — only visible when in range */}
      {inRange && (
        <View
          style={{
            position: 'absolute',
            width: bright ? 78 : 72,
            height: bright ? 78 : 72,
            borderRadius: bright ? 39 : 36,
            borderWidth: 3,
            borderColor: bright ? '#4AFF6F' : '#2DD855',
            backgroundColor: 'transparent',
            opacity: bright ? 0.9 : 0.4,
          }}
        />
      )}

      {/* Glow effect based on rarity — brighter when in range + pulsing */}
      <View
        style={{
          position: 'absolute',
          width: inRange && bright ? 74 : 70,
          height: inRange && bright ? 74 : 70,
          borderRadius: inRange && bright ? 37 : 35,
          backgroundColor: inRange ? '#4AFF6F' : rarityConfig.color,
          opacity: inRange ? (bright ? 0.6 : 0.3) : 0.4,
        }}
      />

      {/* White outline circle — green border when in range */}
      <View
        style={{
          position: 'absolute',
          width: 60,
          height: 60,
          borderRadius: 30,
          borderWidth: 3,
          borderColor: inRange ? (bright ? '#4AFF6F' : '#2DD855') : 'white',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          shadowColor: inRange ? '#4AFF6F' : '#000',
          shadowOffset: { width: 2, height: 2 },
          shadowRadius: inRange ? 6 : 0,
          shadowOpacity: inRange ? (bright ? 0.8 : 0.4) : 0.3,
        }}
      />

      {/* Item icon */}
      {imageSource ? (
        <Image
          source={imageSource}
          style={{
            width: 45,
            height: 45,
            zIndex: 10,
          }}
          contentFit="contain"
        />
      ) : (
        <View
          style={{
            width: 45,
            height: 45,
            borderRadius: 22,
            backgroundColor: rarityConfig.color,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <Text style={{ fontSize: 24 }}>🎁</Text>
        </View>
      )}

      {/* Timer */}
      {timeRemaining && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            backgroundColor: config.primary,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: 'white',
            shadowColor: '#000',
            shadowOffset: { width: 1, height: 1 },
            shadowRadius: 0,
            shadowOpacity: 0.3,
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 11,
              color: 'white',
            }}
          >
            {timeRemaining}
          </Text>
        </View>
      )}

      {/* Rarity indicator */}
      <View
        style={{
          position: 'absolute',
          top: 5,
          right: 10,
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: rarityConfig.color,
          borderWidth: 2,
          borderColor: 'white',
          shadowColor: '#000',
          shadowOffset: { width: 1, height: 1 },
          shadowRadius: 0,
          shadowOpacity: 0.3,
        }}
      />
    </View>
  );
}
