import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GameShellV2, Haptic, playSfx, type GameResult } from '../../../gamekit';
import {
  beginCurrentBoard, CURRENT_TIERS, currentStars, makeCurrentBoard, moveCurrent, scoreCurrentBoard,
  type CurrentProgress, type CurrentTier,
} from './logic';

const BOARD_WIDTH = Math.min(Dimensions.get('window').width - 42, 350);
const GAP = 6;
const SHARK = require('../../../../assets/images/screens/pin-collections/shark.png');
const QUEST_ICONS = require('../../../assets/games/current-quest/icons-v1.png');

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
}

/** Three short route puzzles. Completing them records play only; queue rewards stay server-owned. */
export default function CurrentQuestGame({ visible, seed, taskName, tier = 'standard', onClose, onQuit,
  onComplete }: CurrentQuestGameProps) {
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
      setHint(`Current ${stage + 1} cleared. A new route is ready.`);
      return;
    }
    const durationSeconds = Math.max(1, Math.round(
      (Date.now() - startedAtRef.current - pausedTotalRef.current) / 1000));
    setResult({ score: nextScore, stars: currentStars(boards, completedRef.current),
      message: 'Treasure found!', meta: { score: nextScore, duration: durationSeconds,
        seed: roundSeed, tier, moves: completedRef.current.map(item => item.moves),
        paths: completedRef.current.map(item => item.history) } });
  }, [board, boards, result, roundSeed, score, stage, voyages, tier]);

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
    objective="Collect pearls and reach the treasure"
    result={result} onStart={handleStart} onPause={handlePause} onResume={handleResume}
    onClose={onClose} onQuit={onQuit} onComplete={onComplete}>
    <View style={styles.field}>
      <LinearGradient colors={['#07548f', '#0c8bc9', '#9cdef4']} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.bubbleOne} />
      <View pointerEvents="none" style={styles.bubbleTwo} />
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>THE SHARK ARCADE · QUEUE QUEST</Text>
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
            {here ? <Image source={SHARK} resizeMode="contain"
              style={{ width: cellSize * 0.77, height: cellSize * 0.77 }} />
              : rock ? <QuestIcon slot={1} size={cellSize * 0.78} />
                : pearl ? <QuestIcon slot={0} size={cellSize * 0.62} />
                  : treasure ? <QuestIcon slot={2} size={cellSize * 0.83} />
                    : visited ? <View style={styles.trailDot} />
                      : <View style={styles.waterDot} />}
          </Pressable>;
        })}
      </View>
      <Text style={styles.hint} accessibilityLiveRegion="polite">{hint}</Text>
      {stageClear ? <Pressable accessibilityRole="button" accessibilityLabel="Start next voyage"
        onPress={nextStage} style={styles.nextButton}>
        <Text style={styles.nextButtonText}>NEXT VOYAGE  →</Text>
      </Pressable> : <Text style={styles.instruction}>Tap a neighboring tile · tap back to change course</Text>}
    </View>
  </GameShellV2>;
}

const styles = StyleSheet.create({
  field: { flex: 1, alignItems: 'center', paddingHorizontal: 18, paddingTop: 20, overflow: 'hidden' },
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
});
