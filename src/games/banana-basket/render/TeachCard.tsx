/**
 * Teaching cards (Mario Party) and queue set cards. A card is a forced
 * freeze: the sim is not stepping while it shows, and it leaves on the next
 * touch after its minimum time (1.2 s teaching, 1.5 s set card). Bright
 * card, never a dark veil. Art is Alex's / gate-passed only.
 */

import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import {
  CARD_BALL, CARD_BEACH, CARD_BREEZY, CARD_FINGER, CARD_GOLDEN, CARD_GULLS, CARD_PUFFER, CARD_RIM, CARD_SET_BASE,
  CARD_SPLASH,
} from '../constants';

const IMG = {
  ball: require('../../../assets/games/banana-basket/v2/ball.png'),
  puffer: require('../../../assets/games/banana-basket/v2/puffer_full.png'),
  coin: require('../../../assets/games/banana-basket/v2/coin.png'),
  banana: require('../../../assets/games/banana-basket/v2/banana.png'),
  bunch: require('../../../assets/games/banana-basket/v2/bunch.png'),
  finger: require('../../../assets/games/banana-basket/v2/finger.png'),
  shark: require('../../../assets/games/banana-basket/v2/shark_hold.png'),
  cheer: require('../../../assets/games/banana-basket/v2/shark_cheer.png'),
  gull: require('../../../assets/games/banana-basket/v2/gull_glide.png'),
};

export interface CardInfo {
  id: number;
  title: string;
  body: string;
  image: ImageSourcePropType;
  /** Lines for set cards (banked score, chain kept, next). */
  lines?: string[];
  minMs: number;
}

export const TWIST_CARD: Record<number, { title: string; body: string }> = {
  [CARD_BREEZY]: { title: 'PARK TWIST: BREEZY', body: 'The wind pushes snacks sideways. Watch the drift.' },
  [CARD_BEACH]: { title: 'PARK TWIST: BEACH PARTY', body: 'Ball bounces pay double and the ball comes back fast.' },
  [CARD_SPLASH]: { title: 'PARK TWIST: SPLASHDOWN', body: 'Listen for the gurgle. Stay out of the ripples or your chain freezes.' },
  [CARD_GULLS]: { title: 'PARK TWIST: GULL SEASON', body: 'Leave the shadow before the gull dives.' },
};

export function cardInfo(id: number, extra?: { setScore?: number; chain?: number; twistCard?: number; nextSet?: number; gullSet?: boolean }): CardInfo {
  if (id >= CARD_SET_BASE) {
    const set = id - CARD_SET_BASE;
    const lines: string[] = [];
    if (extra?.setScore !== undefined) lines.push(`SCORE ${extra.setScore}`);
    if (extra?.chain) lines.push(`CHAIN ${extra.chain} KEPT`);
    let title = `SET ${set} DONE`;
    let body = 'Shuffle forward, then touch to start the next set.';
    let image = set === 2 ? IMG.bunch : IMG.cheer;
    if (set === 1 && extra?.gullSet) {
      title = 'NEXT: GULL SET!';
      body = 'Listen for the squawk. Slide out of the shadow before the gull dives.';
      image = IMG.gull;
      lines.unshift('SET 1 DONE');
    } else if (set === 1 && extra?.twistCard && TWIST_CARD[extra.twistCard]) {
      title = TWIST_CARD[extra.twistCard].title;
      body = TWIST_CARD[extra.twistCard].body;
      lines.unshift(`SET 1 DONE`);
    } else if (set === 2) {
      title = 'NEXT: CART TIP-OVER!';
      body = 'The snack cart dumps a shower. Then FINAL RUSH.';
      lines.unshift('SET 2 DONE');
    }
    return { id, title, body, image, lines, minMs: 1500 };
  }
  switch (id) {
    case CARD_BALL:
      return { id, title: 'KEEP THE BALL UP', body: 'Bounce it off your basket. The ball is the key: x3 and x4 only count while it stays up.', image: IMG.ball, minMs: 1200 };
    case CARD_PUFFER:
      return { id, title: 'DODGE THE PUFFERFISH', body: 'Listen for the creak and watch the coral shadow. A hit costs a heart.', image: IMG.puffer, minMs: 1200 };
    case CARD_GOLDEN:
      return { id, title: 'GOLDEN HOUR!', body: 'Three coins light it up. Every catch pays more and the basket gets wider.', image: IMG.coin, minMs: 1200 };
    case CARD_RIM:
      return { id, title: 'RIM ROLL', body: 'Close ones roll in on the rim. Nudge toward it for a SAVE!', image: IMG.banana, minMs: 1200 };
    case CARD_FINGER:
      return { id, title: 'FOAM FINGER', body: 'Snacks curve into your basket for 6 seconds.', image: IMG.finger, minMs: 1200 };
    default:
      return { id, title: 'HEADS UP', body: '', image: IMG.shark, minMs: 1200 };
  }
}

export function TeachCard({ card, ready }: { card: CardInfo; ready: boolean }) {
  const pop = useSharedValue(0.6);
  const bob = useSharedValue(0);
  const hint = useSharedValue(0);
  useEffect(() => {
    pop.value = withSpring(1, { damping: 10, stiffness: 260 });
    bob.value = withRepeat(withSequence(withTiming(-8, { duration: 380, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 380, easing: Easing.inOut(Easing.quad) })), -1);
  }, [card.id, pop, bob]);
  useEffect(() => {
    hint.value = ready ? withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.55, { duration: 400 })), -1) : 0;
  }, [ready, hint]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const artStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.card, cardStyle]}>
        <Animated.View style={artStyle}>
          <Image source={card.image} style={styles.art} resizeMode="contain" />
        </Animated.View>
        {card.lines?.map((l) => (
          <Text key={l} style={styles.line}>{l}</Text>
        ))}
        <Text style={styles.title}>{card.title}</Text>
        <Text style={styles.body}>{card.body}</Text>
        <Animated.Text style={[styles.hint, hintStyle]}>TOUCH TO PLAY</Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.28)' },
  card: {
    width: '82%',
    backgroundColor: '#fff8e4',
    borderRadius: 24,
    borderWidth: 4,
    borderColor: '#23263a',
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  art: { width: 120, height: 120, marginBottom: 6 },
  line: { fontFamily: 'Shark', fontSize: 18, color: '#0768b9', marginBottom: 2 },
  title: { fontFamily: 'Shark', fontSize: 26, color: '#23263a', textAlign: 'center', marginTop: 4 },
  body: { fontFamily: 'Knockout', fontSize: 18, color: '#23263a', textAlign: 'center', marginTop: 6, lineHeight: 22 },
  hint: { fontFamily: 'Shark', fontSize: 18, color: '#ff6b5c', marginTop: 12 },
});
