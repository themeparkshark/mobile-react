/**
 * RivalStrip.tsx: the Memory Race rival strip (design 4.5, 6.8).
 *
 * Each racer is a shark token (Alex's colour variants, resized only) with
 * pairs, a chain flame and a sticker emote bubble. Tokens drop in with a bouncy
 * land (y -40 -> 0, squash 0.85 -> 1.05 -> 1.0 over 260ms, Fall Guys). Never
 * shows a rival's cards or slots.
 */
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { SHARKS, STICKERS } from '../../../gamekit/party/partyArt';
import type { EmoteId } from '../../../gamekit/net/partyTypes';
import { MM } from '../theme';

export interface Racer {
  key: string;
  name: string;
  shark: keyof typeof SHARKS;
  pairs: number;
  chain: number;
  showtime: boolean;
  me: boolean;
  placement: number;
  emote: { id: EmoteId; at: number } | null;
  incoming?: boolean;
}

export function RivalStrip({ racers, total, reducedMotion }: { racers: Racer[]; total: number; reducedMotion: boolean }) {
  return (
    <View style={styles.strip} accessible accessibilityLabel={racers.map((r) => `${r.name} ${r.pairs} of ${total}`).join(', ')}>
      {racers.map((r, i) => <Token key={r.key} r={r} total={total} index={i} reducedMotion={reducedMotion} />)}
    </View>
  );
}

function Token({ r, total, index, reducedMotion }: { r: Racer; total: number; index: number; reducedMotion: boolean }) {
  const drop = useSharedValue(reducedMotion ? 1 : 0);
  const squash = useSharedValue(1);
  const bubble = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    drop.value = withDelay(index * 90, withTiming(1, { duration: 200, easing: Easing.in(Easing.quad) }));
    squash.value = withDelay(index * 90 + 200, withSequence(withTiming(0.85, { duration: 60 }), withTiming(1.05, { duration: 110 }), withTiming(1, { duration: 90 })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!r.emote) return;
    bubble.value = withSequence(withTiming(1, { duration: 160, easing: Easing.out(Easing.back(2)) }), withDelay(1200, withTiming(0, { duration: 180 })));
  }, [r.emote?.at, bubble, r.emote]);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - drop.value) * -40 }, { scaleY: squash.value }, { scaleX: 2 - squash.value }],
    opacity: drop.value,
  }));
  const bst = useAnimatedStyle(() => ({ opacity: bubble.value, transform: [{ scale: 0.5 + bubble.value * 0.5 }] }));
  return (
    <Animated.View style={[styles.token, r.me && styles.tokenMe, r.incoming && styles.tokenIncoming, st]}>
      <Text style={[styles.place, r.placement === 1 && styles.placeFirst]}>{r.placement}</Text>
      <Image source={SHARKS[r.shark]} style={styles.shark} resizeMode="contain" />
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>{r.me ? 'YOU' : r.name}</Text>
        <Text style={[styles.pairs, r.showtime && { color: MM.goldDeep }]}>{`${r.pairs}/${total}${r.chain >= 3 ? ' x2' : ''}`}</Text>
      </View>
      {r.emote ? (
        <Animated.View style={[styles.bubble, bst]}>
          <Image source={STICKERS[r.emote.id]} style={styles.sticker} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: { flex: 1, flexDirection: 'row', marginHorizontal: 6, justifyContent: 'space-between' },
  token: {
    flex: 1, marginHorizontal: 2, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 2,
    borderColor: '#ffffff', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2,
  },
  tokenMe: { borderColor: MM.gold, backgroundColor: '#fff8e4' },
  tokenIncoming: { borderColor: MM.urgent },
  place: { position: 'absolute', left: 2, top: -8, fontFamily: 'Shark', fontSize: 14, color: '#ffffff', textShadowColor: MM.ink, textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 1 },
  placeFirst: { color: MM.gold },
  shark: { width: 22, height: 26 },
  meta: { flex: 1, marginLeft: 1 },
  name: { fontFamily: 'Knockout', fontSize: 10, color: MM.navyText },
  pairs: { fontFamily: 'Shark', fontSize: 13, color: MM.navyText },
  bubble: {
    position: 'absolute', top: 38, left: 6, width: 34, height: 34, borderRadius: 17, backgroundColor: '#ffffff', borderWidth: 2,
    borderColor: MM.ink, alignItems: 'center', justifyContent: 'center',
  },
  sticker: { width: 26, height: 26 },
});
