/**
 * Ride Challenge stake card (design v7.1 0.A.5): before GO, 1.2 s, any tap
 * skips. Three stacks of Alex's coin name the existing multiplier tiers as
 * ride tiers: clear 3 voyages = the ride coin, 6 shells = Perfect Ride
 * (+50% coins), 8 shells = Tide Master Ride (double coins). No new economy.
 */

import React, { useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { CQ } from './theme';
import { CARD_CREAM } from './ResultsCard';

const COIN = require('../../assets/games/current-quest/coin.png');

export const STAKE_MS = 1200;

export const STAKE_TIERS = [
  { coins: 1, label: 'Clear 3 voyages', sub: 'ride coin' },
  { coins: 2, label: '6 shells', sub: 'Perfect Ride, +50% coins' },
  { coins: 3, label: '8 shells', sub: 'Tide Master Ride, double coins' },
] as const;

export function StakeCard({ onDone }: { onDone: () => void }) {
  // The parent re-renders often (HUD, rail); the 1.2 s timer must not restart with it.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), STAKE_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(160)} style={styles.scrim}>
      <Pressable style={styles.fill} onPress={() => done.current()} accessibilityLabel="Ride stakes. Tap to start.">
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.card}>
          <Text style={styles.title}>Ride Challenge</Text>
          <View style={styles.row}>
            {STAKE_TIERS.map((t, i) => (
              <Animated.View key={t.label} entering={ZoomIn.delay(120 + i * 140).springify().damping(9)} style={styles.tier}>
                <View style={styles.stack}>
                  {Array.from({ length: t.coins }, (_, k) => (
                    <Image key={`c${k}`} source={COIN} style={[styles.coin, { bottom: k * 9 }]} />
                  ))}
                </View>
                <Text style={styles.label}>{t.label}</Text>
                <Text style={styles.sub}>{t.sub}</Text>
              </Animated.View>
            ))}
          </View>
          <Text style={styles.rule}>Every stroke counts. A life ring gives 2 strokes.</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 40 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: '90%', paddingVertical: 14, paddingHorizontal: 10, borderRadius: 24, backgroundColor: CARD_CREAM, borderWidth: 4, borderColor: CQ.gold, alignItems: 'center', shadowColor: CQ.ink, shadowOpacity: 0.25, shadowRadius: 0, shadowOffset: { width: 0, height: 4 } },
  title: { fontFamily: 'Shark', fontSize: 24, color: CQ.navy },
  row: { flexDirection: 'row', gap: 8, marginTop: 8, alignSelf: 'stretch' },
  rule: { marginTop: 10, fontFamily: 'Knockout', fontSize: 13, color: CQ.navy, textAlign: 'center', opacity: 0.85 },
  tier: { flex: 1, alignItems: 'center' },
  stack: { width: 52, height: 66, alignItems: 'center', justifyContent: 'flex-end' },
  coin: { position: 'absolute', width: 48, height: 48, resizeMode: 'contain' },
  label: { marginTop: 4, fontFamily: 'Shark', fontSize: 15, color: CQ.navy, textAlign: 'center' },
  sub: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy, textAlign: 'center' },
});
