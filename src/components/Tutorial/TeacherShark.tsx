/**
 * TeacherShark — The tutorial guide character
 * 
 * Animated shark character with speech bubble that guides users
 * through the app. Slides in from bottom, has different moods/poses,
 * and displays tutorial text in a styled speech bubble.
 * 
 * Uses the existing approved teacher-shark artwork.
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Image } from 'react-native';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { SharkMood, SharkPosition } from './types';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import config from '../../config';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const TEACHER_SHARK_IMAGE = require('../../../assets/images/tutorial/teacher-shark.png');

interface TeacherSharkProps {
  title?: string;
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
  /** Keep Finn clear of persistent bottom navigation when a screen has it. */
  bottomOffset?: number;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function TeacherShark({
  title,
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
  bottomOffset = 20,
}: TeacherSharkProps) {
  const reducedMotion = useReducedGameMotion();
  const bobValue = useSharedValue(0);
  const tiltValue = useSharedValue(0);
  const greetingValue = useSharedValue(0);
  useEffect(() => {
    [bobValue, tiltValue, greetingValue].forEach(value => { cancelAnimation(value); value.value = 0; });
    if (!reducedMotion) {
      bobValue.value = withRepeat(withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      ), -1, false);
      tiltValue.value = withRepeat(withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ), -1, false);
      if (mood === 'celebrating' || mood === 'waving') greetingValue.value = withSequence(
        withTiming(1, { duration: 180 }), withTiming(0, { duration: 220 }));
    }
    return () => [bobValue, tiltValue, greetingValue].forEach(value => cancelAnimation(value));
  }, [reducedMotion, mood, bobValue, tiltValue, greetingValue]);
  const sharkAnimStyle = useAnimatedStyle(() => ({ transform: [
    { translateY: reducedMotion ? 0 : bobValue.value * -3 },
    { rotate: `${reducedMotion ? 0 : tiltValue.value}deg` },
    { scale: reducedMotion ? 1 : 1 + greetingValue.value * 0.025 },
  ] }));

  // Position the shark
  const getSharkContainerStyle = () => {
    switch (position) {
      case 'bottom-left':
        return { bottom: bottomOffset, left: 16 };
      case 'bottom-right':
        return { bottom: bottomOffset, right: 16 };
      case 'bottom-center':
        return { bottom: bottomOffset, left: 0, right: 0, alignItems: 'center' as const };
      case 'top-left':
        return { top: 100, left: 16 };
      case 'top-right':
        return { top: 100, right: 16 };
      default:
        return { bottom: bottomOffset, left: 0, right: 0, alignItems: 'center' as const };
    }
  };

  return (
    <Animated.View
      style={[styles.container, getSharkContainerStyle()]}
      entering={reducedMotion ? undefined : FadeIn.duration(180)}
      exiting={reducedMotion ? undefined : FadeOut.duration(160)}
    >
      {/* Speech Bubble */}
      <Animated.View
        style={styles.speechBubble}
        entering={reducedMotion ? undefined : FadeIn.duration(180)}
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

        {title && <Text style={styles.title}>{title}</Text>}

        {/* Main text */}
        <Text style={styles.mainText}>{text}</Text>
        
        {/* Subtitle */}
        {subtitle && (
          <Text style={styles.subtitleText}>{subtitle}</Text>
        )}

        {/* Buttons */}
        <View style={styles.buttonRow}>
          {showSkip && onSkip && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Skip this guide" onPress={onSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
          {showNext && (
            <TouchableOpacity accessibilityRole="button" onPress={onNext} style={styles.nextButton}>
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
  title: { fontFamily: 'Shark', fontSize: 23, lineHeight: 28, textAlign: 'center', color: '#075083', marginBottom: 9 },
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
    gap: 8,
  },
  skipButton: {
    minHeight: 48, justifyContent: 'center',
    paddingHorizontal: 12,
  },
  skipText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#537082',
  },
  nextButton: {
    flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    backgroundColor: config.secondary,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 25,
    shadowColor: config.secondary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  nextText: {
    textAlign: 'center',
    fontFamily: 'Knockout',
    fontSize: 18,
    color: 'white',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
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
