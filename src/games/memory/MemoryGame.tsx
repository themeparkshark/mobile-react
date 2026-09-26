/**
 * MemoryGame.tsx — Memory Match+ (Queue Kit rebuild, Component 3 game #5).
 *
 * A self-contained minigame built on GameKit. It renders ONLY its play field;
 * GameShellV2 owns countdown / pause / results / server-reward handoff.
 *
 * Feature set (from the master plan + brief):
 *   - 4x4 board on difficulty 1-2, 4x5 on difficulty 3.
 *   - Reanimated 3D card flips (see MemoryCard: perspective + rotateY +
 *     backfaceVisibility, mid-flip lift that springs to settle).
 *   - Themed decks (ocean / theme-park) from the asset pipeline; deck chosen
 *     per round from the seed.
 *   - Match: paired Skia glow burst + hitMedium haptic.
 *   - Mismatch: brief shake + staggered flip-back.
 *   - COMBO TIMER: consecutive matches within 4s build a multiplier (GameKit
 *     Combo.ts with a 4000ms window); fever at a 4-chain lights the board edge
 *     (Skia FeverGlow).
 *   - Score = combo-weighted match points + end-of-round time bonus.
 *   - Reports { score, maxCombo, seed } to the shell (server-authoritative
 *     rewards — never synthesized here).
 *   - Personal best in AsyncStorage, keyed by difficulty.
 *
 * Zero network. All animation on the UI thread (Reanimated) + Skia for
 * particles/glow.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, Image, StyleSheet, Dimensions, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GameShellV2,
  ParticleField,
  useCombo,
  GAME_COLORS,
  Haptic,
  playSfx,
  type GameResult,
  type ParticleHandle,
  type ComboConfig,
} from '../../gamekit';
import { MemoryCard, type MemoryCardHandle } from './MemoryCard';
import { FeverGlow } from './FeverGlow';
import { deckById, deckIdForRideName, type Deck } from './decks';
import {
  buildBoard,
  boardShapeFor,
  scoreConfigFor,
  matchPoints,
  timeBonus,
  starsFor,
  type Board,
} from './logic';
import { loadPersonalBest, savePersonalBest } from './storage';

const { width: SCREEN_W } = Dimensions.get('window');

/** 4s combo window + fever that lasts a few seconds once a chain hits. */
const COMBO_CONFIG: ComboConfig = { windowMs: 4000, feverMs: 4000 };
/** Fever lights the board at a 4-chain (brief spec: "fever at 4-chain"). */
const FEVER_CHAIN = 4;

export interface MemoryGameProps {
  visible: boolean;
  /** 0 = four-pair ride sprint; 1-3 are longer queue boards. */
  difficulty?: number;
  /** Optional deterministic seed (session/replay). Random when omitted. */
  seed?: number;
  /** Pin a themed deck for a ride chapter. */
  deckId?: string;
  /** Shell subtitle (e.g. the task/ride name). */
  taskName?: string;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
  /** Preserved external contract: onComplete(multiplier, meta). */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
}

interface FlipState {
  first: number | null;
  locked: boolean;
}

export default function MemoryGame({
  visible,
  difficulty = 1,
  seed,
  deckId,
  taskName,
  onClose,
  onQuit,
  onComplete,
}: MemoryGameProps) {
  // -- Round setup (rebuilt whenever the game (re)opens). --------------------
  const roundSeed = useMemo(
    () => (seed != null ? seed >>> 0 : (Math.random() * 0xffffffff) >>> 0),
    // New seed each time the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, seed],
  );
  const deck: Deck = useMemo(() =>
    deckById(deckId ?? deckIdForRideName(taskName)) ?? deckById('park')!,
  [deckId, taskName]);
  const displayRideName = taskName?.toLowerCase().includes('pirates of the caribbean')
    ? 'Pirates'
    : taskName;
  const shellSubtitle = difficulty === 0
    ? displayRideName && displayRideName.length > 18
      ? displayRideName
      : `${displayRideName ?? 'Ride sprint'} · 4 quick pairs`
    : displayRideName;
  const board: Board = useMemo(
    () => buildBoard(difficulty, deck, roundSeed),
    [difficulty, deck, roundSeed],
  );
  const scoreCfg = useMemo(() => scoreConfigFor(difficulty), [difficulty]);
  const shape = useMemo(() => boardShapeFor(difficulty), [difficulty]);

  // -- Live UI state. --------------------------------------------------------
  const [score, setScore] = useState(0);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [personalBest, setPersonalBest] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [feverOn, setFeverOn] = useState(false);
  const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });

  // -- Non-render refs. ------------------------------------------------------
  const cardRefs = useRef<Array<MemoryCardHandle | null>>([]);
  const matchedRef = useRef<Set<number>>(new Set());
  const flipRef = useRef<FlipState>({ first: null, locked: false });
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const pausedTotalRef = useRef(0);
  const playingRef = useRef(false);
  const endedRef = useRef(false);
  const scoreRef = useRef(0);
  const timeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const particleRef = useRef<ParticleHandle>(null);
  const boardOriginRef = useRef({ x: 0, y: 0 });
  // Timestamp of the last match — drives combo-window coldness for fever decay.
  const lastMatchAtRef = useRef(0);
  // Mirror of feverOn readable inside the poll interval without re-subscribing.
  const feverOnRef = useRef(false);

  const combo = useCombo(COMBO_CONFIG);

  // -- Reset when (re)opened. ------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    matchedRef.current = new Set();
    flipRef.current = { first: null, locked: false };
    endedRef.current = false;
    pausedAtRef.current = null;
    pausedTotalRef.current = 0;
    playingRef.current = false;
    scoreRef.current = 0;
    lastMatchAtRef.current = 0;
    feverOnRef.current = false;
    setScore(0);
    setMatchedPairs(0);
    setResult(null);
    setFeverOn(false);
    combo.reset();
    void loadPersonalBest(difficulty).then(setPersonalBest);
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, roundSeed, difficulty]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeoutsRef.current.push(t);
  }, []);

  // -- Card geometry. --------------------------------------------------------
  const cardSize = useMemo(() => {
    // Fit `cols` cards across ~92% of screen width, minus per-card margin.
    const usable = SCREEN_W * 0.94 - 24;
    return Math.floor(usable / shape.cols) - 10;
  }, [shape.cols]);

  // -- Start (countdown finished). -------------------------------------------
  const handleStart = useCallback(() => {
    startedAtRef.current = Date.now();
    playingRef.current = true;
    // Flip every card face-down cleanly at start (in case of a re-open).
    cardRefs.current.forEach((c) => c?.setFaceUp(false));
  }, []);

  const handlePause = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    pausedAtRef.current = Date.now();
  }, []);

  const handleResume = useCallback(() => {
    if (pausedAtRef.current != null) {
      pausedTotalRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    playingRef.current = true;
  }, []);

  // -- End the round. --------------------------------------------------------
  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;

    const now = Date.now();
    const activePause = pausedAtRef.current == null ? 0 : now - pausedAtRef.current;
    const elapsed = (now - startedAtRef.current - pausedTotalRef.current - activePause) / 1000;
    const bonus = timeBonus(scoreCfg, elapsed);
    const finalScore = scoreRef.current + bonus;
    scoreRef.current = finalScore;
    setScore(finalScore);

    const maxCombo = combo.maxStreak;
    const stars = starsFor(scoreCfg, elapsed, maxCombo);

    void savePersonalBest(difficulty, finalScore).then(({ best }) => setPersonalBest(best));

    setResult({
      score: finalScore,
      stars,
      maxCombo,
      message: stars === 3 ? 'INCREDIBLE!' : stars === 2 ? 'GREAT!' : 'CLEARED!',
      // Server-authoritative reward inputs. Never compute rewards client-side.
      meta: {
        score: finalScore,
        duration: Math.round(elapsed * 1000),
        seed: roundSeed,
        maxCombo,
        difficulty,
        deck: deck.id,
        game: 'memory-match-plus',
      },
    });
  }, [scoreCfg, combo.maxStreak, difficulty, roundSeed, deck.id]);

  // -- Tap handling: the match flow. -----------------------------------------
  const onCardPress = useCallback(
    (slot: number) => {
      if (endedRef.current || !playingRef.current) return;
      const state = flipRef.current;
      if (state.locked) return;
      if (matchedRef.current.has(slot)) return;
      if (state.first === slot) return;

      Haptic.tapLight();
      playSfx('tap');
      cardRefs.current[slot]?.setFaceUp(true);

      if (state.first == null) {
        state.first = slot;
        return;
      }

      // Second card of the pair.
      const a = state.first;
      const b = slot;
      state.locked = true;

      const symA = board.cards[a].symbolIndex;
      const symB = board.cards[b].symbolIndex;

      if (symA === symB) {
        // ---- MATCH ----------------------------------------------------------
        matchedRef.current.add(a);
        matchedRef.current.add(b);
        setMatchedPairs(matchedRef.current.size / 2);

        const cs = combo.hit();
        const chain = cs.streak;
        lastMatchAtRef.current = Date.now();
        const pts = matchPoints(scoreCfg, cs.multiplier);
        scoreRef.current += pts;
        setScore(scoreRef.current);

        Haptic.hitMedium();
        playSfx(chain >= FEVER_CHAIN ? 'combo' : 'coin');

        // Paired glow + burst particles centered on each matched card.
        const origin = boardOriginRef.current;
        [a, b].forEach((idx) => {
          cardRefs.current[idx]?.celebrate();
          const c = centerOfSlot(idx, shape.cols, cardSize, origin);
          particleRef.current?.burst({
            x: c.x,
            y: c.y,
            preset: 'burst',
            count: 14,
            colors: [GAME_COLORS.gold, GAME_COLORS.blue, deck.symbols[symA]?.tint ?? GAME_COLORS.coral],
          });
        });

        // Fever board glow once the chain reaches the fever threshold.
        if (chain >= FEVER_CHAIN && !feverOnRef.current) {
          feverOnRef.current = true;
          setFeverOn(true);
          Haptic.comboHeavy();
        }

        state.first = null;
        state.locked = false;

        // Win check.
        if (matchedRef.current.size === board.cards.length) {
          schedule(finish, 320);
        }
      } else {
        // ---- MISMATCH -------------------------------------------------------
        combo.miss();
        if (feverOnRef.current) {
          feverOnRef.current = false;
          setFeverOn(false);
        }
        Haptic.warning();
        playSfx('fail');

        // Brief shake, then staggered flip-back.
        schedule(() => {
          cardRefs.current[a]?.shake();
          cardRefs.current[b]?.shake();
        }, 220);
        schedule(() => {
          cardRefs.current[a]?.setFaceUp(false);
        }, 480);
        schedule(() => {
          cardRefs.current[b]?.setFaceUp(false);
          flipRef.current.first = null;
          flipRef.current.locked = false;
        }, 560);
      }
    },
    [board.cards, combo, scoreCfg, shape.cols, cardSize, deck.symbols, finish, schedule],
  );

  // Poll the combo state machine so a lapsed 4s window decays the streak even
  // without new taps. When the combo window goes cold, drop the board fever
  // glow. Coldness is computed from a ref timestamp (not the hook's render
  // cadence) so it's robust to closure staleness.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      if (!playingRef.current) return;
      combo.poll();
      const cold = Date.now() - lastMatchAtRef.current > COMBO_CONFIG.windowMs;
      if (cold && feverOnRef.current) {
        feverOnRef.current = false;
        setFeverOn(false);
      }
    }, 250);
    return () => clearInterval(id);
  }, [visible, combo]);

  const onBoardLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height, x, y } = e.nativeEvent.layout;
    setBoardSize({ w: width, h: height });
    boardOriginRef.current = { x, y };
  }, []);

  const objective = `Match all ${shape.pairs} pairs`;

  return (
    <GameShellV2
      visible={visible}
      title="Memory Match+"
      subtitle={shellSubtitle}
      score={score}
      multiplier={combo.multiplier}
      // Header fever styling tracks the SAME 4-chain threshold that lights the
      // board edge, so the two read as one state (gamekit's own combo.fever
      // fires at a 10-streak, which is too high for this shorter game).
      fever={feverOn}
      personalBest={personalBest}
      objective={objective}
      goal={difficulty === 0 ? { current: matchedPairs, target: board.cards.length / 2, label: 'PAIRS' } : undefined}
      result={result}
      onStart={handleStart}
      onPause={handlePause}
      onResume={handleResume}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <View style={styles.field}>
        <LinearGradient colors={['#07548f', '#0b80c4', '#96dcf4']}
          style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={styles.bubbleOne} />
        <View pointerEvents="none" style={styles.bubbleTwo} />
        <View style={styles.banner}>
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerKicker}>THEME PARK SHARK · MEMORY MATCH</Text>
            <Text style={styles.bannerTitle} numberOfLines={1}>{deck.label}</Text>
          </View>
          <Image source={require('../../../assets/images/screens/pin-collections/shark.png')}
            resizeMode="contain" style={styles.bannerShark}
            accessibilityLabel="Theme Park Shark mascot" />
        </View>
        <Text style={styles.progress} accessibilityLiveRegion="polite">
          {matchedPairs} / {shape.pairs} PAIRS MATCHED
        </Text>
        <Text style={styles.hint}>Flip two cards to find a match</Text>
        <View style={styles.boardWrap} onLayout={onBoardLayout}>
          {boardSize.w > 0 ? (
            <FeverGlow width={boardSize.w} height={boardSize.h} active={feverOn} />
          ) : null}
          <View style={styles.grid}>
            {board.cards.map((card) => {
              const sym = deck.symbols[card.symbolIndex];
              return (
                <MemoryCard
                  key={card.slot}
                  ref={(r) => {
                    cardRefs.current[card.slot] = r;
                  }}
                  size={cardSize}
                  faceSource={sym?.source}
                  faceSheet={sym?.extraSheetSlot != null ? deck.extraFaceSheet : deck.faceSheet}
                  sheetSlot={sym?.extraSheetSlot ?? sym?.sheetSlot}
                  sheetColumns={sym?.extraSheetSlot != null ? 2 : 4}
                  sheetRows={sym?.extraSheetSlot != null ? 1 : 2}
                  frameSource={deck.faceFrame}
                  backSource={deck.back}
                  tint={sym?.tint ?? GAME_COLORS.blue}
                  glyph={sym?.glyph ?? '🦈'}
                  slot={card.slot}
                  symbolName={sym?.id.split('-').slice(1).join(' ') ?? 'shark'}
                  matched={matchedRef.current.has(card.slot)}
                  disabled={false}
                  onPress={() => onCardPress(card.slot)}
                  entranceDelay={entranceDelayFor(card.slot, shape.cols)}
                />
              );
            })}
          </View>
        </View>

        {/* Skia particle layer above the board, ignores touches. */}
        {boardSize.w > 0 ? (
          <ParticleField
            ref={particleRef}
            width={SCREEN_W}
            height={boardSize.h + boardOriginRef.current.y + 40}
            style={styles.particles}
            pointerEvents="none"
          />
        ) : null}
      </View>
    </GameShellV2>
  );
}

// -- Geometry helpers ---------------------------------------------------------

const CARD_MARGIN = 5; // must match MemoryCard's pressable margin
const BOARD_WRAP_PADDING = 8; // must match styles.boardWrap padding

function entranceDelayFor(slot: number, cols: number): number {
  const row = Math.floor(slot / cols);
  const col = slot % cols;
  return row * 55 + col * 28;
}

/**
 * Center pixel of a card slot in the ParticleField canvas coordinate space.
 *
 * The ParticleField spans the full screen width and is pinned to the field's
 * top-left. The grid is centered horizontally, so the grid's left edge is
 * (SCREEN_W - gridWidth) / 2. Rows stack from the board's measured top (origin.y)
 * plus the board wrap padding.
 */
function centerOfSlot(
  slot: number,
  cols: number,
  cardSize: number,
  origin: { x: number; y: number },
): { x: number; y: number } {
  const cellW = cardSize + CARD_MARGIN * 2;
  const cellH = cardSize * 1.28 + CARD_MARGIN * 2;
  const row = Math.floor(slot / cols);
  const col = slot % cols;
  const gridW = cellW * cols;
  const gridLeft = (SCREEN_W - gridW) / 2;
  const x = gridLeft + col * cellW + cellW / 2;
  const y = origin.y + BOARD_WRAP_PADDING + row * cellH + cellH / 2;
  return { x, y };
}

const styles = StyleSheet.create({
  field: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bubbleOne: { position: 'absolute', width: 210, height: 210, borderRadius: 105,
    borderColor: 'rgba(255,255,255,0.18)', borderWidth: 9, top: '6%', right: -105 },
  bubbleTwo: { position: 'absolute', width: 125, height: 125, borderRadius: 63,
    borderColor: 'rgba(255,255,255,0.17)', borderWidth: 7, bottom: '8%', left: -70 },
  banner: { width: '90%', maxWidth: 390, minHeight: 74, borderRadius: 16,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#1265ae',
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    marginBottom: 20, paddingLeft: 14,
    shadowColor: '#064375', shadowOpacity: 0.35, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 } },
  bannerCopy: { flex: 1 },
  bannerKicker: { color: '#bcecff', fontFamily: 'Knockout', fontSize: 12,
    letterSpacing: 0.7 },
  bannerTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 22,
    marginTop: 3, textShadowColor: '#064375',
    textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 1 },
  bannerShark: { width: 87, height: 87, marginRight: -10 },
  progress: { color: '#fff', fontFamily: 'Shark', fontSize: 19, letterSpacing: 0.6,
    marginBottom: 4, textAlign: 'center' },
  hint: { color: '#e6f8ff', fontFamily: 'Knockout', fontSize: 15, marginBottom: 16,
    textAlign: 'center' },
  boardWrap: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  particles: { position: 'absolute', top: 0, left: 0 },
});
