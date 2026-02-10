import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { RideDefinition } from '../../models/idle-game-types';

interface Props {
  def: RideDefinition;
  locked: boolean;
  hasManager?: boolean;
}

// Pulsing manager badge as module-level component
function ManagerBadge() {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[styles.managerBadge, { transform: [{ scale: pulseAnim }] }]}>
      <View style={styles.managerStar} />
    </Animated.View>
  );
}

export default function RideIcon({ def, locked, hasManager }: Props) {
  return (
    <View>
      <LinearGradient
        colors={locked ? (['#ccc', '#aaa'] as any) : (def.colors as any)}
        style={styles.icon}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {/* Inner shadow effect */}
        <View style={styles.innerShadow} />
        <Text style={styles.letter}>{def.initial}</Text>
      </LinearGradient>
      {hasManager && <ManagerBadge />}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  innerShadow: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  letter: {
    fontFamily: 'Knockout',
    fontSize: 34,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  managerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#7c3aed',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  managerStar: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fec90e',
  },
});
