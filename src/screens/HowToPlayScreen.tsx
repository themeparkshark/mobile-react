/**
 * How to Play: five big cards, each a short looping demo of the mechanic
 * with a 2 to 3 word title and one line of 7 words or fewer. The next card
 * peeks in from the right so swiping is obvious without reading. A speaker
 * button reads each card aloud. "Learn more" (a pill) opens the full help;
 * a "?" sheet that links a topic opens it directly.
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faVolumeHigh } from '@fortawesome/free-solid-svg-icons/faVolumeHigh';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolate, interpolateColor, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence,
  withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper, { BOTTOM_BAR_OVERHANG } from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { playSfx } from '../gamekit/SFX';
import * as Haptics from '../helpers/haptics';
import * as RootNavigation from '../RootNavigation';
import type { HelpTopicId } from '../services/help/glossary';
import { HOW_TO_CARDS, type HowToArtKey, type HowToCard } from '../services/help/howToCards';
import { BRAND, GameButton, GameIcon, RADIUS } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import HowToDemo from './HowToPlay/HowToDemos';
import HowToPlayMore from './HowToPlay/HowToPlayMore';
import { StarBurst } from './SetCollection/DexParts';

const VOICE: Readonly<Record<HowToArtKey, number>> = {
  find: require('../../assets/sounds/howto/vo-find.mp3'),
  catch: require('../../assets/sounds/howto/vo-catch.mp3'),
  book: require('../../assets/sounds/howto/vo-book.mp3'),
  park: require('../../assets/sounds/howto/vo-park.mp3'),
  line: require('../../assets/sounds/howto/vo-line.mp3'),
};

/** Space left and right of a card; the next card shows PEEK points of itself. */
const SIDE = 24;
const GAP = 12;

export default function HowToPlayScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const focus = (route.params as { topic?: HelpTopicId } | undefined)?.topic ?? null;
  const [more, setMore] = useState(focus != null);
  const [moreFocus, setMoreFocus] = useState<HelpTopicId | null>(focus);
  const { width } = useWindowDimensions();
  const reduced = useUiReducedMotion();
  const { player } = useContext(AuthContext);
  const soundOn = player?.enabled_sound_effects !== false;

  const cardWidth = width - SIDE * 2 - 20;
  const interval = cardWidth + GAP;
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const [readAloud, setReadAloud] = useState(false);
  const voice = useRef<Audio.Sound | null>(null);
  const [cheer, setCheer] = useState(0);
  const last = page === HOW_TO_CARDS.length - 1;

  const stopVoice = useCallback(() => {
    const current = voice.current;
    voice.current = null;
    if (current) void current.unloadAsync().catch(() => undefined);
  }, []);

  const speak = useCallback(async (card: HowToCard) => {
    stopVoice();
    if (!soundOn) return;
    try {
      const { sound } = await Audio.Sound.createAsync(VOICE[card.art], { shouldPlay: true, volume: 1 });
      voice.current = sound;
    } catch { /* Voice is a bonus; the words are on the card. */ }
  }, [soundOn, stopVoice]);

  useEffect(() => stopVoice, [stopVoice]);

  const onPage = useCallback((next: number) => {
    if (next === pageRef.current) return;
    pageRef.current = next;
    setPage(next);
    playSfx('ui.select', 0.45);
    void Haptics.selectionAsync().catch(() => undefined);
    if (readAloud) void speak(HOW_TO_CARDS[next]);
    if (next === HOW_TO_CARDS.length - 1) {
      // The last card is a small finish: a puff of stars and a cheer.
      setCheer(value => value + 1);
      playSfx('fx.reveal', 0.6);
    }
  }, [readAloud, speak]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => { scrollX.value = event.contentOffset.x; },
    onMomentumEnd: event => {
      runOnJS(onPage)(Math.max(0, Math.min(HOW_TO_CARDS.length - 1, Math.round(event.contentOffset.x / Math.max(1, interval)))));
    },
  }, [interval, onPage]);

  const goTo = (index: number) => {
    const target = Math.max(0, Math.min(HOW_TO_CARDS.length - 1, index));
    scrollRef.current?.scrollTo({ x: target * interval, animated: !reduced });
    onPage(target);
  };

  const toggleRead = () => {
    const next = !readAloud;
    setReadAloud(next);
    playSfx('ui.tap', 0.6);
    if (next) void speak(HOW_TO_CARDS[page]); else stopVoice();
  };

  const openMore = (topic: HelpTopicId | null) => {
    playSfx('ui.tap', 0.6);
    stopVoice();
    setMoreFocus(topic);
    setMore(true);
  };

  const finish = () => {
    stopVoice();
    playSfx('fx.whoosh', 0.5);
    if (navigation.canGoBack()) navigation.goBack();
    RootNavigation.navigate('Explore');
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
          <Animated.ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}
            snapToInterval={interval} decelerationRate="fast" disableIntervalMomentum
            contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP }}
            onScroll={onScroll} scrollEventThrottle={16} style={{ flex: 1 }}>
            {HOW_TO_CARDS.map((card, index) => (
              <CardPage key={card.id} card={card} index={index} width={cardWidth} interval={interval} scrollX={scrollX}
                active={index === page} reduced={reduced} cheer={index === HOW_TO_CARDS.length - 1 ? cheer : 0}
                readAloud={readAloud} onSpeak={toggleRead} />
            ))}
          </Animated.ScrollView>

          <View style={styles.dots} accessible accessibilityRole="adjustable"
            accessibilityLabel="How to play cards" accessibilityValue={{ text: `Card ${page + 1} of ${HOW_TO_CARDS.length}` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={event => goTo(page + (event.nativeEvent.actionName === 'increment' ? 1 : -1))}>
            {HOW_TO_CARDS.map((card, index) => (
              <Dot key={card.id} index={index} interval={interval} scrollX={scrollX} color={card.colors[1]} onPress={() => goTo(index)} />
            ))}
          </View>

          <View style={[styles.footer, { paddingBottom: BOTTOM_BAR_OVERHANG }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Learn more" onPress={() => openMore(HOW_TO_CARDS[page]?.topic ?? null)}
              style={({ pressed }) => [styles.morePill, pressed && { transform: [{ scale: 0.96 }] }]} hitSlop={6}>
              <GameIcon name="info" size={24} />
              <Text style={styles.moreText}>Learn more</Text>
            </Pressable>
            <PulseOnCheer cheer={cheer} reduced={reduced}>
              <GameButton label={last ? "Let's play!" : 'Next'} icon={last ? 'play' : 'arrow'} fullWidth
                onPress={() => (last ? finish() : goTo(page + 1))} />
            </PulseOnCheer>
          </View>
        </View>
      )}
    </Wrapper>
  );
}

function PulseOnCheer({ cheer, reduced, children }: { readonly cheer: number; readonly reduced: boolean; readonly children: ReactNode }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!cheer || reduced) return;
    scale.value = withSequence(withTiming(1.08, { duration: 160 }), withSpring(1, { damping: 7, stiffness: 220 }));
  }, [cheer, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function CardPage({ card, index, width, interval, scrollX, active, reduced, cheer, readAloud, onSpeak }: {
  readonly card: HowToCard; readonly index: number; readonly width: number; readonly interval: number;
  readonly scrollX: SharedValue<number>; readonly active: boolean; readonly reduced: boolean; readonly cheer: number;
  readonly readAloud: boolean; readonly onSpeak: () => void;
}) {
  // Card moves 1x, its art 1.3x: a little depth as you swipe. Reduce Motion keeps cards flat.
  const cardStyle = useAnimatedStyle(() => {
    if (reduced) return {};
    const progress = (scrollX.value - index * interval) / Math.max(1, interval);
    return { transform: [{ scale: interpolate(progress, [-1, 0, 1], [0.92, 1, 0.92], 'clamp') }] };
  });
  const artStyle = useAnimatedStyle(() => {
    if (reduced) return {};
    const progress = (scrollX.value - index * interval) / Math.max(1, interval);
    return { transform: [{ translateX: interpolate(progress, [-1, 0, 1], [width * 0.3, 0, -width * 0.3], 'clamp') }] };
  });
  const demo = Math.min(width - 24, 300);
  return (
    <Animated.View style={[styles.card, { width }, cardStyle]} accessible accessibilityLabel={`${card.title}. ${card.line}`}>
      <LinearGradient colors={card.colors as [string, string]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
      <Pressable accessibilityRole="button" accessibilityLabel={readAloud ? 'Stop reading aloud' : 'Read aloud'}
        onPress={onSpeak} hitSlop={10} style={[styles.speaker, readAloud && styles.speakerOn]}>
        <FontAwesomeIcon icon={faVolumeHigh} size={22} color={BRAND.navy} />
      </Pressable>
      <Animated.View style={[styles.artWrap, artStyle]}>
        <View style={styles.halo} />
        <HowToDemo art={card.art} size={demo} active={active} reduced={reduced} />
        {cheer > 0 && !reduced && <StarBurst key={cheer} size={demo} />}
      </Animated.View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>{card.title}</Text>
        <Text style={styles.line}>{card.line}</Text>
      </View>
    </Animated.View>
  );
}

function Dot({ index, interval, scrollX, color, onPress }: {
  readonly index: number; readonly interval: number; readonly scrollX: SharedValue<number>; readonly color: string;
  readonly onPress: () => void;
}) {
  // Width and color follow the finger directly (no spring started per frame).
  const style = useAnimatedStyle(() => {
    const distance = Math.min(1, Math.abs(scrollX.value / Math.max(1, interval) - index));
    return {
      width: interpolate(distance, [0, 1], [30, 12], 'clamp'),
      backgroundColor: interpolateColor(distance, [0, 1], [color, '#9cc7ea']),
    };
  });
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 16, bottom: 16, left: 6, right: 6 }} accessible={false}>
      <Animated.View style={[styles.dot, style]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, marginTop: -8, backgroundColor: '#e3f3ff' },
  card: {
    marginVertical: 14, borderRadius: 30, overflow: 'hidden', borderWidth: 4, borderColor: BRAND.white,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%' },
  halo: {
    position: 'absolute', width: '84%', aspectRatio: 1, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)',
  },
  speaker: {
    position: 'absolute', top: 12, right: 12, zIndex: 2, width: 46, height: 46, borderRadius: 23, alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: 3, borderColor: BRAND.white,
  },
  speakerOn: { backgroundColor: BRAND.gold },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 22 },
  copy: { paddingHorizontal: 20, paddingBottom: 24, alignItems: 'center' },
  title: {
    fontFamily: 'Shark', fontSize: 38, color: BRAND.white, textAlign: 'center',
    textShadowColor: 'rgba(5,52,110,0.45)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0,
  },
  line: { fontFamily: 'Knockout', fontSize: 26, lineHeight: 30, color: BRAND.white, textAlign: 'center', marginTop: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 10 },
  dot: { height: 12, borderRadius: 6 },
  footer: { paddingHorizontal: 16, gap: 10 },
  morePill: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 18,
    borderRadius: RADIUS.pill, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.navy,
  },
  moreText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
});
