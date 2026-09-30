/**
 * VS rail (design 3 / 8): cream pill with 3pt outline. Your portrait and
 * rolling-odometer score on the left, the opponent's on the right, round pips
 * in the middle (current pulses, won gold, lost cream, opponent blue), the
 * streak flame with visible tiers, the lifeline tray and the LOCKED badges
 * that punch in with the opponent's real lock time.
 */
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { CountUpText } from '../../../gamekit/fx/CountUpText';
import { ART, C, FIN_POSES, SHARKS, type SharkLook } from '../art';

export type PipState = 'pending' | 'current' | 'me' | 'opp' | 'both' | 'none';

export interface RailSide {
  name: string;
  score: number;
  look: SharkLook | 'fin';
  lockLabel: string | null;
  stake: string | null;
  ghost?: boolean;
  badge?: string | null;
}

interface Props {
  me: RailSide;
  opp: RailSide;
  pips: PipState[];
  flame: 0 | 1 | 2 | 3 | 5;
  streak: number;
  shield: boolean;
  tray: { chomp: boolean; freeze: boolean; peek: boolean };
  moving: boolean;
  reducedMotion: boolean;
  onTickCoin?: () => void;
}

export const Rail = React.memo(function Rail({ me, opp, pips, flame, streak, shield, tray, moving, reducedMotion, onTickCoin }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <Side side={me} align="left" reducedMotion={reducedMotion} onTick={onTickCoin} />
        <View style={styles.mid}>
          <View style={styles.pips}>
            {pips.map((p, i) => <Pip key={i} state={p} reducedMotion={reducedMotion} />)}
          </View>
          <View style={styles.midRow}>
            <Flame tier={flame} streak={streak} shield={shield} reducedMotion={reducedMotion} />
            <View style={styles.tray}>
              <TraySlot on={tray.chomp} src={ART.chomp} wide />
              <TraySlot on={tray.freeze} src={ART.stopwatch} />
              <TraySlot on={tray.peek} src={ART.magnifier} />
            </View>
          </View>
          {moving ? <Text style={styles.moving}>LINE MOVING</Text> : null}
        </View>
        <Side side={opp} align="right" reducedMotion={reducedMotion} />
      </View>
    </View>
  );
});

function Side({ side, align, reducedMotion, onTick }: { side: RailSide; align: 'left' | 'right'; reducedMotion: boolean; onTick?: () => void }) {
  const punch = useSharedValue(1);
  const badgeS = useSharedValue(0);
  useEffect(() => {
    if (!side.lockLabel) { badgeS.value = 0; return; }
    if (reducedMotion) { badgeS.value = 1; return; }
    punch.value = withSequence(withTiming(1.25, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 320 }));
    badgeS.value = withSequence(withTiming(1.35, { duration: 80 }), withSpring(1, { damping: 9, stiffness: 360 }));
  }, [side.lockLabel, punch, badgeS, reducedMotion]);
  const pStyle = useAnimatedStyle(() => ({ transform: [{ scale: punch.value }] }));
  const bStyle = useAnimatedStyle(() => ({ transform: [{ scale: badgeS.value }], opacity: badgeS.value > 0 ? 1 : 0 }));
  const src = side.look === 'fin' ? FIN_POSES.idle : SHARKS[side.look];
  const portrait = (
    <Animated.View style={[styles.portrait, side.ghost && styles.ghostRing, pStyle]}>
      <Image source={src} style={[styles.portraitImg, side.look !== 'fin' && align === 'left' && { transform: [{ scaleX: -1 }] }, side.ghost && { opacity: 0.55 }]} />
    </Animated.View>
  );
  const score = (
    <View style={[styles.scoreCol, align === 'right' && { alignItems: 'flex-end' }]}>
      <Text style={styles.name} numberOfLines={1}>{side.name}</Text>
      <CountUpText value={side.score} style={styles.score} reducedMotion={reducedMotion} tickEvery={align === 'left' ? 25 : 0} onTick={onTick} />
    </View>
  );
  return (
    <View style={[styles.side, align === 'right' && { flexDirection: 'row-reverse' }]}>
      {portrait}
      {score}
      <Animated.View style={[styles.lockBadge, align === 'left' ? { left: 6 } : { right: 6 }, bStyle]} pointerEvents="none">
        <Text style={styles.lockText}>{side.lockLabel ?? ''}</Text>
      </Animated.View>
      {side.stake ? (
        <View style={[styles.stake, align === 'left' ? { left: 58 } : { right: 58 }]}>
          <Text style={styles.stakeText}>{side.stake}</Text>
        </View>
      ) : null}
      {side.badge ? (
        <View style={[styles.mastery, align === 'left' ? { left: 0 } : { right: 0 }]}>
          <Text style={styles.masteryText}>{side.badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Pip({ state, reducedMotion }: { state: PipState; reducedMotion: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (state === 'current' && !reducedMotion) s.value = withRepeat(withSequence(withTiming(1.25, { duration: 220 }), withTiming(1, { duration: 220 })), -1);
    else s.value = withSpring(1);
  }, [state, s, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const bg = state === 'me' ? C.gold : state === 'opp' ? C.blue : state === 'both' ? C.green : state === 'current' ? '#ffffff' : C.cream;
  return <Animated.View style={[styles.pip, { backgroundColor: bg }, state === 'current' && { borderColor: C.goldDeep }, st]} />;
}

function Flame({ tier, streak, shield, reducedMotion }: { tier: 0 | 1 | 2 | 3 | 5; streak: number; shield: boolean; reducedMotion: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    s.value = withSequence(withTiming(1.2, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [tier, streak, s, reducedMotion]);
  const scale = tier === 5 ? 1.15 : tier === 3 ? 1 : tier === 2 ? 0.85 : 0.7;
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value * scale }] }));
  return (
    <View style={styles.flameWrap} accessibilityLabel={`Streak ${streak}`}>
      {shield ? <View style={styles.shield} /> : null}
      <Animated.View style={[{ opacity: tier === 0 ? 0.25 : 1 }, st]}>
        <Image source={ART.flame} style={styles.flame} />
      </Animated.View>
      <Text style={styles.flameN}>{streak}</Text>
    </View>
  );
}

function TraySlot({ on, src, wide }: { on: boolean; src: number; wide?: boolean }) {
  const s = useSharedValue(on ? 1 : 0.8);
  useEffect(() => {
    s.value = on ? withSequence(withTiming(1.3, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 300 })) : withTiming(0.85, { duration: 160 });
  }, [on, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <View style={[styles.slot, !on && styles.slotEmpty]}>
      <Animated.View style={st}>
        <Image source={src} style={[wide ? styles.slotImgWide : styles.slotImg, !on && { opacity: 0.22 }]} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingTop: 6 },
  pill: {
    height: 72, borderRadius: 36, backgroundColor: C.cream, borderWidth: 3, borderColor: C.ink,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6,
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  portrait: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#bfe8ff', borderWidth: 3, borderColor: C.ink, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ghostRing: { borderColor: C.blue, borderStyle: 'dashed' },
  portraitImg: { width: 52, height: 52, marginTop: 8 },
  scoreCol: { marginHorizontal: 6, flexShrink: 1 },
  name: { fontFamily: 'Knockout', fontSize: 13, color: C.navy },
  score: { fontFamily: 'Shark', fontSize: 26, color: C.navy, padding: 0, margin: 0 },
  mid: { width: 108, alignItems: 'center' },
  pips: { flexDirection: 'row', marginBottom: 4 },
  pip: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.ink, marginHorizontal: 2.5 },
  midRow: { flexDirection: 'row', alignItems: 'center' },
  flameWrap: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  flame: { width: 26, height: 30 },
  flameN: { position: 'absolute', bottom: -4, fontFamily: 'Shark', fontSize: 13, color: C.navy },
  shield: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, borderColor: C.gold, backgroundColor: 'rgba(254,201,14,0.2)' },
  tray: { flexDirection: 'row', marginLeft: 4 },
  slot: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: C.ink, backgroundColor: '#ffffff', marginHorizontal: 1.5, alignItems: 'center', justifyContent: 'center' },
  slotEmpty: { borderStyle: 'dashed', backgroundColor: 'transparent', borderColor: '#9aa9b8' },
  slotImg: { width: 17, height: 17 },
  slotImgWide: { width: 20, height: 14 },
  moving: { fontFamily: 'Knockout', fontSize: 10, color: C.blue, marginTop: 1 },
  lockBadge: { position: 'absolute', top: -14, backgroundColor: C.gold, borderWidth: 2.5, borderColor: C.ink, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  lockText: { fontFamily: 'Shark', fontSize: 13, color: C.navy },
  stake: { position: 'absolute', bottom: -16, backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: C.ink, borderRadius: 8, paddingHorizontal: 6 },
  stakeText: { fontFamily: 'Shark', fontSize: 13, color: C.coral },
  mastery: { position: 'absolute', bottom: -14, backgroundColor: C.blue, borderRadius: 8, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 5 },
  masteryText: { fontFamily: 'Knockout', fontSize: 10, color: '#fff' },
});
