/**
 * Overlays: the between-moments UI (design 5.2 breathers, 5.9 FINISH, 6.10).
 * These render only at Burst boundaries, never per hit.
 *
 *   <Banner>    READY... GO! / FINISH! / callouts: slam 2.2 -> 1.0, Easing.out(back(2))
 *   <Breather>  banked count-up, stats, Walk Boost, next Burst, the GO pad (split into GO and
 *               GO FEVER when fever is banked, v4 6.5), BANK & EXIT
 *   <DuelCard>  Bonk Battle reveal: both scores, tug-of-war bar, winner, stickers
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Canvas, Path, Skia, rect } from '@shopify/react-native-skia';

const NAVY = '#05346e';
const GOLD = '#ffcf3b';
const BLUE = '#0768b9';
const CREAM = '#fff8e4';
const CORAL = '#ff6b5c';

export function Banner({ text, sub, color = '#ffffff', stamp, top }: { text: string | null; sub?: string | null; color?: string; stamp: number; top: number }) {
  const s = useSharedValue(0);
  const o = useSharedValue(0);
  useEffect(() => {
    if (!text) {
      o.value = withTiming(0, { duration: 160 });
      return;
    }
    s.value = 2.2;
    o.value = 1;
    s.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.back(2)) });
  }, [text, stamp, s, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.banner, { top }, style]}>
      {text ? <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.bannerText, { color }]}>{text}</Text> : null}
      {sub ? <Text style={styles.bannerSub}>{sub}</Text> : null}
    </Animated.View>
  );
}

function useCountUp(to: number, ms = 700): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      setV(Math.round(to * (1 - (1 - k) * (1 - k))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

function Ring({ pct, size = 64 }: { pct: number; size?: number }) {
  const p = Skia.Path.Make();
  p.addArc(rect(6, 6, size - 12, size - 12), -90, 360 * Math.max(0, Math.min(1, pct)));
  const bg = Skia.Path.Make();
  bg.addArc(rect(6, 6, size - 12, size - 12), 0, 359.9);
  return (
    <Canvas style={{ width: size, height: size }}>
      <Path path={bg} style="stroke" strokeWidth={9} color={NAVY} />
      <Path path={bg} style="stroke" strokeWidth={5} color="#bfe5ff" />
      <Path path={p} style="stroke" strokeWidth={5} strokeCap="round" color={GOLD} />
    </Canvas>
  );
}

export interface BreatherProps {
  burstNumber: number;
  bursts: number;
  burstScore: number;
  runScore: number;
  stats: { label: string; value: string }[];
  nextBanner: string;
  walkPct: number;
  walkMeters: number;
  boostReady: string | null;
  incomingSplats: number;
  readyEnabled: boolean;
  goal: string | null;
  /** Show the Walk Boost row (random-seed solo Queue Runs only). */
  showWalk?: boolean;
  /** A banked fever: the pad splits into GO and GO FEVER. */
  feverReady?: boolean;
  /** The next Burst is the Boss Run. */
  bossNext?: boolean;
  onReady: () => void;
  onFever?: () => void;
  onBank: () => void;
  canBank: boolean;
  duelLine?: string | null;
}

export function Breather(p: BreatherProps) {
  const count = useCountUp(p.burstScore);
  const pulse = useSharedValue(1);
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withSpring(1, { damping: 14, stiffness: 180 });
  }, [enter]);
  useEffect(() => {
    if (p.readyEnabled) pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 420 }), withTiming(1, { duration: 420 })), -1);
    else pulse.value = 1;
  }, [p.readyEnabled, pulse]);
  const padStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: (1 - enter.value) * -30 }] }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={styles.dim} pointerEvents="none" />
      <Animated.View style={[styles.card, cardStyle]}>
        <Text style={styles.cardKicker}>{`BURST ${p.burstNumber} OF ${p.bursts} BANKED`}</Text>
        <Text style={styles.cardScore}>{`+${count.toLocaleString()}`}</Text>
        <Text style={styles.cardRun}>{`RUN ${p.runScore.toLocaleString()}`}</Text>
        <View style={styles.chips}>
          {p.stats.map((s) => (
            <View key={s.label} style={styles.chip}>
              <Text style={styles.chipValue}>{s.value}</Text>
              <Text style={styles.chipLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
        {p.duelLine ? <Text style={styles.duelLine}>{p.duelLine}</Text> : null}
        {p.goal ? <Text style={styles.goal}>{p.goal}</Text> : null}
        {p.showWalk !== false ? (
          <View style={styles.walkRow}>
            <Ring pct={p.walkPct} size={52} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.walkTitle}>{p.boostReady ? `WALK BOOST: ${p.boostReady}` : 'WALK BOOST'}</Text>
              <Text style={styles.walkSub}>{p.boostReady ? 'Your steps in line put a golden in the next Burst' : `+${Math.round(p.walkMeters)}m walked. Keep shuffling!`}</Text>
            </View>
          </View>
        ) : null}
        {p.incomingSplats > 0 ? (
          <Text style={styles.incoming}>{`INCOMING: ${p.incomingSplats} CANDY SPLAT${p.incomingSplats > 1 ? 'S' : ''}. 3 QUICKS IN A ROW BLOCK ONE`}</Text>
        ) : null}
        <Text style={[styles.next, p.bossNext && { color: CORAL }]}>{p.bossNext ? `BOSS RUN: ${p.nextBanner}` : `NEXT: ${p.nextBanner}`}</Text>
        {p.feverReady ? <Text style={styles.feverHint}>FEVER READY: SAVE IT FOR THE FINALE FOR UP TO x8</Text> : null}
      </Animated.View>
      <View style={styles.thumbZone}>
        {p.feverReady && p.onFever ? (
          <View style={styles.split}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go without fever" onPress={p.readyEnabled ? p.onReady : undefined}
              style={[styles.go, !p.readyEnabled && styles.readyOff]}>
              <Text style={styles.goText}>GO</Text>
              <Text style={styles.readySub}>save fever</Text>
            </Pressable>
            <Animated.View style={padStyle}>
              <Pressable accessibilityRole="button" accessibilityLabel="Go with fever" onPress={p.readyEnabled ? p.onFever : undefined}
                style={[styles.goFever, !p.readyEnabled && styles.readyOff]}>
                <Text style={styles.goText}>GO FEVER</Text>
                <Text style={styles.readySub}>7s of x2</Text>
              </Pressable>
            </Animated.View>
          </View>
        ) : (
          <Animated.View style={padStyle}>
            <Pressable accessibilityRole="button" accessibilityLabel="Ready for the next Burst" onPress={p.readyEnabled ? p.onReady : undefined}
              style={[styles.ready, !p.readyEnabled && styles.readyOff]}>
              <Text style={styles.readyText}>GO</Text>
              <Text style={styles.readySub}>tap when you're set</Text>
            </Pressable>
          </Animated.View>
        )}
        {p.canBank ? (
          <Pressable accessibilityRole="button" onPress={p.onBank} style={styles.bank} hitSlop={10}>
            <Text style={styles.bankText}>BANK &amp; EXIT</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function DuelCard({ me, rival, rivalName, winner, wins, onEmote }: {
  me: number; rival: number; rivalName: string; winner: 'me' | 'rival' | 'tie'; wins: [number, number]; onEmote?: (id: number) => void;
}) {
  const tug = useSharedValue(0.5);
  useEffect(() => {
    const share = me + rival > 0 ? me / (me + rival) : 0.5;
    tug.value = withDelay(300, withTiming(share, { duration: 1400, easing: Easing.out(Easing.cubic) }));
  }, [me, rival, tug]);
  const fill = useAnimatedStyle(() => ({ width: `${tug.value * 100}%` }));
  return (
    <View style={styles.duel}>
      <Text style={styles.duelTitle}>{winner === 'me' ? 'BURST TO YOU!' : winner === 'rival' ? `BURST TO ${rivalName.toUpperCase()}` : 'DEAD HEAT!'}</Text>
      <View style={styles.duelRow}>
        <Text style={styles.duelScore}>{me.toLocaleString()}</Text>
        <Text style={styles.duelWins}>{`${wins[0]} - ${wins[1]}`}</Text>
        <Text style={[styles.duelScore, { color: CORAL }]}>{rival.toLocaleString()}</Text>
      </View>
      <View style={styles.tug}>
        <Animated.View style={[styles.tugFill, fill]} />
      </View>
      {onEmote ? (
        <View style={styles.emotes}>
          {['NICE!', 'GG', 'REMATCH?'].map((label, i) => (
            <Pressable key={label} onPress={() => onEmote(i)} style={styles.emote} hitSlop={6}>
              <Text style={styles.emoteText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bannerText: {
    fontFamily: 'Shark', fontSize: 40, textAlign: 'center', paddingHorizontal: 24, alignSelf: 'stretch',
    textShadowColor: NAVY, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 1,
  },
  bannerSub: {
    fontFamily: 'Shark', fontSize: 20, color: '#ffffff', marginTop: 4, textAlign: 'center', paddingHorizontal: 20,
    textShadowColor: NAVY, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1,
  },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(191,229,255,0.35)' },
  card: {
    marginTop: 14, marginHorizontal: 16, backgroundColor: CREAM, borderRadius: 22, borderWidth: 4, borderColor: NAVY,
    paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center',
  },
  cardKicker: { fontFamily: 'Knockout', fontSize: 15, letterSpacing: 1.5, color: BLUE },
  cardScore: { fontFamily: 'Shark', fontSize: 48, color: NAVY, marginTop: 2 },
  cardRun: { fontFamily: 'Shark', fontSize: 18, color: BLUE },
  chips: { flexDirection: 'row', marginTop: 10 },
  chip: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 3, borderColor: NAVY, paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 4, alignItems: 'center' },
  chipValue: { fontFamily: 'Shark', fontSize: 18, color: NAVY },
  chipLabel: { fontFamily: 'Knockout', fontSize: 11, color: BLUE, letterSpacing: 1 },
  duelLine: { fontFamily: 'Shark', fontSize: 18, color: CORAL, marginTop: 8 },
  goal: { fontFamily: 'Knockout', fontSize: 15, color: NAVY, marginTop: 8 },
  walkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, alignSelf: 'stretch' },
  walkTitle: { fontFamily: 'Shark', fontSize: 17, color: NAVY },
  walkSub: { fontFamily: 'Knockout', fontSize: 13, color: BLUE },
  incoming: { fontFamily: 'Knockout', fontSize: 13, color: CORAL, marginTop: 8, textAlign: 'center' },
  next: { fontFamily: 'Shark', fontSize: 18, color: BLUE, marginTop: 10 },
  feverHint: { fontFamily: 'Knockout', fontSize: 13, color: NAVY, marginTop: 4, textAlign: 'center' },
  split: { flexDirection: 'row', alignItems: 'center' },
  go: {
    width: 128, height: 88, borderRadius: 44, backgroundColor: '#ffffff', borderWidth: 4, borderColor: NAVY,
    borderBottomWidth: 9, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  goFever: {
    width: 196, height: 96, borderRadius: 48, backgroundColor: GOLD, borderWidth: 4, borderColor: NAVY,
    borderBottomWidth: 9, alignItems: 'center', justifyContent: 'center',
  },
  goText: { fontFamily: 'Shark', fontSize: 30, color: NAVY },
  thumbZone: { position: 'absolute', left: 0, right: 0, bottom: 26, alignItems: 'center' },
  ready: {
    width: 240, height: 92, borderRadius: 46, backgroundColor: GOLD, borderWidth: 4, borderColor: NAVY,
    borderBottomWidth: 9, alignItems: 'center', justifyContent: 'center',
  },
  readyOff: { opacity: 0.55 },
  readyText: { fontFamily: 'Shark', fontSize: 40, color: NAVY },
  readySub: { fontFamily: 'Knockout', fontSize: 13, color: NAVY, marginTop: -4 },
  bank: { marginTop: 14, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 3, borderColor: NAVY },
  bankText: { fontFamily: 'Shark', fontSize: 17, color: NAVY },
  duel: { marginTop: 10, alignSelf: 'stretch', backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 3, borderColor: NAVY, padding: 10, alignItems: 'center' },
  duelTitle: { fontFamily: 'Shark', fontSize: 22, color: NAVY },
  duelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 4 },
  duelScore: { fontFamily: 'Shark', fontSize: 24, color: BLUE },
  duelWins: { fontFamily: 'Shark', fontSize: 18, color: NAVY },
  tug: { height: 16, alignSelf: 'stretch', borderRadius: 8, backgroundColor: CORAL, borderWidth: 3, borderColor: NAVY, overflow: 'hidden', marginTop: 6 },
  tugFill: { height: '100%', backgroundColor: '#00a5f5' },
  emotes: { flexDirection: 'row', marginTop: 8 },
  emote: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: CREAM, borderWidth: 2, borderColor: NAVY, marginHorizontal: 4 },
  emoteText: { fontFamily: 'Shark', fontSize: 14, color: NAVY },
});
