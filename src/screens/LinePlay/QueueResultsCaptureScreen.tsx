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
 *   - LINE TRIVIA, AUTOPLAY WIN: the real duel on its stage, every answer
 *     right (capture-only autoplay), so the won card shows in release JS.
 *   - RIDE MISS, NO RETRY / TICKET BACK: the map's ride challenge missed, then
 *     the same lostTryHasRetry rule RedeemRedeemableModal runs: no retry goes
 *     straight back (one card), the Ticket back opens the try card.
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
import { silenceForCapture } from '../../gamekit/audio/captureSilence';
import { Haptic, hapticTrace } from '../../gamekit/Haptics';
import { CUE_LOG_CAP, cueName, finishCueLine, finishCues } from '../../gamekit/results/cueLog';
import { endTrace } from '../../gamekit/core/endWatch';
import { WhackAShark } from '../../games/whack';
import { SharkySwim } from '../../games/sharky';
import { RhythmTapGame } from '../../games/rhythm';
import { BananaBasketGame } from '../../games/banana-basket/BananaBasketGame';
import { MemoryGame } from '../../games/memory';
import { CurrentQuestQueueGame } from '../../games/current-quest';
import { TriviaGame, createLinePlayTriviaSource } from '../../games/trivia';
import { TriviaDuel } from '../../games/trivia-duel';
import ChallengeStatusCard from '../../components/rewards/ChallengeStatusCard';
import { AD_RETRY_ACTION, lostTryCopy, lostTryHasRetry } from '../../components/rewards/lostTryCard';
import { DuelResults, type ResultsModel } from '../../games/trivia-duel/ui/DuelResults';

type Run = {
  game: 'tap' | 'shark' | 'timing' | 'current' | 'trivia' | 'duel' | 'duelWin' | 'duelPart' | 'rideMiss' | 'timingTwo' | 'banana' | 'memoryRide' | 'memoryWarmup'; groupTurn: boolean; rideUpAfterMs: number | null; endReason?: WrapUpReason; key: number;
  /** RIDE MISS: what the server said about the lost try (a ticket and coin fixture). */
  miss?: { ticketBack: boolean; ticketCost: number };
  /** Whack plays itself (the game's own scripted player), so a release check can show a star run and a win streak. */
  autoplay?: boolean;
  /** Whack: this run unlocks a new costume Finn (capture only), so the new-Finn beat can be checked on demand. */
  newFinn?: boolean;
  /** Memory: the capture bot plays (clean clears with turns, so the STATS star pips show). */
  memoryBot?: 'clean' | 'mixed' | 'novice' | 'timeout';
  /** Sharky: this run unlocks Prize Boxes (capture only). */
  sharkyUnlock?: boolean;
  /** Banana soak: the bot lets go when time is up, or a teaching card opens on the last step. */
  bananaLift?: boolean;
  bananaEndCard?: boolean;
};

/**
 * BANANA SOAK x10: ten Banana Basket runs in a row, played by the bot, in release-like JS. Runs 7-8
 * let go of the thumb the moment time is up; runs 9-10 force a teaching card open on the last step.
 * Each run's row in the shell's end trace (core/endWatch.ts) says when its card was lit and who lit
 * it (the game, the game's rescue, or the shared card), so a dark end can never pass unseen.
 */
const SOAK_RUNS = 10;
const soakRun = (i: number): Omit<Run, 'key'> => ({
  game: 'banana', groupTurn: false, rideUpAfterMs: null, autoplay: true, bananaLift: i === 6 || i === 7, bananaEndCard: i >= 8,
});
/** A soak run with no lit card this long after it started is a dark end (a queue run is about 75 s). */
const SOAK_DARK_MS = 150000;

const CHOICES: { label: string; run: Omit<Run, 'key'> }[] = [
  { label: 'WHACK IN LINE', run: { game: 'tap', groupTurn: false, rideUpAfterMs: null } },
  { label: 'WHACK IN LINE, AUTOPLAY', run: { game: 'tap', groupTurn: false, rideUpAfterMs: null, autoplay: true } },
  { label: 'WHACK, AUTOPLAY, NEW FINN', run: { game: 'tap', groupTurn: false, rideUpAfterMs: null, autoplay: true, newFinn: true } },
  { label: 'WHACK, RIDE UP IN 8 S', run: { game: 'tap', groupTurn: false, rideUpAfterMs: 8000 } },
  { label: 'WHACK, LEFT LINE IN 8 S', run: { game: 'tap', groupTurn: false, rideUpAfterMs: 8000, endReason: 'left-queue' } },
  { label: 'WHACK, RIDE UP AT 1 S', run: { game: 'tap', groupTurn: false, rideUpAfterMs: 1000 } },
  { label: 'WHACK GROUP TURN', run: { game: 'tap', groupTurn: true, rideUpAfterMs: null } },
  { label: 'SHARKY IN LINE', run: { game: 'shark', groupTurn: false, rideUpAfterMs: null } },
  { label: 'SHARKY, RIDE UP IN 6 S', run: { game: 'shark', groupTurn: false, rideUpAfterMs: 6000 } },
  { label: 'SHARKY, RIDE UP AT 1 S', run: { game: 'shark', groupTurn: false, rideUpAfterMs: 1000 } },
  { label: 'SHARKY GROUP TURN', run: { game: 'shark', groupTurn: true, rideUpAfterMs: null } },
  // Sharky plays itself and unlocks Prize Boxes: the unlock picture with its NEW tag, inside the card above the buttons.
  { label: 'SHARKY, AUTOPLAY, UNLOCK', run: { game: 'shark', groupTurn: false, rideUpAfterMs: null, autoplay: true, sharkyUnlock: true } },
  { label: 'RHYTHM IN LINE', run: { game: 'timing', groupTurn: false, rideUpAfterMs: null } },
  // The card with a game's own extra row inside it, above DONE: Rhythm's TRY TWO THUMBS? offer and Banana Basket's rows.
  { label: 'RHYTHM, TWO THUMBS OFFER', run: { game: 'timingTwo', groupTurn: false, rideUpAfterMs: null } },
  { label: 'BANANA BASKET IN LINE', run: { game: 'banana', groupTurn: false, rideUpAfterMs: null } },
  { label: 'BANANA BASKET, AUTOPLAY', run: { game: 'banana', groupTurn: false, rideUpAfterMs: null, autoplay: true } },
  // Memory Match's ride try card (TIME'S UP!, TRY AGAIN with tries left, DONE): play it and let the clock run out.
  { label: 'MEMORY RIDE TRY CARD', run: { game: 'memoryRide', groupTurn: false, rideUpAfterMs: null } },
  // Memory Match played by the capture bot: a cleared board with turns (the end card, STATS star pips).
  { label: 'MEMORY RIDE, AUTOPLAY', run: { game: 'memoryRide', groupTurn: false, rideUpAfterMs: null, memoryBot: 'clean' } },
  // Finn's warm-up (the first-session first win), played by the bot.
  { label: 'MEMORY WARM-UP, AUTOPLAY', run: { game: 'memoryWarmup', groupTurn: false, rideUpAfterMs: null, memoryBot: 'clean' } },
  { label: 'CURRENT QUEST IN LINE', run: { game: 'current', groupTurn: false, rideUpAfterMs: null } },
  { label: 'CURRENT QUEST, RIDE UP IN 6 S', run: { game: 'current', groupTurn: false, rideUpAfterMs: 6000 } },
  { label: 'LINE TRIVIA', run: { game: 'trivia', groupTurn: false, rideUpAfterMs: null } },
  { label: 'TRIVIA DUEL, BEAT THE BUZZER', run: { game: 'duel', groupTurn: false, rideUpAfterMs: null } },
  // The real duel on its real stage, every answer right and fast: the won card in release JS.
  { label: 'LINE TRIVIA, AUTOPLAY WIN', run: { game: 'duelWin', groupTurn: false, rideUpAfterMs: null } },
  // Two right answers, then misses and a missed bonus Final: the partial-score loss card (navy gap bar; a missed Final costs nothing).
  { label: 'LINE TRIVIA, PARTIAL LOSS', run: { game: 'duelPart', groupTurn: false, rideUpAfterMs: null } },
  // The map's ride challenge, played and missed (no taps): 1 Ticket spent and no retry,
  // so the game's own card is the only card and DONE goes back to the map.
  { label: 'RIDE MISS, NO RETRY', run: { game: 'rideMiss', groupTurn: false, rideUpAfterMs: null, miss: { ticketBack: false, ticketCost: 1 } } },
  { label: 'RIDE MISS, TICKET BACK', run: { game: 'rideMiss', groupTurn: false, rideUpAfterMs: null, miss: { ticketBack: true, ticketCost: 0 } } },
];

/**
 * DUEL WIN CARD: Line Trivia's own results card for a won duel with every
 * banner (FIN BEATEN, RANK UP, NEW BEST), the Fin rank fins and the Best
 * Moment polaroid, so the win layout is checked without needing autoplay to
 * beat Fin. The numbers are a fixed sample, never a real player's.
 */
const DUEL_WIN: ResultsModel = {
  won: true, tie: false, myScore: 1576, oppScore: 988, oppName: 'Fin',
  banners: ['FIN BEATEN', 'RANK UP', 'NEW BEST'], nearMiss: '',
  rows: [{ label: 'Correct', value: '4/5' }, { label: 'Fastest answer', value: 'Great' }],
  facts: [{ id: 'sample', fact: 'Earth is shaped almost like a ball.', gold: false, at: 0, isNew: false }],
  // duelStars(1576, 988, 4 right of 5): a 588-point win is 2 stars.
  stars: 2, practice: false,
  rank: { label: 'Captain Gill', progress: 0, next: 'Admiral Gill', stripes: 2, nextStripes: 3, wins: 0, need: 3 },
  best: { label: '0.9s on Q1' },
};

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
  const [duelCard, setDuelCard] = useState(0);
  const realWindow = useRef(Dimensions.get('window'));
  // BANANA SOAK: which run (0-based) is playing, and one line per finished run.
  const [soak, setSoak] = useState<{ i: number; startedAt: number; traceFrom: number } | null>(null);
  const [soakLog, setSoakLog] = useState<string[]>([]);
  const startSoakRun = (i: number) => {
    cues.current = [];
    finishAt.current = -1;
    setQueueEnded(null);
    setSoak({ i, startedAt: Date.now(), traceFrom: endTrace().length ? endTrace()[endTrace().length - 1].run : 0 });
    setRun({ ...soakRun(i), key: Date.now() % 100000 + 500 + i });
  };
  useEffect(() => {
    if (!soak) return undefined;
    const id = setInterval(() => {
      const row = endTrace().find((r) => r.run > soak.traceFrom && r.game === 'banana');
      const tag = soakRun(soak.i).bananaLift ? ' (thumb up at TIME!)' : soakRun(soak.i).bananaEndCard ? ' (card on the last step)' : '';
      const finish = (line: string) => {
        clearInterval(id);
        setSoakLog((l) => [...l, line]);
        const next = soak.i + 1;
        if (next < SOAK_RUNS) setTimeout(() => startSoakRun(next), 1500);
        else {
          setSoak(null);
          setRun(null);
        }
      };
      if (row?.litAt != null) {
        finish(`Soak ${soak.i + 1}/${SOAK_RUNS}: lit ${((row.litAt - row.overAt) / 1000).toFixed(1)} s after time up, by ${row.by}${tag}`);
      } else if (Date.now() - soak.startedAt > SOAK_DARK_MS) {
        finish(`Soak ${soak.i + 1}/${SOAK_RUNS}: DARK END, no lit card${row ? ' (time was up)' : ' (time never ran out)'}${tag}`);
      }
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soak]);

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
  /** Where the last finish haptic landed in `cues`: the End line starts there. */
  const finishAt = useRef(-1);
  const pushCue = (c: string) => {
    const next = [...cues.current, c];
    const drop = Math.max(0, next.length - CUE_LOG_CAP);
    cues.current = next.slice(drop);
    finishAt.current = finishAt.current >= 0 ? Math.max(0, finishAt.current - drop) : -1;
  };
  const pushCueRef = useRef(pushCue);
  pushCueRef.current = pushCue;
  useEffect(() => {
    // The capture never plays a sound, so it never touches the native audio
    // stack either (a stuck simulator audio server freezes the app).
    const unsilence = silenceForCapture();
    SFX.setMasterVolume(0);
    const play = GameAudio.play;
    // Only the cue a game asked for is logged: a muted cue that falls back to
    // another (GameAudio.play calls itself) is still one sound, not two.
    let depth = 0;
    GameAudio.play = (name, opts) => {
      if (depth === 0) pushCueRef.current(cueName(name, opts as { pitch?: number } | undefined));
      depth += 1;
      try {
        return play.call(GameAudio, name, opts);
      } finally {
        depth -= 1;
      }
    };
    const feel = { ...Haptic };
    (['success', 'failBuzz', 'hitSoft', 'softBump'] as const).forEach((k) => {
      Haptic[k] = () => {
        // The shell's one finish haptic: the End line starts here.
        finishAt.current = cues.current.length;
        pushCueRef.current(`haptic ${k}`);
        // The shell's one finish haptic marks the results reveal: measure it.
        measureRevealRef.current();
        feel[k]();
      };
    });
    // Named patterns too (the star slams, the RUN SAVED stamp's tap).
    hapticTrace.listener = (name) => {
      // A card with no shell finish haptic (the Duel's own card): its first
      // star stamp starts the End line, so the line holds the results only.
      if (finishAt.current < 0 && (name === 'starSlam' || name === 'bigStarSlam')) finishAt.current = cues.current.length;
      pushCueRef.current(`pattern ${name}`);
    };
    return () => {
      SFX.setMasterVolume(1);
      unsilence();
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
    // Every cue from the finish haptic on: what the results card sounded like.
    note(`End: ${finishCueLine(finishCues(cues.current, finishAt.current))}`);
    note(line);
    setRun(null);
    setQueueEnded(null);
  };
  // RIDE MISS: the same rule RedeemRedeemableModal runs after a lost try.
  // With no retry the game's own card was the only card: back to the map.
  // With the Ticket back, the try card offers the free retry.
  const rideMissDone = () => {
    const miss = run?.miss;
    if (!miss) return;
    const retry = lostTryHasRetry({ firstCoinTicketReturned: miss.ticketBack, rescueRetryAvailable: false, retryOffered: false });
    if (retry) {
      note('Ride miss: try card (Ticket back)');
      setRun(null);
      setTryCard('back');
      return;
    }
    end(`Ride miss: back to the map, one card (${miss.ticketCost} Ticket used, no retry)`);
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
        {soakLog.length ? (
          <View style={styles.log}>
            {soakLog.map((line, i) => <Text key={`${i}:${line}`} style={styles.logText}>{line}</Text>)}
            <Text style={styles.logText}>{`Soak: ${soakLog.filter((l) => / lit /.test(l)).length} of ${soakLog.length} lit${soak ? ' (running)' : ''}`}</Text>
          </View>
        ) : null}
        <TouchableOpacity accessibilityRole="button" style={[styles.btn, shortPhone && styles.btnOn]} onPress={() => setShortPhone((v) => !v)}>
          <Text style={styles.btnText}>{shortPhone ? 'SHORT PHONE: ON (SE)' : 'SHORT PHONE: OFF'}</Text>
        </TouchableOpacity>
        {/* The same 3 s frame count on this still screen: the simulator's own baseline. */}
        <TouchableOpacity accessibilityRole="button" style={styles.btn} onPress={() => measureReveal()}>
          <Text style={styles.btnText}>PERF BASELINE (3 S)</Text>
        </TouchableOpacity>
        {CHOICES.map((c, i) => (
          <TouchableOpacity key={c.label} accessibilityRole="button" style={styles.btn}
            onPress={() => { cues.current = []; finishAt.current = -1; setQueueEnded(null); setRun({ ...c.run, key: Date.now() % 100000 + i }); }}>
            <Text style={styles.btnText}>{c.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity accessibilityRole="button" style={styles.btn} onPress={() => { setSoakLog([]); startSoakRun(0); }}>
          <Text style={styles.btnText}>BANANA SOAK x10</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.btn} onPress={() => setDuelCard(Date.now())}>
          <Text style={styles.btnText}>DUEL WIN CARD</Text>
        </TouchableOpacity>
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
      {duelCard ? (
        <View style={styles.tryScrim}>
          <View style={shortPhone ? [styles.seFrame, styles.duelStage] : styles.duelFull}>
            <DuelResults key={duelCard} model={DUEL_WIN} beatMs={500} reducedMotion={false} height={Math.round((shortPhone ? SE_FRAME.height : Dimensions.get('window').height) * 0.5)}
              onRematch={() => { note('Duel card: REMATCH'); setDuelCard(0); }} onGhost={() => { note('Duel card: PASS TO CREW'); setDuelCard(0); }}
              onContinue={() => { note('Duel card: DONE'); setDuelCard(0); }} />
          </View>
        </View>
      ) : null}
      {tryCard ? (
        <View style={styles.tryScrim}>
          <View style={shortPhone ? styles.seFrame : styles.fullFrame}>
          {/* The same words and props RedeemRedeemableModal passes on a miss.
              The card only shows when a retry is on offer (a miss with none
              goes straight back to the map): TICKET BACK is the free retry,
              TICKET SPENT is the "one more try" offer. */}
          <ChallengeStatusCard art="soClose" {...lostTryCopy({ usedRescuePass: false, rescueRetryAvailable: false,
            firstCoinTicketReturned: tryCard === 'back', lostTicketCost: tryCard === 'back' ? 0 : 1, retryOffered: tryCard === 'spent' })}
            primary={tryCard === 'back'
              ? { label: 'Try Again', onPress: () => { note('Try card: Try Again'); setTryCard(null); } }
              : { ...AD_RETRY_ACTION, onPress: () => { note('Try card: One More Try'); setTryCard(null); } }}
            quiet={{ label: 'DONE', onPress: () => { note('Try card: DONE'); setTryCard(null); } }}
            guardRetry={tryCard === 'back'} />
          </View>
        </View>
      ) : null}
      {/* SHORT PHONE: the game shell is drawn at the SE's exact 375 x 667 points, not just told the size. */}
      <ShellFrameContext.Provider value={shortPhone ? SE_FRAME : null}>
      <LinePlayMovementContext.Provider value={movement}>
        {run && common && run.game === 'tap' ? <WhackAShark key={run.key} {...common} difficulty={2} taskName="Space Mountain" autoplay={run.autoplay} captureNewFinn={run.newFinn} /> : null}
        {run && common && run.game === 'shark' ? <SharkySwim key={run.key} {...common} difficulty={2} captureAutoplay={run.autoplay} captureUnlock={run.sharkyUnlock} /> : null}
        {run && common && run.game === 'timing' ? <RhythmTapGame key={run.key} {...common} /> : null}
        {run && common && run.game === 'timingTwo' ? <RhythmTapGame key={run.key} {...common} captureOfferTwo /> : null}
        {run && common && run.game === 'banana' ? <BananaBasketGame key={run.key} {...common} mode="queue" autoplay={run.autoplay}
          captureLiftAtEnd={run.bananaLift} captureEndCard={run.bananaEndCard} /> : null}
        {run && common && run.game === 'memoryRide' ? <MemoryGame key={run.key} {...common} mode="ride" difficulty={1} menu={false} taskName="Space Mountain" captureAutoplay={run.memoryBot} /> : null}
        {run && common && run.game === 'memoryWarmup' ? <MemoryGame key={run.key} {...common} mode="warmup" menu={false} captureAutoplay={run.memoryBot} /> : null}
        {run && common && run.game === 'current' ? <CurrentQuestQueueGame key={run.key} {...common} taskName="Space Mountain" /> : null}
        {run && common && run.game === 'trivia' ? (
          <TriviaGame key={run.key} visible title="Line Trivia" seed={run.key}
            source={createLinePlayTriviaSource({ parkId: 8, seed: run.key })} onClose={common.onClose} onComplete={common.onComplete} />
        ) : null}
        {run && common && run.game === 'duelPart' ? (
          <TriviaDuel key={run.key} visible mode="queue" title="Trivia Duel" seed={run.key} parkId={8} captureAutoplay="partial" onClose={common.onClose} onComplete={common.onComplete} />
        ) : null}
        {run && common && run.game === 'duelWin' ? (
          <TriviaDuel key={run.key} visible mode="queue" title="Trivia Duel" seed={run.key} parkId={8} captureAutoplay="win" onClose={common.onClose} onComplete={common.onComplete} />
        ) : null}
        {run && common && run.game === 'rideMiss' ? (
          <TriviaDuel key={run.key} visible mode="ride" seed={run.key} parkId={8} onClose={rideMissDone} onComplete={rideMissDone} />
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
  // The duel card sits on the stage's sky, the way it does in the game.
  duelStage: { backgroundColor: '#8fd3ff' },
  duelFull: { ...StyleSheet.absoluteFillObject, backgroundColor: '#8fd3ff' },
  log: { marginTop: 12 },
  logText: { fontFamily: 'Knockout', fontSize: 17, color: '#05346e', textAlign: 'center', marginVertical: 2 },
});
