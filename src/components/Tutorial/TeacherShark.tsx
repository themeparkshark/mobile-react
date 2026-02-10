/**
 * TeacherShark — The tutorial guide character
 * 
 * Animated shark character with speech bubble that guides users
 * through the app. Slides in from bottom, has different moods/poses,
 * and displays tutorial text in a styled speech bubble.
 * 
 * When Dustin provides the teacher shark asset, replace the placeholder
 * with the real image. For now uses a fun styled placeholder.
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  interpolate,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { SharkMood, SharkPosition } from './types';
import config from '../../config';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TEACHER_SHARK_IMAGE = require('../../../assets/images/tutorial/teacher-shark.png');

interface TeacherSharkProps {
  text: string;
  subtitle?: string;
  mood: SharkMood;
  position: SharkPosition;
  nextText?: string;
  showSkip?: boolean;
  showNext?: boolean;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkip?: () => void;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function TeacherShark({
  text,
  subtitle,
  mood,
  position,
  nextText = 'Next',
  showSkip = false,
  showNext = true,
  stepIndex,
  totalSteps,
  onNext,
  onSkip,
}: TeacherSharkProps) {
  // === Polished Finn animation — perfect symmetric loops ===
  
  // Bob: center → up → center → down → center (sine easing, perfectly symmetric)
  const bobValue = useSharedValue(0);
  // Tilt: gentle sway synced but offset from bob
  const tiltValue = useSharedValue(0);
  // Breathe: subtle scale pulse
  const breatheValue = useSharedValue(0);
  // Diploma wiggle: tiny periodic wiggle
  const wiggleValue = useSharedValue(0);
  
  useEffect(() => {
    // Bob — 3s full cycle, perfectly symmetric
    bobValue.value = withRepeat(
      withSequence(
        // center → up
        withTiming(1, { duration: 750, easing: Easing.inOut(Easing.sin) }),
        // up → center
        withTiming(0, { duration: 750, easing: Easing.inOut(Easing.sin) }),
        // center → down
        withTiming(-1, { duration: 750, easing: Easing.inOut(Easing.sin) }),
        // down → center
        withTiming(0, { duration: 750, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    
    // Tilt — 4s cycle, slightly slower than bob for organic feel
    tiltValue.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    
    // Breathe — 3.5s cycle, subtle scale
    breatheValue.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1750, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1750, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    
    // Diploma wiggle — quick little wiggle every ~5s
    wiggleValue.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 3500, easing: Easing.linear }), // pause
        withTiming(1, { duration: 100, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.5, { duration: 150, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 150, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const sharkAnimStyle = useAnimatedStyle(() => {
    // Combine tilt sway + diploma wiggle into one rotation
    const totalRotation = (tiltValue.value * 2) + (wiggleValue.value * 1.5);
    return {
      transform: [
        // Bob: ±6px vertical float
        { translateY: bobValue.value * 6 },
        // Combined rotation: gentle sway + periodic wiggle
        { rotate: `${totalRotation}deg` },
        // Breathe: subtle 1.0 → 1.03 scale pulse
        { scale: 1 + breatheValue.value * 0.03 },
      ],
    };
  });

  // Position the shark
  const getSharkContainerStyle = () => {
    switch (position) {
      case 'bottom-left':
        return { bottom: 20, left: 16 };
      case 'bottom-right':
        return { bottom: 20, right: 16 };
      case 'bottom-center':
        return { bottom: 20, left: 0, right: 0, alignItems: 'center' as const };
      case 'top-left':
        return { top: 100, left: 16 };
      case 'top-right':
        return { top: 100, right: 16 };
      default:
        return { bottom: 20, left: 0, right: 0, alignItems: 'center' as const };
    }
  };

  // Get mood emoji (placeholder until real asset)
  const getMoodEmoji = () => {
    switch (mood) {
      case 'happy': return '😊';
      case 'excited': return '🤩';
      case 'pointing': return '👉';
      case 'thinking': return '🤔';
      case 'waving': return '👋';
      case 'celebrating': return '🎉';
      default: return '😊';
    }
  };

  return (
    <Animated.View
      style={[styles.container, getSharkContainerStyle()]}
      entering={SlideInDown.springify().damping(15).stiffness(100)}
      exiting={SlideOutDown.duration(300)}
    >
      {/* Speech Bubble */}
      <Animated.View
        style={styles.speechBubble}
        entering={FadeIn.delay(200).duration(300)}
      >
        {/* Progress dots */}
        {totalSteps > 1 && (
          <View style={styles.progressRow}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i === stepIndex && styles.progressDotActive,
                  i < stepIndex && styles.progressDotCompleted,
                ]}
              />
            ))}
          </View>
        )}

        {/* Main text */}
        <Text style={styles.mainText}>{text}</Text>
        
        {/* Subtitle */}
        {subtitle && (
          <Text style={styles.subtitleText}>{subtitle}</Text>
        )}

        {/* Buttons */}
        <View style={styles.buttonRow}>
          {showSkip && onSkip && (
            <TouchableOpacity onPress={onSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
          {showNext && (
            <TouchableOpacity onPress={onNext} style={styles.nextButton}>
              <Text style={styles.nextText}>{nextText}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Speech bubble tail */}
        <View style={styles.bubbleTail} />
      </Animated.View>

      {/* Shark Character — Teacher Finn */}
      <Animated.View style={[styles.sharkContainer, sharkAnimStyle]}>
        <Image 
          source={TEACHER_SHARK_IMAGE} 
          style={styles.sharkImage}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 9999,
    maxWidth: SCREEN_WIDTH - 32,
  },
  speechBubble: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    paddingBottom: 16,
    marginBottom: 8,
    marginHorizontal: 16,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    // Border
    borderWidth: 3,
    borderColor: config.secondary,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 6,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
  },
  progressDotActive: {
    backgroundColor: config.secondary,
    width: 20,
    borderRadius: 4,
  },
  progressDotCompleted: {
    backgroundColor: config.tertiary,
  },
  mainText: {
    fontFamily: 'Knockout',
    fontSize: 18,
    color: '#1a1a2e',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 4,
  },
  subtitleText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  skipText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#999',
  },
  nextButton: {
    backgroundColor: config.secondary,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 25,
    shadowColor: config.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  nextText: {
    fontFamily: 'Knockout',
    fontSize: 18,
    color: 'white',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -10,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'white',
  },
  sharkContainer: {
    alignSelf: 'center',
    width: 120,
    height: 120,
  },
  sharkImage: {
    width: 110,
    height: 110,
  },
});
