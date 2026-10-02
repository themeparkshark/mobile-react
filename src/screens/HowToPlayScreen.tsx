/**
 * How to Play: five big swipe cards, one short sentence each, so a kid gets
 * the game in a few seconds. A springy page indicator and a soft tick on each
 * swipe. Deeper detail (every feature, every word, replay tutorials) sits
 * behind the small "More" link. A "?" sheet that links a topic opens More
 * directly on that topic.
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation, interpolate, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat,
  withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { playSfx } from '../gamekit/SFX';
import * as Haptics from '../helpers/haptics';
import type { HelpTopicId } from '../services/help/glossary';
import { HOW_TO_CARDS, pageForOffset, type HowToArtKey, type HowToCard } from '../services/help/howToCards';
import { BRAND, GameButton, RADIUS } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import HowToPlayMore from './HowToPlay/HowToPlayMore';

const ART: Readonly<Record<HowToArtKey, number>> = {
  find: require('../../assets/images/howto/find.png'),
  catch: require('../../assets/images/howto/catch.png'),
  book: require('../../assets/images/howto/book.png'),
  park: require('../../assets/images/howto/park.png'),
  line: require('../../assets/images/howto/line.png'),
};

const GUTTER = 16;

export default function HowToPlayScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const focus = (route.params as { topic?: HelpTopicId } | undefined)?.topic ?? null;
  const [more, setMore] = useState(focus != null);
  const [moreFocus, setMoreFocus] = useState<HelpTopicId | null>(focus);
  const { width } = useWindowDimensions();
  const reduced = useUiReducedMotion();

  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);

  const onPage = useCallback((next: number) => {
    if (next === pageRef.current) return;
    pageRef.current = next;
    setPage(next);
    playSfx('ui.select', 0.45);
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => { scrollX.value = event.contentOffset.x; },
    onMomentumEnd: event => { runOnJS(onPage)(Math.round(event.contentOffset.x / Math.max(1, width))); },
  }, [width, onPage]);

  const goTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: !reduced });
    onPage(pageForOffset(index * width, width));
  };

  const last = page === HOW_TO_CARDS.length - 1;
  const openMore = (topic: HelpTopicId | null) => {
    playSfx('ui.tap', 0.6);
    setMoreFocus(topic);
    setMore(true);
  };

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton onPress={more && focus == null ? () => setMore(false) : undefined} />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{more ? 'More help' : 'How to Play'}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      {more ? <HowToPlayMore focus={moreFocus} /> : (
        <View style={styles.body}>
          <Animated.ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onScroll={onScroll} scrollEventThrottle={16} style={{ flex: 1 }} decelerationRate="fast">
            {HOW_TO_CARDS.map((card, index) => (
              <CardPage key={card.id} card={card} index={index} width={width} scrollX={scrollX}
                active={index === page} reduced={reduced} />
            ))}
          </Animated.ScrollView>

          <View style={styles.dots} accessibilityRole="adjustable" accessibilityLabel={`Card ${page + 1} of ${HOW_TO_CARDS.length}`}>
            {HOW_TO_CARDS.map((card, index) => (
              <Dot key={card.id} index={index} width={width} scrollX={scrollX} color={card.colors[1]}
                onPress={() => goTo(index)} />
            ))}
          </View>

          <View style={styles.footer}>
            <GameButton label={last ? "Let's play!" : 'Next'} icon={last ? 'play' : 'arrow'} fullWidth
              onPress={() => (last ? navigation.goBack() : goTo(page + 1))} />
            <Pressable accessibilityRole="button" accessibilityLabel="More help" hitSlop={12}
              onPress={() => openMore(HOW_TO_CARDS[page]?.topic ?? null)} style={styles.moreLink}>
              <Text style={styles.moreText}>More</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Wrapper>
  );
}

function CardPage({ card, index, width, scrollX, active, reduced }: {
  readonly card: HowToCard; readonly index: number; readonly width: number; readonly scrollX: SharedValue<number>;
  readonly active: boolean; readonly reduced: boolean;
}) {
  const bob = useSharedValue(0);
  // Only the card on screen floats, so nothing animates off-screen.
  useEffect(() => {
    if (!active || reduced) {
      cancelAnimation(bob);
      bob.value = withTiming(0, { duration: 150 });
      return;
    }
    bob.value = withRepeat(withSequence(withTiming(-8, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1, false);
    return () => cancelAnimation(bob);
  }, [active, reduced, bob]);

  const cardStyle = useAnimatedStyle(() => {
    const progress = (scrollX.value - index * width) / Math.max(1, width);
    return {
      transform: [
        { scale: interpolate(progress, [-1, 0, 1], [0.9, 1, 0.9], 'clamp') },
        { rotate: `${interpolate(progress, [-1, 0, 1], [4, 0, -4], 'clamp')}deg` },
      ],
    };
  });
  const artStyle = useAnimatedStyle(() => {
    const progress = (scrollX.value - index * width) / Math.max(1, width);
    return {
      transform: [
        { translateX: interpolate(progress, [-1, 0, 1], [width * 0.25, 0, -width * 0.25], 'clamp') },
        { translateY: bob.value },
      ],
    };
  });

  return (
    <View style={{ width, paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 8 }}>
      <Animated.View style={[styles.card, cardStyle]}>
        <LinearGradient colors={card.colors as [string, string]} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
        <View style={styles.glow} />
        <Animated.View style={[styles.artWrap, artStyle]}>
          <Image source={ART[card.art]} style={styles.art} contentFit="contain" accessibilityIgnoresInvertColors />
        </Animated.View>
        <View style={styles.copy}>
          <Text style={styles.step}>{index + 1} of {HOW_TO_CARDS.length}</Text>
          <Text accessibilityRole="header" style={styles.title}>{card.title}</Text>
          <Text style={styles.line}>{card.line}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function Dot({ index, width, scrollX, color, onPress }: {
  readonly index: number; readonly width: number; readonly scrollX: SharedValue<number>; readonly color: string;
  readonly onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(scrollX.value / Math.max(1, width) - index);
    const on = distance < 0.5;
    return {
      width: withSpring(on ? 30 : 12, { damping: 11, stiffness: 220 }),
      opacity: interpolate(distance, [0, 1], [1, 0.45], 'clamp'),
      backgroundColor: on ? color : '#9cc7ea',
    };
  });
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={`Card ${index + 1}`}>
      <Animated.View style={[styles.dot, style]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, marginTop: -8, backgroundColor: '#e3f3ff' },
  card: {
    flex: 1, borderRadius: 30, overflow: 'hidden', borderWidth: 4, borderColor: BRAND.white,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%' },
  glow: {
    position: 'absolute', top: '6%', alignSelf: 'center', width: '82%', aspectRatio: 1, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 18 },
  art: { width: '86%', height: '100%', maxHeight: 340 },
  copy: { paddingHorizontal: 22, paddingBottom: 26, alignItems: 'center' },
  step: { fontFamily: 'Knockout', fontSize: 15, color: 'rgba(255,255,255,0.85)', letterSpacing: 1, textTransform: 'uppercase' },
  title: {
    fontFamily: 'Shark', fontSize: 38, color: BRAND.white, textAlign: 'center', marginTop: 2,
    textShadowColor: 'rgba(5,52,110,0.45)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0,
  },
  line: { fontFamily: 'Knockout', fontSize: 24, lineHeight: 29, color: BRAND.white, textAlign: 'center', marginTop: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 12 },
  dot: { height: 12, borderRadius: 6 },
  footer: { paddingHorizontal: GUTTER, paddingBottom: 92 },
  moreLink: { alignSelf: 'center', marginTop: 6, paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADIUS.pill },
  moreText: { fontFamily: 'Knockout', fontSize: 18, color: BRAND.blue, textDecorationLine: 'underline' },
});
