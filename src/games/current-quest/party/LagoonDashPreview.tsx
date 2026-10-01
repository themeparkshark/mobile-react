/**
 * LagoonDashPreview (dev only): plays one Lagoon Dash micro-round locally,
 * exactly as Line Party would (same sim, same seeded board, the same house
 * bots replayed live on a race strip), without a server. Used to capture the
 * board on a simulator until the backend registers `lagoon_dash`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import LagoonDashBoard from './LagoonDashBoard';
import { botTaps, buildBoard, resolve, ROUND_MS, type DashProfile, type DashTap } from './lagoonDash';
import { CQ } from '../theme';

const CREW: { seat: number; name: string; profile: DashProfile }[] = [
  { seat: 1, name: 'Marina', profile: 'regular' },
  { seat: 2, name: 'Finley', profile: 'rookie' },
  { seat: 3, name: 'Coral', profile: 'ace' },
];

export default function LagoonDashPreview({ seed = 2026, autoplay = 'regular' as DashProfile | null }: { seed?: number; autoplay?: DashProfile | null }) {
  const board = useMemo(() => buildBoard(seed), [seed]);
  const perfNow = useCallback(() => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()), []);
  const goAt = useMemo(() => perfNow() + 2500, [perfNow]);
  const taps = useRef<DashTap[]>([]);
  const logs = useMemo(() => CREW.map((c) => botTaps(board, seed, c.seat, c.profile)), [board, seed]);
  const [t, setT] = useState(-2500);
  const [mine, setMine] = useState(0);
  const boardClock = useCallback(() => perfNow() - goAt, [perfNow, goAt]);
  const onTap = useCallback((a: number) => {
    const bt = Math.round(perfNow() - goAt);
    if (bt < 0 || bt > ROUND_MS) return null;
    const last = taps.current.length ? taps.current[taps.current.length - 1][0] : 0;
    taps.current.push([Math.max(bt, last), a]);
    return Math.max(bt, last);
  }, [goAt, perfNow]);
  useEffect(() => {
    const h = setInterval(() => setT(perfNow() - goAt), 250);
    return () => clearInterval(h);
  }, [goAt, perfNow]);
  const lines = [
    { name: 'You', score: mine, me: true },
    ...CREW.map((c, i) => ({ name: c.name, score: resolve(board, logs[i].filter(([at]) => at <= t)).score, me: false })),
  ];
  const sorted = [...lines].sort((a, b) => b.score - a.score);
  const left = Math.max(0, Math.ceil((ROUND_MS - t) / 1000));
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.strip}>
        {sorted.map((l) => (
          <View key={l.name} style={[styles.racer, l.me && styles.racerMe]}>
            <Text style={styles.name}>{l.name}</Text>
            <Text style={styles.score}>{l.score >= 10000 ? `${Math.ceil((l.score - 10000) / 1000)} shells` : `${Math.floor(l.score / 100)} pearls`}</Text>
          </View>
        ))}
        <Text style={styles.clock}>{t < 0 ? 'GET READY' : `${left}s`}</Text>
      </View>
      <LagoonDashBoard board={board} seed={seed} goAt={goAt} durationMs={ROUND_MS} perfNow={perfNow} onTap={onTap}
        onProgress={(s) => setMine(s)} boardClock={boardClock} autoplay={autoplay} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CQ.water, paddingTop: 54 },
  strip: { flexDirection: 'row', gap: 4, paddingHorizontal: 8, alignItems: 'center' },
  racer: { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: CQ.ink, backgroundColor: 'rgba(255,255,255,0.8)', paddingVertical: 3, alignItems: 'center' },
  racerMe: { backgroundColor: CQ.cream, borderColor: CQ.goldDeep, borderWidth: 2 },
  name: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy },
  score: { fontFamily: 'Knockout', fontSize: 11, color: CQ.ink },
  clock: { fontFamily: 'Shark', fontSize: 18, color: '#ffffff', marginLeft: 4 },
});
