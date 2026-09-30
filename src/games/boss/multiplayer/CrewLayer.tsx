/**
 * Crew presentation: ally sharks at the sides of the arena (they lunge in to
 * the boss on their crits), the Team Surge pips, the Lure badge, SYNC!, and
 * the ghost-race readout. Pure presentation; outcomes are settled from proofs.
 */
import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { ArenaLayout } from '../view';

const SHARK = require('../../../../assets/images/screens/welcome/shark.png');

export interface CrewLayerHandle {
  lunge: (who: string) => void;
  caught: (who: string) => void;
  sync: () => void;
}

interface Mate { id: string; name: string; lure: boolean; inBreak: boolean; ghost?: boolean }

function AllyShark({ mate, side, L, lungeKey, caughtKey }: { mate: Mate; side: -1 | 1; L: ArenaLayout; lungeKey: number; caughtKey: number }) {
  const p = useSharedValue(0);
  const c = useSharedValue(0);
  useEffect(() => {
    if (lungeKey > 0) p.value = withSequence(withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 170 }));
  }, [lungeKey, p]);
  useEffect(() => {
    if (caughtKey > 0) c.value = withSequence(withTiming(1, { duration: 80 }), withTiming(1, { duration: 1800 }), withTiming(0, { duration: 150 }));
  }, [caughtKey, c]);
  const x0 = side < 0 ? 8 : L.W - 8 - 60;
  const y0 = L.bossY + L.bossSize * 0.18;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x0 + (L.bossX - 30 - x0) * 0.55 * p.value },
      { translateY: y0 - 30 * p.value + Math.sin(c.value * 20) * 3 * c.value },
      { scaleX: side < 0 ? 1 : -1 },
      { rotate: `${side * -12 * p.value}deg` },
    ],
    opacity: mate.ghost ? 0.5 : 1,
  }));
  return (
    <Animated.View style={[styles.ally, style]} pointerEvents="none">
      <View style={[styles.allyBubble, mate.inBreak && styles.allyHot, mate.ghost && styles.allyGhost]}>
        <Image source={SHARK} style={styles.allyImg} resizeMode="contain" />
      </View>
      <View style={[styles.nameTag, { transform: [{ scaleX: side < 0 ? 1 : -1 }] }]}>
        <Text style={styles.nameText} numberOfLines={1}>{mate.lure ? `${mate.name} LURE` : mate.name}</Text>
      </View>
    </Animated.View>
  );
}

export const CrewLayer = forwardRef<CrewLayerHandle, {
  L: ArenaLayout;
  mates: Mate[];
  surge: number;
  surgeOn: boolean;
  meLure: boolean;
  ghostLine: string | null;
}>(function CrewLayer({ L, mates, surge, surgeOn, meLure, ghostLine }, ref) {
  const [lunges, setLunges] = useState<Record<string, number>>({});
  const [caught, setCaught] = useState<Record<string, number>>({});
  const [syncKey, setSyncKey] = useState(0);
  const syncP = useSharedValue(0);
  const seq = useRef(0);
  useImperativeHandle(ref, () => ({
    lunge: (who) => setLunges((m) => ({ ...m, [who]: ++seq.current })),
    caught: (who) => setCaught((m) => ({ ...m, [who]: ++seq.current })),
    sync: () => setSyncKey((k) => k + 1),
  }), []);
  useEffect(() => {
    if (syncKey > 0) syncP.value = withSequence(withTiming(1, { duration: 120 }), withTiming(1, { duration: 700 }), withTiming(0, { duration: 250 }));
  }, [syncKey, syncP]);
  const syncStyle = useAnimatedStyle(() => ({ opacity: syncP.value, transform: [{ scale: 0.8 + 0.3 * syncP.value }] }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {mates.slice(0, 2).map((m, i) => (
        <AllyShark key={m.id} mate={m} side={i === 0 ? -1 : 1} L={L} lungeKey={lunges[m.id] ?? 0} caughtKey={caught[m.id] ?? 0} />
      ))}
      {mates.length > 0 && (
        <View style={[styles.surge, { top: 62 }]}>
          <Text style={styles.surgeLabel}>{surgeOn ? 'TEAM SURGE!' : 'TEAM'}</Text>
          {Array.from({ length: 6 }, (_, k) => (
            <View key={k} style={[styles.pip, k < surge && styles.pipOn, surgeOn && styles.pipOn]} />
          ))}
        </View>
      )}
      {meLure && (
        <View style={[styles.lure, { left: L.floatX - 58, top: L.floatY - L.floatR * 2.9 }]}>
          <Text style={styles.lureText}>YOU'RE THE LURE</Text>
        </View>
      )}
      {ghostLine && (
        <View style={[styles.ghost, { top: 62 }]}>
          <Text style={styles.ghostText}>{ghostLine}</Text>
        </View>
      )}
      <Animated.View style={[styles.sync, { top: L.bossY - 20 }, syncStyle]}>
        <Text style={styles.syncText}>SYNC!</Text>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  ally: { position: 'absolute', left: 0, top: 0, width: 60, alignItems: 'center' },
  allyBubble: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 3,
    borderColor: '#7FE9FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  allyHot: { borderColor: '#FFCF3B' },
  allyGhost: { borderStyle: 'dashed' },
  allyImg: { width: 50, height: 54 },
  nameTag: { marginTop: 2, backgroundColor: '#1B2A4A', borderRadius: 8, paddingHorizontal: 5, maxWidth: 90 },
  nameText: { fontFamily: 'Knockout', fontSize: 11, color: '#FFFFFF' },
  surge: { position: 'absolute', left: 14, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  surgeLabel: { fontFamily: 'Shark', fontSize: 12, color: '#1B2A4A', marginRight: 3 },
  pip: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: '#1B2A4A', backgroundColor: '#FFFFFF' },
  pipOn: { backgroundColor: '#FFCF3B' },
  lure: { position: 'absolute', width: 116, alignItems: 'center', backgroundColor: '#FF6B5C', borderRadius: 10, borderWidth: 2, borderColor: '#FFFFFF' },
  lureText: { fontFamily: 'Shark', fontSize: 12, color: '#FFFFFF' },
  ghost: { position: 'absolute', right: 14, backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  ghostText: { fontFamily: 'Shark', fontSize: 13, color: '#1B2A4A' },
  sync: { position: 'absolute', alignSelf: 'center' },
  syncText: { fontFamily: 'Shark', fontSize: 44, color: '#FFCF3B', textShadowColor: '#1B2A4A', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
});
