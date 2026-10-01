/**
 * VS rail (design 3, rev 7): an 84pt cream pill with a 3pt outline. Your
 * 56pt portrait and 28pt rolling score on the left, the opponent's on the
 * right, round pips in the middle (current pulses, won gold, lost cream,
 * opponent blue), the living streak flame next to your score (Skia, 3 seeded
 * paths line-boiled at 10fps, 0.7 / 0.85 / 1.0 / 1.15 per tier, squash-pop
 * on each increment), the 32pt Shield slot, and the LOCKED badges that punch
 * in with the opponent's real lock time (portrait 1 to 1.3 to 1 with a gold
 * ring). Stakes flip face-up on the rail at the Final reveal.
 */
import React, { useEffect, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import Svg, { Path as SvgPath } from 'react-native-svg';
import Animated, {
  useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { CountUpText } from '../../../gamekit/fx/CountUpText';
import { C, FIN_POSES, SHARKS, type SharkLook } from '../art';

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
  /** The Shield slot only shows once the Shield is unlocked (match 2). */
  shieldOn?: boolean;
  moving: boolean;
  reducedMotion: boolean;
  onTickCoin?: () => void;
}

export const Rail = React.memo(function Rail({ me, opp, pips, flame, streak, shield, shieldOn = true, moving, reducedMotion, onTickCoin }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <Side side={me} align="left" reducedMotion={reducedMotion} onTick={onTickCoin} />
        <View style={styles.mid}>
          <View style={styles.pips}>
            {pips.map((p, i) => <Pip key={i} state={p} reducedMotion={reducedMotion} />)}
          </View>
          <View style={styles.midRow}>
            <Flame tier={flame} streak={streak} reducedMotion={reducedMotion} />
            {shieldOn ? <ShieldSlot on={shield} reducedMotion={reducedMotion} /> : null}
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
    punch.value = withSequence(withTiming(1.3, { duration: 90 }), withTiming(1, { duration: 130 }));
    badgeS.value = withSequence(withTiming(1.35, { duration: 80 }), withSpring(1, { damping: 9, stiffness: 360 }));
  }, [side.lockLabel, punch, badgeS, reducedMotion]);
  const pStyle = useAnimatedStyle(() => ({ transform: [{ scale: punch.value }] }));
  const bStyle = useAnimatedStyle(() => ({ transform: [{ scale: badgeS.value }], opacity: badgeS.value > 0 ? 1 : 0 }));
  const src = side.look === 'fin' ? FIN_POSES.idle : SHARKS[side.look];
  const portrait = (
    <Animated.View style={[styles.portrait, side.ghost && styles.ghostRing, side.lockLabel ? styles.lockedRing : null, pStyle]}>
      <Image source={src} style={[styles.portraitImg, side.look !== 'fin' && align === 'left' && { transform: [{ scaleX: -1 }] }, side.ghost && { opacity: 0.55 }]} />
    </Animated.View>
  );
  const score = (
    <View style={[styles.scoreCol, align === 'right' && { alignItems: 'flex-end' }]}>
      <Text style={styles.name} numberOfLines={1}>{side.name}</Text>
      <CountUpText value={side.score} style={[styles.score, { textAlign: align === 'right' ? 'right' : 'left' }]} reducedMotion={reducedMotion} tickEvery={align === 'left' ? 25 : 0} onTick={onTick} />
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

/** Three seeded flame silhouettes (outer coral, gold, cream core) around a 32 x 40 box. */
function flamePath(seed: number, k: number, scale: number): ReturnType<typeof Skia.Path.Make> {
  const rnd = (n: number) => {
    const x = Math.sin((seed + 1) * 12.9898 + n * 78.233 + k * 37.719) * 43758.5453;
    return x - Math.floor(x);
  };
  const p = Skia.Path.Make();
  const cx = 16;
  const base = 38;
  const w = 13 * scale;
  const h = 34 * scale;
  const j = (n: number) => (rnd(n) - 0.5) * 2.2;
  p.moveTo(cx, base);
  p.cubicTo(cx - w + j(1), base - 2, cx - w * 0.9 + j(2), base - h * 0.55, cx - w * 0.25 + j(3), base - h * 0.78);
  p.cubicTo(cx - w * 0.15 + j(4), base - h * 0.62, cx + j(5), base - h * 0.7, cx + 1 + j(6), base - h);
  p.cubicTo(cx + w * 0.6 + j(7), base - h * 0.72, cx + w + j(8), base - h * 0.45, cx + w * 0.92 + j(9), base - h * 0.18);
  p.cubicTo(cx + w * 0.85, base - 2, cx + w * 0.3, base, cx, base);
  p.close();
  return p;
}

const FLAME_SCALE: Record<0 | 1 | 2 | 3 | 5, number> = { 0: 0.6, 1: 0.7, 2: 0.85, 3: 1.0, 5: 1.15 };

function Flame({ tier, streak, reducedMotion }: { tier: 0 | 1 | 2 | 3 | 5; streak: number; reducedMotion: boolean }) {
  const s = useSharedValue(1);
  const sy = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion || streak === 0) return;
    s.value = withSequence(withTiming(1.2, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }));
    sy.value = withSequence(withTiming(0.82, { duration: 60 }), withTiming(1.15, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [tier, streak, s, sy, reducedMotion]);
  // Line boil at 10fps: 3 seeded variants of each layer.
  const boilT = useSharedValue(0);
  useFrameCallback((f) => {
    'worklet';
    if (reducedMotion || f.timeSincePreviousFrame == null) return;
    boilT.value += f.timeSincePreviousFrame;
  });
  const sets = useMemo(() => [0, 1, 2].map((v) => ({
    outer: flamePath(v, 0, 1), mid: flamePath(v + 3, 1, 0.7), core: flamePath(v + 6, 2, 0.42),
  })), []);
  const pick = useDerivedValue(() => Math.floor(boilT.value / 100) % 3);
  const outer = useDerivedValue(() => sets[pick.value].outer);
  const mid = useDerivedValue(() => sets[pick.value].mid);
  const core = useDerivedValue(() => sets[pick.value].core);
  const k = FLAME_SCALE[tier];
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value * k }, { scaleY: sy.value }] }));
  return (
    <View style={styles.flameWrap} accessibilityLabel={`Streak ${streak}`}>
      <Animated.View style={[{ opacity: tier === 0 ? 0.3 : 1 }, st]}>
        <Canvas style={{ width: 32, height: 40 }}>
          <Group>
            <Path path={outer} color={C.coral} />
            <Path path={outer} color={C.ink} style="stroke" strokeWidth={2.5} strokeJoin="round" />
            <Path path={mid} color={C.gold} />
            <Path path={core} color={C.cream} />
          </Group>
        </Canvas>
      </Animated.View>
      <Text style={styles.flameN}>{streak}</Text>
    </View>
  );
}

/** 32pt Shield slot: a gold badge when held, a dashed socket when not. */
function ShieldSlot({ on, reducedMotion }: { on: boolean; reducedMotion: boolean }) {
  const s = useSharedValue(on ? 1 : 0.85);
  useEffect(() => {
    if (reducedMotion) { s.value = on ? 1 : 0.85; return; }
    s.value = on ? withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 300 })) : withTiming(0.85, { duration: 160 });
  }, [on, s, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.shieldSlot, on ? styles.shieldOn : styles.shieldOff, st]} accessibilityLabel={on ? 'Shield ready' : 'No shield'}>
      {on ? (
        <Svg width={22} height={24}>
          <SvgPath d="M11 2 L20 5.5 C20 13 17 19 11 22.5 C5 19 2 13 2 5.5 Z" fill="#ffffff" stroke={C.ink} strokeWidth={2.2} strokeLinejoin="round" />
          <SvgPath d="M11 6 L16.5 8 C16.5 12.5 14.6 16.4 11 18.6 Z" fill={C.blue} />
        </Svg>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 8, paddingTop: 6 },
  pill: {
    height: 76, borderRadius: 38, backgroundColor: C.cream, borderWidth: 3, borderColor: C.ink,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6,
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  portrait: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#bfe8ff', borderWidth: 3, borderColor: C.ink, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ghostRing: { borderColor: C.blue, borderStyle: 'dashed' },
  lockedRing: { borderColor: C.goldDeep, borderWidth: 4 },
  portraitImg: { width: 56, height: 56, marginTop: 8 },
  scoreCol: { marginHorizontal: 6, flexShrink: 1 },
  name: { fontFamily: 'Knockout', fontSize: 13, color: C.navy },
  // Fixed width: the count-up writes text natively, so its box never re-measures (a growing number would clip).
  score: { fontFamily: 'Shark', fontSize: 28, color: C.navy, padding: 0, margin: 0, width: 78 },
  mid: { width: 92, alignItems: 'center' },
  pips: { flexDirection: 'row', marginBottom: 4 },
  pip: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.ink, marginHorizontal: 2.5 },
  midRow: { flexDirection: 'row', alignItems: 'center' },
  flameWrap: { width: 34, height: 42, alignItems: 'center', justifyContent: 'center' },
  flameN: { position: 'absolute', bottom: -4, fontFamily: 'Shark', fontSize: 13, color: C.navy },
  shieldSlot: { width: 32, height: 32, borderRadius: 10, borderWidth: 2.5, marginLeft: 6, alignItems: 'center', justifyContent: 'center' },
  shieldOn: { backgroundColor: C.gold, borderColor: C.ink },
  shieldOff: { borderStyle: 'dashed', borderColor: '#9aa9b8', backgroundColor: 'transparent' },
  moving: { fontFamily: 'Knockout', fontSize: 10, color: C.blue, marginTop: 1 },
  lockBadge: { position: 'absolute', top: -14, backgroundColor: C.gold, borderWidth: 2.5, borderColor: C.ink, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  lockText: { fontFamily: 'Shark', fontSize: 13, color: C.navy },
  stake: { position: 'absolute', bottom: -16, backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: C.ink, borderRadius: 8, paddingHorizontal: 6 },
  stakeText: { fontFamily: 'Shark', fontSize: 13, color: C.coral },
  mastery: { position: 'absolute', bottom: -14, backgroundColor: C.blue, borderRadius: 8, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 5 },
  masteryText: { fontFamily: 'Knockout', fontSize: 10, color: '#fff' },
});
