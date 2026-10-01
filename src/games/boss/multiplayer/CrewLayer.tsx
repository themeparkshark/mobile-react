/**
 * Crew presentation (design v7 13.2-13.3): teammates' sharks ride the row
 * edges and hop on their POPs; a ghost rides at alpha 0.5; on a TEAM STRIKE the
 * merged allies launch from the row edge into the boss's face with you. Pure
 * presentation: every point is settled from each player's own proof.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { ArenaLayout } from '../view';

const SHARK = require('../../../../assets/images/screens/welcome/shark.png');

export interface CrewLayerHandle {
  hop: (who: string) => void;
  caught: (who: string) => void;
  strike: (who: string[]) => void;
}

export interface CrewMate { id: string; name: string; house?: boolean; ghost?: boolean }

function Ally({ mate, side, L, hopKey, caughtKey, strikeKey }: {
  mate: CrewMate; side: -1 | 1; L: ArenaLayout; hopKey: number; caughtKey: number; strikeKey: number;
}) {
  const hop = useSharedValue(0);
  const shake = useSharedValue(0);
  const fly = useSharedValue(0);
  useEffect(() => {
    if (hopKey > 0) hop.value = withSequence(withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 160 }));
  }, [hopKey, hop]);
  useEffect(() => {
    if (caughtKey > 0) shake.value = withSequence(withTiming(1, { duration: 60 }), withTiming(1, { duration: 500 }), withTiming(0, { duration: 120 }));
  }, [caughtKey, shake]);
  useEffect(() => {
    if (strikeKey > 0) fly.value = withSequence(withTiming(1, { duration: 150, easing: Easing.in(Easing.quad) }), withTiming(1, { duration: 120 }), withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) }));
  }, [strikeKey, fly]);
  const x0 = side < 0 ? 4 : L.W - 4 - 52;
  const y0 = L.targetY - 108;
  const tx = L.bossX - 26 - x0;
  const ty = L.bossY + L.bossSize * 0.05 - y0;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x0 + tx * fly.value + Math.sin(shake.value * 40) * 4 * shake.value },
      { translateY: y0 - 16 * hop.value + ty * fly.value },
      { scale: 1 + 0.12 * hop.value - 0.25 * fly.value },
      { rotate: `${side * -18 * fly.value}deg` },
    ],
    opacity: mate.ghost ? 0.5 : 1,
  }));
  return (
    <Animated.View style={[styles.ally, style]} pointerEvents="none">
      <View style={[styles.bubble, mate.ghost && styles.ghostBubble]}>
        <Image source={SHARK} style={[styles.img, side > 0 && styles.flip]} resizeMode="contain" />
      </View>
      <View style={styles.tag}>
        <Text style={styles.tagText} numberOfLines={1}>{mate.name}</Text>
      </View>
      {mate.house ? <Text style={styles.house}>HOUSE CREW</Text> : null}
    </Animated.View>
  );
}

export const CrewLayer = forwardRef<CrewLayerHandle, { L: ArenaLayout; mates: CrewMate[] }>(function CrewLayer({ L, mates }, ref) {
  const [hops, setHops] = useState<Record<string, number>>({});
  const [caught, setCaught] = useState<Record<string, number>>({});
  const [strikes, setStrikes] = useState<Record<string, number>>({});
  const seq = useRef(0);
  useImperativeHandle(ref, () => ({
    hop: (who) => setHops((m) => ({ ...m, [who]: ++seq.current })),
    caught: (who) => setCaught((m) => ({ ...m, [who]: ++seq.current })),
    strike: (whos) => setStrikes((m) => {
      const n = { ...m };
      whos.forEach((w) => { n[w] = ++seq.current; });
      return n;
    }),
  }), []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {mates.slice(0, 2).map((m, i) => (
        <Ally key={m.id} mate={m} side={i === 0 ? -1 : 1} L={L} hopKey={hops[m.id] ?? 0} caughtKey={caught[m.id] ?? 0} strikeKey={strikes[m.id] ?? 0} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  ally: { position: 'absolute', left: 0, top: 0, width: 52, alignItems: 'center' },
  bubble: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 3, borderColor: '#1B2A4A',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ghostBubble: { borderStyle: 'dashed', borderColor: '#0768B9' },
  img: { width: 42, height: 46 },
  flip: { transform: [{ scaleX: -1 }] },
  tag: { marginTop: 2, backgroundColor: '#1B2A4A', borderRadius: 8, paddingHorizontal: 5, maxWidth: 96 },
  tagText: { fontFamily: 'Knockout', fontSize: 11, color: '#FFFFFF' },
  house: { fontFamily: 'Knockout', fontSize: 9, color: '#1B2A4A', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 6, paddingHorizontal: 4, marginTop: 1, overflow: 'hidden' },
});
