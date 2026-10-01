/**
 * Current Quest HUD (design v5 10.2): pearl slots (left), the voyage rail with
 * 2 x 3 or 3 x 3 shells around Alex's compass rose (middle), the Riptide chip
 * with this voyage's Riptide count and the tide dial (right; hold it to see the
 * whole board at the next tide). Trial adds life rings. Shells are the only
 * thing on screen that reads as a goal; a forfeited Par shell dims once.
 */

import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { CQ } from './theme';

const PEARL = require('../../assets/games/current-quest/pearl.png');
const SHELL = require('../../assets/games/current-quest/golden_pearl.png');
const COMPASS = require('../../assets/games/current-quest/compass.png');
const RING = require('../../assets/games/current-quest/life_ring.png');
const STREAK = require('../../../assets/icons/game/streak.png');

export interface HudState {
  voyage: number;
  pearls: number;
  pearlsTaken: number;
  hasGolden: boolean;
  goldenTaken: boolean;
  /** shells[v] = [clear, par, golden] earned. */
  shells: boolean[][];
  voyages: number;
  /** Riptide strokes this voyage (Author medal only; never a goal). */
  ripCount: number;
  /** A Riptide surge is playing (4 bars after a Riptide stroke). */
  riptide: boolean;
  /** This voyage's Par shell is already gone (undo, tip or continue). */
  parLost: boolean;
  hasTide: boolean;
  tideLow: boolean;
  movesToTurn: number;
  rings: number;
  ringsMax: number;
  trial: boolean;
}

const POP = { damping: 9, stiffness: 320, mass: 0.6 };

function Pop({ on, children, size }: { on: boolean; children: React.ReactNode; size: number }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (on) s.value = withSequence(withTiming(1.3, { duration: 90 }), withSpring(1, POP));
  }, [on, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, st]}>{children}</Animated.View>;
}

export const QuestHud = React.memo(function QuestHud({ h, walkingChip, onTideHold }: {
  h: HudState; walkingChip?: boolean; onTideHold?: (on: boolean) => void;
}) {
  void walkingChip;
  const ripple = useSharedValue(1);
  useEffect(() => {
    if (h.ripCount > 0) ripple.value = withSequence(withTiming(1.3, { duration: 120 }), withSpring(1, POP));
  }, [h.ripCount, ripple]);
  const parDim = useSharedValue(1);
  useEffect(() => {
    if (h.parLost) parDim.value = withSequence(withTiming(0.2, { duration: 100 }), withTiming(1, { duration: 100 }), withTiming(0.35, { duration: 200 }));
    else parDim.value = 1;
  }, [h.parLost, h.voyage, parDim]);
  const parStyle = useAnimatedStyle(() => ({ opacity: parDim.value }));
  const ripStyle = useAnimatedStyle(() => ({ transform: [{ scale: ripple.value }] }));
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.left}>
        <View style={styles.pearlRow}>
          {Array.from({ length: h.pearls }, (_, k) => (
            <Pop key={`p${k}`} on={k < h.pearlsTaken} size={21}>
              <Image source={PEARL} style={[styles.pearl, k >= h.pearlsTaken && styles.dim]} />
            </Pop>
          ))}
          {h.hasGolden ? (
            <Pop on={h.goldenTaken} size={28}>
              <Image source={SHELL} style={[styles.golden, !h.goldenTaken && styles.dim]} />
            </Pop>
          ) : null}
        </View>
        {h.trial ? (
          <View style={styles.ringRow}>
            {Array.from({ length: h.ringsMax }, (_, k) => (
              <Image key={`r${k}`} source={RING} style={[styles.ring, k >= h.rings && styles.ringLost]} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.rail} pointerEvents="none" accessibilityLabel={`Voyage ${h.voyage + 1} of ${h.voyages}`}>
        {[0, 1, 2].slice(0, h.voyages).map((v) => (
          <React.Fragment key={`v${v}`}>
            {v === 1 ? <Image source={COMPASS} style={styles.compass} /> : null}
            <View style={[styles.voyage, v === h.voyage && styles.voyageNow]}>
              {[0, 1, 2].map((k) => {
                const earned = !!h.shells[v]?.[k];
                const lostPar = k === 1 && v === h.voyage && h.parLost && !earned;
                return (
                  <View key={`s${k}`} style={styles.shellSlot}>
                    {earned ? (
                      <Animated.Image entering={ZoomIn.springify().damping(9)} source={SHELL} style={styles.shell} />
                    ) : lostPar ? <Animated.View style={[styles.shellEmpty, styles.shellLost, parStyle]} /> : <View style={styles.shellEmpty} />}
                  </View>
                );
              })}
            </View>
          </React.Fragment>
        ))}
      </View>

      <View style={styles.right}>
        <Animated.View pointerEvents="none" style={[styles.ripChip, (h.riptide || h.ripCount > 0) && styles.ripChipOn, ripStyle]}>
          <Image source={STREAK} style={[styles.streak, !h.ripCount && styles.dim]} />
          <Text style={[styles.ripTxt, !h.ripCount && styles.dimTxt]}>{h.ripCount ? `x${h.ripCount}` : 'Riptide'}</Text>
        </Animated.View>
        {h.hasTide ? (
          <Pressable
            onPressIn={() => onTideHold?.(true)}
            onPressOut={() => onTideHold?.(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Tide ${h.tideLow ? 'low' : 'high'}, turns in ${h.movesToTurn} moves. Hold to see the next tide.`}
            style={({ pressed }) => [styles.tide, h.tideLow ? styles.tideLow : styles.tideHigh, pressed && styles.tidePressed]}
          >
            <Text style={styles.tideTxt}>{h.tideLow ? 'LOW' : 'HIGH'}</Text>
            <Text style={[styles.tideNext, h.movesToTurn === 1 && styles.tideNextHot]}>{h.movesToTurn}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },
  left: { width: 100, justifyContent: 'center' },
  pearlRow: { flexDirection: 'row', alignItems: 'center' },
  pearl: { width: 19, height: 19, resizeMode: 'contain' },
  golden: { width: 26, height: 28, resizeMode: 'contain' },
  dim: { opacity: 0.32 },
  ringRow: { flexDirection: 'row', marginTop: 2 },
  ring: { width: 18, height: 18, resizeMode: 'contain', marginRight: 2 },
  ringLost: { opacity: 0.2 },
  rail: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  compass: { width: 26, height: 26, marginHorizontal: -3, zIndex: 2 },
  voyage: {
    flexDirection: 'row', paddingHorizontal: 3, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 2, borderColor: CQ.ink,
  },
  voyageNow: { backgroundColor: CQ.cream, borderColor: CQ.goldDeep },
  shellSlot: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center' },
  shell: { width: 18, height: 19, resizeMode: 'contain' },
  shellEmpty: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(47,47,58,0.18)' },
  right: { width: 84, alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  ripChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 2, borderColor: CQ.ink,
  },
  ripChipOn: { backgroundColor: '#fff3c2', borderColor: CQ.goldDeep },
  streak: { width: 15, height: 15, resizeMode: 'contain' },
  ripTxt: { fontFamily: 'Knockout', fontSize: 11, color: CQ.navy },
  dimTxt: { opacity: 0.55 },
  shellLost: { backgroundColor: 'rgba(255,107,92,0.55)' },
  tidePressed: { transform: [{ scale: 0.94 }], borderColor: CQ.goldDeep },
  tideNextHot: { backgroundColor: CQ.gold },
  tide: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, minHeight: 24, borderRadius: 10, borderWidth: 2, borderColor: CQ.ink },
  tideHigh: { backgroundColor: CQ.waterLight },
  tideLow: { backgroundColor: CQ.sand },
  tideTxt: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy },
  tideNext: { fontFamily: 'Knockout', fontSize: 12, color: CQ.ink, backgroundColor: '#ffffff', borderRadius: 7, paddingHorizontal: 4, overflow: 'hidden' },
  moving: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: CQ.water, borderWidth: 1.5, borderColor: CQ.ink },
  movingTxt: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff' },
});
