import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  current: number;
  max: number;
  secondsUntilNext: number;
}

/**
 * Energy bar showing current/max energy with regeneration timer.
 */
export default function EnergyBar({ current, max, secondsUntilNext }: Props) {
  const [timer, setTimer] = useState(secondsUntilNext);
  const percentage = Math.min(100, (current / max) * 100);
  const isFull = current >= max;

  // Countdown timer
  useEffect(() => {
    setTimer(secondsUntilNext);

    if (isFull || secondsUntilNext <= 0) return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsUntilNext, isFull]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>⚡ Energy</Text>
        <Text style={styles.count}>
          {current}/{max}
        </Text>
      </View>
      
      <View style={styles.barContainer}>
        <View
          style={[
            styles.barFill,
            {
              width: `${percentage}%`,
              backgroundColor: percentage > 30 ? '#4CAF50' : '#FF9800',
            },
          ]}
        />
      </View>

      {!isFull && timer > 0 && (
        <Text style={styles.timer}>
          +1 in {formatTime(timer)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  count: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  barContainer: {
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  timer: {
    color: '#aaa',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'right',
  },
});
