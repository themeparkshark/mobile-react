import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { formatCash } from '../../helpers/idle-game';

const PEAK_POSITIONS = [0.10, 0.25, 0.40, 0.55, 0.70, 0.85];
const PEAK_HEIGHTS = [24, 36, 18, 42, 28, 20];

interface Props {
  totalRides: number;
  ips: number;
  level: number;
  starPoints: number;
}

export default function ParkHeader({ totalRides, ips, level, starPoints }: Props) {
  const screenWidth = Dimensions.get('window').width;
  const containerWidth = screenWidth - 32 - 40; // account for marginHorizontal + padding

  return (
    <LinearGradient
      colors={['#09268f', '#00a5f5'] as any}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Skyline silhouette */}
      <View style={styles.skyline}>
        {PEAK_POSITIONS.map((pos, i) => (
          <View
            key={i}
            style={[
              styles.peak,
              { height: PEAK_HEIGHTS[i], left: pos * containerWidth },
            ]}
          />
        ))}
      </View>

      <Text style={styles.title}>SHARK PARK</Text>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>{totalRides} rides</Text>
        <View style={styles.dot} />
        <Text style={styles.stat}>${formatCash(ips)}/sec</Text>
        <View style={styles.dot} />
        <Text style={styles.stat}>Level {level}</Text>
        {starPoints > 0 && (
          <>
            <View style={styles.dot} />
            <Text style={styles.starStat}>{starPoints} SP</Text>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  skyline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 42,
  },
  peak: {
    position: 'absolute',
    bottom: 0,
    width: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  title: {
    fontFamily: 'Knockout',
    fontSize: 36,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  stat: {
    fontFamily: 'Shark',
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
  },
  starStat: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#fec90e',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
