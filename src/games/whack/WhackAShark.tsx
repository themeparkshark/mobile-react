/**
 * WhackAShark.tsx — native Skia rebuild of the legacy TapChallenge minigame.
 *
 * Self-contained per the Component 3 contract: exports the game component,
 * consumes GameShellV2, takes a difficulty (1-3), runs a 60s round, keeps a
 * personal best in AsyncStorage, and reports {score, maxCombo, seed} through
 * the shell's onComplete multiplier contract. One-thumb, portrait, offline.
 *
 * Feel (quality bar #3 — juice is not optional):
 *   - Pop = anticipation squash (wind-up dip to 0.72) then overshoot (1.12)
 *     then settle, all on the UI thread via Reanimated springs.
 *   - Whack a shark → hitMedium haptic + burst particles + score pop.
 *   - Tap a decoy anglerfish → penalty + failBuzz + screen shake.
 *   - Golden shark → x5 + triggers Combo fever: spawn rate doubles + a gold
 *     tint overlay washes the field.
 *   - Grid lives in the bottom 60% of the screen so it's one-thumb reachable.
 *
 * External contract (matches MiniGameSelector, unchanged from legacy):
 *   onComplete(multiplier, meta) — shell derives multiplier from stars; meta
 *   carries { score, duration, seed, maxCombo } to the server. Never compute
 *   rewards on the client.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  Canvas,
  Image as SkiaImage,
  Group,
  Rect,
  useImage,
  type SkImage,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GameShellV2,
  ParticleField,
  useCombo,
  useShake,
  useFlash,
  haptic,
  playSfx,
  GAME_COLORS,
  JUICE,
  type GameShellV2Handle,
  type GameResult,
  type ParticleHandle,
} from '../../gamekit';
import {
  GRID_COLS,
  GRID_ROWS,
  ROUND_SECONDS,
  RIDE_ROUND_SECONDS,
  SCORING,
  STAR_THRESHOLDS,
  RIDE_STAR_THRESHOLDS,
  RIDE_PB_KEY,
  POP,
  DECOY_SHAKE_MS,
  PB_KEY,
  type Difficulty,
} from './constants';
import { useWhackEngine, type Occupant, type WhackOutcome } from './useWhackEngine';
import {
  HOLE_IMAGE,
  SHARK_POP_FRAMES,
  DECOY_IMAGE,
  GOLDEN_IMAGE,
} from './assets';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export interface WhackASharkProps {
  visible: boolean;
  /** 1-3, chosen by session context. Controls pace, up-time and decoy rate. */
  difficulty?: Difficulty;
  /** Optional deterministic seed (else time-based). Enables replay. */
  seed?: number;
  /** Short paid ride challenge; the default full round remains for LinePlay. */
  format?: 'ride' | 'queue';
  /** GameShellV2 external contract — matches MiniGameSelector. */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

function scoreToStars(score: number, format: 'ride' | 'queue'): number {
  const thresholds = format === 'ride' ? RIDE_STAR_THRESHOLDS : STAR_THRESHOLDS;
  if (score >= thresholds.three) return 3;
  if (score >= thresholds.two) return 2;
  if (score >= thresholds.one) return 1;
  return 0;
}

export function WhackAShark({
  visible,
  difficulty = 1,
  seed,
  format = 'queue',
  onComplete,
  onClose,
  onQuit,
}: WhackASharkProps) {
  const shellRef = useRef<GameShellV2Handle>(null);
  const particlesRef = useRef<ParticleHandle>(null);

  // Playfield size (measured; defaults to screen so the canvas is never 0).
  const [field, setField] = useState({ w: SCREEN_W, h: SCREEN_H - 140 });

  // Score / combo (JS thread).
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(format === 'ride' ? RIDE_ROUND_SECONDS : ROUND_SECONDS);
  const scoreRef = useRef(0);
  const combo = useCombo();
  const [best, setBest] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const roundSeconds = format === 'ride' ? RIDE_ROUND_SECONDS : ROUND_SECONDS;
  const personalBestKey = format === 'ride' ? RIDE_PB_KEY : PB_KEY;
  const runSeed = useRef<number>(seed ?? Date.now() >>> 0);
  const startedAt = useRef(0);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endDueAt = useRef(0);
  const remainingMs = useRef(roundSeconds * 1000);
  const pausedAt = useRef<number | null>(null);
  const pausedTotalMs = useRef(0);
  const finished = useRef(false);

  // Screen shake (decoy) + gold fever flash overlay.
  const shakeCtl = useShake();
  const flashCtl = useFlash();

  // Load personal best once.
  useEffect(() => {
    let alive = true;
    setBest(0);
    AsyncStorage.getItem(personalBestKey)
      .then((v) => {
        if (alive && v != null) setBest(parseInt(v, 10) || 0);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [personalBestKey]);

  // --- Grid geometry (bottom 60% of the field, one-thumb reachable). -------
  const layout = useMemo(() => computeGrid(field.w, field.h), [field.w, field.h]);

  // --- Engine callbacks (JS thread). ---------------------------------------
  const applyScore = useCallback((delta: number) => {
    scoreRef.current = Math.max(SCORING.floor, scoreRef.current + delta);
    setScore(scoreRef.current);
  }, []);

  const onWhackTarget = useCallback(
    (index: number, outcome: WhackOutcome) => {
      const cell = layout.cells[index];
      if (outcome.kind === 'decoy') {
        // Penalty: break combo, buzz, shake, red flash.
        combo.miss();
        applyScore(outcome.baseDelta); // negative
        haptic('failBuzz');
        shakeCtl.shake(10, DECOY_SHAKE_MS);
        flashCtl.flash(0.5, 160);
        playSfx('fail');
        particlesRef.current?.burst({
          x: cell.cx,
          y: cell.cy,
          preset: 'burst',
          colors: [GAME_COLORS.danger, GAME_COLORS.coral],
          count: 12,
          speed: 0.8,
        });
        return;
      }

      // Shark / golden: advance combo first so this hit scores at the new mult.
      const next = combo.hit();
      const gained = Math.round(outcome.baseDelta * outcome.selfMultiplier * next.multiplier);
      applyScore(gained);

      if (outcome.kind === 'golden') {
        // Fever is triggered by the combo machine at FEVER_STREAK; the golden
        // gives an immediate gold wash + coin shower + heavy haptic regardless.
        haptic('comboHeavy');
        flashCtl.flash(0.35, 220);
        playSfx('coin');
        particlesRef.current?.burst({
          x: cell.cx,
          y: cell.cy,
          preset: 'coins',
          colors: [GAME_COLORS.gold, '#fff2b0'],
          count: 18,
        });
        particlesRef.current?.burst({
          x: cell.cx,
          y: cell.cy,
          preset: 'burst',
          colors: [GAME_COLORS.gold],
          count: 14,
        });
      } else {
        haptic(next.multiplier >= 3 ? 'comboHeavy' : 'hitMedium');
        playSfx('hit');
        particlesRef.current?.burst({
          x: cell.cx,
          y: cell.cy,
          preset: 'burst',
          colors: [GAME_COLORS.blue, GAME_COLORS.gold, '#fff'],
          count: 14,
        });
      }
    },
    [layout.cells, combo, applyScore, shakeCtl, flashCtl],
  );

  const onMissTarget = useCallback(() => {
    // A shark that ducked away unwhacked breaks the streak (whiff).
    combo.miss();
  }, [combo]);

  const engine = useWhackEngine({
    difficulty,
    roundSeconds,
    fever: combo.fever,
    onWhack: onWhackTarget,
    onMiss: onMissTarget,
  });

  // Poll the combo machine so fever expires and stale streaks decay.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      if (shellRef.current?.getPhase() === 'playing') combo.poll();
    }, 250);
    return () => clearInterval(id);
  }, [visible, combo]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      if (shellRef.current?.getPhase() === 'playing' && !finished.current) {
        setSecondsLeft(Math.ceil(Math.max(0, endDueAt.current - Date.now()) / 1000));
      }
    }, 200);
    return () => clearInterval(id);
  }, [visible]);

  // --- Finish ---------------------------------------------------------------
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    if (endTimer.current) clearTimeout(endTimer.current);
    endTimer.current = null;
    remainingMs.current = 0;
    setSecondsLeft(0);
    engine.stop();
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > best;
    const stars = scoreToStars(finalScore, format);
    if (isNewBest) {
      setBest(finalScore);
      AsyncStorage.setItem(personalBestKey, String(finalScore)).catch(() => undefined);
    }
    const duration = (Date.now() - startedAt.current - pausedTotalMs.current) / 1000;
    setResult({
      score: finalScore,
      stars,
      maxCombo: combo.maxStreak,
      message: stars === 0 ? 'TIME!' : undefined,
      meta: {
        score: finalScore,
        duration,
        seed: runSeed.current,
        maxCombo: combo.maxStreak,
        difficulty,
        format,
        isNewBest,
      },
    });
  }, [result, best, combo.maxStreak, difficulty, engine, format, personalBestKey]);

  // --- Shell lifecycle ------------------------------------------------------
  const handleStart = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    combo.reset();
    setResult(null);
    runSeed.current = seed ?? Date.now() >>> 0;
    startedAt.current = Date.now();
    finished.current = false;
    pausedAt.current = null;
    pausedTotalMs.current = 0;
    remainingMs.current = roundSeconds * 1000;
    setSecondsLeft(roundSeconds);
    engine.start(runSeed.current);
    if (endTimer.current) clearTimeout(endTimer.current);
    endDueAt.current = Date.now() + remainingMs.current;
    endTimer.current = setTimeout(finish, remainingMs.current);
  }, [combo, engine, seed, finish, roundSeconds]);

  const handlePause = useCallback(() => {
    if (pausedAt.current != null || finished.current) return;
    pausedAt.current = Date.now();
    remainingMs.current = Math.max(0, endDueAt.current - pausedAt.current);
    setSecondsLeft(Math.ceil(remainingMs.current / 1000));
    if (endTimer.current) clearTimeout(endTimer.current);
    endTimer.current = null;
    engine.pause();
  }, [engine]);

  const handleResume = useCallback(() => {
    if (pausedAt.current == null || finished.current) return;
    pausedTotalMs.current += Date.now() - pausedAt.current;
    pausedAt.current = null;
    endDueAt.current = Date.now() + remainingMs.current;
    endTimer.current = setTimeout(finish, remainingMs.current);
    engine.resume();
  }, [engine, finish]);

  useEffect(() => {
    return () => {
      if (endTimer.current) clearTimeout(endTimer.current);
    };
  }, []);

  const handleWhack = useCallback(
    (index: number) => {
      if (shellRef.current?.getPhase() !== 'playing') return;
      engine.whack(index);
    },
    [engine],
  );

  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setField({ w: width, h: height });
  }, []);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flashCtl.opacity.value }));

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Whack-a-Shark"
      subtitle={format === 'ride' ? `Ride sprint · ${secondsLeft}s left` : `Bop sharks · ${secondsLeft}s left`}
      objective="Whack sharks! Avoid the anglerfish. Golden shark = x5 + fever!"
      score={score}
      multiplier={combo.multiplier}
      fever={combo.fever}
      personalBest={best}
      result={result}
      onStart={handleStart}
      onPause={handlePause}
      onResume={handleResume}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <Animated.View style={[styles.fill, shakeCtl.style]} onLayout={onFieldLayout}>
        <Image
          source={require('../../../assets/images/screens/lineplay/whack-underwater-playfield-v1.png')}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
          accessibilityIgnoresInvertColors
        />
        <WhackField
          holes={engine.holes}
          layout={layout}
          width={field.w}
          height={field.h}
          fever={combo.fever}
          onWhack={handleWhack}
        />
        {/* Particles above the canvas, below the HUD. */}
        <ParticleField
          ref={particlesRef}
          width={field.w}
          height={field.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Gold fever wash — a full-field flash on golden / big hits. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.feverWash, flashStyle]}
        />
        {/* Persistent subtle gold tint while fever is active. */}
        {combo.fever ? <View pointerEvents="none" style={styles.feverTint} /> : null}
      </Animated.View>
    </GameShellV2>
  );
}

// =============================================================================
// Grid geometry
// =============================================================================

interface Cell {
  /** Top-left of the hole rect. */
  x: number;
  y: number;
  size: number;
  /** Center of the hole (for particles + sprite anchoring). */
  cx: number;
  cy: number;
}

interface GridLayout {
  cells: Cell[];
  /** Vertical offset where the grid starts (top 40% left as breathing room). */
  top: number;
}

/**
 * Lay the 3x3 grid in the BOTTOM 60% of the field so every hole is inside a
 * thumb's arc (quality bar: one-thumb reachable). Square cells, centered.
 */
function computeGrid(w: number, h: number): GridLayout {
  const top = h * 0.4;
  const gridH = h - top;
  const padX = w * 0.06;
  const gapFrac = 0.14;
  const usableW = w - padX * 2;
  // Solve cell + gap: 3*cell + 2*gap = usableW, gap = cell*gapFrac.
  const cell = usableW / (GRID_COLS + (GRID_COLS - 1) * gapFrac);
  const gap = cell * gapFrac;
  const gridWidth = GRID_COLS * cell + (GRID_COLS - 1) * gap;
  const startX = (w - gridWidth) / 2;
  const rowsH = GRID_ROWS * cell + (GRID_ROWS - 1) * gap;
  const startY = top + Math.max(0, (gridH - rowsH) / 2);

  const cells: Cell[] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const x = startX + c * (cell + gap);
      const y = startY + r * (cell + gap);
      cells.push({ x, y, size: cell, cx: x + cell / 2, cy: y + cell / 2 });
    }
  }
  return { cells, top };
}

// =============================================================================
// Skia field — holes + pop targets
// =============================================================================

interface WhackFieldProps {
  holes: ReadonlyArray<Occupant | null>;
  layout: GridLayout;
  width: number;
  height: number;
  fever: boolean;
  onWhack: (index: number) => void;
}

function WhackField({ holes, layout, width, height, onWhack }: WhackFieldProps) {
  const holeImg = useImage(HOLE_IMAGE);
  const decoyImg = useImage(DECOY_IMAGE);
  const goldenImg = useImage(GOLDEN_IMAGE);
  const pop0 = useImage(SHARK_POP_FRAMES[0]);
  const pop1 = useImage(SHARK_POP_FRAMES[1]);
  const pop2 = useImage(SHARK_POP_FRAMES[2]);
  const sharkFrames = useMemo(() => [pop0, pop1, pop2], [pop0, pop1, pop2]);

  return (
    <>
      <Canvas style={{ width, height }} pointerEvents="none">
        {layout.cells.map((cell, i) => (
          <HoleCell
            key={`hole-${i}`}
            cell={cell}
            holeImg={holeImg}
            occupant={holes[i]}
            sharkFrames={sharkFrames}
            decoyImg={decoyImg}
            goldenImg={goldenImg}
          />
        ))}
      </Canvas>
      {/* Transparent touch targets over each hole (Skia canvas is non-interactive). */}
      {layout.cells.map((cell, i) => (
        <Pressable
          key={`tap-${i}`}
          onPress={() => onWhack(i)}
          hitSlop={6}
          style={[
            styles.tapTarget,
            { left: cell.x, top: cell.y, width: cell.size, height: cell.size },
          ]}
        />
      ))}
    </>
  );
}

// --- One hole + whatever is popping out of it -------------------------------

interface HoleCellProps {
  cell: Cell;
  holeImg: SkImage | null;
  occupant: Occupant | null;
  sharkFrames: Array<SkImage | null>;
  decoyImg: SkImage | null;
  goldenImg: SkImage | null;
}

function HoleCell({
  cell,
  holeImg,
  occupant,
  sharkFrames,
  decoyImg,
  goldenImg,
}: HoleCellProps) {
  // Rise 0..1 (below hole → fully up) and squash/stretch scale, both on UI thread.
  const rise = useSharedValue<number>(0);
  const scale = useSharedValue<number>(POP.windupScale);
  // Track the occupant id so re-spawns in the same hole re-trigger the pop.
  const activeId = occupant && !occupant.hit ? occupant.id : occupant?.id ?? 0;
  const hit = !!occupant?.hit;

  useEffect(() => {
    if (occupant && !occupant.hit) {
      // Pop up: rise out of the hole while the scale does a single squash-and-
      // stretch — wind-up DIP (0.72) → snappy OVERSHOOT (1.12) → spring settle.
      // One sequence: the earlier draft double-assigned scale.value and ate the
      // wind-up; this is the intended anticipation curve.
      rise.value = withTiming(1, { duration: POP.riseMs, easing: Easing.out(Easing.cubic) });
      scale.value = withSequence(
        withTiming(POP.windupScale, { duration: 70, easing: Easing.out(Easing.quad) }),
        withTiming(POP.overshootScale, { duration: 120, easing: Easing.out(Easing.back(2)) }),
        withSpring(1, JUICE.popSpring),
      );
    } else if (occupant && occupant.hit) {
      // Whacked: quick squash punch, stays up briefly for the dazed frame.
      scale.value = withSequence(
        withTiming(POP.overshootScale, { duration: 60 }),
        withTiming(0.88, { duration: 120 }),
      );
    } else {
      // Empty: duck back down.
      rise.value = withTiming(0, { duration: POP.duckMs, easing: Easing.in(Easing.quad) });
      scale.value = withTiming(POP.windupScale, { duration: POP.duckMs });
    }
    // activeId in deps so a new occupant in the same hole restarts the pop.
  }, [activeId, hit, occupant, rise, scale]);

  const kind = occupant?.kind ?? 'shark';
  const img =
    kind === 'decoy'
      ? decoyImg
      : kind === 'golden'
        ? goldenImg
        : hit
          ? sharkFrames[2] // dazed frame when whacked
          : sharkFrames[1]; // popped frame while up

  // Sprite sits centered on the hole; rises up out of it and clips at the rim.
  const spriteSize = cell.size * 0.92;
  const riseTravel = cell.size * 0.62; // how far it climbs out of the hole

  const spriteTransform = useDerivedValue(() => {
    const up = riseTravel * rise.value;
    const s = scale.value;
    const drawW = spriteSize * s;
    const drawH = spriteSize * s;
    return {
      x: cell.cx - drawW / 2,
      // Anchor near the hole mouth; climb upward as rise increases.
      y: cell.cy - drawH * 0.62 - up,
      w: drawW,
      h: drawH,
    };
  }, [cell.cx, cell.cy, spriteSize, riseTravel]);

  const spriteX = useDerivedValue(() => spriteTransform.value.x, [spriteTransform]);
  const spriteY = useDerivedValue(() => spriteTransform.value.y, [spriteTransform]);
  const spriteW = useDerivedValue(() => spriteTransform.value.w, [spriteTransform]);
  const spriteH = useDerivedValue(() => spriteTransform.value.h, [spriteTransform]);

  // Clip rect so the emerging sprite is masked below the hole's front lip.
  // Hoisted to the top level (never call hooks conditionally inside JSX).
  const clipRect = useDerivedValue(
    () => ({
      x: cell.x - 6,
      y: cell.y - riseTravel - 4,
      width: cell.size + 12,
      height: cell.size + riseTravel + cell.size * 0.5,
    }),
    [cell.x, cell.y, cell.size, riseTravel],
  );

  const showSprite = occupant !== null;

  return (
    <Group>
      {/* The pop target, behind the hole's front rim (so it reads as emerging). */}
      {showSprite && img ? (
        <Group clip={clipRect}>
          <SkiaImage image={img} x={spriteX} y={spriteY} width={spriteW} height={spriteH} fit="contain" />
        </Group>
      ) : null}
      {/* The hole plate, drawn last so its front rim overlaps the sprite base. */}
      {holeImg ? (
        <SkiaImage
          image={holeImg}
          x={cell.x}
          y={cell.y + cell.size * 0.42}
          width={cell.size}
          height={cell.size * 0.62}
          fit="fill"
        />
      ) : (
        // Fallback rim if the image hasn't loaded — never render nothing.
        <Rect
          x={cell.x}
          y={cell.y + cell.size * 0.62}
          width={cell.size}
          height={cell.size * 0.22}
          color={GAME_COLORS.navy}
        />
      )}
    </Group>
  );
}


const styles = StyleSheet.create({
  fill: { flex: 1 },
  tapTarget: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  feverWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GAME_COLORS.gold,
  },
  feverTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(254,201,14,0.10)',
  },
});

export default WhackAShark;
