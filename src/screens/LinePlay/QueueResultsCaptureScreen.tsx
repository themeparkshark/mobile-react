/**
 * QueueResultsCapture (dev and release-JS capture only, never in store builds).
 *
 * Plays a queue game exactly the way LinePlay hosts it (the same movement
 * context: queue end, ride guess, group turn, run counting) without a live
 * queue session, so the end of a run can be checked in release-like JS:
 *   - WHACK IN LINE: Bank and Exit must land on a solid results card.
 *   - RIDE UP IN 8 S: the wait ends mid-run, so the run is saved (RUN SAVED).
 *   - GROUP TURN: one try, the card shows only DONE.
 *   - SHARKY IN LINE: Sharky's own results card.
 *   - RHYTHM / CURRENT QUEST IN LINE: the other queue games' cards.
 * The log line shows what LinePlay would count ("Counted: 0 stars, saved").
 * It is always silent: master game volume is 0 while it is open, so a
 * capture never plays through the speakers, signed in or not.
 *
 * Reached through the dev route list, or in release JS with
 * EXPO_PUBLIC_PERF_CAPTURE=1 and EXPO_PUBLIC_PERF_CAPTURE_ROUTE=QueueResultsCapture.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinePlayMovementContext, type LinePlayMovement } from '../../gamekit/LinePlayMovementContext';
import type { WrapUpReason } from '../../gamekit/core/session';
import { SFX } from '../../gamekit/SFX';
import { WhackAShark } from '../../games/whack';
import { SharkySwim } from '../../games/sharky';
import { RhythmTapGame } from '../../games/rhythm';
import { CurrentQuestQueueGame } from '../../games/current-quest';

type Run = { game: 'tap' | 'shark' | 'timing' | 'current'; groupTurn: boolean; rideUpAfterMs: number | null; key: number };

const CHOICES: { label: string; run: Omit<Run, 'key'> }[] = [
  { label: 'WHACK IN LINE', run: { game: 'tap', groupTurn: false, rideUpAfterMs: null } },
  { label: 'WHACK, RIDE UP IN 8 S', run: { game: 'tap', groupTurn: false, rideUpAfterMs: 8000 } },
  { label: 'WHACK GROUP TURN', run: { game: 'tap', groupTurn: true, rideUpAfterMs: null } },
  { label: 'SHARKY IN LINE', run: { game: 'shark', groupTurn: false, rideUpAfterMs: null } },
  { label: 'SHARKY GROUP TURN', run: { game: 'shark', groupTurn: true, rideUpAfterMs: null } },
  { label: 'RHYTHM IN LINE', run: { game: 'timing', groupTurn: false, rideUpAfterMs: null } },
  { label: 'CURRENT QUEST IN LINE', run: { game: 'current', groupTurn: false, rideUpAfterMs: null } },
];

export default function QueueResultsCaptureScreen() {
  const [run, setRun] = useState<Run | null>(null);
  const [queueEnded, setQueueEnded] = useState<WrapUpReason | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 6));
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    SFX.setMasterVolume(0);
    return () => SFX.setMasterVolume(1);
  }, []);

  useEffect(() => {
    if (!run || run.rideUpAfterMs == null) return undefined;
    const t = setTimeout(() => setQueueEnded('boarding'), run.rideUpAfterMs);
    return () => clearTimeout(t);
  }, [run]);

  const movement = useMemo<LinePlayMovement>(() => ({
    moving: false,
    onResume: () => undefined,
    lineMovePolicy: 'passive',
    queueEnded,
    rideUpLikely: false,
    turnOnly: run?.groupTurn === true,
    onBoardingAnswer: (boarded) => note(boarded ? 'Boarding: wait ended' : 'Kept playing'),
    onRunDone: (stars, partial) => {
      if (runRef.current?.groupTurn) return;
      note(`Counted: ${stars} star${stars === 1 ? '' : 's'}${partial ? ', saved' : ''}`);
    },
  }), [queueEnded, run?.groupTurn]);

  const end = (line: string) => {
    note(line);
    setRun(null);
    setQueueEnded(null);
  };
  const common = run ? {
    visible: true,
    seed: 4242 + run.key,
    onClose: () => end(run.groupTurn ? 'Turn done: next player' : 'Closed'),
    onComplete: (multiplier: number) => end(`Completed: x${multiplier}`),
  } : null;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>QUEUE RESULTS CHECK</Text>
        {CHOICES.map((c, i) => (
          <TouchableOpacity key={c.label} accessibilityRole="button" style={styles.btn}
            onPress={() => { setQueueEnded(null); setRun({ ...c.run, key: Date.now() % 100000 + i }); }}>
            <Text style={styles.btnText}>{c.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.log}>
          {log.map((line, i) => <Text key={`${i}:${line}`} style={styles.logText}>{line}</Text>)}
        </View>
      </ScrollView>
      <LinePlayMovementContext.Provider value={movement}>
        {run && common && run.game === 'tap' ? <WhackAShark key={run.key} {...common} difficulty={2} taskName="Space Mountain" /> : null}
        {run && common && run.game === 'shark' ? <SharkySwim key={run.key} {...common} difficulty={2} /> : null}
        {run && common && run.game === 'timing' ? <RhythmTapGame key={run.key} {...common} /> : null}
        {run && common && run.game === 'current' ? <CurrentQuestQueueGame key={run.key} {...common} taskName="Space Mountain" /> : null}
      </LinePlayMovementContext.Provider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#dff4ff' },
  content: { padding: 16, paddingTop: 140 },
  title: { fontFamily: 'Shark', fontSize: 26, color: '#05346e', textAlign: 'center', marginBottom: 12 },
  btn: { backgroundColor: '#ffcf3b', borderRadius: 16, borderWidth: 3, borderColor: '#05346e', paddingVertical: 12, marginVertical: 5, alignItems: 'center' },
  btnText: { fontFamily: 'Shark', fontSize: 20, color: '#05346e' },
  log: { marginTop: 12 },
  logText: { fontFamily: 'Knockout', fontSize: 17, color: '#05346e', textAlign: 'center', marginVertical: 2 },
});
