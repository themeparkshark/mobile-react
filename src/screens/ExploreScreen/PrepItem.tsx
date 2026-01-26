import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrepItemType } from '../../models/prep-item-type';
import dayjs from 'dayjs';

interface Props {
  prepItem: PrepItemType;
  onExpire: () => void;
}

/**
 * Prep item marker for the home map.
 * Shows a collectible item that spawns near the player when not at a park.
 */
export default function PrepItem({ prepItem, onExpire }: Props) {
  const [timeRemaining, setTimeRemaining] = useState<string>('');

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

  // Rarity colors
  const rarityColor = {
    1: '#4CAF50', // Common - green
    2: '#2196F3', // Uncommon - blue
    3: '#9C27B0', // Rare - purple
  }[prepItem.rarity] || '#4CAF50';

  return (
    <View style={styles.container}>
      {/* Glow effect based on rarity */}
      <View style={[styles.glow, { backgroundColor: rarityColor }]} />
      
      {/* Item icon or fallback */}
      {prepItem.icon_url ? (
        <Image
          source={{ uri: prepItem.icon_url }}
          style={styles.icon}
          contentFit="contain"
        />
      ) : (
        <View style={[styles.fallbackIcon, { backgroundColor: rarityColor }]}>
          <Text style={styles.fallbackText}>🎁</Text>
        </View>
      )}

      {/* Timer */}
      {timeRemaining && (
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>{timeRemaining}</Text>
        </View>
      )}

      {/* Rarity indicator */}
      <View style={[styles.rarityDot, { backgroundColor: rarityColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: 80,
  },
  glow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    opacity: 0.3,
  },
  icon: {
    width: 50,
    height: 50,
  },
  fallbackIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontSize: 24,
  },
  timerContainer: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timerText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  rarityDot: {
    position: 'absolute',
    top: 5,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'white',
  },
});
