import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { GAME_INTROS, type MiniGameKind } from '../../services/help/helpTopics';
import { BRAND, GameButton, RADIUS, SHADOW } from '../../ui';

const FINN = require('../../../assets/images/tutorial/teacher-shark.png');

/**
 * How to play one mini-game, shown once per game type before it starts.
 * The game has not started yet, so nothing is interrupted; the timer only
 * begins after Play.
 */
export default function GameIntroCard({ kind, onStart }: {
  readonly kind: MiniGameKind;
  readonly onStart: () => void;
}) {
  const reduced = useReducedGameMotion();
  const intro = GAME_INTROS[kind];
  return (
    <View style={styles.fill} accessibilityViewIsModal>
      <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={styles.card}>
        <Image source={FINN} style={styles.finn} contentFit="contain" />
        <Text style={styles.kicker}>HOW TO PLAY</Text>
        <Text accessibilityRole="header" style={styles.title}>{intro.name}</Text>
        <Text style={styles.body}>{intro.how}</Text>
        <Text style={styles.win}>{intro.win}</Text>
        <GameButton label="Play" onPress={onStart} accessibilityHint="Starts the game and its timer" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: BRAND.scrim },
  card: {
    width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: RADIUS.xl,
    borderWidth: 4, borderColor: BRAND.white, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 20, ...SHADOW.card,
  },
  finn: { width: 110, height: 110, marginBottom: 2 },
  kicker: { fontFamily: 'Knockout', fontSize: 14, letterSpacing: 1.2, color: BRAND.navySoft },
  title: { fontFamily: 'Shark', fontSize: 30, color: BRAND.navy, textAlign: 'center', marginBottom: 6 },
  body: { fontFamily: 'Knockout', fontSize: 19, lineHeight: 24, color: BRAND.navy, textAlign: 'center' },
  win: { fontFamily: 'Knockout', fontSize: 17, lineHeight: 22, color: BRAND.blue, textAlign: 'center', marginTop: 6, marginBottom: 16 },
});
