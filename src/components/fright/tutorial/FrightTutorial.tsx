/**
 * Fin-ister Nights activation tutorial.
 *
 * intro:  cinematic (night scrim, fog rolls in, distant thunder, the lantern
 *         lights) -> the Deep Lantern opens with the mode name -> 5 swipe cards
 *         in the How to Play card style. Skippable at every step.
 * welcome_back: one card for returning players with what's new this season.
 * replay: the 5 cards only (from the pill "?" or How to Play).
 *
 * Reduce Motion: no drift or thunder, static fades. Audio only when Spooky
 * effects are on. Every card has a VoiceOver label.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { FRIGHT_SOUNDS, playFrightSfx } from '../../map/fright/frightAudio';
import { NIGHT } from '../../../services/fright/theme';
import { TUTORIAL_CARDS } from '../../../services/fright/tutorial';
import { GameIcon } from '../../../ui';
import { NightButton } from '../ui';

const FOG = require('../../map/fright/art/fog-near.webp');
const CARD_ICONS = ['queue', 'fin', 'search', 'sparkle', 'star'] as const;
const CARD_COLORS: readonly (readonly [string, string])[] = [
  [NIGHT.dusk, NIGHT.haunt], [NIGHT.pumpkin, NIGHT.pumpkinDark], [NIGHT.haunt, NIGHT.midnight],
  ['#3f7f8f', NIGHT.haunt], [NIGHT.candy, NIGHT.pumpkin],
];

export type FrightTutorialMode = 'intro' | 'welcome_back' | 'replay';

export default function FrightTutorial({ mode, title, whatsNew, spooky = true, onDone }: {
  readonly mode: FrightTutorialMode;
  readonly title: string;
  readonly whatsNew?: readonly string[] | null;
  readonly spooky?: boolean;
  readonly onDone: () => void;
}) {
  const reduced = useReducedGameMotion();
  const [step, setStep] = useState<'cinematic' | 'lantern' | 'cards' | 'welcome'>(
    mode === 'intro' ? 'cinematic' : mode === 'welcome_back' ? 'welcome' : 'cards');
  const fade = useRef(new Animated.Value(0)).current;
  const fog = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: reduced ? 200 : 700, useNativeDriver: true }).start();
  }, [fade, reduced]);

  useEffect(() => {
    if (step !== 'cinematic') return;
    if (spooky && !reduced) playFrightSfx('fright.intro.thunder', FRIGHT_SOUNDS.thunder, 0.45, 3200);
    const anims = reduced ? [Animated.timing(glow, { toValue: 1, duration: 300, useNativeDriver: true })] : [
      Animated.timing(fog, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([Animated.delay(1200),
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true })]),
    ];
    Animated.parallel(anims).start();
    const timer = setTimeout(() => setStep('lantern'), reduced ? 900 : 2700);
    return () => clearTimeout(timer);
  }, [step, reduced, spooky, fog, glow]);

  useEffect(() => {
    if (step !== 'lantern') return;
    const timer = setTimeout(() => setStep('cards'), 1800);
    return () => clearTimeout(timer);
  }, [step]);

  const skip = (
    <Pressable accessibilityRole="button" accessibilityLabel="Skip the tutorial" onPress={onDone} hitSlop={10} style={styles.skip}>
      <Text style={styles.skipText}>Skip</Text>
    </Pressable>
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]} accessibilityViewIsModal>
      {(step === 'cinematic' || step === 'lantern') && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setStep(step === 'cinematic' ? 'lantern' : 'cards')}
          accessibilityRole="button" accessibilityLabel={`${title} is on. Tap to continue.`}>
          <Animated.View style={[StyleSheet.absoluteFill, {
            opacity: fog.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0.6 : 0, 0.75] }),
            transform: [{ translateX: fog.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 120, 0] }) }],
          }]}>
            <Image source={FOG} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Animated.View>
          <View style={styles.center}>
            <Animated.View style={[styles.lantern, { opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
              <View style={styles.lanternCore}><GameIcon name="sparkle" size={44} /></View>
            </Animated.View>
            {step === 'lantern' && (
              <>
                <Text style={styles.modeName} accessibilityRole="header">{title}</Text>
                <Text style={styles.modeLine}>The fog is rolling in.</Text>
              </>
            )}
          </View>
        </Pressable>
      )}
      {step === 'cards' && <Cards title={title} onDone={onDone} />}
      {step === 'welcome' && (
        <View style={styles.center}>
          <View style={[styles.card, { width: '86%' }]} accessible accessibilityLabel={`Welcome back to ${title}. ${(whatsNew ?? []).join('. ')}`}>
            <LinearGradient colors={[NIGHT.dusk, NIGHT.haunt]} style={styles.cardFill}>
              <GameIcon name="star" size={56} />
              <Text style={styles.cardTitle}>Welcome back</Text>
              <Text style={styles.cardLine}>{title} is on.</Text>
              {(whatsNew ?? []).slice(0, 3).map(line => <Text key={line} style={styles.newLine}>{`New: ${line}`}</Text>)}
            </LinearGradient>
          </View>
          <NightButton label="Let's go" onPress={onDone} style={{ marginTop: 16, minWidth: 200 }} />
        </View>
      )}
      {skip}
    </Animated.View>
  );
}

function Cards({ title, onDone }: { readonly title: string; readonly onDone: () => void }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const cardWidth = width - 48;
  const last = page >= TUTORIAL_CARDS.length - 1;
  const go = (next: number) => {
    scroll.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Text style={styles.cardsKicker}>{title.toUpperCase()}</Text>
      <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={event => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}>
        {TUTORIAL_CARDS.map((card, index) => (
          <View key={card.key} style={{ width, alignItems: 'center' }}>
            <View style={[styles.card, { width: cardWidth }]} accessible
              accessibilityLabel={`Card ${index + 1} of ${TUTORIAL_CARDS.length}. ${card.title}. ${card.line}`}>
              <LinearGradient colors={CARD_COLORS[index] as [string, string]} style={styles.cardFill}>
                <View style={styles.halo}><GameIcon name={CARD_ICONS[index]} size={88} /></View>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardLine}>{card.line}</Text>
              </LinearGradient>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots} accessibilityLabel={`Card ${page + 1} of ${TUTORIAL_CARDS.length}`}>
        {TUTORIAL_CARDS.map((card, index) => (
          <View key={card.key} style={[styles.dot, { backgroundColor: index === page ? NIGHT.candy : NIGHT.dusk }]} />
        ))}
      </View>
      <NightButton label={last ? 'Into the fog' : 'Next'} icon={last ? 'check' : 'arrow'}
        onPress={() => (last ? onDone() : go(page + 1))} style={{ alignSelf: 'center', minWidth: 220 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: 'rgba(30,24,70,0.9)', zIndex: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  lantern: { width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,179,71,0.25)', alignItems: 'center', justifyContent: 'center' },
  lanternCore: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(255,201,60,0.55)', alignItems: 'center', justifyContent: 'center' },
  modeName: { fontFamily: 'Shark', fontSize: 40, color: NIGHT.candy, textAlign: 'center', marginTop: 18,
    textShadowColor: NIGHT.ink, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  modeLine: { fontFamily: 'Knockout', fontSize: 22, color: NIGHT.fogLight, marginTop: 6 },
  skip: { position: 'absolute', top: 60, right: 18, minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, borderWidth: 2, borderColor: NIGHT.fog, paddingHorizontal: 14 },
  skipText: { fontFamily: 'Shark', fontSize: 16, color: NIGHT.fogLight },
  cardsKicker: { fontFamily: 'Shark', fontSize: 16, color: NIGHT.fog, textAlign: 'center', letterSpacing: 1, marginBottom: 6 },
  card: { marginVertical: 14, borderRadius: 30, overflow: 'hidden', borderWidth: 4, borderColor: NIGHT.white,
    shadowColor: NIGHT.ink, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  cardFill: { minHeight: 380, alignItems: 'center', justifyContent: 'center', padding: 22 },
  halo: { width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: 'Shark', fontSize: 34, color: NIGHT.white, textAlign: 'center', marginTop: 16,
    textShadowColor: 'rgba(30,24,56,0.5)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  cardLine: { fontFamily: 'Knockout', fontSize: 23, lineHeight: 28, color: NIGHT.white, textAlign: 'center', marginTop: 8 },
  newLine: { fontFamily: 'Knockout', fontSize: 18, color: NIGHT.moon, textAlign: 'center', marginTop: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
