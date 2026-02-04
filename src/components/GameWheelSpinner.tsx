import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Vibration,
  Modal,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(SCREEN_WIDTH * 0.75, 280);

type GameType = 'tap' | 'timing' | 'memory' | 'trivia';

interface GameSegment {
  id: GameType;
  name: string;
  color: string;
}

const GAMES: GameSegment[] = [
  { id: 'tap', name: 'WHACK-A-SHARK', color: '#3b82f6' },
  { id: 'timing', name: 'RHYTHM TAP', color: '#8b5cf6' },
  { id: 'memory', name: 'MEMORY MATCH', color: '#ec4899' },
  { id: 'trivia', name: 'QUICK TRIVIA', color: '#f59e0b' },
];

const NUM_SEGMENTS = GAMES.length;
const SEGMENT_ANGLE = 360 / NUM_SEGMENTS;

interface Props {
  visible: boolean;
  ticketCost: number;
  onClose: () => void;
  onGameSelected: (game: GameType) => void;
}

export default function GameWheelSpinner({
  visible,
  ticketCost,
  onClose,
  onGameSelected,
}: Props) {
  const [phase, setPhase] = useState<'ready' | 'spinning' | 'landed'>('ready');
  const [selectedGame, setSelectedGame] = useState<GameSegment | null>(null);
  
  const wheelRotation = useRef(new Animated.Value(0)).current;

  console.log('🎡 GameWheelSpinner render, visible:', visible, 'phase:', phase);

  useEffect(() => {
    if (visible) {
      setPhase('ready');
      setSelectedGame(null);
      wheelRotation.setValue(0);
    }
  }, [visible]);

  const spin = useCallback(() => {
    if (phase !== 'ready') return;
    
    setPhase('spinning');
    Vibration.vibrate(50);
    
    const extraSpins = 4 + Math.random() * 3;
    const randomSegment = Math.floor(Math.random() * NUM_SEGMENTS);
    const randomOffset = randomSegment * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const finalAngle = extraSpins * 360 + randomOffset;
    
    Animated.timing(wheelRotation, {
      toValue: finalAngle,
      duration: 4000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        const normalizedAngle = finalAngle % 360;
        const segmentIndex = Math.floor(normalizedAngle / SEGMENT_ANGLE) % NUM_SEGMENTS;
        const game = GAMES[segmentIndex];
        
        setSelectedGame(game);
        setPhase('landed');
        Vibration.vibrate([0, 80, 40, 80]);
        
        setTimeout(() => {
          onGameSelected(game.id);
        }, 1500);
      }
    });
  }, [phase, onGameSelected]);

  const wheelRotationDeg = wheelRotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Title */}
          <Text style={styles.title}>SPIN TO PLAY!</Text>
          <Text style={styles.subtitle}>Cost: {ticketCost} Ticket{ticketCost > 1 ? 's' : ''}</Text>

          {/* Simple Wheel */}
          <View style={styles.wheelWrap}>
            <Animated.View
              style={[
                styles.wheel,
                { transform: [{ rotate: wheelRotationDeg }] },
              ]}
            >
              {GAMES.map((game, i) => (
                <View
                  key={game.id}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: game.color,
                      transform: [
                        { rotate: `${i * SEGMENT_ANGLE}deg` },
                        { translateY: -WHEEL_SIZE / 4 },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.segmentText}>{game.name}</Text>
                </View>
              ))}
            </Animated.View>
            
            {/* Pointer */}
            <View style={styles.pointer} />
          </View>

          {/* Button */}
          {phase === 'ready' && (
            <TouchableOpacity style={styles.spinBtn} onPress={spin}>
              <Text style={styles.spinBtnText}>TAP TO SPIN!</Text>
            </TouchableOpacity>
          )}

          {phase === 'spinning' && (
            <Text style={styles.spinningText}>SPINNING...</Text>
          )}

          {phase === 'landed' && selectedGame && (
            <View style={styles.result}>
              <Text style={styles.resultText}>{selectedGame.name}</Text>
              <Text style={styles.resultSub}>Get ready...</Text>
            </View>
          )}

          {/* Cancel */}
          {phase === 'ready' && (
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 24,
  },
  wheelWrap: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheel: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    borderRadius: WHEEL_SIZE / 2,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fbbf24',
  },
  segment: {
    position: 'absolute',
    width: WHEEL_SIZE * 0.4,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  pointer: {
    position: 'absolute',
    top: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderBottomWidth: 25,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ef4444',
  },
  spinBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  spinBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  spinningText: {
    color: '#fbbf24',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 24,
  },
  result: {
    alignItems: 'center',
    marginTop: 24,
  },
  resultText: {
    color: '#4ade80',
    fontSize: 24,
    fontWeight: '900',
  },
  resultSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 4,
  },
  cancelBtn: {
    marginTop: 16,
    padding: 8,
  },
  cancelText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
});
