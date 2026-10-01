/**
 * Current Quest HUD (design v7.1 10.2, 0.A.1, 0.A.2, 0.A.5): one 56 pt row and
 * the run bar under it. In a run the player sees four things, nothing else:
 *
 *   - the stroke medallion (left): strokes left on Alex-style life ring art, an
 *     arc that drains as strokes are spent with a gold notch at par, a pop on
 *     every stroke, coral and pulsing at 3 or fewer; Trial rings under it;
 *   - three shell sockets for this voyage (centre): Clear, Par, Golden. They
 *     fill with a pop and a ladder tone; the Par socket cracks when Par is lost;
 *   - the tide medallion (right, tide boards only): the current state as a
 *     brush glyph, P pips that drain one per move, a 180 deg flip on each turn,
 *     a next-state inset at 5 o'clock (the Threes "next" tile) and, for a
 *     player's first runs, a "LOW in 2" tag. Hold it to preview the next tide;
 *   - the run bar (under the row): one segment per shell across the run, voyage
 *     dividers and two gold notches at the tier thresholds.
 *
 * No Haul, no pearl dots, no Riptide chip, no unlabeled numbers (0.A.1, J10).
 */

import React, { useEffect, useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Canvas, Circle, Group, Image as SkiaImage, Path, Skia, Text as SkiaText, useFont, useImage,
} from '@shopify/react-native-skia';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { CQ } from './theme';

const RING_ART = require('../../assets/games/current-quest/life_ring_v2.png');
const SOCKET_ART = require('../../assets/games/current-quest/shell_socket.png');
const MEDALLION_ART = require('../../assets/games/current-quest/tide_medallion.png');
const SHARK_FONT = require('../../../assets/fonts/shark-random-funnyness-2.ttf');

export interface HudState {
  voyage: number;
  voyages: number;
  /** Strokes left (limit + bonus - spent), the limit and the par target this voyage. */
  left: number;
  limit: number;
  par: number;
  /** shells[v] = [clear, par, golden] earned on cleared voyages. */
  shells: boolean[][];
  hasGolden: boolean;
  goldenTaken: boolean;
  /** This voyage's Par shell is already gone (undo, tip, ring). */
  parLost: boolean;
  hasTide: boolean;
  tideLow: boolean;
  /** Tide period and moves until the next turn. */
  P: number;
  movesToTurn: number;
  /** Show the "LOW in 2" text tag (a player's first 3 runs). */
  tideTag: boolean;
  rings: number;
  ringsMax: number;
  trial: boolean;
  /** Tier thresholds on the run bar (two-star and three-star shell counts). */
  tiers: [number, number];
  /** Showdown rank chip beside the tide medallion. */
  rank?: { place: number; of: number } | null;
}

const POP = { damping: 9, stiffness: 320, mass: 0.6 };

// ---------------------------------------------------------------------------
// Stroke medallion

const MED = 52;

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const p = Skia.Path.Make();
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 0.12));
  for (let k = 0; k <= steps; k++) {
    const a = from + ((to - from) * k) / steps;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (k === 0) p.moveTo(x, y); else p.lineTo(x, y);
  }
  return p;
}

export const StrokeMedallion = React.memo(function StrokeMedallion({ left, limit, par, spentPar, trial, rings, ringsMax }: {
  left: number; limit: number; par: number; spentPar: number; trial: boolean; rings: number; ringsMax: number;
}) {
  const art = useImage(RING_ART);
  const font = useFont(SHARK_FONT, 26);
  const hot = left <= 3;
  const pop = useSharedValue(1);
  useEffect(() => {
    pop.value = withSequence(withTiming(1.25, { duration: 60 }), withTiming(1, { duration: 80, easing: Easing.out(Easing.quad) }));
  }, [left, pop]);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (hot) pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 420 }), withTiming(1, { duration: 420 })), -1, true);
    else { cancelAnimation(pulse); pulse.value = withTiming(1, { duration: 150 }); }
  }, [hot, pulse]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: pop.value * pulse.value }] }));
  const total = Math.max(1, limit);
  const frac = Math.max(0, Math.min(1, left / total));
  const cx = MED / 2;
  const cy = MED / 2;
  const r = MED / 2 - 3;
  const start = -Math.PI / 2;
  // Drain arc: what is left, clockwise from 12 o'clock.
  const arc = useMemo(() => arcPath(cx, cy, r, start, start + Math.PI * 2 * frac), [frac]); // eslint-disable-line react-hooks/exhaustive-deps
  // Gold notch where the par stroke sits on the arc (strokes left at par = limit - par).
  const parLeft = Math.max(0, total - spentPar);
  const na = start + Math.PI * 2 * (parLeft / total);
  const notch = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(cx + Math.cos(na) * (r - 6), cy + Math.sin(na) * (r - 6));
    p.lineTo(cx + Math.cos(na) * (r + 3), cy + Math.sin(na) * (r + 3));
    return p;
  }, [na]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = String(Math.max(0, left));
  const tw = font ? font.getTextWidth(label) : 0;
  void par;
  return (
    <View style={styles.medWrap} accessibilityLabel={`${left} strokes left, par ${par}`}>
      <Animated.View style={st}>
        <Canvas style={{ width: MED, height: MED }}>
          {art ? <SkiaImage image={art} x={1} y={1} width={MED - 2} height={MED - 2} fit="contain" /> : null}
          <Circle cx={cx} cy={cy} r={r - 9} color="#ffffff" opacity={0.92} />
          <Path path={arc} color={CQ.ink} style="stroke" strokeWidth={7} strokeCap="round" />
          <Path path={arc} color={hot ? CQ.coral : '#7fdaf7'} style="stroke" strokeWidth={4} strokeCap="round" />
          <Path path={notch} color={CQ.ink} style="stroke" strokeWidth={5} strokeCap="round" />
          <Path path={notch} color={CQ.gold} style="stroke" strokeWidth={3} strokeCap="round" />
          {font ? (
            <Group>
              <SkiaText text={label} x={cx - tw / 2} y={cy + 9} font={font} color={CQ.ink} style="stroke" strokeWidth={5} strokeJoin="round" />
              <SkiaText text={label} x={cx - tw / 2} y={cy + 9} font={font} color={hot ? CQ.coral : CQ.gold} />
            </Group>
          ) : null}
        </Canvas>
      </Animated.View>
      {trial ? (
        <View style={styles.ringRow}>
          {Array.from({ length: ringsMax }, (_, k) => (
            <Image key={`r${k}`} source={RING_ART} style={[styles.ringMini, k >= rings && styles.ringGone]} />
          ))}
        </View>
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Shell sockets (Clear, Par, Golden)

function Socket({ filled, cracked, golden, delay }: { filled: boolean; cracked: boolean; golden: boolean; delay: number }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (filled) s.value = withSequence(withTiming(1, { duration: delay }), withTiming(1.3, { duration: 90 }), withSpring(1, POP));
  }, [filled, delay, s]);
  const crack = useSharedValue(0);
  useEffect(() => {
    crack.value = cracked ? withSequence(withTiming(1, { duration: 100 }), withTiming(0.55, { duration: 100 })) : 0;
  }, [cracked, crack]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { rotate: `${crack.value * -8}deg` }] }));
  return (
    <Animated.View style={[styles.socket, st]}>
      <Image source={SOCKET_ART} style={[styles.socketImg, !filled && styles.socketEmpty, cracked && styles.socketCracked]} />
      {filled ? <View style={[styles.socketGold, golden && styles.socketGoldPearl]} pointerEvents="none" /> : null}
      {cracked ? <View style={styles.crackLine} pointerEvents="none" /> : null}
    </Animated.View>
  );
}

export const ShellSockets = React.memo(function ShellSockets({ shells, parLost, goldenTaken, hasGolden }: {
  shells: boolean[]; parLost: boolean; goldenTaken: boolean; hasGolden: boolean;
}) {
  const [clear, par, golden] = shells;
  return (
    <View style={styles.sockets} accessibilityLabel={`Shells this voyage: ${shells.filter(Boolean).length} of 3${parLost ? ', par lost' : ''}`}>
      <Socket filled={clear} cracked={false} golden={false} delay={0} />
      <Socket filled={par} cracked={parLost && !par} golden={false} delay={160} />
      <Socket filled={golden || (goldenTaken && hasGolden)} cracked={false} golden delay={golden ? 320 : 0} />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Tide medallion

const TIDE = 52;

function waveGlyph(cx: number, cy: number, s: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx - s, cy + s * 0.25);
  p.cubicTo(cx - s * 0.6, cy - s * 0.55, cx - s * 0.05, cy - s * 0.55, cx + s * 0.1, cy - s * 0.05);
  p.cubicTo(cx + s * 0.2, cy + s * 0.25, cx + s * 0.55, cy + s * 0.2, cx + s * 0.55, cy - s * 0.1);
  p.cubicTo(cx + s * 0.8, cy + s * 0.15, cx + s, cy + s * 0.25, cx + s, cy + s * 0.25);
  p.lineTo(cx + s, cy + s * 0.6);
  p.lineTo(cx - s, cy + s * 0.6);
  p.close();
  return p;
}

function moundGlyph(cx: number, cy: number, s: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx - s, cy + s * 0.45);
  p.cubicTo(cx - s * 0.6, cy - s * 0.45, cx + s * 0.6, cy - s * 0.45, cx + s, cy + s * 0.45);
  p.close();
  return p;
}

export const TideMedallion = React.memo(function TideMedallion({ low, P, movesToTurn, tag, onHold }: {
  low: boolean; P: number; movesToTurn: number; tag: boolean; onHold?: (on: boolean) => void;
}) {
  const art = useImage(MEDALLION_ART);
  const flip = useSharedValue(1);
  const first = React.useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // 180 deg flip on the vertical axis, settleSpring-like (300 ms).
    flip.value = withSequence(withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }), withSpring(1, { damping: 12, stiffness: 260 }));
  }, [low, flip]);
  const warn = useSharedValue(1);
  useEffect(() => {
    if (movesToTurn === 1) warn.value = withRepeat(withSequence(withTiming(1.12, { duration: 250 }), withTiming(1, { duration: 250 })), -1, true);
    else { cancelAnimation(warn); warn.value = withTiming(1, { duration: 120 }); }
  }, [movesToTurn, warn]);
  const st = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.04, flip.value) }, { scale: warn.value }] }));
  const cx = TIDE / 2;
  const cy = TIDE / 2 + 3;
  const face = TIDE * 0.3;
  // P pips around the rim: filled = moves still to go before the turn.
  const pips = useMemo(() => Array.from({ length: P }, (_, k) => {
    const a = -Math.PI / 2 + ((k + 0.5) / P) * Math.PI * 1.2 - Math.PI * 0.6;
    return { x: cx + Math.cos(a) * (TIDE * 0.47), y: cy + Math.sin(a) * (TIDE * 0.47) - 2, on: k < movesToTurn };
  }), [P, movesToTurn]); // eslint-disable-line react-hooks/exhaustive-deps
  const glyph = useMemo(() => (low ? moundGlyph(cx, cy + 2, face * 0.85) : waveGlyph(cx, cy, face * 0.85)), [low]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => (low ? waveGlyph(TIDE * 0.84, TIDE * 0.82, 6) : moundGlyph(TIDE * 0.84, TIDE * 0.82, 6)), [low]);
  return (
    <Pressable
      onPressIn={() => onHold?.(true)}
      onPressOut={() => onHold?.(false)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Tide ${low ? 'low' : 'high'}, ${low ? 'high' : 'low'} in ${movesToTurn} move${movesToTurn === 1 ? '' : 's'}. Hold to see the next tide.`}
      style={styles.tideWrap}
    >
      <Animated.View style={st}>
        <Canvas style={{ width: TIDE, height: TIDE }}>
          {art ? <SkiaImage image={art} x={4} y={0} width={TIDE - 8} height={TIDE} fit="contain" /> : null}
          <Circle cx={cx} cy={cy} r={face + 2} color={CQ.ink} />
          <Circle cx={cx} cy={cy} r={face} color={low ? CQ.sand : '#7fdaf7'} />
          <Path path={glyph} color={low ? '#e9c98a' : '#2fb6ec'} />
          <Path path={glyph} color={CQ.ink} style="stroke" strokeWidth={2} strokeJoin="round" />
          {pips.map((p, k) => (
            <Group key={`pip${k}`}>
              <Circle cx={p.x} cy={p.y} r={3.6} color={CQ.ink} />
              <Circle cx={p.x} cy={p.y} r={2.4} color={p.on ? CQ.gold : '#ffffff'} />
            </Group>
          ))}
          {/* Next state inset at 5 o'clock (Threes). */}
          <Circle cx={TIDE * 0.84} cy={TIDE * 0.84} r={9} color={CQ.ink} />
          <Circle cx={TIDE * 0.84} cy={TIDE * 0.84} r={7.5} color={low ? '#7fdaf7' : CQ.sand} />
          <Path path={next} color={low ? '#2fb6ec' : '#e9c98a'} />
          <Path path={next} color={CQ.ink} style="stroke" strokeWidth={2} />
        </Canvas>
      </Animated.View>
      {tag ? <Text style={styles.tideTag}>{`${low ? 'HIGH' : 'LOW'} in ${movesToTurn}`}</Text> : null}
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Run bar (0.A.5)

export const RunBar = React.memo(function RunBar({ shells, voyages, tiers, voyage, width, labels }: {
  shells: boolean[][]; voyages: number; tiers: [number, number]; voyage: number; width: number; labels?: [string, string];
}) {
  const total = voyages * 3;
  const have = shells.slice(0, voyages).reduce((s, v) => s + v.filter(Boolean).length, 0);
  const gap = 2;
  const divider = 6;
  const segW = Math.max(6, (width - divider * (voyages - 1) - gap * (total - voyages)) / total);
  const notchPop = [useSharedValue(1), useSharedValue(1)];
  const prev = React.useRef(have);
  useEffect(() => {
    tiers.forEach((t, i) => {
      if (prev.current < t && have >= t) notchPop[i].value = withSequence(withTiming(1.6, { duration: 90 }), withSpring(1, POP));
    });
    prev.current = have;
  }, [have]); // eslint-disable-line react-hooks/exhaustive-deps
  const n0 = useAnimatedStyle(() => ({ transform: [{ scale: notchPop[0].value }] }));
  const n1 = useAnimatedStyle(() => ({ transform: [{ scale: notchPop[1].value }] }));
  // Order of segments: shells are filled left to right within the run (count, not which shell).
  let k = 0;
  const segs: React.ReactNode[] = [];
  const xOf = (idx: number) => {
    const v = Math.floor(idx / 3);
    return idx * (segW + gap) - v * gap + v * divider;
  };
  for (let v = 0; v < voyages; v++) {
    const got = (shells[v] ?? []).filter(Boolean).length;
    for (let s = 0; s < 3; s++) {
      const on = s < got;
      segs.push(<View key={`s${k}`} style={[styles.seg, { left: xOf(k), width: segW }, on && styles.segOn, !on && v === voyage && styles.segNow]} />);
      k++;
    }
  }
  const notchX = (t: number) => xOf(t - 1) + segW + (t % 3 === 0 ? divider / 2 : gap / 2) - 6;
  return (
    <View style={[styles.runBar, { width }]} accessibilityLabel={`${have} of ${total} shells. ${tiers[0]} and ${tiers[1]} shells are the next tiers.`}>
      {segs}
      {tiers.map((t, i) => (
        <Animated.View key={`n${i}`} style={[styles.notch, { left: notchX(t) }, i === 0 ? n0 : n1, have >= t && styles.notchOn]}>
          <Text style={styles.notchTxt}>{labels ? labels[i] : `${i + 2}`}</Text>
        </Animated.View>
      ))}
    </View>
  );
});

// ---------------------------------------------------------------------------

export const QuestHud = React.memo(function QuestHud({ h, onTideHold, width, tierLabels }: {
  h: HudState; onTideHold?: (on: boolean) => void; width: number; tierLabels?: [string, string];
}) {
  const cur = h.shells[h.voyage] ?? [false, false, false];
  const spentPar = h.par;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.row} pointerEvents="box-none">
        <StrokeMedallion left={h.left} limit={h.limit} par={h.par} spentPar={spentPar} trial={h.trial} rings={h.rings} ringsMax={h.ringsMax} />
        <ShellSockets shells={cur} parLost={h.parLost} goldenTaken={h.goldenTaken} hasGolden={h.hasGolden} />
        <View style={styles.right}>
          {h.rank ? (
            <View style={styles.rank}>
              <Text style={styles.rankTxt}>{['1st', '2nd', '3rd', '4th'][h.rank.place - 1] ?? `${h.rank.place}th`}</Text>
            </View>
          ) : null}
          {h.hasTide ? <TideMedallion low={h.tideLow} P={h.P} movesToTurn={h.movesToTurn} tag={h.tideTag} onHold={onTideHold} /> : <View style={{ width: TIDE }} />}
        </View>
      </View>
      <RunBar shells={h.shells} voyages={h.voyages} tiers={h.tiers} voyage={h.voyage} width={width} labels={tierLabels} />
    </View>
  );
});

/** Static HUD heights (layout reserves them so the board never re-lays out). */
export const HUD_ROW_H = 60;
export const RUN_BAR_H = 18;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14 },
  row: { height: HUD_ROW_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  medWrap: { width: 64, alignItems: 'center' },
  ringRow: { flexDirection: 'row', marginTop: -4, gap: 2 },
  ringMini: { width: 14, height: 14, resizeMode: 'contain' },
  ringGone: { opacity: 0.22 },
  sockets: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  socket: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  socketImg: { width: 40, height: 40, resizeMode: 'contain' },
  socketEmpty: { opacity: 0.55 },
  socketCracked: { opacity: 0.3 },
  socketGold: {
    position: 'absolute', width: 34, height: 30, borderRadius: 15, top: 4, backgroundColor: CQ.gold, opacity: 0.55,
  },
  socketGoldPearl: { backgroundColor: '#ffe46b', opacity: 0.7 },
  crackLine: { position: 'absolute', width: 3, height: 30, backgroundColor: CQ.ink, transform: [{ rotate: '24deg' }], borderRadius: 2, opacity: 0.8 },
  right: { width: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  rank: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, backgroundColor: CQ.cream, borderWidth: 2, borderColor: CQ.ink },
  rankTxt: { fontFamily: 'Shark', fontSize: 15, color: CQ.navy },
  tideWrap: { alignItems: 'center', width: TIDE },
  tideTag: {
    position: 'absolute', bottom: -10, fontFamily: 'Knockout', fontSize: 11, color: CQ.navy, backgroundColor: '#ffffff',
    paddingHorizontal: 5, borderRadius: 7, overflow: 'hidden', borderWidth: 1.5, borderColor: CQ.ink,
  },
  runBar: { height: RUN_BAR_H, alignSelf: 'center', marginTop: 2 },
  seg: { position: 'absolute', top: 4, height: 9, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1.5, borderColor: CQ.ink },
  segNow: { backgroundColor: 'rgba(255,255,255,0.9)' },
  segOn: { backgroundColor: CQ.gold },
  notch: {
    position: 'absolute', top: -1, width: 12, height: 18, borderRadius: 6, backgroundColor: '#ffffff', borderWidth: 2, borderColor: CQ.goldDeep,
    alignItems: 'center', justifyContent: 'center',
  },
  notchOn: { backgroundColor: CQ.gold, borderColor: CQ.ink },
  notchTxt: { fontFamily: 'Knockout', fontSize: 9, color: CQ.navy },
});
