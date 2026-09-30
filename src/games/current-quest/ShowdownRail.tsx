/**
 * Showdown rail (design 14.1): every racer as an Alex-colour avatar chip on a
 * 2-voyage track with shells and a check per cleared voyage. Presence without
 * spoilers: no opponent is ever drawn on your board. A racer who clears bounces
 * with a splash; a Shield shows as a bubble on the chip.
 */

import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { CQ } from './theme';

const AVATARS = {
  you: require('../../assets/games/current-quest/avatar_classic.png'),
  blue: require('../../assets/games/current-quest/avatar_blue.png'),
  green: require('../../assets/games/current-quest/avatar_green.png'),
  orange: require('../../assets/games/current-quest/avatar_orange.png'),
};
const SHELL = require('../../assets/games/current-quest/golden_pearl.png');
const BUBBLE = require('../../assets/games/current-quest/shield_bubble.png');

export interface RailRacer {
  seat: number;
  name: string;
  avatar: keyof typeof AVATARS;
  you: boolean;
  cleared: number;
  shells: number;
  strokes: number;
  finished: boolean;
  shield: boolean;
  /** Changes every time this racer clears (drives the bounce). */
  bump: number;
  place: number;
}

function Chip({ r, total }: { r: RailRacer; total: number }) {
  const s = useSharedValue(1);
  const x = useSharedValue(r.cleared / total);
  useEffect(() => {
    if (r.bump) s.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [r.bump, s]);
  useEffect(() => { x.value = withSpring(Math.min(1, r.cleared / total), { damping: 14, stiffness: 140 }); }, [r.cleared, total, x]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const track = useAnimatedStyle(() => ({ width: `${x.value * 100}%` }));
  return (
    <View style={[styles.chip, r.you && styles.chipYou]}>
      <Animated.View style={[styles.avatarWrap, st]}>
        <Image source={AVATARS[r.avatar]} style={styles.avatar} />
        {r.shield ? <Image source={BUBBLE} style={styles.bubble} /> : null}
      </Animated.View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>{r.you ? 'You' : r.name}</Text>
        <View style={styles.bar}><Animated.View style={[styles.fill, r.finished && styles.fillDone, track]} /></View>
        <View style={styles.row}>
          <Image source={SHELL} style={styles.shell} />
          <Text style={styles.stat}>{r.shells}</Text>
          <Text style={styles.strokes}>{r.finished ? `${r.strokes} st` : `v${Math.min(total, r.cleared + 1)}`}</Text>
        </View>
      </View>
    </View>
  );
}

export const ShowdownRail = React.memo(function ShowdownRail({ racers, remainingMs, total }: { racers: RailRacer[]; remainingMs: number; total: number }) {
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const low = secs <= 30;
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLabel="Showdown standings">
      <View style={styles.chips}>
        {racers.map((r) => <Chip key={`r${r.seat}`} r={r} total={total} />)}
      </View>
      <View style={[styles.window, low && styles.windowLow]}>
        <Text style={[styles.windowTxt, low && styles.windowTxtLow]}>{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: 44, marginHorizontal: 8, marginBottom: 2, flexDirection: 'row', alignItems: 'center' },
  chips: { flex: 1, flexDirection: 'row', gap: 4 },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 11, borderWidth: 1.5, borderColor: CQ.ink, paddingHorizontal: 3, height: 40 },
  chipYou: { backgroundColor: CQ.cream, borderColor: CQ.goldDeep, borderWidth: 2 },
  avatarWrap: { width: 24, height: 26 },
  avatar: { width: 24, height: 26, resizeMode: 'contain' },
  bubble: { position: 'absolute', left: -4, top: -4, width: 32, height: 32, opacity: 0.8 },
  meta: { flex: 1, marginLeft: 2 },
  name: { fontFamily: 'Knockout', fontSize: 11, color: CQ.navy },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(47,47,58,0.15)', overflow: 'hidden', marginVertical: 1 },
  fill: { height: 4, backgroundColor: CQ.water },
  fillDone: { backgroundColor: CQ.gold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  shell: { width: 10, height: 11, resizeMode: 'contain' },
  stat: { fontFamily: 'Knockout', fontSize: 10, color: CQ.ink },
  strokes: { fontFamily: 'Knockout', fontSize: 10, color: CQ.navy, marginLeft: 'auto' },
  window: { marginLeft: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 9, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: CQ.ink },
  windowLow: { backgroundColor: '#ffe3df', borderColor: CQ.coral },
  windowTxt: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy },
  windowTxtLow: { color: CQ.coral },
});
