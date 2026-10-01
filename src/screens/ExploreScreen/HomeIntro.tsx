import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image, type ImageSource } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameButton, SHADOW } from '../../ui';

export const HOME_INTRO_KEY = 'home_intro_seen_v1';

export interface HomeIntroStep {
  readonly title: string;
  readonly body: string;
  readonly art: ImageSource;
  readonly badge?: string;
}

/** Three quick cards: where finds come from, how to grab one, why sets matter. */
export const HOME_INTRO_STEPS: readonly HomeIntroStep[] = [
  {
    title: 'Finds pop up near you',
    body: 'Treats appear on the map around you, even at home. Each one leaves after a while, so watch its timer.',
    art: require('../../../assets/images/prep-items/churros/churro_18.png'),
    badge: 'leaves in 21 min',
  },
  {
    title: 'Walk close, then tap',
    body: 'Your shark has a grab zone. A find inside it bounces and says TAP TO GRAB. Farther finds show how far to walk.',
    art: require('../../../assets/images/screens/pin-collections/shark.png'),
    badge: 'TAP TO GRAB',
  },
  {
    title: 'Fill sets for rewards',
    body: 'Every find goes into a set, like the Churro Collection. Finds and finished sets earn Energy and Tickets for your next park day.',
    art: require('../../../assets/images/screens/profile/pin_collections.png'),
    badge: 'Churro Collection: 3/40',
  },
];

function storageKey(playerId: number) {
  return `${HOME_INTRO_KEY}:${playerId}`;
}

/** Loads whether this player has seen the intro. Null while unknown. */
export function useHomeIntroSeen(playerId: number | null | undefined): [boolean | null, () => void] {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    setSeen(null);
    if (!playerId) return;
    let alive = true;
    AsyncStorage.getItem(storageKey(playerId))
      .then(value => { if (alive) setSeen(value === '1'); })
      // Storage trouble should never trap a player behind the intro.
      .catch(() => { if (alive) setSeen(true); });
    return () => { alive = false; };
  }, [playerId]);
  const markSeen = () => {
    setSeen(true);
    if (playerId) void AsyncStorage.setItem(storageKey(playerId), '1').catch(() => undefined);
  };
  return [seen, markSeen];
}

/** First-time home intro: three cards, shown once, skippable at every step. */
export default function HomeIntro({ onDone }: { readonly onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedGameMotion();
  const step = HOME_INTRO_STEPS[index];
  const last = index === HOME_INTRO_STEPS.length - 1;
  return (
    // A real modal so the intro sits above the menu button, the map chips and
    // the tab bar (inside the map it drew under the hamburger, which poked
    // into the card's corner).
    <Modal transparent visible statusBarTranslucent animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onDone}>
      <View style={styles.scrim} accessibilityViewIsModal>
        <View style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip the intro" hitSlop={10}
            onPress={onDone} style={styles.skip}>
            <Text style={styles.skipText}>SKIP</Text>
          </Pressable>
          <Text style={styles.kicker}>HOW HOME FINDS WORK · {index + 1} OF {HOME_INTRO_STEPS.length}</Text>
          <Animated.View key={index} style={styles.artWell}
            entering={reducedMotion ? undefined : FadeIn.duration(160)}>
            <Image source={step.art} style={styles.art} contentFit="contain" />
            {step.badge && <View style={[styles.badge, index === 1 && styles.badgeGold]}>
              <Text style={[styles.badgeText, index === 1 && styles.badgeTextGold]}>{step.badge}</Text>
            </View>}
          </Animated.View>
          <Text style={styles.title} accessibilityRole="header">{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          <View style={styles.dots} accessibilityElementsHidden>
            {HOME_INTRO_STEPS.map((_, dot) => <View key={dot} style={[styles.dot, dot === index && styles.dotOn]} />)}
          </View>
          <GameButton label={last ? "Let's hunt" : 'Next'} size="compact"
            onPress={() => (last ? onDone() : setIndex(index + 1))} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: BRAND.scrim,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  card: { width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 24,
    borderWidth: 4, borderColor: BRAND.white, paddingTop: 16, paddingBottom: 18, paddingHorizontal: 18, ...SHADOW.card },
  skip: { position: 'absolute', top: 12, right: 14, zIndex: 2, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 10, backgroundColor: BRAND.sky },
  skipText: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.navySoft, letterSpacing: 0.4 },
  kicker: { alignSelf: 'flex-start', fontFamily: 'Knockout', fontSize: 12, color: BRAND.navySoft, letterSpacing: 0.4 },
  artWell: { width: 150, height: 130, marginTop: 12, borderRadius: 22, backgroundColor: BRAND.sky,
    borderWidth: 3, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  art: { width: 104, height: 104 },
  badge: { position: 'absolute', bottom: -12, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10,
    backgroundColor: BRAND.blue, borderWidth: 2, borderColor: BRAND.white },
  badgeGold: { backgroundColor: BRAND.gold },
  badgeText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.white },
  badgeTextGold: { color: BRAND.navy },
  title: { marginTop: 22, fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, textAlign: 'center' },
  // Three lines tall on every step, so the card and its button do not jump between steps.
  body: { marginTop: 6, minHeight: 63, fontFamily: 'Knockout', fontSize: 16, lineHeight: 21, color: BRAND.navySoft, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.skyDeep },
  dotOn: { width: 22, backgroundColor: BRAND.blueBright },
});
