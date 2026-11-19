import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { GameShellV2, Haptic, playSfx, type GameResult } from '../../../gamekit';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import GameIcon from '../../../ui/GameIcon';
import {
  beginCurrentBoard, CURRENT_TIERS, currentStars, makeCurrentBoard, moveCurrent, scoreCurrentBoard,
  type CurrentProgress, type CurrentTier,
} from './logic';

const BOARD_WIDTH = Math.min(Dimensions.get('window').width - 42, 350);
const GAP = 6;
const SHARK = require('../../../../assets/images/screens/pin-collections/shark.png');
const QUEST_ICONS = require('../../../assets/games/current-quest/icons-v1.png');
/** T032: the tap hand players know from Parade Beat and the map, and the open chest for a cleared voyage. */
const TAP_HAND = require('../../../../assets/images/ride-photo/tap-hand.webp');
const CHEST_OPEN = require('../../../assets/games/current-quest/chest_open.png');

/** T032: one loop of the start card's tap demo (the hand taps the tile beside the shark, the shark swims in). */
export const TAP_DEMO_MS = 1600;

/** Pure demo pose at loop phase p (0..1): the finger dips onto the tile, then the shark slides across to it. */
export function tapDemoPose(p: number): { finger: number; swim: number } {
  'worklet';
  const ease = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const finger = ease(0.05, 0.18, p) * (1 - ease(0.22, 0.34, p));
  const swim = ease(0.24, 0.6, p) * (1 - ease(0.88, 1, p));
  return { finger, swim };
}

/**
 * T032: the start card's picture for a TAP game (the old pill said "Collect pearls" and the how-to card
 * showed a swipe): the shark on its tile, a hand tapping the tile next to it (the shark swims there),
 * then the pearl and the chest. Existing art only; UI thread; Reduce Motion holds the tap pose still.
 */
function TapPathDemo({ reduced }: { reduced: boolean }) {
  const t = useSharedValue(reduced ? 0.15 : 0);
  useEffect(() => {
    if (reduced) { t.value = 0.15; return undefined; }
    t.value = withRepeat(withTiming(1, { duration: TAP_DEMO_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [reduced, t]);
  const fingerSt = useAnimatedStyle(() => {
    const q = tapDemoPose(t.value);
    return { transform: [{ translateY: -12 + 12 * q.finger }, { rotate: `${6 - 10 * q.finger}deg` }] };
  });
  const sharkSt = useAnimatedStyle(() => ({ transform: [{ translateX: 46 * tapDemoPose(t.value).swim }] }));
  return (
    <View style={styles.demoRow} accessible={false}>
      <View style={styles.demoTiles}>
        <View style={[styles.demoTile, styles.visitedCell]} />
        <View style={[styles.demoTile, styles.nextCell]} />
        <Animated.View style={[styles.demoShark, sharkSt]}>
          <Image source={SHARK} resizeMode="contain" style={styles.demoSharkArt} />
        </Animated.View>
        <Animated.View style={[styles.demoHand, fingerSt]} pointerEvents="none">
          <Image source={TAP_HAND} resizeMode="contain" style={styles.demoHandArt} />
        </Animated.View>
      </View>
      <GameIcon name="arrow" size={18} />
      <QuestIcon slot={0} size={30} />
      <GameIcon name="arrow" size={18} />
      <QuestIcon slot={2} size={38} />
    </View>
  );
}

/** T032: a splash ring on the tile the shark just swam to (one-shot, UI thread). */
function Splash({ size }: { size: number }) {
  const v = useSharedValue(0);
  useEffect(() => { v.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }); }, [v]);
  const st = useAnimatedStyle(() => ({ opacity: 1 - v.value, transform: [{ scale: 0.5 + v.value * 0.9 }] }));
  return <Animated.View pointerEvents="none" style={[styles.splash, { width: size, height: size, borderRadius: size / 2 }, st]} />;
}

/** T032: a cleared voyage pops the open chest over the board (spring), with a gold shine, before NEXT VOYAGE. */
function ChestPop({ reduced, size }: { reduced: boolean; size: number }) {
  const pop = useSharedValue(reduced ? 1 : 0);
  const shine = useSharedValue(0);
  useEffect(() => {
    if (reduced) return undefined;
    pop.value = withSpring(1, { damping: 9, stiffness: 180 });
    shine.value = withDelay(120, withSequence(withTiming(1, { duration: 260 }), withTiming(0.35, { duration: 500 })));
    return () => { cancelAnimation(pop); cancelAnimation(shine); };
  }, [reduced, pop, shine]);
  const chestSt = useAnimatedStyle(() => ({ transform: [{ scale: 0.3 + 0.7 * pop.value }, { translateY: (1 - pop.value) * 24 }] }));
  const shineSt = useAnimatedStyle(() => ({ opacity: shine.value, transform: [{ scale: 0.8 + shine.value * 0.3 }] }));
  return (
    <View pointerEvents="none" style={styles.chestLayer} testID="cq-chest-pop">
      <Animated.View style={[styles.chestShine, { width: size * 1.3, height: size * 1.3, borderRadius: size * 0.65 }, shineSt]} />
      <Animated.Image source={CHEST_OPEN} resizeMode="contain" style={[{ width: size, height: size }, chestSt]} />
    </View>
  );
}

function QuestIcon({ slot, size }: { slot: 0 | 1 | 2; size: number }) {
  return <View style={{ width: size, height: size, overflow: 'hidden' }}>
    <Image source={QUEST_ICONS} resizeMode="stretch" style={{ position: 'absolute',
      width: size * 3, height: size, left: -slot * size, top: 0 }} />
  </View>;
}

export interface CurrentQuestGameProps {
  visible: boolean;
  seed?: number;
  taskName?: string;
  /** Queue bonus tier from the server attempt (Standard 3 voyages, Easy, Breeze 2). */
  tier?: CurrentTier;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  /**
   * T032: PLAY AGAIN on the results card. A finished run's proof goes here before the replay starts
   * (the line's bonus proof is never thrown away by playing again; the replay deals new routes).
   */
  onRunProof?: (meta: Record<string, unknown>) => void;
}

/** T032: PLAY AGAIN deals a fresh set of routes: run 0 keeps the server's seed (its proof), later runs mix it. */
export function replaySeed(seed: number, run: number): number {
  if (run <= 0) return seed >>> 0;
  return (Math.imul((seed >>> 0) ^ (run * 0x9e3779b9), 0x85ebca6b) >>> 0);
}

/** Three short route puzzles, and PLAY AGAIN for another set (T032). */
export default function CurrentQuestGame(props: CurrentQuestGameProps) {
  const [run, setRun] = useState(0);
  const base = useMemo(() => props.seed == null ? (Math.random() * 0xffffffff) >>> 0 : props.seed >>> 0, [props.visible, props.seed]);
  const lastMeta = useRef<Record<string, unknown> | null>(null);
  const { onRunProof } = props;
  const rematch = useCallback(() => {
    if (lastMeta.current && onRunProof) onRunProof(lastMeta.current);
    lastMeta.current = null;
    setRun((n) => n + 1);
  }, [onRunProof]);
  return <CurrentQuestRun key={run} {...props} seed={replaySeed(base, run)} onRematch={rematch}
    onResult={(meta) => { lastMeta.current = meta; }} />;
}

/** One run: three short route puzzles. Completing them records play only; queue rewards stay server-owned. */
function CurrentQuestRun({ visible, seed, taskName, tier = 'standard', onClose, onQuit,
  onComplete, onRematch, onResult }: CurrentQuestGameProps & { onRematch: () => void; onResult: (meta: Record<string, unknown>) => void }) {
  const reduced = useReducedGameMotion();
  const voyages = CURRENT_TIERS[tier]?.voyages ?? 3;
  const roundSeed = useMemo(() => seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0,
    [visible, seed]);
  const boards = useMemo(() => Array.from({ length: voyages }, (_, stage) => makeCurrentBoard(roundSeed, stage, tier)),
    [roundSeed, voyages, tier]);
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState<CurrentProgress>(() => beginCurrentBoard(boards[0]));
  const [score, setScore] = useState(0);
  const [stageClear, setStageClear] = useState(false);
  const [hint, setHint] = useState('Collect every pearl, then reach the treasure.');
  const [result, setResult] = useState<GameResult | null>(null);
  // The line ended the run (ride's up): the shell shows its card, the board steps back.
  const [wrapped, setWrapped] = useState(false);
  const resting = !!result || wrapped;
  const progressRef = useRef(progress);
  const completedRef = useRef<CurrentProgress[]>([]);
  const playingRef = useRef(false);
  const lockedRef = useRef(false);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const board = boards[stage];

  useEffect(() => {
    if (!visible) return;
    const first = beginCurrentBoard(boards[0]);
    setStage(0);
    setProgress(first);
    progressRef.current = first;
    setScore(0);
    setStageClear(false);
    setHint('Collect every pearl, then reach the treasure.');
    setResult(null);
    setWrapped(false);
    completedRef.current = [];
    playingRef.current = false;
    lockedRef.current = false;
    startedAtRef.current = 0;
    pausedAtRef.current = 0;
    pausedTotalRef.current = 0;
  }, [visible, boards]);

  const handleStart = useCallback(() => {
    startedAtRef.current = Date.now();
    playingRef.current = true;
  }, []);
  const handlePause = useCallback(() => {
    playingRef.current = false;
    pausedAtRef.current = Date.now();
  }, []);
  const handleResume = useCallback(() => {
    if (pausedAtRef.current) pausedTotalRef.current += Date.now() - pausedAtRef.current;
    pausedAtRef.current = 0;
    playingRef.current = true;
  }, []);

  const handleCell = useCallback((target: number) => {
    if (!playingRef.current || lockedRef.current || result) return;
    const outcome = moveCurrent(board, progressRef.current, target);
    if (outcome.result === 'invalid') return;
    if (outcome.result === 'blocked' || outcome.result === 'goal-locked') {
      Haptic.warning();
      playSfx('fail', 0.22);
      setHint(outcome.result === 'blocked' ? 'A rock blocks that current. Pick another path.'
        : `Find ${board.pearls.length - progressRef.current.collected.length} more pearl${board.pearls.length - progressRef.current.collected.length === 1 ? '' : 's'} first.`);
      return;
    }
    progressRef.current = outcome.progress;
    setProgress(outcome.progress);
    if (outcome.result === 'pearl') {
      Haptic.hitMedium();
      playSfx('coin', 0.48);
      setHint('Pearl found! Follow your trail to the treasure.');
    } else if (outcome.result === 'backtrack') {
      Haptic.tickSelection();
      setHint('Backtracked. Find another way through.');
    } else {
      Haptic.tapLight();
      playSfx('tap', 0.32);
    }
    if (outcome.result !== 'complete') return;
    lockedRef.current = true;
    completedRef.current = [...completedRef.current, outcome.progress];
    const roundScore = scoreCurrentBoard(board, outcome.progress);
    const nextScore = score + roundScore;
    setScore(nextScore);
    Haptic.success();
    playSfx('star', 0.65);
    if (stage < voyages - 1) {
      setStageClear(true);
      // T032: the chest pops over the board (a picture), so the line under it stays short.
      setHint('Treasure! On to the next voyage.');
      return;
    }
    const durationSeconds = Math.max(1, Math.round(
      (Date.now() - startedAtRef.current - pausedTotalRef.current) / 1000));
    const meta = { score: nextScore, duration: durationSeconds,
      seed: roundSeed, tier, moves: completedRef.current.map(item => item.moves),
      paths: completedRef.current.map(item => item.history) };
    onResult(meta);
    setResult({ score: nextScore, stars: currentStars(boards, completedRef.current), message: 'TREASURE FOUND!', meta });
  }, [board, boards, result, roundSeed, score, stage, voyages, tier, onResult]);

  const nextStage = useCallback(() => {
    if (!playingRef.current || !stageClear || stage >= 2) return;
    const next = stage + 1;
    const initial = beginCurrentBoard(boards[next]);
    progressRef.current = initial;
    lockedRef.current = false;
    setProgress(initial);
    setStage(next);
    setStageClear(false);
    setHint('Collect every pearl, then reach the treasure.');
    Haptic.tickSelection();
    playSfx('whoosh', 0.5);
  }, [boards, stage, stageClear]);

  const cellSize = (BOARD_WIDTH - 24 - GAP * (board.size - 1)) / board.size;
  const current = progress.path.at(-1) ?? board.start;
  const remaining = board.pearls.length - progress.collected.length;

  return <GameShellV2 visible={visible} title="Current Quest" subtitle={taskName}
    score={score + (stageClear || result ? 0 : progress.collected.length * 35)}
    objective="Tap the tile next to your shark to swim there. Collect pearls, then reach the treasure."
    countdownDemo={<TapPathDemo reduced={reduced} />}
    result={result} onStart={handleStart} onPause={handlePause} onResume={handleResume}
    onClose={onClose} onQuit={onQuit} onComplete={onComplete} onRematch={onRematch}
    onWrapUp={() => { setWrapped(true); return null; }}>
    <View style={styles.field}>
      <LinearGradient colors={['#07548f', '#0c8bc9', '#9cdef4']} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.bubbleOne} />
      <View pointerEvents="none" style={styles.bubbleTwo} />
      {/* Once the results card is up the board steps back (no tiles or hint
          text around the card), so the card reads on a calm backdrop. */}
      <View style={[styles.play, resting ? styles.playResting : null]} pointerEvents={resting ? 'none' : 'auto'}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>THE SHARK ARCADE · CURRENT QUEST</Text>
          <Text style={styles.heroTitle}>Follow the Current</Text>
          <Text style={styles.heroBody}>Three little voyages. One treasure.</Text>
        </View>
        <Image source={SHARK} resizeMode="contain" style={styles.heroShark}
          accessibilityLabel="Theme Park Shark mascot" />
      </View>
      <View style={styles.stageRail} accessibilityLabel={`Voyage ${stage + 1} of ${voyages}`}>
        {boards.map((_, index) => <View key={index}
          style={[styles.stageBadge, index <= stage && styles.stageBadgeActive]}>
          <Text style={[styles.stageText, index <= stage && styles.stageTextActive]}>{index + 1}</Text>
        </View>)}
      </View>
      <Text style={styles.counter} accessibilityLiveRegion="polite">
        VOYAGE {stage + 1}/{voyages}  ·  {remaining} PEARL{remaining === 1 ? '' : 'S'} LEFT
      </Text>
      <View style={[styles.board, { width: BOARD_WIDTH }]}>
        {Array.from({ length: board.size * board.size }, (_, index) => {
          const rock = board.rocks.includes(index);
          const pearl = board.pearls.includes(index) && !progress.collected.includes(index);
          const visited = progress.path.includes(index);
          const here = index === current;
          const treasure = index === board.goal;
          const adjacent = Math.abs(Math.floor(index / board.size) - Math.floor(current / board.size)) +
            Math.abs(index % board.size - current % board.size) === 1;
          const label = here ? 'Shark position' : rock ? 'Rock, blocked' : treasure ?
            `${remaining ? 'Treasure, collect pearls first' : 'Treasure, ready'}` : pearl ? 'Pearl' :
            visited ? 'Your trail' : 'Open water';
          return <Pressable key={index} accessibilityRole="button"
            accessibilityLabel={`Row ${Math.floor(index / board.size) + 1}, column ${index % board.size + 1}: ${label}`}
            disabled={stageClear || !!result} onPress={() => handleCell(index)}
            style={({ pressed }) => [styles.cell, { width: cellSize, height: cellSize },
              rock && styles.rockCell, visited && styles.visitedCell,
              adjacent && !rock && !visited && styles.nextCell,
              treasure && styles.goalCell, pressed && styles.pressedCell]}>
            {here && !reduced && progress.path.length > 1 ? <Splash key={`s${progress.path.length}`} size={cellSize * 0.9} /> : null}
            {here ? <Animated.Image key={`h${progress.path.length}`} source={SHARK} resizeMode="contain"
              entering={reduced ? undefined : ZoomIn.springify().damping(11).stiffness(220)}
              style={{ width: cellSize * 0.77, height: cellSize * 0.77 }} />
              : rock ? <QuestIcon slot={1} size={cellSize * 0.78} />
                : pearl ? <QuestIcon slot={0} size={cellSize * 0.62} />
                  : treasure ? <QuestIcon slot={2} size={cellSize * 0.83} />
                    : visited ? <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(10)} style={styles.trailDot} />
                      : <View style={styles.waterDot} />}
          </Pressable>;
        })}
        {stageClear && !result ? <ChestPop reduced={reduced} size={Math.min(150, BOARD_WIDTH * 0.45)} /> : null}
      </View>
      {resting ? null : <Text style={styles.hint} accessibilityLiveRegion="polite">{hint}</Text>}
      {resting ? null : stageClear ? <Pressable accessibilityRole="button" accessibilityLabel="Start next voyage"
        onPress={nextStage} style={styles.nextButton}>
        <Text style={styles.nextButtonText}>NEXT VOYAGE</Text>
      </Pressable> : <Text style={styles.instruction}>Tap a neighboring tile · tap back to change course</Text>}
      </View>
    </View>
  </GameShellV2>;
}

const styles = StyleSheet.create({
  field: { flex: 1, alignItems: 'center', paddingHorizontal: 18, paddingTop: 20, overflow: 'hidden' },
  play: { width: '100%', alignItems: 'center' },
  playResting: { opacity: 0.12 },
  bubbleOne: { position: 'absolute', width: 190, height: 190, borderRadius: 95,
    borderWidth: 7, borderColor: '#ffffff22', top: 115, right: -90 },
  bubbleTwo: { position: 'absolute', width: 110, height: 110, borderRadius: 55,
    borderWidth: 5, borderColor: '#ffffff2b', bottom: 80, left: -48 },
  hero: { width: '100%', height: 106, borderRadius: 18, borderWidth: 3, borderColor: '#fff',
    backgroundColor: '#2469ac', flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    paddingLeft: 14 },
  heroCopy: { flex: 1, zIndex: 1 },
  eyebrow: { color: '#d3f2ff', fontFamily: 'Knockout', fontSize: 11, letterSpacing: 0.3 },
  heroTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 22, lineHeight: 28, marginTop: 5,
    textShadowColor: '#053e69', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  heroBody: { color: '#d3f2ff', fontSize: 12, marginTop: 4 },
  heroShark: { width: 106, height: 104, marginRight: -8, marginBottom: -4 },
  stageRail: { flexDirection: 'row', gap: 15, marginTop: 18, marginBottom: 9 },
  stageBadge: { width: 29, height: 29, borderRadius: 15, borderWidth: 2, borderColor: '#fff',
    backgroundColor: '#82bdd7', alignItems: 'center', justifyContent: 'center' },
  stageBadgeActive: { backgroundColor: '#ffd34f' },
  stageText: { color: '#255c7c', fontFamily: 'Knockout', fontSize: 15 },
  stageTextActive: { color: '#083c72' },
  counter: { color: '#fff', fontFamily: 'Knockout', fontSize: 19, letterSpacing: 0.3,
    marginBottom: 12, textShadowColor: '#07548f', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, padding: 9, borderRadius: 20,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#0b4e85', alignSelf: 'center' },
  cell: { borderRadius: 12, borderWidth: 2, borderColor: '#a9ecff', backgroundColor: '#52b6df',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rockCell: { backgroundColor: '#7099aa', borderColor: '#a8bfca' },
  visitedCell: { backgroundColor: '#ffd34f', borderColor: '#fff1b7' },
  nextCell: { borderColor: '#ffe16e', borderWidth: 3 },
  goalCell: { backgroundColor: '#146ca8', borderColor: '#ffd34f' },
  pressedCell: { opacity: 0.75 },
  trailDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: '#fff8d1' },
  waterDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#9be4f9' },
  hint: { minHeight: 24, color: '#fff', fontSize: 14, textAlign: 'center', marginTop: 17,
    fontWeight: '700', textShadowColor: '#07548f', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  instruction: { color: '#d9f4ff', fontSize: 12, textAlign: 'center', marginTop: 7 },
  nextButton: { marginTop: 3, minHeight: 46, minWidth: 205, borderRadius: 13, borderWidth: 2,
    borderColor: '#fff', backgroundColor: '#ffd34f', alignItems: 'center', justifyContent: 'center' },
  nextButtonText: { color: '#073a70', fontFamily: 'Knockout', fontSize: 18 },
  demoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  demoTiles: { width: 96, height: 50, flexDirection: 'row', gap: 6, alignItems: 'center' },
  demoTile: { width: 44, height: 44, borderRadius: 10, borderWidth: 2, borderColor: '#a9ecff', backgroundColor: '#52b6df' },
  demoShark: { position: 'absolute', left: 3, top: 6 },
  demoSharkArt: { width: 38, height: 38 },
  demoHand: { position: 'absolute', left: 60, top: 14 },
  demoHandArt: { width: 30, height: 36 },
  splash: { position: 'absolute', borderWidth: 3, borderColor: '#ffffff' },
  chestLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  chestShine: { position: 'absolute', backgroundColor: '#fff1b7' },
});
