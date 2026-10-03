/**
 * Fin-ister Nights activation tutorial (rev 2, after the first live test).
 *
 * intro:  full-screen cinematic on its own opaque night sky (nothing from the
 *         map shows through): fog rolls in, distant thunder, the Deep Lantern
 *         lights up, then the mode name -> 5 swipe cards, one short line each.
 * welcome_back: one card for returning players with what's new this season.
 * replay: the 5 cards only (from the pill "?" or How to Play).
 *
 * Layout rules (rev 2):
 *  - A real Modal over everything (tab bar included); opaque themed background.
 *  - Every edge respects the safe area (Dynamic Island, status bar, home bar).
 *  - Skip sits alone in the top-right safe corner on its own backing.
 *  - Card copy sits in the clear sky band of the hero art (no stars, moon or
 *    characters behind it); decorative sparkles never cross text.
 *  - Dots and Next sit in their own bottom band above the home indicator.
 *
 * Reduce Motion: no drift, flash or thunder; static fades. Audio only when
 * Spooky effects are on. Every step has a VoiceOver label.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { FRIGHT_SOUNDS, playFrightSfx } from '../../map/fright/frightAudio';
import { NIGHT } from '../../../services/fright/theme';
import { cardLayout, HERO_COPY_BAND, TUTORIAL_CARDS } from '../../../services/fright/tutorial';
import ArtImage from '../ArtImage';
import { NightButton } from '../ui';

const FOG_FAR = require('../../map/fright/art/fog-far.webp');
const FOG_NEAR = require('../../map/fright/art/fog-near.webp');
const MOON = require('../../map/fright/art/moon-clouds.webp');
const LANTERN = require('../art/lantern.webp');
const HERO = require('../art/tutorial-hero.webp');

export type FrightTutorialMode = 'intro' | 'welcome_back' | 'replay';
export type FrightTutorialStep = 'cinematic' | 'lantern' | 'cards' | 'welcome';

export default function FrightTutorial({ mode, title, whatsNew, spooky = true, hero = null, onDone, initialStep, initialPage = 0 }: {
  readonly mode: FrightTutorialMode;
  /** Server tutorial hero (720x1080, sky band empty for copy); the bundled copy is the fallback. */
  readonly hero?: string | null;
  readonly title: string;
  readonly whatsNew?: readonly string[] | null;
  readonly spooky?: boolean;
  readonly onDone: () => void;
  /** Dev previews and captures only. */
  readonly initialStep?: FrightTutorialStep;
  readonly initialPage?: number;
}) {
  const reduced = useReducedGameMotion();
  const [step, setStep] = useState<FrightTutorialStep>(initialStep
    ?? (mode === 'intro' ? 'cinematic' : mode === 'welcome_back' ? 'welcome' : 'cards'));
  const fade = useRef(new Animated.Value(0)).current;
  const fog = useRef(new Animated.Value(initialStep && initialStep !== 'cinematic' ? 1 : 0)).current;
  const glow = useRef(new Animated.Value(initialStep && initialStep !== 'cinematic' ? 1 : 0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: reduced ? 200 : 600, useNativeDriver: true }).start();
  }, [fade, reduced]);

  // The beat: fog rolls in, thunder flashes, a moment later the lantern lights.
  useEffect(() => {
    if (step !== 'cinematic') return;
    if (reduced) {
      Animated.parallel([
        Animated.timing(fog, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fog, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([Animated.delay(900),
          Animated.timing(flash, { toValue: 0.35, duration: 70, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 160, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0.18, duration: 60, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 220, useNativeDriver: true })]),
        Animated.sequence([Animated.delay(1700),
          Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true })]),
      ]).start();
    }
    const thunder = spooky && !reduced ? setTimeout(() => playFrightSfx('fright.intro.thunder', FRIGHT_SOUNDS.thunder, 0.45, 3200), 1500) : null;
    const next = setTimeout(() => setStep('lantern'), reduced ? 900 : 2900);
    return () => { clearTimeout(next); if (thunder) clearTimeout(thunder); };
  }, [step, reduced, spooky, fog, glow, flash]);

  useEffect(() => {
    if (step !== 'lantern' || initialStep === 'lantern') return;
    const timer = setTimeout(() => setStep('cards'), 2000);
    return () => clearTimeout(timer);
  }, [step, initialStep]);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onDone}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} accessibilityViewIsModal>
        <NightSky reduced={reduced} fog={fog} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />
        {(step === 'cinematic' || step === 'lantern') && (
          <Cinematic step={step} title={title} glow={glow}
            onAdvance={() => setStep(step === 'cinematic' ? 'lantern' : 'cards')} />
        )}
        {step === 'cards' && <Cards title={title} hero={hero} onDone={onDone} initialPage={initialPage} />}
        {step === 'welcome' && <Welcome title={title} whatsNew={whatsNew} onDone={onDone} />}
        <TopBar title={step === 'cards' ? title : null} onSkip={onDone} />
      </Animated.View>
    </Modal>
  );
}

/** The opaque themed backdrop: night gradient, moon, a few still stars up high, fog drifting low. */
function NightSky({ reduced, fog }: { readonly reduced: boolean; readonly fog: Animated.Value }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(drift, { toValue: 1, duration: 26_000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [drift, reduced]);
  const moon = Math.min(width * 0.34, 150);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[NIGHT.ink, NIGHT.midnight, NIGHT.haunt]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <Image source={MOON} contentFit="contain"
        style={{ position: 'absolute', width: moon, height: moon * 0.6, left: 18, top: insets.top + 64, opacity: 0.85 }} />
      {SKY_STARS.map(([x, y, r], i) => (
        <View key={i} style={{ position: 'absolute', left: x * width, top: insets.top + y * height * 0.12, width: r, height: r,
          borderRadius: r / 2, backgroundColor: NIGHT.moon, opacity: 0.7 }} />
      ))}
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.42,
        opacity: fog.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
        transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.5] }) }] }}>
        <Image source={FOG_FAR} contentFit="cover" style={{ position: 'absolute', left: 0, bottom: 0, width: width * 1.5, height: '100%' }} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: -20, height: height * 0.28,
        opacity: fog.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] }),
        transform: [{ translateX: fog.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : -width * 0.4, 0] }) }] }}>
        <Image source={FOG_NEAR} contentFit="cover" style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

/** Tiny still stars in the top band only (never behind text). [x fraction, y fraction of the band, size]. */
const SKY_STARS: readonly (readonly [number, number, number])[] = [
  [0.52, 0.2, 3], [0.62, 0.7, 2], [0.78, 0.35, 3], [0.88, 0.85, 2], [0.4, 0.9, 2],
];

function TopBar({ title, onSkip }: { readonly title: string | null; readonly onSkip: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { top: insets.top + 6 }]} pointerEvents="box-none">
      <Text style={styles.kicker} numberOfLines={1}>{title ? title.toUpperCase() : ''}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Skip the tutorial" onPress={onSkip} hitSlop={8} style={styles.skip}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  );
}

function Cinematic({ step, title, glow, onAdvance }: {
  readonly step: FrightTutorialStep; readonly title: string; readonly glow: Animated.Value; readonly onAdvance: () => void;
}) {
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.56, 240);
  return (
    <Pressable style={styles.center} onPress={onAdvance} accessibilityRole="button"
      accessibilityLabel={`${title} is on. The fog is rolling in. Tap to continue.`}>
      <View style={{ width: size * 1.5, height: size * 1.5, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[styles.halo, { width: size * 1.4, height: size * 1.4, borderRadius: size * 0.7,
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
          transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]} />
        <Animated.View style={{ opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
          <Image source={LANTERN} contentFit="contain" style={{ width: size, height: size }}
            accessibilityIgnoresInvertColors />
        </Animated.View>
      </View>
      <View style={styles.nameBlock}>
        {step === 'lantern' && (
          <>
            <Text style={styles.modeName} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
            <Text style={styles.modeLine}>The fog is rolling in.</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

function Cards({ title, hero, onDone, initialPage }: {
  readonly title: string; readonly hero: string | null; readonly onDone: () => void; readonly initialPage: number;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = cardLayout({ width, height, insetTop: insets.top, insetBottom: insets.bottom });
  const [page, setPage] = useState(initialPage);
  const scroll = useRef<ScrollView>(null);
  const last = page >= TUTORIAL_CARDS.length - 1;
  const go = (next: number) => {
    scroll.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: layout.top, bottom: 0 }}>
      <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
        contentOffset={{ x: initialPage * width, y: 0 }}
        onMomentumScrollEnd={event => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}>
        {TUTORIAL_CARDS.map((card, index) => (
          <View key={card.key} style={{ width, alignItems: 'center' }}>
            <View style={[styles.card, { width: layout.cardWidth, height: layout.cardHeight }]} accessible
              accessibilityLabel={`Card ${index + 1} of ${TUTORIAL_CARDS.length}. ${card.title}. ${card.line}`}>
              <ArtImage uri={hero} fit="cover" style={StyleSheet.absoluteFill}
                fallback={<Image source={HERO} contentFit="cover" style={StyleSheet.absoluteFill} />} />
              <View style={[styles.copy, {
                top: layout.cardHeight * HERO_COPY_BAND.top, height: layout.cardHeight * (HERO_COPY_BAND.bottom - HERO_COPY_BAND.top),
                paddingHorizontal: layout.cardWidth * 0.08 }]}>
                <Text style={[styles.cardTitle, { fontSize: layout.titleSize }]} numberOfLines={1} adjustsFontSizeToFit>{card.title}</Text>
                <Text style={[styles.cardLine, { fontSize: layout.lineSize, lineHeight: layout.lineSize * 1.2 }]}
                  numberOfLines={2} adjustsFontSizeToFit>{card.line}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.bottomBand, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.dots} accessibilityLabel={`Card ${page + 1} of ${TUTORIAL_CARDS.length}`}>
          {TUTORIAL_CARDS.map((card, index) => (
            <View key={card.key} style={[styles.dot, { backgroundColor: index === page ? NIGHT.candy : NIGHT.dusk }]} />
          ))}
        </View>
        <NightButton label={last ? 'Into the fog' : 'Next'} icon={last ? 'check' : 'arrow'}
          onPress={() => (last ? onDone() : go(page + 1))} style={{ alignSelf: 'center', minWidth: 220 }} />
      </View>
    </View>
  );
}

function Welcome({ title, whatsNew, onDone }: { readonly title: string; readonly whatsNew?: readonly string[] | null; readonly onDone: () => void }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width * 0.36, 160);
  const lines = (whatsNew ?? []).slice(0, 3);
  return (
    <View style={styles.center} accessible accessibilityLabel={`Welcome back to ${title}. ${lines.join('. ')}`}>
      <Image source={LANTERN} contentFit="contain" style={{ width: size, height: size }} />
      <Text style={styles.modeName} numberOfLines={1} adjustsFontSizeToFit>Welcome back</Text>
      <Text style={styles.modeLine}>{title} is on.</Text>
      {lines.length > 0 && (
        <View style={styles.newBox}>
          {lines.map(line => <Text key={line} style={styles.newLine}>{`New: ${line}`}</Text>)}
        </View>
      )}
      <NightButton label="Let's go" onPress={onDone} style={{ marginTop: 20, minWidth: 220 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flash: { backgroundColor: NIGHT.fogLight },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  halo: { position: 'absolute', backgroundColor: NIGHT.lantern },
  nameBlock: { minHeight: 96, alignItems: 'center', justifyContent: 'flex-start', marginTop: 6, alignSelf: 'stretch' },
  modeName: { fontFamily: 'Shark', fontSize: 40, color: NIGHT.candy, textAlign: 'center',
    textShadowColor: NIGHT.ink, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  modeLine: { fontFamily: 'Knockout', fontSize: 22, color: NIGHT.fogLight, marginTop: 6, textAlign: 'center' },
  topBar: { position: 'absolute', left: 16, right: 16, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: NIGHT.fog, letterSpacing: 1, marginRight: 12 },
  skip: { minHeight: 40, minWidth: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 20,
    backgroundColor: NIGHT.midnight, borderWidth: 2, borderColor: NIGHT.fog, paddingHorizontal: 16 },
  skipText: { fontFamily: 'Shark', fontSize: 16, color: NIGHT.fogLight },
  card: { borderRadius: 28, overflow: 'hidden', borderWidth: 4, borderColor: NIGHT.white, backgroundColor: NIGHT.haunt,
    shadowColor: NIGHT.ink, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  copy: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: 'Shark', color: NIGHT.white, textAlign: 'center',
    textShadowColor: 'rgba(30,24,56,0.6)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  cardLine: { fontFamily: 'Knockout', color: NIGHT.fogLight, textAlign: 'center', marginTop: 6 },
  bottomBand: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  newBox: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 18, backgroundColor: 'rgba(30,24,56,0.55)' },
  newLine: { fontFamily: 'Knockout', fontSize: 18, color: NIGHT.moon, textAlign: 'center', marginTop: 4 },
});
