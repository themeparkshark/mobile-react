import React, { useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  PanResponder,
  Animated,
} from 'react-native';

const JOYSTICK_SIZE = 120;
const KNOB_SIZE = 44;
const MAX_OFFSET = (JOYSTICK_SIZE - KNOB_SIZE) / 2;

const SPEEDS = {
  walk: 0.00002,
  jog: 0.00008,
  drive: 0.0004,
};

type SpeedMode = keyof typeof SPEEDS;

interface DevJoystickProps {
  onMove: (dx: number, dy: number, speed: number) => void;
  onStop: () => void;
  currentLat: number;
  currentLng: number;
}

export const DevJoystick: React.FC<DevJoystickProps> = ({
  onMove,
  onStop,
  currentLat,
  currentLng,
}) => {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const isMoving = useRef(false);
  const moveInterval = useRef<NodeJS.Timeout | null>(null);
  const dirRef = useRef({ dx: 0, dy: 0 });
  const [speedMode, setSpeedMode] = React.useState<SpeedMode>('walk');
  const [minimized, setMinimized] = React.useState(false);
  const speedRef = useRef(SPEEDS.walk);

  // Keep speedRef in sync
  React.useEffect(() => {
    speedRef.current = SPEEDS[speedMode];
  }, [speedMode]);

  const startMoving = useCallback(() => {
    if (moveInterval.current) return;
    isMoving.current = true;
    moveInterval.current = setInterval(() => {
      if (isMoving.current) {
        onMove(dirRef.current.dx, dirRef.current.dy, speedRef.current);
      }
    }, 16);
  }, [onMove]);

  const stopMoving = useCallback(() => {
    isMoving.current = false;
    if (moveInterval.current) {
      clearInterval(moveInterval.current);
      moveInterval.current = null;
    }
    onStop();
  }, [onStop]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        const dist = Math.sqrt(gesture.dx ** 2 + gesture.dy ** 2);
        const clampedDist = Math.min(dist, MAX_OFFSET);
        const angle = Math.atan2(gesture.dy, gesture.dx);

        const x = Math.cos(angle) * clampedDist;
        const y = Math.sin(angle) * clampedDist;

        pan.setValue({ x, y });

        const norm = clampedDist / MAX_OFFSET;
        dirRef.current = {
          dx: Math.cos(angle) * norm,
          dy: -Math.sin(angle) * norm,
        };

        if (!isMoving.current) {
          startMoving();
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          damping: 15,
          stiffness: 150,
        }).start();
        dirRef.current = { dx: 0, dy: 0 };
        stopMoving();
      },
    })
  ).current;

  const cycleSpeed = () => {
    const modes: SpeedMode[] = ['walk', 'jog', 'drive'];
    const idx = modes.indexOf(speedMode);
    setSpeedMode(modes[(idx + 1) % modes.length]);
  };

  if (minimized) {
    return (
      <TouchableOpacity
        style={styles.minimizedButton}
        onPress={() => setMinimized(false)}
      >
        <Text style={styles.minimizedText}>🕹️</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.coordText}>
          {currentLat.toFixed(5)}, {currentLng.toFixed(5)}
        </Text>
        <TouchableOpacity onPress={() => setMinimized(true)}>
          <Text style={styles.minimizeBtn}>−</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.joystickArea}>
        <View style={styles.joystickBg}>
          <Animated.View
            style={[
              styles.knob,
              {
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                ],
              },
            ]}
            {...panResponder.panHandlers}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.speedButton} onPress={cycleSpeed}>
        <Text style={styles.speedText}>
          {speedMode === 'walk' ? '🚶' : speedMode === 'jog' ? '🏃' : '🚗'}{' '}
          {speedMode.toUpperCase()}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    zIndex: 9999,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: JOYSTICK_SIZE,
    marginBottom: 4,
  },
  coordText: {
    color: '#0f0',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  minimizeBtn: {
    color: '#fff',
    fontSize: 18,
    paddingHorizontal: 6,
  },
  joystickArea: {
    width: JOYSTICK_SIZE,
    height: JOYSTICK_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  joystickBg: {
    width: JOYSTICK_SIZE,
    height: JOYSTICK_SIZE,
    borderRadius: JOYSTICK_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: 'rgba(0, 200, 255, 0.8)',
    borderWidth: 2,
    borderColor: '#fff',
  },
  speedButton: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
  },
  speedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  minimizedButton: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  minimizedText: {
    fontSize: 22,
  },
});
