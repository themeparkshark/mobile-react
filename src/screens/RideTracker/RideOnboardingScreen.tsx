import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  FlatList,
  ViewToken,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../design-system';
import { GameIcon, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ONBOARDING_KEY = 'ride_tracker_onboarded';

// ─── Slide Data ───

interface SlideData {
  icons: GameIconName[];
  emojiSizes: number[];
  emojiOffsets: { x: number; y: number; rotate: string }[];
  title: string;
  subtitle: string;
  gradient: [string, string];
  accentIcon: GameIconName;
}

const SLIDES: SlideData[] = [
  {
    icons: ['ride', 'shark', 'edit'],
    emojiSizes: [72, 96, 64],
    emojiOffsets: [
      { x: -70, y: -20, rotate: '-15deg' },
      { x: 0, y: -40, rotate: '0deg' },
      { x: 70, y: -10, rotate: '12deg' },
    ],
    title: 'Your Ride Journal',
    subtitle:
      'Track every ride you\'ve ever been on. Rate them, add photos, build your complete theme park history.',
    gradient: ['#0879ca', '#0768b9'],
    accentIcon: 'sparkle',
  },
  {
    icons: ['pin', 'sparkle', 'ride'],
    emojiSizes: [64, 48, 80],
    emojiOffsets: [
      { x: -60, y: 10, rotate: '-8deg' },
      { x: 10, y: -50, rotate: '20deg' },
      { x: 60, y: -15, rotate: '5deg' },
    ],
    title: 'Auto-Detect Rides',
    subtitle:
      'Just pocket your phone and ride. We\'ll detect what you rode using GPS and ask you to confirm. Magic.',
    gradient: ['#1ba0ea', '#0879ca'],
    accentIcon: 'star',
  },
  {
    icons: ['camera', 'trophy', 'medal1'],
    emojiSizes: [60, 80, 64],
    emojiOffsets: [
      { x: -65, y: -10, rotate: '-10deg' },
      { x: 5, y: -45, rotate: '0deg' },
      { x: 65, y: -5, rotate: '10deg' },
    ],
    title: 'Share & Compete',
    subtitle:
      'Share beautiful ride cards, compare stats with friends, and earn achievement badges as you level up.',
    gradient: ['#0768b9', '#0a5ea8'],
    accentIcon: 'medal2',
  },
  {
    icons: ['shark', 'crown'],
    emojiSizes: [100, 72],
    emojiOffsets: [
      { x: -30, y: -30, rotate: '-5deg' },
      { x: 50, y: -50, rotate: '15deg' },
    ],
    title: "Let's Start!",
    subtitle: 'Your theme park adventure begins now. Ready to track your first ride?',
    gradient: ['#0879ca', '#05468f'],
    accentIcon: 'crown',
  },
];

// ─── Animated Slide ───

interface AnimatedSlideProps {
  item: SlideData;
  index: number;
  scrollX: Animated.Value;
}

const AnimatedSlide: React.FC<AnimatedSlideProps> = React.memo(
  ({ item, index, scrollX }) => {
    const inputRange = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];

    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0, 1, 0],
      extrapolate: 'clamp',
    });

    const translateY = scrollX.interpolate({
      inputRange,
      outputRange: [60, 0, 60],
      extrapolate: 'clamp',
    });

    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.8, 1, 0.8],
      extrapolate: 'clamp',
    });

    return (
      <View style={slideStyles.outerContainer}>
        <LinearGradient
          colors={item.gradient}
          style={slideStyles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Animated.View
            style={[
              slideStyles.content,
              { opacity, transform: [{ translateY }, { scale }] },
            ]}
          >
            {/* Emoji Scene */}
            <View style={slideStyles.emojiScene}>
              {item.icons.map((icon, i) => (
                <IconFloat
                  key={i}
                  icon={icon}
                  size={item.emojiSizes[i]}
                  offset={item.emojiOffsets[i]}
                  delay={i * 150}
                />
              ))}
            </View>

            {/* Sparkle accent */}
            <GameIcon name={item.accentIcon} size={30} style={slideStyles.accent} />

            {/* Title */}
            <Text style={slideStyles.title}>{item.title}</Text>

            {/* Subtitle */}
            <Text style={slideStyles.subtitle}>{item.subtitle}</Text>
          </Animated.View>
        </LinearGradient>
      </View>
    );
  },
);
AnimatedSlide.displayName = 'AnimatedSlide';

// ─── Floating art with a springy entrance and a subtle bob ───

interface IconFloatProps {
  icon: GameIconName;
  size: number;
  offset: { x: number; y: number; rotate: string };
  delay: number;
}

const IconFloat: React.FC<IconFloatProps> = React.memo(
  ({ icon, size, offset, delay }) => {
    const reduced = useUiReducedMotion();
    const floatAnim = useRef(new Animated.Value(0)).current;
    const entryAnim = useRef(new Animated.Value(reduced ? 1 : 0)).current;

    useEffect(() => {
      if (reduced) { entryAnim.setValue(1); return; }
      // Entry animation
      Animated.spring(entryAnim, {
        toValue: 1,
        delay,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }).start();

      // Subtle floating loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, {
            toValue: 1,
            duration: 2000 + delay * 2,
            useNativeDriver: true,
          }),
          Animated.timing(floatAnim, {
            toValue: 0,
            duration: 2000 + delay * 2,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }, []);

    const floatY = floatAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -8],
    });

    return (
      <Animated.View
        style={{
          width: size,
          height: size,
          position: 'absolute',
          left: '50%',
          marginLeft: offset.x - size / 2,
          top: '50%',
          marginTop: offset.y - size / 2,
          transform: [
            { translateY: floatY },
            { scale: entryAnim },
            { rotate: offset.rotate },
          ],
        }}
      >
        <GameIcon name={icon} size={size} />
      </Animated.View>
    );
  },
);
IconFloat.displayName = 'IconFloat';

const slideStyles = StyleSheet.create({
  outerContainer: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  emojiScene: {
    width: 240,
    height: 180,
    position: 'relative',
    marginBottom: 16,
  },
  accent: {
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontFamily: 'Shark',
    textTransform: 'uppercase',
    textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontFamily: 'Knockout',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 8,
    maxWidth: 340,
  },
});

// ─── Pagination Dots ───

interface DotsProps {
  count: number;
  scrollX: Animated.Value;
}

const PaginationDots: React.FC<DotsProps> = React.memo(({ count, scrollX }) => (
  <View style={dotStyles.container}>
    {Array.from({ length: count }).map((_, i) => {
      const inputRange = [
        (i - 1) * SCREEN_WIDTH,
        i * SCREEN_WIDTH,
        (i + 1) * SCREEN_WIDTH,
      ];

      const width = scrollX.interpolate({
        inputRange,
        outputRange: [8, 28, 8],
        extrapolate: 'clamp',
      });

      const opacity = scrollX.interpolate({
        inputRange,
        outputRange: [0.3, 1, 0.3],
        extrapolate: 'clamp',
      });

      const backgroundColor = scrollX.interpolate({
        inputRange,
        outputRange: ['rgba(255,255,255,0.3)', '#00A5F5', 'rgba(255,255,255,0.3)'],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View
          key={i}
          style={[dotStyles.dot, { width, opacity, backgroundColor }]}
        />
      );
    })}
  </View>
));
PaginationDots.displayName = 'PaginationDots';

const dotStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});

// ─── Main Screen ───

export default function RideOnboardingScreen() {
  const navigation = useNavigation<any>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const handleFinish = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    navigation.replace('RideTracker');
  }, [navigation]);

  const handleSkip = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    navigation.replace('RideTracker');
  }, [navigation]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isLastSlide) {
      const next = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      handleFinish();
    }
  }, [currentIndex, isLastSlide, handleFinish]);

  const handleExplore = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    navigation.replace('RideTracker');
  }, [navigation]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: SlideData; index: number }) => (
      <AnimatedSlide item={item} index={index} scrollX={scrollX} />
    ),
    [scrollX],
  );

  return (
    <View style={styles.container}>
      {/* Skip button */}
      <SafeAreaView edges={['top']} style={styles.skipContainer}>
        {!isLastSlide && (
          <Pressable onPress={handleSkip} hitSlop={16} style={styles.skipPressable}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </SafeAreaView>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => i.toString()}
        renderItem={renderItem}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Bottom controls */}
      <SafeAreaView edges={['bottom']} style={styles.bottomContainer}>
        <PaginationDots count={SLIDES.length} scrollX={scrollX} />

        {isLastSlide ? (
          <View style={styles.ctaGroup}>
            <Pressable
              onPress={handleFinish}
              style={({ pressed }) => [
                styles.primaryCta,
                pressed && styles.ctaPressed,
              ]}
            >
              <Text style={styles.primaryCtaText}>Log Your First Ride</Text>
            </Pressable>

            <Pressable
              onPress={handleExplore}
              style={({ pressed }) => [
                styles.secondaryCta,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.secondaryCtaText}>Explore First</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.nextBtn,
              pressed && styles.ctaPressed,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.nextBtnText}>Next</Text>
              <GameIcon name="arrow" size={24} />
            </View>
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}

export { ONBOARDING_KEY };

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0768b9',
  },
  skipContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
  },
  skipPressable: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  skipText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 17,
    fontFamily: 'Shark',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  ctaGroup: {
    gap: 12,
  },
  primaryCta: {
    backgroundColor: '#ffcf3b',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 5,
    borderBottomColor: '#d99a00',
    shadowColor: '#05346e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  primaryCtaText: {
    color: '#05346e',
    fontSize: 22,
    fontFamily: 'Shark',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  secondaryCta: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryCtaText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 17,
    fontFamily: 'Shark',
  },
  nextBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: 'Shark',
    textTransform: 'uppercase',
  },
});
