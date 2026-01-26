import { StyleSheet, Text, View } from 'react-native';

interface Props {
  streak: number;
  multiplier: number;
  atRisk?: boolean;
}

/**
 * Badge showing current streak and bonus multiplier.
 */
export default function StreakBadge({ streak, multiplier, atRisk }: Props) {
  if (streak <= 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.noStreak}>Start your streak!</Text>
      </View>
    );
  }

  // Determine badge color based on streak length
  const badgeColor =
    streak >= 100
      ? '#FFD700' // Gold for 100+
      : streak >= 30
      ? '#9C27B0' // Purple for 30+
      : streak >= 7
      ? '#2196F3' // Blue for 7+
      : '#4CAF50'; // Green for 1-6

  return (
    <View style={[styles.container, atRisk && styles.atRisk]}>
      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <Text style={styles.flame}>🔥</Text>
        <Text style={styles.streakCount}>{streak}</Text>
      </View>
      
      {multiplier > 1 && (
        <Text style={styles.multiplier}>
          {multiplier}x
        </Text>
      )}

      {atRisk && (
        <Text style={styles.riskWarning}>!</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  atRisk: {
    opacity: 0.8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  flame: {
    fontSize: 14,
    marginRight: 2,
  },
  streakCount: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  multiplier: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 4,
  },
  noStreak: {
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
  },
  riskWarning: {
    color: '#FF5722',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 4,
  },
});
