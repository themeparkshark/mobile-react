/**
 * Current Quest HUD (design 10.2): pearl slots (left), the voyage rail with
 * 3 x 3 shells around Alex's compass rose (middle), the Riptide chip with flow
 * pips and the tide dial (right). Trial adds life rings. Shells are the only
 * thing on screen that reads as a goal.
 */

import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { CQ } from './theme';

const PEARL = require('../../assets/games/current-quest/pearl.png');
const SHELL = require('../../assets/games/current-quest/golden_pearl.png');
const COMPASS = require('../../assets/games/current-quest/compass.png');
const RING = require('../../assets/games/current-quest/life_ring.png');

export interface HudState {
  voyage: number;
  pearls: number;
  pearlsTaken: number;
  hasGolden: boolean;
  goldenTaken: boolean;
  /** shells[v] = [clear, par, golden] earned. */
  shells: boolean[][];
  flow: number;
  riptide: boolean;
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

export const QuestHud = React.memo(function QuestHud({ h, walkingChip }: { h: HudState; walkingChip: boolean }) {
  const ripple = useSharedValue(1);
  useEffect(() => {
    if (h.riptide) ripple.value = withSequence(withTiming(1.25, { duration: 120 }), withSpring(1, POP));
  }, [h.riptide, ripple]);
  const ripStyle = useAnimatedStyle(() => ({ transform: [{ scale: ripple.value }] }));
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.left}>
        <View style={styles.pearlRow}>
          {Array.from({ length: h.pearls }, (_, k) => (
            <Pop key={`p${k}`} on={k < h.pearlsTaken} size={24}>
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

      <View style={styles.rail} accessibilityLabel={`Voyage ${h.voyage + 1} of 3`}>
        {[0, 1, 2].map((v) => (
          <React.Fragment key={`v${v}`}>
            {v === 1 ? <Image source={COMPASS} style={styles.compass} /> : null}
            <View style={[styles.voyage, v === h.voyage && styles.voyageNow]}>
              {[0, 1, 2].map((k) => {
                const earned = !!h.shells[v]?.[k];
                return (
                  <View key={`s${k}`} style={styles.shellSlot}>
                    {earned ? (
                      <Animated.Image entering={ZoomIn.springify().damping(9)} source={SHELL} style={styles.shell} />
                    ) : <View style={styles.shellEmpty} />}
                  </View>
                );
              })}
            </View>
          </React.Fragment>
        ))}
      </View>

      <View style={styles.right}>
        <Animated.View style={[styles.ripChip, h.riptide && styles.ripChipOn, ripStyle]}>
          {[0, 1, 2].map((k) => (
            <View key={`f${k}`} style={[styles.pip, h.flow > k && styles.pipOn, h.riptide && styles.pipGold]} />
          ))}
        </Animated.View>
        {h.hasTide ? (
          <View style={[styles.tide, h.tideLow ? styles.tideLow : styles.tideHigh]} accessibilityLabel={`Tide ${h.tideLow ? 'low' : 'high'}, turns in ${h.movesToTurn}`}>
            <Text style={styles.tideTxt}>{h.tideLow ? 'LOW' : 'HIGH'}</Text>
            <Text style={styles.tideNext}>{h.movesToTurn}</Text>
          </View>
        ) : null}
        {walkingChip ? <View style={styles.moving}><Text style={styles.movingTxt}>Line moving</Text></View> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },
  left: { width: 92, justifyContent: 'center' },
  pearlRow: { flexDirection: 'row', alignItems: 'center' },
  pearl: { width: 22, height: 22, resizeMode: 'contain' },
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
  right: { width: 92, alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  ripChip: {
    flexDirection: 'row', gap: 4, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 2, borderColor: CQ.ink,
  },
  ripChipOn: { backgroundColor: '#fff3c2', borderColor: CQ.goldDeep },
  pip: { width: 9, height: 9, borderRadius: 5, backgroundColor: 'rgba(47,47,58,0.2)' },
  pipOn: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: CQ.ink },
  pipGold: { backgroundColor: CQ.gold },
  tide: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 2, borderColor: CQ.ink },
  tideHigh: { backgroundColor: CQ.waterLight },
  tideLow: { backgroundColor: CQ.sand },
  tideTxt: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy },
  tideNext: { fontFamily: 'Knockout', fontSize: 12, color: CQ.ink, backgroundColor: '#ffffff', borderRadius: 7, paddingHorizontal: 4, overflow: 'hidden' },
  moving: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: CQ.water, borderWidth: 1.5, borderColor: CQ.ink },
  movingTxt: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff' },
});
