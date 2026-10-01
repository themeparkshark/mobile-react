/**
 * Async ghost race rail (design 14.3): your shark and your best run on this
 * exact seed ride a 2- or 3-voyage track. Rail only: the ghost's route is never
 * drawn on your board, and split-delta chips at each clear compare strokes,
 * never routes. Rank keys never use raw time.
 */

import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import type { GhostRun } from './progress';
import { CQ } from './theme';

const YOU = require('../../assets/games/current-quest/avatar_classic.png');
const GHOST = require('../../assets/games/current-quest/avatar_blue.png');

function ghostProgress(g: GhostRun, elapsed: number): number {
  let done = 0;
  let prev = 0;
  for (let i = 0; i < g.clearAt.length; i++) {
    const at = g.clearAt[i];
    if (elapsed >= at) { done = i + 1; prev = at; continue; }
    const span = Math.max(1, at - prev);
    return done + Math.min(0.95, (elapsed - prev) / span);
  }
  return done;
}

function Racer({ source, frac, label, ghost, total }: { source: number; frac: number; label: string; ghost?: boolean; total: number }) {
  const x = useSharedValue(frac);
  useEffect(() => { x.value = withSpring(frac, { damping: 14, stiffness: 120 }); }, [frac, x]);
  const st = useAnimatedStyle(() => ({ left: `${Math.min(1, x.value / total) * 88}%` }));
  return (
    <Animated.View style={[styles.racer, st]}>
      <Image source={source} style={[styles.avatar, ghost && styles.ghost]} />
      <Text style={styles.name} numberOfLines={1}>{label}</Text>
    </Animated.View>
  );
}

export const GhostRail = React.memo(function GhostRail({ ghost, elapsedMs, voyage, cleared, total = 3 }: {
  ghost: GhostRun; elapsedMs: number; voyage: number; cleared: number; total?: number;
}) {
  const g = ghostProgress(ghost, elapsedMs);
  const you = Math.max(cleared, Math.min(voyage + 0.5, cleared + 0.5));
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLabel={`Racing your ghost: ${ghost.shells} shells last time`}>
      <View style={styles.track}>
        {Array.from({ length: total - 1 }, (_, i) => i + 1).map((k) => <View key={`t${k}`} style={[styles.tick, { left: `${(k / total) * 88 + 4}%` }]} />)}
        <Text style={styles.goal}>{`Ghost: ${ghost.shells}/${total * 3}`}</Text>
      </View>
      <Racer source={GHOST} frac={g} label="ghost" ghost total={total} />
      <Racer source={YOU} frac={you} label="you" total={total} />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: 40, marginHorizontal: 14, marginBottom: 2, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, top: 17, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1.5, borderColor: CQ.ink },
  tick: { position: 'absolute', top: -4, width: 3, height: 13, borderRadius: 2, backgroundColor: CQ.ink },
  goal: { position: 'absolute', right: 2, top: -16, fontFamily: 'Knockout', fontSize: 11, color: '#ffffff' },
  racer: { position: 'absolute', top: 0, alignItems: 'center', width: 40 },
  avatar: { width: 26, height: 28, resizeMode: 'contain' },
  ghost: { opacity: 0.55 },
  name: { fontFamily: 'Knockout', fontSize: 9, color: '#ffffff', marginTop: -2 },
});
