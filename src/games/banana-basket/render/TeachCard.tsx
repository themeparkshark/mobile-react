/**
 * Teaching cards (design 6.5, WarioWare rule: one line, 4 words max, a
 * 2-frame demo) and queue set cards. A card is a forced
 * freeze: the sim is not stepping while it shows, and it leaves on the next
 * touch after its minimum time (1.2 s teaching, 1.5 s set card). Bright
 * card, never a dark veil. Art is Alex's / gate-passed only.
 */

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import {
  CARD_AIM, CARD_BALL, CARD_CATCH, CARD_GATE, CARD_GOLDEN, CARD_GULL, CARD_HEAT, CARD_PAIL, CARD_PUFFER, CARD_SET_BASE,
} from '../constants';

const IMG = {
  ball: require('../../../assets/games/banana-basket/v2/ball.png'),
  puffer: require('../../../assets/games/banana-basket/v2/puffer.png'),
  pufferFull: require('../../../assets/games/banana-basket/v2/puffer_full.png'),
  coin: require('../../../assets/games/banana-basket/v2/coin.png'),
  banana: require('../../../assets/games/banana-basket/v2/banana.png'),
  bunch: require('../../../assets/games/banana-basket/v2/bunch.png'),
  basket: require('../../../assets/games/banana-basket/v2/basket.png'),
  pail: require('../../../assets/games/banana-basket/v2/pail.png'),
  shark: require('../../../assets/games/banana-basket/v2/shark_hold.png'),
  cheer: require('../../../assets/games/banana-basket/v2/shark_cheer.png'),
  gull: require('../../../assets/games/banana-basket/v2/gull_glide.png'),
  gullUp: require('../../../assets/games/banana-basket/v2/gull_up.png'),
  streak: require('../../../assets/games/banana-basket/v2/streak.png'),
};

export interface CardInfo {
  id: number;
  /** WarioWare rule (6.5): one line, 4 words max. */
  title: string;
  /** 2-frame demo: the art alternates between these. */
  image: ImageSourcePropType;
  image2: ImageSourcePropType;
  /** Lines for set cards (banked score, chain kept). */
  lines?: string[];
  minMs: number;
}

export function cardInfo(id: number, extra?: { setScore?: number; chain?: number; gullSet?: boolean }): CardInfo {
  if (id >= CARD_SET_BASE) {
    const set = id - CARD_SET_BASE;
    const lines: string[] = [`SET ${set} BANKED`];
    if (extra?.setScore !== undefined) lines.push(`SCORE ${extra.setScore}`);
    if (extra?.chain) lines.push(`CHAIN ${extra.chain} KEPT`);
    if (set === 1 && extra?.gullSet) return { id, title: 'NEXT: GULL SET!', image: IMG.gull, image2: IMG.gullUp, lines, minMs: 1500 };
    if (set === 2) return { id, title: 'CART TIP-OVER!', image: IMG.bunch, image2: IMG.banana, lines, minMs: 1500 };
    return { id, title: 'NEXT SET!', image: IMG.puffer, image2: IMG.pufferFull, lines, minMs: 1500 };
  }
  switch (id) {
    case CARD_CATCH:
      return { id, title: 'CATCH!', image: IMG.banana, image2: IMG.basket, minMs: 1200 };
    case CARD_BALL:
      return { id, title: 'KEEP IT UP!', image: IMG.ball, image2: IMG.basket, minMs: 1200 };
    case CARD_AIM:
      return { id, title: 'AIM WITH THE RIM!', image: IMG.basket, image2: IMG.coin, minMs: 1200 };
    case CARD_PUFFER:
      return { id, title: 'DODGE!', image: IMG.puffer, image2: IMG.pufferFull, minMs: 1200 };
    case CARD_GOLDEN:
      return { id, title: 'GOLDEN HOUR!', image: IMG.coin, image2: IMG.cheer, minMs: 1200 };
    case CARD_GATE:
      return { id, title: 'BALL UNLOCKS x3!', image: IMG.ball, image2: IMG.streak, minMs: 1200 };
    case CARD_GULL:
      return { id, title: 'DUCK THE GULL!', image: IMG.gull, image2: IMG.gullUp, minMs: 1200 };
    case CARD_PAIL:
      return { id, title: 'PAIL SAVES ONCE!', image: IMG.pail, image2: IMG.ball, minMs: 1200 };
    case CARD_HEAT:
      return { id, title: 'SAME LINE, SAME RACE!', image: IMG.cheer, image2: IMG.shark, minMs: 1200 };
    default:
      return { id, title: 'HEADS UP!', image: IMG.shark, image2: IMG.cheer, minMs: 1200 };
  }
}

export function TeachCard({ card, ready }: { card: CardInfo; ready: boolean }) {
  const pop = useSharedValue(0.6);
  const bob = useSharedValue(0);
  const hint = useSharedValue(0);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => 1 - f), 420);
    return () => clearInterval(id);
  }, []);
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
      <Animated.View style={[styles.cardWrap, cardStyle]}>
        <View style={styles.card} collapsable={false}>
        <Animated.View style={artStyle}>
          <Image source={frame === 0 ? card.image : card.image2} style={styles.art} resizeMode="contain" />
        </Animated.View>
        {card.lines?.map((l) => (
          <Text key={l} style={styles.line}>{l}</Text>
        ))}
        <Text style={styles.title}>{card.title}</Text>
        <Animated.Text style={[styles.hint, hintStyle]}>TOUCH TO PLAY</Animated.Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.28)' },
  cardWrap: { width: '82%' },
  card: {
    width: '100%',
    overflow: 'hidden',
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
  title: { fontFamily: 'Shark', fontSize: 34, color: '#23263a', textAlign: 'center', marginTop: 4 },
  body: { fontFamily: 'Knockout', fontSize: 18, color: '#23263a', textAlign: 'center', marginTop: 6, lineHeight: 22 },
  hint: { fontFamily: 'Shark', fontSize: 18, color: '#ff6b5c', marginTop: 12 },
});
