/**
 * QueueResultsCapture (dev and release-JS capture only, never in store builds).
 *
 * Plays a queue game exactly the way LinePlay hosts it (the same movement
 * context: queue end, ride guess, group turn, run counting) without a live
 * queue session, so the end of a run can be checked in release-like JS:
 *   - WHACK IN LINE: Bank and Exit must land on a solid results card.
 *   - RIDE UP IN 8 S: the wait ends mid-run, so the run is saved (RUN SAVED).
 *   - LEFT LINE IN 8 S / RIDE UP AT 1 S: the left-the-line card and a ride
 *     that comes up before the first point.
 *   - GROUP TURN: one try, the card shows only DONE.
 *   - SHARKY IN LINE: Sharky's own results card.
 *   - RHYTHM / CURRENT QUEST IN LINE: the other queue games' cards.
 *   - LINE TRIVIA / TRIVIA DUEL: the duel's own results card.
 *   - RIDE TRY CARD: the map ride challenge's GOOD TRY! card with the same
 *     words and buttons RedeemRedeemableModal passes (ticket back, ticket
 *     spent), since a live miss needs a ticket and a coin in dev.
 *   - SHORT PHONE: makes the window report 375 x 667 (iPhone SE) so cards
 *     that size themselves from the window lay out as on an SE. Capture only.
 * The log line shows what LinePlay would count ("Counted: 0 stars, saved").
 * It is always silent: master game volume is 0 while it is open, so a
 * capture never plays through the speakers, signed in or not. Instead the
 * log names the last sounds and haptics each run asked for ("End: ui.confirm,
 * hitSoft"), so a muted capture still proves which finish cue played.
 *
 * Reached through the dev route list, or in release JS with
 * EXPO_PUBLIC_PERF_CAPTURE=1 and EXPO_PUBLIC_PERF_CAPTURE_ROUTE=QueueResultsCapture.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { LinePlayMovementContext, type LinePlayMovement } from '../../gamekit/LinePlayMovementContext';
import { ShellFrameContext } from '../../gamekit/ShellFrameContext';
import type { WrapUpReason } from '../../gamekit/core/session';
import { SFX } from '../../gamekit/SFX';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { Haptic, hapticTrace } from '../../gamekit/Haptics';
import { WhackAShark } from '../../games/whack';
import { SharkySwim } from '../../games/sharky';
import { RhythmTapGame } from '../../games/rhythm';
import { CurrentQuestQueueGame } from '../../games/current-quest';
import { TriviaGame, createLinePlayTriviaSource } from '../../games/trivia';
import { TriviaDuel } from '../../games/trivia-duel';
import ChallengeStatusCard from '../../components/rewards/ChallengeStatusCard';
import { lostTryCopy } from '../../components/rewards/lostTryCard';

type Run = { game: 'tap' | 'shark' | 'timing' | 'current' | 'trivia' | 'duel'; groupTurn: boolean; rideUpAfterMs: number | null; endReason?: WrapUpReason; key: number };

const CHOICES: { label: string; run: Omit<Run, 'key'> }[] = [
  { label: 'WHACK IN LINE', run: { game: 'tap', groupTurn: false, rideUpAfterMs: null } },
  { label: 'WHACK, RIDE UP IN 8 S', run: { game: 'tap', groupTurn: false, rideUpAfterMs: 8000 } },
  { label: 'WHACK, LEFT LINE IN 8 S', run: { game: 'tap', groupTurn: false, rideUpAfterMs: 8000, endReason: 'left-queue' } },
  { label: 'WHACK, RIDE UP AT 1 S', run: { game: 'tap', groupTurn: false, rideUpAfterMs: 1000 } },
  { label: 'WHACK GROUP TURN', run: { game: 'tap', groupTurn: true, rideUpAfterMs: null } },
  { label: 'SHARKY IN LINE', run: { game: 'shark', groupTurn: false, rideUpAfterMs: null } },
  { label: 'SHARKY, RIDE UP IN 6 S', run: { game: 'shark', groupTurn: false, rideUpAfterMs: 6000 } },
  { label: 'SHARKY, RIDE UP AT 1 S', run: { game: 'shark', groupTurn: false, rideUpAfterMs: 1000 } },
  { label: 'SHARKY GROUP TURN', run: { game: 'shark', groupTurn: true, rideUpAfterMs: null } },
  { label: 'RHYTHM IN LINE', run: { game: 'timing', groupTurn: false, rideUpAfterMs: null } },
  { label: 'CURRENT QUEST IN LINE', run: { game: 'current', groupTurn: false, rideUpAfterMs: null } },
  { label: 'CURRENT QUEST, RIDE UP IN 6 S', run: { game: 'current', groupTurn: false, rideUpAfterMs: 6000 } },
  { label: 'LINE TRIVIA', run: { game: 'trivia', groupTurn: false, rideUpAfterMs: null } },
  { label: 'TRIVIA DUEL, BEAT THE BUZZER', run: { game: 'duel', groupTurn: false, rideUpAfterMs: null } },
];

/** iPhone SE window, for the SHORT PHONE toggle. */
const SE_WINDOW = { width: 375, height: 667, scale: 2, fontScale: 1 };
const SE_FRAME = { width: 375, height: 667 };
/** How long the results reveal is measured after a run is counted. */
const REVEAL_MS = 3000;

export default function QueueResultsCaptureScreen() {
  const [run, setRun] = useState<Run | null>(null);
  const [queueEnded, setQueueEnded] = useState<WrapUpReason | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((l) => [line, ...l].slice(0, 6));
  const runRef = useRef(run);
  runRef.current = run;
  const [shortPhone, setShortPhone] = useState(false);
  const [tryCard, setTryCard] = useState<'back' | 'spent' | null>(null);
  const realWindow = useRef(Dimensions.get('window'));

  // SHORT PHONE: the window reports an SE size (cards read it through
  // useWindowDimensions); the real size comes back when it is turned off or
  // the screen closes.
  useEffect(() => {
    const real = realWindow.current;
    Dimensions.set({ window: shortPhone ? SE_WINDOW : real, screen: shortPhone ? SE_WINDOW : Dimensions.get('screen') });
    return () => { if (shortPhone) Dimensions.set({ window: real, screen: real }); };
  }, [shortPhone]);

  // Reveal perf: for REVEAL_MS after a run is counted (the results reveal),
  // count UI-thread frames (Reanimated frame callback) and JS-thread frames
  // (requestAnimationFrame) and the share over the 16.7 ms budget.
  const ui = useSharedValue({ on: false, n: 0, over: 0, sum: 0 });
  const uiFrames = useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (!ui.value.on || dt == null || dt <= 0 || dt > 500) return;
    const v = ui.value;
    ui.value = { on: true, n: v.n + 1, over: v.over + (dt > 17.5 ? 1 : 0), sum: v.sum + dt };
  }, false);
  // Each finish haptic restarts the window, so it measures the last one: the
  // shell's single finish cue when the results card arrives.
  const probe = useRef<{ start: number; n: number; over: number; sum: number; last: number; running: boolean }>({ start: 0, n: 0, over: 0, sum: 0, last: 0, running: false });
  const measureReveal = () => {
    const p = probe.current;
    Object.assign(p, { start: Date.now(), n: 0, over: 0, sum: 0, last: 0 });
    ui.value = { on: true, n: 0, over: 0, sum: 0 };
    // The frame counter runs only while measuring (a still capture screen costs no frames).
    uiFrames.setActive(true);
    if (p.running) return;
    p.running = true;
    const step = (t: number) => {
      if (p.last) { const dt = t - p.last; p.n += 1; p.sum += dt; if (dt > 17.5) p.over += 1; }
      p.last = t;
      if (Date.now() - p.start < REVEAL_MS) { requestAnimationFrame(step); return; }
      p.running = false;
      uiFrames.setActive(false);
      const u = ui.value;
      ui.value = { ...u, on: false };
      const fps = (n: number, sum: number) => (sum > 0 ? Math.round((1000 * n) / sum) : 0);
      const pct = (o: number, n: number) => (n > 0 ? Math.round((100 * o) / n) : 0);
      note(`Reveal perf: UI ${fps(u.n, u.sum)} fps, ${pct(u.over, u.n)}% slow; JS ${fps(p.n, p.sum)} fps, ${pct(p.over, p.n)}% slow`);
    };
    requestAnimationFrame(step);
  };
  const measureRevealRef = useRef(measureReveal);
  measureRevealRef.current = measureReveal;

  // What the run asked to hear and feel (names only; the volume stays at 0).
  const cues = useRef<string[]>([]);
  useEffect(() => {
    SFX.setMasterVolume(0);
    const play = GameAudio.play;
    GameAudio.play = (name, opts) => {
      cues.current = [...cues.current, name].slice(-12);
      return play.call(GameAudio, name, opts);
    };
    const feel = { ...Haptic };
    (['success', 'failBuzz', 'hitSoft', 'softBump'] as const).forEach((k) => {
      Haptic[k] = () => {
        cues.current = [...cues.current, `haptic ${k}`].slice(-12);
        // The shell's one finish haptic marks the results reveal: measure it.
        measureRevealRef.current();
        feel[k]();
      };
    });
    // Named patterns too (the star slams, the RUN SAVED stamp's tap).
    hapticTrace.listener = (name) => { cues.current = [...cues.current, `pattern ${name}`].slice(-12); };
    return () => {
      SFX.setMasterVolume(1);
      GameAudio.play = play;
      Object.assign(Haptic, feel);
      hapticTrace.listener = null;
    };
  }, []);

  useEffect(() => {
    if (!run || run.rideUpAfterMs == null) return undefined;
    const t = setTimeout(() => setQueueEnded(run.endReason ?? 'boarding'), run.rideUpAfterMs);
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
    // The last few cues are the finish: what the results card sounded like.
    note(`End: ${cues.current.slice(-6).join(', ') || 'silent'}`);
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
        <TouchableOpacity accessibilityRole="button" style={[styles.btn, shortPhone && styles.btnOn]} onPress={() => setShortPhone((v) => !v)}>
          <Text style={styles.btnText}>{shortPhone ? 'SHORT PHONE: ON (SE)' : 'SHORT PHONE: OFF'}</Text>
        </TouchableOpacity>
        {/* The same 3 s frame count on this still screen: the simulator's own baseline. */}
        <TouchableOpacity accessibilityRole="button" style={styles.btn} onPress={() => measureReveal()}>
          <Text style={styles.btnText}>PERF BASELINE (3 S)</Text>
        </TouchableOpacity>
        {CHOICES.map((c, i) => (
          <TouchableOpacity key={c.label} accessibilityRole="button" style={styles.btn}
            onPress={() => { cues.current = []; setQueueEnded(null); setRun({ ...c.run, key: Date.now() % 100000 + i }); }}>
            <Text style={styles.btnText}>{c.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity accessibilityRole="button" style={styles.btn} onPress={() => setTryCard('back')}>
          <Text style={styles.btnText}>RIDE TRY CARD, TICKET BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.btn} onPress={() => setTryCard('spent')}>
          <Text style={styles.btnText}>RIDE TRY CARD, TICKET SPENT</Text>
        </TouchableOpacity>
        <View style={styles.log}>
          {log.map((line, i) => <Text key={`${i}:${line}`} style={styles.logText}>{line}</Text>)}
        </View>
      </ScrollView>
      {tryCard ? (
        <View style={styles.tryScrim}>
          <View style={shortPhone ? styles.seFrame : styles.fullFrame}>
          {/* The same words and props RedeemRedeemableModal passes on a miss. */}
          <ChallengeStatusCard art="soClose" {...lostTryCopy({ usedRescuePass: false, rescueRetryAvailable: false,
            firstCoinTicketReturned: tryCard === 'back', lostTicketCost: tryCard === 'back' ? 0 : 1 })}
            primary={tryCard === 'back'
              ? { label: 'Try Again', onPress: () => { note('Try card: Try Again'); setTryCard(null); } }
              : { label: 'Continue', onPress: () => { note('Try card: Continue'); setTryCard(null); } }}
            quiet={tryCard === 'back' ? { label: 'DONE', onPress: () => { note('Try card: DONE'); setTryCard(null); } } : undefined}
            guardRetry={tryCard === 'back'} />
          </View>
        </View>
      ) : null}
      {/* SHORT PHONE: the game shell is drawn at the SE's exact 375 x 667 points, not just told the size. */}
      <ShellFrameContext.Provider value={shortPhone ? SE_FRAME : null}>
      <LinePlayMovementContext.Provider value={movement}>
        {run && common && run.game === 'tap' ? <WhackAShark key={run.key} {...common} difficulty={2} taskName="Space Mountain" /> : null}
        {run && common && run.game === 'shark' ? <SharkySwim key={run.key} {...common} difficulty={2} /> : null}
        {run && common && run.game === 'timing' ? <RhythmTapGame key={run.key} {...common} /> : null}
        {run && common && run.game === 'current' ? <CurrentQuestQueueGame key={run.key} {...common} taskName="Space Mountain" /> : null}
        {run && common && run.game === 'trivia' ? (
          <TriviaGame key={run.key} visible title="Line Trivia" seed={run.key}
            source={createLinePlayTriviaSource({ parkId: 8, seed: run.key })} onClose={common.onClose} onComplete={common.onComplete} />
        ) : null}
        {run && common && run.game === 'duel' ? (
          <TriviaDuel key={run.key} visible mode="ride" seed={run.key} parkId={8} onClose={common.onClose} onComplete={common.onComplete} />
        ) : null}
      </LinePlayMovementContext.Provider>
      </ShellFrameContext.Provider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#dff4ff' },
  content: { padding: 16, paddingTop: 140 },
  title: { fontFamily: 'Shark', fontSize: 26, color: '#05346e', textAlign: 'center', marginBottom: 12 },
  btn: { backgroundColor: '#ffcf3b', borderRadius: 16, borderWidth: 3, borderColor: '#05346e', paddingVertical: 12, marginVertical: 5, alignItems: 'center' },
  btnText: { fontFamily: 'Shark', fontSize: 20, color: '#05346e' },
  btnOn: { backgroundColor: '#ffffff' },
  tryScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 52, 110, 0.55)', alignItems: 'center', justifyContent: 'center' },
  seFrame: { width: 375, height: 667, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffffff' },
  fullFrame: { alignSelf: 'stretch', alignItems: 'center' },
  log: { marginTop: 12 },
  logText: { fontFamily: 'Knockout', fontSize: 17, color: '#05346e', textAlign: 'center', marginVertical: 2 },
});
