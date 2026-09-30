/**
 * Sprint Race overlays (RN, outside the Skia world): the lineup lobby, the
 * server-synced count-in, and the VERIFIED podium. Bright world, Alex's
 * palette, the Shark/Knockout fonts; no emoji.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RaceMember, RaceResult, RaceRound, RaceState } from '../net/raceTransport';
import { SHARKY_ART } from '../assets';

const INK = '#23384f';
const GOLD = '#ffc233';

function useNow(active: boolean, ms = 100): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const iv = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(iv);
  }, [active, ms]);
  return now;
}

export function RaceLobby({ state, crew, onReady, onLeave, toLocal }: {
  state: RaceState;
  crew: string[];
  onReady: () => void;
  onLeave: () => void;
  toLocal: (serverMs: number) => number;
}) {
  const now = useNow(true, 250);
  const left = Math.max(0, Math.ceil((toLocal(state.autostartAtMs) - now) / 1000));
  const humans: RaceMember[] = state.members;
  const me = humans.find((m) => m.id === state.userId);
  const seats = [...humans.map((m) => ({ name: m.name, ready: m.ready, human: true, me: m.id === state.userId })),
    ...crew.slice(0, Math.max(0, 4 - humans.length)).map((n) => ({ name: n, ready: true, human: false, me: false }))];
  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        <Text style={styles.kicker}>SPRINT RACE</Text>
        <Text style={styles.title}>{state.phase === 'connecting' || state.phase === 'offline' ? 'Finding your line...' : 'Sharks in your line'}</Text>
        <View style={styles.lineup}>
          {seats.map((s, i) => (
            <View key={`${s.name}-${i}`} style={[styles.seat, s.me && styles.seatMe]}>
              <Image source={SHARKY_ART.swim} style={[styles.seatShark, !s.human && styles.crewShark]} resizeMode="contain" />
              <Text style={styles.seatName} numberOfLines={1}>{s.me ? 'You' : s.name}</Text>
              <Text style={styles.seatTag}>{s.human ? (s.ready ? 'READY' : 'IN LINE') : 'HOUSE CREW'}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.body}>18 seconds. Draft behind a rival to fill Boost, then slide right to Dash past.</Text>
        {state.phase === 'lobby' ? (
          <>
            <TouchableOpacity accessibilityRole="button" style={[styles.btn, me?.ready && styles.btnDone]} onPress={onReady} disabled={!!me?.ready}>
              <Text style={styles.btnText}>{me?.ready ? 'READY!' : 'READY'}</Text>
            </TouchableOpacity>
            <Text style={styles.small}>{`Starts in ${left}s`}</Text>
          </>
        ) : null}
        <TouchableOpacity accessibilityRole="button" onPress={onLeave}>
          <Text style={styles.leave}>Leave race</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Server-synced 3-2-1-GO. Presentation only: the round length is sim steps. */
export function RaceCountIn({ round, toLocal, onGo }: { round: RaceRound; toLocal: (serverMs: number) => number; onGo: () => void }) {
  const now = useNow(true, 50);
  const goAt = toLocal(round.startAtMs);
  const ms = goAt - now;
  const [fired, setFired] = useState(false);
  useEffect(() => {
    if (!fired && ms <= 0) {
      setFired(true);
      onGo();
    }
  }, [fired, ms, onGo]);
  if (ms < -700) return null;
  const txt = ms > 3000 ? 'GET SET' : ms > 0 ? `${Math.ceil(ms / 1000)}` : 'GO!';
  const names = round.seats.map((s) => (s.seat === round.you ? 'You' : s.name));
  return (
    <View pointerEvents="none" style={styles.countWrap}>
      <Text style={styles.count}>{txt}</Text>
      <Text style={styles.countSub}>{names.join('  ·  ')}</Text>
    </View>
  );
}

const PLACE = ['1ST', '2ND', '3RD', '4TH'];

export function RacePodium({ results, you, verdict, nextAtMs, toLocal, onAgain, onLeave }: {
  results: RaceResult[] | null;
  you: number;
  verdict: string | null;
  nextAtMs: number;
  toLocal: (serverMs: number) => number;
  onAgain: () => void;
  onLeave: () => void;
}) {
  const now = useNow(true, 250);
  if (!results) {
    return (
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>FINISH!</Text>
          <Text style={styles.body}>{verdict === 'ok' ? 'Your run is VERIFIED. Waiting for the other sharks...' : 'Checking your run with the server...'}</Text>
        </View>
      </View>
    );
  }
  const left = Math.max(0, Math.ceil((toLocal(nextAtMs) - now) / 1000));
  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        <Text style={styles.kicker}>SPRINT RACE RESULTS</Text>
        {results.map((r) => (
          <View key={r.seat} style={[styles.row, r.seat === you && styles.rowMe]}>
            <Text style={[styles.place, r.placement === 1 && { color: GOLD }]}>{PLACE[r.placement - 1] ?? `${r.placement}TH`}</Text>
            <Image source={r.placement === 1 ? SHARKY_ART.cheer : SHARKY_ART.swim} style={styles.rowShark} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>{r.seat === you ? 'You' : r.name}</Text>
              <Text style={styles.rowSub}>
                {r.finished ? `${(r.finishStep / 60).toFixed(2)}s` : 'DNF'}
                {r.filledBy === 'ghost' ? '  ·  ghost finished' : r.kind === 'bot' ? '  ·  house crew' : ''}
              </Text>
            </View>
            <View style={styles.verified}><Text style={styles.verifiedText}>{r.verified ? 'VERIFIED' : 'CHECKING'}</Text></View>
          </View>
        ))}
        <TouchableOpacity accessibilityRole="button" style={styles.btn} onPress={onAgain}>
          <Text style={styles.btnText}>RACE AGAIN</Text>
        </TouchableOpacity>
        <Text style={styles.small}>{`Next race opens in ${left}s`}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={onLeave}>
          <Text style={styles.leave}>Leave race</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(223,244,255,0.72)', alignItems: 'center', justifyContent: 'center' },
  card: { width: '88%', backgroundColor: '#fff8e4', borderRadius: 26, borderWidth: 4, borderColor: INK, padding: 18, alignItems: 'center' },
  kicker: { fontFamily: 'Knockout', fontSize: 14, color: INK, letterSpacing: 2 },
  title: { fontFamily: 'Shark', fontSize: 30, color: INK, marginTop: 2, textAlign: 'center' },
  lineup: { flexDirection: 'row', marginVertical: 12 },
  seat: { width: 72, alignItems: 'center', marginHorizontal: 3, paddingVertical: 6, borderRadius: 14, backgroundColor: '#dff4ff', borderWidth: 3, borderColor: INK },
  seatMe: { backgroundColor: GOLD },
  seatShark: { width: 58, height: 34 },
  crewShark: { opacity: 0.6 },
  seatName: { fontFamily: 'Shark', fontSize: 14, color: INK, marginTop: 2, maxWidth: 66 },
  seatTag: { fontFamily: 'Knockout', fontSize: 10, color: INK, letterSpacing: 1 },
  body: { fontFamily: 'Knockout', fontSize: 15, color: INK, textAlign: 'center', marginVertical: 6 },
  btn: { backgroundColor: GOLD, borderRadius: 999, borderWidth: 4, borderColor: INK, paddingHorizontal: 44, paddingVertical: 10, marginTop: 8 },
  btnDone: { backgroundColor: '#bff3a8' },
  btnText: { fontFamily: 'Shark', fontSize: 26, color: INK },
  small: { fontFamily: 'Knockout', fontSize: 13, color: INK, marginTop: 6 },
  leave: { fontFamily: 'Knockout', fontSize: 14, color: INK, marginTop: 10, opacity: 0.75 },
  countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: 'Shark', fontSize: 84, color: '#ffffff', textShadowColor: INK, textShadowOffset: { width: 0, height: 5 }, textShadowRadius: 0 },
  countSub: { fontFamily: 'Knockout', fontSize: 16, color: INK, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, marginVertical: 2 },
  rowMe: { backgroundColor: '#dff4ff', borderWidth: 3, borderColor: INK },
  place: { fontFamily: 'Shark', fontSize: 24, color: INK, width: 58 },
  rowShark: { width: 46, height: 36, marginRight: 8 },
  rowName: { fontFamily: 'Shark', fontSize: 18, color: INK },
  rowSub: { fontFamily: 'Knockout', fontSize: 12, color: INK },
  verified: { backgroundColor: '#3aa7f0', borderRadius: 8, borderWidth: 2, borderColor: INK, paddingHorizontal: 6, paddingVertical: 2 },
  verifiedText: { fontFamily: 'Knockout', fontSize: 11, color: '#ffffff', letterSpacing: 1 },
});
