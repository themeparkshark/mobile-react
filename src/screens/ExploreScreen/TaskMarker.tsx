import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Text, View, Easing, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import Countdown, { zeroPad } from 'react-countdown';
import { TaskType } from '../../models/task-type';

export default function TaskMarker({
  task,
  isSelected,
  onPress,
}: {
  readonly task: TaskType;
  readonly isSelected: boolean;
  readonly onPress: () => void;
}) {
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Glow pulse animation - runs continuously
  useEffect(() => {
    const glowPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    
    const ringPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    
    glowPulse.start();
    ringPulse.start();
    
    return () => {
      glowPulse.stop();
      ringPulse.stop();
    };
  }, []);
  
  // Bounce animation when tapped
  useEffect(() => {
    if (isSelected) {
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1.15,
          duration: 100,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(bounceAnim, {
          toValue: 1,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isSelected]);

  const expiresAt = task.active_to ? new Date(task.active_to + 'Z') : null;
  const minsLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : null;
  
  // Ring color based on time left
  const ringColor = minsLeft !== null && minsLeft < 5 ? '#ef4444' : '#4ade80';
  const timerUrgent = minsLeft !== null && minsLeft < 5;

  return (
    <Marker
      coordinate={{
        latitude: Number(task.latitude),
        longitude: Number(task.longitude),
      }}
      onPress={onPress}
      stopPropagation={true}
      tracksViewChanges={true}
    >
      <View style={styles.container}>
        {/* Timer badge - always visible, matches coin/key style */}
        {expiresAt && (
          <View style={[
            styles.timerBadge,
            timerUrgent && styles.timerBadgeUrgent,
          ]}>
            <Countdown
              date={expiresAt.getTime()}
              renderer={({ minutes, seconds }) => (
                <Text style={[
                  styles.timerText,
                  timerUrgent && styles.timerTextUrgent,
                ]}>
                  {minutes}:{zeroPad(seconds)}
                </Text>
              )}
            />
          </View>
        )}
        
        {/* Task name tooltip - only when selected */}
        {isSelected && (
          <View style={styles.tooltipContainer}>
            <View style={styles.tooltip}>
              <Text style={styles.tooltipTitle}>
                {task.name}
              </Text>
            </View>
            <View style={styles.tooltipArrow} />
          </View>
        )}
        
        {/* Glowing base ring */}
        <Animated.View
          style={[
            styles.glowRingOuter,
            {
              opacity: glowAnim,
              transform: [{ scale: pulseAnim }],
              shadowColor: ringColor,
              borderColor: ringColor,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.glowRingInner,
            {
              opacity: glowAnim.interpolate({
                inputRange: [0.4, 1],
                outputRange: [0.6, 1],
              }),
              borderColor: ringColor,
              backgroundColor: `${ringColor}20`,
            },
          ]}
        />
        
        {/* Task building with bounce */}
        <Animated.View style={[styles.buildingContainer, { transform: [{ scale: bounceAnim }] }]}>
          <Image
            source={require('../../../assets/images/screens/explore/task_animation.gif')}
            style={styles.buildingImage}
            contentFit="contain"
          />
        </Animated.View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 140,
    height: 160,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
  },
  timerBadge: {
    position: 'absolute',
    top: 65,
    backgroundColor: '#FFF8E7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1.5,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 20,
  },
  timerBadgeUrgent: {
    backgroundColor: '#FEE2E2',
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  timerText: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#B8860B',
    textAlign: 'center',
  },
  timerTextUrgent: {
    color: '#ef4444',
  },
  tooltipContainer: {
    position: 'absolute',
    top: 25,
    left: -10,
    right: -10,
    alignItems: 'center',
    zIndex: 15,
  },
  tooltip: {
    backgroundColor: 'white',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  tooltipTitle: {
    fontFamily: 'Shark',
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'white',
  },
  glowRingOuter: {
    position: 'absolute',
    bottom: 8,
    width: 80,
    height: 35,
    borderRadius: 40,
    borderWidth: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  glowRingInner: {
    position: 'absolute',
    bottom: 12,
    width: 65,
    height: 28,
    borderRadius: 32,
    borderWidth: 2,
  },
  buildingContainer: {
    zIndex: 5,
  },
  buildingImage: {
    width: 120,
    height: 120,
  },
});
