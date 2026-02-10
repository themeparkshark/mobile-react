import { useRef, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, Platform } from 'react-native';
import Svg, { G, Path, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import * as Haptics from '../helpers/haptics';
import { SoundEffectContext, SoundEffectContextType } from '../context/SoundEffectProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(SCREEN_WIDTH * 0.8, 300);
const CENTER = WHEEL_SIZE / 2;
const RADIUS = WHEEL_SIZE / 2 - 10;
const INNER_RADIUS = RADIUS * 0.2;

interface WheelSegment {
  id: string;
  name: string;
  color: string;
  gradientEnd: string;
  icon: string;
}

const SEGMENTS: WheelSegment[] = [
  { id: 'tap', name: 'WHACK-A-SHARK', color: '#3b82f6', gradientEnd: '#1d4ed8', icon: '🦈' },
  { id: 'timing', name: 'RHYTHM TAP', color: '#8b5cf6', gradientEnd: '#6d28d9', icon: '🎵' },
  { id: 'memory', name: 'MEMORY MATCH', color: '#ec4899', gradientEnd: '#be185d', icon: '🧠' },
  { id: 'trivia', name: 'QUICK TRIVIA', color: '#f59e0b', gradientEnd: '#d97706', icon: '❓' },
];

const NUM_SEGMENTS = SEGMENTS.length;
const SEGMENT_ANGLE = 360 / NUM_SEGMENTS;

// Create SVG arc path for a pie slice
function createArcPath(startAngle: number, endAngle: number, radius: number, innerRadius: number): string {
  const startRad = (startAngle - 90) * Math.PI / 180;
  const endRad = (endAngle - 90) * Math.PI / 180;
  
  const x1 = CENTER + radius * Math.cos(startRad);
  const y1 = CENTER + radius * Math.sin(startRad);
  const x2 = CENTER + radius * Math.cos(endRad);
  const y2 = CENTER + radius * Math.sin(endRad);
  
  const x3 = CENTER + innerRadius * Math.cos(endRad);
  const y3 = CENTER + innerRadius * Math.sin(endRad);
  const x4 = CENTER + innerRadius * Math.cos(startRad);
  const y4 = CENTER + innerRadius * Math.sin(startRad);
  
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

// Calculate text position on segment
function getTextPosition(index: number) {
  const angle = (index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2 - 90) * Math.PI / 180;
  const textRadius = RADIUS * 0.62;
  return {
    x: CENTER + textRadius * Math.cos(angle),
    y: CENTER + textRadius * Math.sin(angle),
    rotation: index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2,
  };
}

interface Props {
  spinning: boolean;
  landed: boolean;
  selectedIndex: number | null;
  onSpinComplete?: () => void;
}

export default function SpinWheel({ spinning, landed, selectedIndex }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  
  useEffect(() => {
    if (spinning && selectedIndex !== null) {
      const extraSpins = 4 + Math.random() * 2;
      // To land segment[i] under the top pointer, rotate so its center (i*90+45°) reaches 0° (top).
      // That means rotate by (360 - (i*90+45)) so the segment comes TO the pointer, not away.
      const segmentCenter = selectedIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
      const targetAngle = extraSpins * 360 + (360 - segmentCenter);
      console.log('🎡 SpinWheel spinning to:', { selectedIndex, segment: SEGMENTS[selectedIndex]?.name, targetAngle });
      
      // Play initial spin whoosh
      playSound(require('../../assets/sounds/redeem_modal_open.mp3'));
      
      // Start tick haptics (simulating wheel clicking past pegs)
      let tickCount = 0;
      const maxTicks = 40;
      let tickDelay = 50; // Start fast
      
      const doTick = () => {
        if (tickCount >= maxTicks) {
          // Final landing - big haptic + sound
          if (Platform.OS === 'ios') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          playSound(require('../../assets/sounds/purchase_item_success.mp3'));
          return;
        }
        
        // Tick haptic
        if (Platform.OS === 'ios') {
          Haptics.impactAsync(
            tickCount > maxTicks * 0.7 
              ? Haptics.ImpactFeedbackStyle.Heavy  // Heavier ticks as it slows
              : Haptics.ImpactFeedbackStyle.Light
          );
        }
        
        tickCount++;
        // Slow down the ticks as wheel decelerates (easing feel)
        tickDelay = 50 + Math.pow(tickCount / maxTicks, 2) * 200;
        tickIntervalRef.current = setTimeout(doTick, tickDelay);
      };
      
      // Start ticking after a brief delay
      tickIntervalRef.current = setTimeout(doTick, 100);
      
      Animated.timing(rotation, {
        toValue: targetAngle,
        duration: 4000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    
    return () => {
      if (tickIntervalRef.current) {
        clearTimeout(tickIntervalRef.current);
      }
    };
  }, [spinning, selectedIndex]);
  
  useEffect(() => {
    if (!spinning && !landed) {
      rotation.setValue(0);
      if (tickIntervalRef.current) {
        clearTimeout(tickIntervalRef.current);
      }
    }
  }, [spinning, landed]);

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Outer glow */}
      <View style={styles.outerGlow} />
      
      {/* Outer ring with pegs */}
      <View style={styles.outerRing}>
        {Array.from({ length: 20 }).map((_, i) => {
          const angle = (i * 18) * Math.PI / 180; // 20 pegs, 18 degrees apart
          const pegRadius = WHEEL_SIZE / 2 + 12;
          const ringCenter = (WHEEL_SIZE + 40) / 2;
          const x = ringCenter + pegRadius * Math.cos(angle - Math.PI / 2);
          const y = ringCenter + pegRadius * Math.sin(angle - Math.PI / 2);
          return (
            <View
              key={i}
              style={[styles.peg, {
                left: x - 5,
                top: y - 5,
              }]}
            />
          );
        })}
      </View>

      {/* Spinning wheel */}
      <Animated.View style={[styles.wheelContainer, { transform: [{ rotate: rotateInterpolate }] }]}>
        <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
          <Defs>
            {SEGMENTS.map((seg, i) => (
              <LinearGradient key={seg.id} id={`grad-${seg.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={seg.color} />
                <Stop offset="100%" stopColor={seg.gradientEnd} />
              </LinearGradient>
            ))}
          </Defs>
          
          {/* Segments */}
          <G>
            {SEGMENTS.map((seg, i) => {
              const startAngle = i * SEGMENT_ANGLE;
              const endAngle = (i + 1) * SEGMENT_ANGLE;
              const path = createArcPath(startAngle, endAngle, RADIUS, INNER_RADIUS);
              
              return (
                <Path
                  key={seg.id}
                  d={path}
                  fill={`url(#grad-${seg.id})`}
                  stroke="#fff"
                  strokeWidth={2}
                />
              );
            })}
          </G>
          
          {/* Segment divider lines */}
          {SEGMENTS.map((_, i) => {
            const angle = (i * SEGMENT_ANGLE - 90) * Math.PI / 180;
            const x1 = CENTER + INNER_RADIUS * Math.cos(angle);
            const y1 = CENTER + INNER_RADIUS * Math.sin(angle);
            const x2 = CENTER + RADIUS * Math.cos(angle);
            const y2 = CENTER + RADIUS * Math.sin(angle);
            return (
              <Path
                key={`line-${i}`}
                d={`M ${x1} ${y1} L ${x2} ${y2}`}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
              />
            );
          })}
          
          {/* Center hub */}
          <Circle cx={CENTER} cy={CENTER} r={INNER_RADIUS + 5} fill="#1a1a2e" stroke="#fbbf24" strokeWidth={3} />
          <Circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - 5} fill="#fbbf24" />
        </Svg>
        
        {/* Text labels on segments */}
        {SEGMENTS.map((seg, i) => {
          const pos = getTextPosition(i);
          return (
            <View
              key={`label-${seg.id}`}
              style={[styles.segmentLabel, {
                left: pos.x - 40,
                top: pos.y - 20,
                transform: [{ rotate: `${pos.rotation}deg` }],
              }]}
            >
              <Text style={styles.segmentIcon}>{seg.icon}</Text>
              <Text style={styles.segmentText}>{seg.name}</Text>
            </View>
          );
        })}
      </Animated.View>
      
      {/* Pointer - at top, pointing DOWN into wheel */}
      <View style={styles.pointerContainer}>
        <View style={styles.pointerGlow} />
        <View style={styles.pointerShadow} />
        <View style={styles.pointer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: WHEEL_SIZE + 40,
    height: WHEEL_SIZE + 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerGlow: {
    position: 'absolute',
    width: WHEEL_SIZE + 30,
    height: WHEEL_SIZE + 30,
    borderRadius: (WHEEL_SIZE + 30) / 2,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
  },
  outerRing: {
    position: 'absolute',
    width: WHEEL_SIZE + 40,
    height: WHEEL_SIZE + 40,
  },
  peg: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fbbf24',
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  wheelContainer: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
  },
  segmentLabel: {
    position: 'absolute',
    width: 80,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  segmentText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  pointerContainer: {
    position: 'absolute',
    top: 8,
    alignItems: 'center',
    zIndex: 100,
  },
  pointerGlow: {
    position: 'absolute',
    top: -5,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  pointerShadow: {
    position: 'absolute',
    top: 3,
    width: 0,
    height: 0,
    borderLeftWidth: 20,
    borderRightWidth: 20,
    borderTopWidth: 40,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(0,0,0,0.4)',
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 18,
    borderRightWidth: 18,
    borderTopWidth: 38,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ef4444',
  },
});
