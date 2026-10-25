/**
 * TeacherShark: Finn, the tutorial guide, with his speech bubble.
 *
 * Motion (UI thread, Reanimated):
 *   - Entrance: Finn springs up from below, overshoots and settles, then the
 *     bubble pops from its tail with a light haptic.
 *   - Speech: his line appears word by word (every word is laid out from the
 *     first frame, so the bubble never resizes). Tap the bubble to show it all.
 *     The subtitle fades in once he has finished.
 *   - Each new step gives the bubble a small squash so the change reads.
 *   - Idle: a gentle bob and tilt; waving and celebrating moods get a hop.
 * Reduced motion: no entrance, no bob, the whole line at once. The Next button
 * works at every moment, so the guide never blocks the player.
 *
 * Uses the existing approved teacher-shark artwork and his yellow button.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  withSpring,
  withDelay,
  interpolate,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { SharkMood, SharkPosition } from './types';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { BRAND, GameButton } from '../../ui';
import { REVEAL_START_MS, revealSchedule, splitWords } from './teacherReveal';
import TapHint from '../TapHint';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TEACHER_SHARK_IMAGE = require('../../../assets/images/tutorial/teacher-shark.png');
const WALK_FEET = require('../../../assets/images/trail/steps.png');

/** Two blue feet that take a few small steps, then stand still (no endless loop). */
function WalkPicture({ reducedMotion }: { reducedMotion: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    t.value = withDelay(500, withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(-1, { duration: 260 })), 4, false,
      () => { t.value = withTiming(0, { duration: 160 }); }));
    return () => cancelAnimation(t);
  }, [reducedMotion, t]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.abs(t.value) * 4 }, { rotate: `${t.value * 8}deg` }] }));
  return (
    <Animated.View style={[styles.walkPicture, st]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={WALK_FEET} style={styles.walkFeet} resizeMode="contain" />
    </Animated.View>
  );
}

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
  /** The next tap was taken and its activity is opening: the button pulses. */
  nextLoading?: boolean;
  onSkip?: () => void;
  /** Keep Finn clear of persistent bottom navigation, or park him above a spotlit card. */
  bottomOffset?: number;
  /** A pointing hand on the button after a short wait (first-session steps a kid cannot read yet). */
  pointAtNext?: boolean;
  /** A small picture under the line: 'walk' shows two stepping feet. */
  picture?: 'walk';
  /**
   * Finn stands beside his bubble instead of under it (bottom-center only).
   * For steps where a find is waiting at the middle of the map: the bubble
   * stays low, so the find and its pointing hand stay in view above it.
   */
  beside?: boolean;
  /** Another existing Finn picture (for example the boater barker right after his warm-up). */
  sharkSource?: number;
}

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
  nextLoading = false,
  onSkip,
  bottomOffset = 20,
  pointAtNext = false,
  picture,
  beside = false,
  sharkSource,
}: TeacherSharkProps) {
  const reducedMotion = useUiReducedMotion();
  const bobValue = useSharedValue(0);
  const tiltValue = useSharedValue(0);
  const greetingValue = useSharedValue(0);
  const scanValue = useSharedValue(0);
  const enterValue = useSharedValue(reducedMotion ? 1 : 0);
  const bubbleValue = useSharedValue(reducedMotion ? 1 : 0);

  // Idle life.
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
      if (mood === 'celebrating' || mood === 'waving') greetingValue.value = withDelay(REVEAL_START_MS, withSequence(
        withTiming(1, { duration: 180 }), withTiming(0, { duration: 220 })));
      // Thinking: Finn sniffs left and right a few times (looking for a treat), then holds still.
      if (mood === 'thinking') scanValue.value = withDelay(300, withRepeat(withSequence(
        withTiming(1, { duration: 380, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 380, easing: Easing.inOut(Easing.sin) })), 5, false,
        () => { scanValue.value = withTiming(0, { duration: 200 }); }));
      else scanValue.value = withTiming(0, { duration: 160 });
    }
    return () => [bobValue, tiltValue, greetingValue, scanValue].forEach(value => cancelAnimation(value));
  }, [reducedMotion, mood, bobValue, tiltValue, greetingValue, scanValue]);

  // Entrance on mount: Finn rises past his mark and settles, then the bubble pops.
  useEffect(() => {
    if (reducedMotion) { enterValue.value = 1; bubbleValue.value = 1; return; }
    enterValue.value = withSequence(
      withTiming(1.06, { duration: 240, easing: Easing.out(Easing.cubic) }),
      withSpring(1, { damping: 9, stiffness: 220, mass: 0.7 }),
    );
    bubbleValue.value = withDelay(140, withSpring(1, { damping: 11, stiffness: 240, mass: 0.6 }));
    return () => { cancelAnimation(enterValue); cancelAnimation(bubbleValue); };
    // Mount only: steps after the first get the squash below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Word-by-word line. Tap the bubble to show it all at once.
  const parts = useMemo(() => splitWords(text), [text]);
  const [shown, setShown] = useState(reducedMotion ? parts.length : 0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLine = useRef(true);
  useEffect(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    if (reducedMotion) { setShown(parts.length); return; }
    // A new step: squash the bubble so the change reads, then talk.
    if (!firstLine.current) {
      bubbleValue.value = withSequence(withTiming(0.94, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 260 }));
    }
    const startDelay = firstLine.current ? REVEAL_START_MS : 120;
    firstLine.current = false;
    const times = revealSchedule(parts);
    setShown(0);
    let index = 0;
    const step = () => {
      index += 1;
      while (index < times.length && times[index] === times[index - 1]) index += 1;
      setShown(index);
      if (index < times.length) revealTimer.current = setTimeout(step, times[index] - times[index - 1]);
    };
    revealTimer.current = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      step();
    }, startDelay);
    return () => { if (revealTimer.current) clearTimeout(revealTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, reducedMotion]);
  const talking = shown < parts.length;
  const finishLine = () => {
    if (!talking) return;
    if (revealTimer.current) clearTimeout(revealTimer.current);
    setShown(parts.length);
  };

  const sharkAnimStyle = useAnimatedStyle(() => ({ transform: [
    { translateY: interpolate(enterValue.value, [0, 1], [110, 0]) + (reducedMotion ? 0 : bobValue.value * -3) },
    { translateX: reducedMotion ? 0 : scanValue.value * 6 },
    { rotate: `${reducedMotion ? 0 : tiltValue.value + scanValue.value * 7}deg` },
    { scale: reducedMotion ? 1 : 1 + greetingValue.value * 0.025 },
  ] }));
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bubbleValue.value, [0, 0.3, 1], [0, 1, 1], 'clamp'),
    transform: [
      { translateY: interpolate(bubbleValue.value, [0, 1], [40, 0]) },
      { scale: interpolate(bubbleValue.value, [0, 1], [0.6, 1]) },
    ],
  }));

  // Position the shark
  const getSharkContainerStyle = () => {
    switch (position) {
      case 'bottom-left':
        return { bottom: bottomOffset, left: 16 };
      case 'bottom-right':
        return { bottom: bottomOffset, right: 16 };
      case 'bottom-center':
        // Beside: Finn on the left, his bubble to his right, both low on the screen.
        if (beside) return { bottom: bottomOffset - 8, left: 8, right: 10, flexDirection: 'row-reverse' as const, alignItems: 'flex-end' as const };
        // 16 on both sides: with maxWidth = screen - 32 the bubble sits truly centred.
        return { bottom: bottomOffset, left: 16, right: 16, alignItems: 'center' as const };
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
      entering={reducedMotion ? undefined : FadeIn.duration(140)}
      exiting={reducedMotion ? undefined : FadeOut.duration(160)}
    >
      {/* Speech bubble: tap to finish Finn's line. */}
      {/* The pop animates this wrapper only; the card inside keeps its own background and shadow layers. */}
      <Animated.View style={[styles.bubbleWrap, beside && styles.bubbleWrapBeside, bubbleStyle]}>
      <View style={styles.speechBubble}>
        <Pressable
          onPress={finishLine}
          accessible
          accessibilityLabel={[title, text, subtitle].filter(Boolean).join('. ')}
          accessibilityHint={talking ? 'Double tap to show the whole message' : undefined}
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

          {/* Main text, word by word; hidden words keep their space. A title-only bubble has none. */}
          {text ? <Text style={styles.mainText}>
            {parts.map((part, i) => (
              <Text key={i} style={i < shown ? undefined : styles.hiddenWord}>{part}</Text>
            ))}
          </Text> : null}

          {subtitle && (
            <Text style={[styles.subtitleText, talking && styles.hiddenWord]}>{subtitle}</Text>
          )}
          {picture === 'walk' && <WalkPicture reducedMotion={reducedMotion} />}
        </Pressable>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          {showNext && (
            <GameButton label={nextText} onPress={onNext} loading={nextLoading} accessibilityHint="Continues the guide" />
          )}
          {showNext && pointAtNext && <TapHint delay={2200} style={styles.nextHand} />}
          {showSkip && onSkip && (
            <GameButton variant="ghost" label="Skip" onPress={onSkip} accessibilityLabel="Skip this guide" />
          )}
        </View>

        {/* Speech bubble tail: down to Finn, or left to Finn when he stands beside it. */}
        <View style={beside ? styles.sideTailBorder : styles.bubbleTailBorder} />
        <View style={beside ? styles.sideTail : styles.bubbleTail} />
      </View>
      </Animated.View>

      {/* Shark Character: Teacher Finn */}
      <Animated.View style={[styles.sharkContainer, beside && styles.sharkContainerBeside, sharkAnimStyle]}>
        <Image
          source={sharkSource ?? TEACHER_SHARK_IMAGE}
          style={styles.sharkImage}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  walkPicture: { alignSelf: 'center', marginTop: 6 },
  walkFeet: { width: 54, height: 54 },
  title: { fontFamily: 'Shark', fontSize: 23, lineHeight: 28, textAlign: 'center', color: BRAND.navy, marginBottom: 8 },
  container: {
    position: 'absolute',
    zIndex: 9999,
    maxWidth: SCREEN_WIDTH - 32,
  },
  bubbleWrap: {
    marginBottom: 12,
    marginHorizontal: 16,
  },
  bubbleWrapBeside: { flex: 1, marginHorizontal: 0, marginLeft: 6, marginBottom: 18 },
  sharkContainerBeside: { alignSelf: 'flex-end', width: 96, height: 120 },
  sideTailBorder: {
    position: 'absolute', left: -17, bottom: 26, width: 0, height: 0,
    borderTopWidth: 13, borderBottomWidth: 13, borderRightWidth: 15,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: BRAND.blueBright,
  },
  sideTail: {
    position: 'absolute', left: -11, bottom: 29, width: 0, height: 0,
    borderTopWidth: 10, borderBottomWidth: 10, borderRightWidth: 12,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: BRAND.white,
  },
  speechBubble: {
    backgroundColor: BRAND.white,
    borderRadius: 22,
    padding: 18,
    paddingBottom: 12,
    shadowColor: BRAND.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 3,
    borderColor: BRAND.blueBright,
    borderBottomWidth: 5,
    borderBottomColor: BRAND.blue,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 6,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND.sky,
  },
  progressDotActive: {
    backgroundColor: BRAND.blueBright,
    width: 20,
  },
  progressDotCompleted: {
    backgroundColor: BRAND.gold,
  },
  mainText: {
    fontFamily: 'Knockout',
    fontSize: 19,
    color: BRAND.navy,
    textAlign: 'center',
    lineHeight: 25,
    marginBottom: 2,
  },
  hiddenWord: {
    color: 'transparent',
  },
  subtitleText: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: BRAND.navySoft,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 6,
  },
  // The fingertip lands on the right half of the button, clear of its label.
  nextHand: { right: '14%', top: -26 },
  buttonRow: {
    alignItems: 'center',
    marginTop: 12,
    gap: 2,
  },
  bubbleTailBorder: {
    position: 'absolute',
    bottom: -17,
    left: '50%',
    marginLeft: -13,
    width: 0,
    height: 0,
    borderLeftWidth: 13,
    borderRightWidth: 13,
    borderTopWidth: 15,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: BRAND.blue,
  },
  bubbleTail: {
    position: 'absolute',
    bottom: -10,
    left: '50%',
    marginLeft: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: BRAND.white,
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
