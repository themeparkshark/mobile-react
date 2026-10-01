/**
 * SprintLab (dev only): a local Parade Beat Same-Minute Race with no server.
 *
 * It runs the real ParadeBoard against a local room clock (GO in 3.5 s), races
 * three house drummers on the room strip, and when the song ends it replays
 * this phone's recorded log through the party sim exactly like the server's
 * sidecar does, printing live vs replayed Duel Points. A personal HOLD button
 * shows the "nobody else freezes" path (6 s budget). Reached from the
 * MiniGameTester with EXPO_PUBLIC_RHYTHM_DEMO=sprint.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RaceStrip, { type RacerLine } from '../../../gamekit/party/RaceStrip';
import type { Seat } from '../../../gamekit/net/partyTypes';
import { ParadeBoard } from './ParadeBoard';
import { botTaps, buildBoard, resolve, resultHash, type SprintProfile, type SprintTap } from './paradeSprint';

const BOTS: { name: string; profile: SprintProfile }[] = [
  { name: 'Captain Fin', profile: 'ace' },
  { name: 'Bubbles', profile: 'regular' },
  { name: 'Chomps', profile: 'rookie' },
];
const HOLD_BUDGET = 6000;

export default function SprintLab({ seed = 1, autoplay = null, onClose }: { seed?: number; autoplay?: SprintProfile | null; onClose?: () => void }) {
  const board = useMemo(() => buildBoard(seed), [seed]);
  const perf = useCallback(() => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()), []);
  const goAt = useRef(perf() + 3500);
  const heldMs = useRef(0);
  const heldAt = useRef<number | null>(null);
  const taps = useRef<SprintTap[]>([]);
  const [held, setHeld] = useState(false);
  const [boardT, setBoardT] = useState(-3500);
  const [live, setLive] = useState(0);
  const [verdict, setVerdict] = useState<string | null>(null);

  const boardClock = useCallback(() => {
    if (heldAt.current !== null) return heldAt.current - goAt.current - heldMs.current;
    return perf() - goAt.current - heldMs.current;
  }, [perf]);
  const recordAt = useCallback((ms: number, code: number) => {
    if (heldAt.current !== null || ms < 0 || ms > board.roundMs) return null;
    const last = taps.current.length ? taps.current[taps.current.length - 1][0] : 0;
    const at = Math.max(Math.round(ms), last);
    taps.current.push([at, code]);
    return at;
  }, [board.roundMs]);
  const onProgress = useCallback((score: number) => setLive(score), []);

  const bots = useMemo(() => BOTS.map((b, i) => {
    const r = resolve(board, botTaps(board, seed, i + 1, b.profile));
    const ch = board.chart;
    return { ...b, pts: r.barPts, barEnd: r.barPts.map((_, k) => ch.barStart[ch.firstBar + k + 1]), final: r.score };
  }), [board, seed]);

  useEffect(() => {
    const h = setInterval(() => {
      const t = boardClock();
      setBoardT(t);
      // HOLD budget: past 6 s the ghost would take the seat; here we just release.
      if (heldAt.current !== null && perf() - heldAt.current > HOLD_BUDGET) toggleHold();
      if (t > board.roundMs + 400 && !verdict) {
        const r = resolve(board, taps.current);
        setVerdict(`Replay ${r.score} vs live ${liveRef.current} ${r.score === liveRef.current ? 'MATCH' : 'DIFF'}  hash ${resultHash(r)}  taps ${taps.current.length}`);
      }
    }, 100);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, verdict]);
  const liveRef = useRef(0);
  liveRef.current = live;

  const toggleHold = useCallback(() => {
    if (heldAt.current === null) {
      if (boardClock() < 0) return;
      heldAt.current = perf();
      setHeld(true);
    } else {
      heldMs.current += perf() - heldAt.current;
      heldAt.current = null;
      setHeld(false);
    }
  }, [boardClock, perf]);

  const lines: RacerLine[] = useMemo(() => {
    const seat = (i: number, name: string, kind: 'human' | 'bot'): Seat => ({ seat: i, kind, name, avatar_url: null, team: null });
    const raw = [
      { seat: seat(0, 'You', 'human'), name: 'You', score: live, me: true, ghost: false, away: false },
      ...bots.map((b, i) => {
        let score = 0;
        for (let k = 0; k < b.pts.length; k++) if (b.barEnd[k] <= boardT) score += b.pts[k];
        return { seat: seat(i + 1, b.name, 'bot'), name: b.name, score, me: false, ghost: false, away: false };
      }),
    ];
    const sorted = raw.map((r) => r.score).sort((a, b) => b - a);
    return raw.map((r) => ({ ...r, placement: sorted.indexOf(r.score) + 1 }));
  }, [bots, boardT, live]);

  const count = boardT < 0 ? Math.ceil(-boardT / 1000) : 0;
  return (
    <View style={styles.root}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.top}>
          <Text style={styles.title}>LINE PARTY: PARADE SPRINT</Text>
          <RaceStrip lines={lines} />
          <View style={styles.row}>
            <Text style={styles.score}>{live.toLocaleString('en-US')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Hold my board" onPress={toggleHold} style={[styles.hold, held && styles.holdOn]}>
              <Text style={styles.holdTxt}>{held ? 'PLAY' : 'HOLD'}</Text>
            </Pressable>
            {onClose ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.hold}>
                <Text style={styles.holdTxt}>CLOSE</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={styles.board}>
          <ParadeBoard board={board} seed={seed} boardClock={boardClock} held={held} recordAt={recordAt} onProgress={onProgress} autoplay={autoplay} />
          {count > 0 ? (
            <View pointerEvents="none" style={styles.countWrap}>
              <Text style={styles.count}>{String(count)}</Text>
            </View>
          ) : null}
          {held ? (
            <View pointerEvents="none" style={styles.countWrap}>
              <Text style={styles.heldTxt}>ON HOLD: only your board is paused</Text>
            </View>
          ) : null}
          {verdict ? (
            <View style={styles.verdict}>
              <Text style={styles.verdictTxt}>{verdict}</Text>
              <Text style={styles.verdictSub}>{`Captain Fin ${bots[0].final}  Bubbles ${bots[1].final}  Chomps ${bots[2].final}`}</Text>
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0768b9' },
  top: { paddingTop: 54, paddingHorizontal: 8 },
  title: { fontFamily: 'Shark', fontSize: 18, color: '#ffffff', textAlign: 'center', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 4 },
  score: { fontFamily: 'Shark', fontSize: 28, color: '#ffcf3b' },
  hold: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 3, borderColor: '#0b3a6b', paddingHorizontal: 12, paddingVertical: 4, marginLeft: 8 },
  holdOn: { backgroundColor: '#ffcf3b' },
  holdTxt: { fontFamily: 'Shark', fontSize: 14, color: '#0b3a6b' },
  board: { flex: 1 },
  countWrap: { position: 'absolute', top: '22%', left: 0, right: 0, alignItems: 'center' },
  count: { fontFamily: 'Shark', fontSize: 96, color: '#ffcf3b' },
  heldTxt: { fontFamily: 'Shark', fontSize: 20, color: '#0b3a6b', backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },
  verdict: { position: 'absolute', left: 16, right: 16, top: '30%', backgroundColor: '#fff8e4', borderRadius: 18, borderWidth: 3, borderColor: '#0b3a6b', padding: 14 },
  verdictTxt: { fontFamily: 'Shark', fontSize: 15, color: '#0b3a6b', textAlign: 'center' },
  verdictSub: { fontFamily: 'Knockout', fontSize: 14, color: '#1f6fc0', textAlign: 'center', marginTop: 6 },
});
