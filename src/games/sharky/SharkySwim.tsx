/**
 * SharkySwim.tsx — native Skia rebuild of the WebView flappy shark.
 *
 * Renders entirely on the Skia canvas driven by useSharkyEngine's SharedValues
 * (no JS-thread animation). Wrapped in GameShellV2 so it inherits the countdown,
 * pause sheet, results screen, star→multiplier contract and confetti — and
 * reports {score, maxCombo, seed} through onComplete for server-authoritative
 * rewards. One-thumb, portrait, offline.
 *
 * External contract (unchanged from the legacy SharkMiniGame):
 *   onComplete(multiplier: number, meta) — GameShellV2 derives multiplier from
 *   stars; meta carries { score, duration, seed, maxCombo } to the backend.
 *   onClose() — player quit without a win.
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
  Pressable,
  StyleSheet,
  Dimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  Canvas,
  Image as SkiaImage,
  Group,
  RoundedRect,
  useImage,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GameShellV2,
  ParticleField,
  useCombo,
  GAME_COLORS,
  type GameShellV2Handle,
  type GameResult,
  type ParticleHandle,
} from '../../gamekit';
import {
  DIFFICULTY,
  OBSTACLE,
  PARALLAX,
  PB_KEY,
  RING,
  ROUND_SECONDS,
  SHARK,
  type Difficulty,
} from './constants';
import { useSharkyEngine, type Obstacle, type Ring } from './useSharkyEngine';
import {
  OCEAN_BACK,
  OCEAN_MID,
  OCEAN_FRONT,
  RING_IMAGE,
  SHARK_FRAMES,
} from './assets';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export interface SharkySwimProps {
  visible: boolean;
  /** 1-3, chosen by session context. Controls gap size + speed. */
  difficulty?: Difficulty;
  /** Optional deterministic seed (else time-based). Enables replay. */
  seed?: number;
  /** GameShellV2 external contract — matches MiniGameSelector. */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
}

/** Star thresholds by score. Tuned so a clean ~30s run earns 1-2 stars. */
function scoreToStars(score: number): number {
  if (score >= 600) return 3;
  if (score >= 300) return 2;
  if (score >= 120) return 1;
  return 0;
}

export function SharkySwim({
  visible,
  difficulty = 1,
  seed,
  onComplete,
  onClose,
}: SharkySwimProps) {
  const shellRef = useRef<GameShellV2Handle>(null);
  const trailRef = useRef<ParticleHandle>(null);

  // Playfield size (measured; defaults to screen so the canvas is never 0).
  const [field, setField] = useState({ w: SCREEN_W, h: SCREEN_H - 120 });

  // Score / combo (JS thread — updated from engine callbacks).
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const combo = useCombo();
  const [best, setBest] = useState<number>(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const runSeed = useRef<number>(seed ?? Date.now() >>> 0);
  const startedAt = useRef<number>(0);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cfg = DIFFICULTY[difficulty];

  // Load personal best once.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PB_KEY)
      .then((v) => {
        if (alive && v != null) setBest(parseInt(v, 10) || 0);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // --- Engine callbacks (JS thread) ----------------------------------------
  // Rings drive the combo chain (a chain of rings triggers fever); a cleared
  // gap scores at whatever multiplier the current ring streak is worth.
  const onRingCollected = useCallback(
    (pts: number) => {
      const next = combo.hit();
      scoreRef.current += Math.round(pts * next.multiplier);
      setScore(scoreRef.current);
    },
    [combo],
  );

  const onGapCleared = useCallback(
    (pts: number) => {
      scoreRef.current += Math.round(pts * combo.multiplier);
      setScore(scoreRef.current);
    },
    [combo],
  );

  const finish = useCallback(() => {
    if (result) return;
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > best;
    const stars = scoreToStars(finalScore);
    if (isNewBest) {
      setBest(finalScore);
      AsyncStorage.setItem(PB_KEY, String(finalScore)).catch(() => undefined);
    }
    const duration = (Date.now() - startedAt.current) / 1000;
    setResult({
      score: finalScore,
      stars,
      maxCombo: combo.maxStreak,
      message: stars === 0 ? 'CRASHED!' : undefined,
      meta: {
        score: finalScore,
        duration,
        seed: runSeed.current,
        maxCombo: combo.maxStreak,
        difficulty,
        isNewBest,
      },
    });
  }, [result, best, combo.maxStreak, difficulty]);

  const onCrash = useCallback(() => {
    engine.loop.pause();
    finish();
  }, [finish]);

  const engine = useSharkyEngine({
    difficulty,
    width: field.w,
    height: field.h,
    onGapCleared,
    onRingCollected,
    onCrash,
  });

  // --- Shell lifecycle ------------------------------------------------------
  const handleStart = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    combo.reset();
    setResult(null);
    runSeed.current = seed ?? Date.now() >>> 0;
    startedAt.current = Date.now();
    engine.start(runSeed.current);
    // Round timer — survive to the clock or crash, whichever first.
    if (endTimer.current) clearTimeout(endTimer.current);
    endTimer.current = setTimeout(() => {
      engine.loop.pause();
      finish();
    }, ROUND_SECONDS * 1000);
  }, [combo, engine, seed, finish]);

  const handlePause = useCallback(() => {
    engine.loop.pause();
  }, [engine]);

  const handleResume = useCallback(() => {
    engine.loop.resume();
  }, [engine]);

  useEffect(() => {
    return () => {
      if (endTimer.current) clearTimeout(endTimer.current);
    };
  }, []);

  // --- Tap to swim (coyote-forgiving; engine owns the grace window) ---------
  const handleTap = useCallback(() => {
    if (shellRef.current?.getPhase() !== 'playing') return;
    engine.swim();
  }, [engine]);

  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setField({ w: width, h: height });
  }, []);

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Sharky Swim"
      subtitle="Tap to swim through the gaps"
      objective="Swim through the gaps. Grab golden rings for a combo!"
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
    >
      <Pressable style={styles.fill} onPress={handleTap} onLayout={onFieldLayout}>
        <OceanScene
          engine={engine}
          width={field.w}
          height={field.h}
          fever={combo.fever}
        />
        {/* Trail particles sit above the canvas, behind the HUD. */}
        <ParticleField
          ref={trailRef}
          width={field.w}
          height={field.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <TrailEmitter
          engine={engine}
          trailRef={trailRef}
          fever={combo.fever}
          tailX={field.w * SHARK.xFrac - SHARK.drawW * 0.35}
        />
      </Pressable>
    </GameShellV2>
  );
}

// =============================================================================
// Skia scene — all motion derives from engine SharedValues (UI thread)
// =============================================================================

interface SceneProps {
  engine: ReturnType<typeof useSharkyEngine>;
  width: number;
  height: number;
  fever: boolean;
}

function OceanScene({ engine, width, height, fever }: SceneProps) {
  const back = useImage(OCEAN_BACK);
  const mid = useImage(OCEAN_MID);
  const front = useImage(OCEAN_FRONT);
  const ringImg = useImage(RING_IMAGE);
  const frame0 = useImage(SHARK_FRAMES[0]);
  const frame1 = useImage(SHARK_FRAMES[1]);
  const frame2 = useImage(SHARK_FRAMES[2]);

  const sharkX = width * SHARK.xFrac;

  return (
    <Canvas style={{ width, height }}>
      {/* Parallax ocean — three tiled layers scrolling at different rates. */}
      <ParallaxLayer image={back} scrollX={engine.scrollX} factor={PARALLAX.back} width={width} height={height} />
      <ParallaxLayer image={mid} scrollX={engine.scrollX} factor={PARALLAX.mid} width={width} height={height} />

      {/* Obstacles (behind the shark, in front of mid ocean). */}
      {Array.from({ length: engine.obstacles.value.length }).map((_, i) => (
        <ObstaclePillar key={`ob-${i}`} obstacles={engine.obstacles} index={i} height={height} />
      ))}

      {/* Golden rings. */}
      {Array.from({ length: engine.rings.value.length }).map((_, i) => (
        <RingSprite key={`ring-${i}`} rings={engine.rings} index={i} image={ringImg} />
      ))}

      {/* Shark sprite — 3-frame swim cycle + velocity tilt. */}
      <SharkSprite
        engine={engine}
        x={sharkX}
        frames={[frame0, frame1, frame2]}
      />

      {/* Front ocean layer overlays for depth. */}
      <ParallaxLayer image={front} scrollX={engine.scrollX} factor={PARALLAX.front} width={width} height={height} opacity={fever ? 0.55 : 0.85} />
    </Canvas>
  );
}

// --- One tiled, wrapping parallax layer -------------------------------------

function ParallaxLayer({
  image,
  scrollX,
  factor,
  width,
  height,
  opacity = 1,
}: {
  image: ReturnType<typeof useImage>;
  scrollX: SharedValue<number>;
  factor: number;
  width: number;
  height: number;
  opacity?: number;
}) {
  // Two side-by-side copies wrap seamlessly. Phase = -(scrollX*factor mod width).
  const tx1 = useDerivedValue(() => {
    'worklet';
    const phase = (scrollX.value * factor) % width;
    return -phase;
  }, [scrollX, factor, width]);
  const tx2 = useDerivedValue(() => {
    'worklet';
    const phase = (scrollX.value * factor) % width;
    return -phase + width;
  }, [scrollX, factor, width]);

  const t1 = useDerivedValue(() => [{ translateX: tx1.value }], [tx1]);
  const t2 = useDerivedValue(() => [{ translateX: tx2.value }], [tx2]);

  if (!image) return null;
  return (
    <Group opacity={opacity}>
      <Group transform={t1}>
        <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="cover" />
      </Group>
      <Group transform={t2}>
        <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="cover" />
      </Group>
    </Group>
  );
}

// --- Obstacle pillar (top + bottom around the gap) --------------------------

function ObstaclePillar({
  obstacles,
  index,
  height,
}: {
  obstacles: SharedValue<Obstacle[]>;
  index: number;
  height: number;
}) {
  const x = useDerivedValue(() => obstacles.value[index].x, [obstacles, index]);
  const topH = useDerivedValue(() => {
    'worklet';
    const ob = obstacles.value[index];
    return ob.active ? Math.max(0, ob.gapY - ob.gapHalf) : 0;
  }, [obstacles, index]);
  const botY = useDerivedValue(() => {
    'worklet';
    const ob = obstacles.value[index];
    return ob.active ? ob.gapY + ob.gapHalf : height;
  }, [obstacles, index]);
  const botH = useDerivedValue(() => {
    'worklet';
    const ob = obstacles.value[index];
    return ob.active ? Math.max(0, height - (ob.gapY + ob.gapHalf)) : 0;
  }, [obstacles, index]);
  const opacity = useDerivedValue(() => (obstacles.value[index].active ? 1 : 0), [obstacles, index]);

  return (
    <Group opacity={opacity}>
      <RoundedRect x={x} y={0} width={OBSTACLE.width} height={topH} r={OBSTACLE.cap} color={GAME_COLORS.navy} />
      <RoundedRect x={x} y={botY} width={OBSTACLE.width} height={botH} r={OBSTACLE.cap} color={GAME_COLORS.navy} />
      {/* Rim highlights read as coral kelp caps. */}
      <RoundedRect x={x} y={0} width={OBSTACLE.width} height={topH} r={OBSTACLE.cap} color={GAME_COLORS.blue} style="stroke" strokeWidth={3} />
      <RoundedRect x={x} y={botY} width={OBSTACLE.width} height={botH} r={OBSTACLE.cap} color={GAME_COLORS.blue} style="stroke" strokeWidth={3} />
    </Group>
  );
}

// --- Golden ring sprite ------------------------------------------------------

function RingSprite({
  rings,
  index,
  image,
}: {
  rings: SharedValue<Ring[]>;
  index: number;
  image: ReturnType<typeof useImage>;
}) {
  const x = useDerivedValue(() => rings.value[index].x - RING.drawSize / 2, [rings, index]);
  const y = useDerivedValue(() => rings.value[index].y - RING.drawSize / 2, [rings, index]);
  const opacity = useDerivedValue(() => (rings.value[index].active ? 1 : 0), [rings, index]);
  if (!image) return null;
  return (
    <Group opacity={opacity}>
      <SkiaImage image={image} x={x} y={y} width={RING.drawSize} height={RING.drawSize} fit="contain" />
    </Group>
  );
}

// --- Shark sprite (3-frame flipbook + velocity tilt) ------------------------

function SharkSprite({
  engine,
  x,
  frames,
}: {
  engine: ReturnType<typeof useSharkyEngine>;
  x: number;
  frames: Array<ReturnType<typeof useImage>>;
}) {
  const drawX = x - SHARK.drawW / 2;
  const drawY = useDerivedValue(() => engine.sharkY.value - SHARK.drawH / 2, [engine.sharkY]);

  // Tilt with vertical velocity (nose up when swimming, down when falling).
  const transform = useDerivedValue(() => {
    'worklet';
    const vy = engine.sharkVY.value;
    const tilt = Math.max(-0.5, Math.min(0.6, vy / 1400));
    return [
      { translateX: x },
      { translateY: engine.sharkY.value },
      { rotate: tilt },
      { translateX: -x },
      { translateY: -engine.sharkY.value },
    ];
  }, [engine.sharkVY, engine.sharkY, x]);

  // Only one frame is visible at a time; opacity toggles by sharkFrame.
  const op0 = useDerivedValue(() => (engine.sharkFrame.value === 0 ? 1 : 0), [engine.sharkFrame]);
  const op1 = useDerivedValue(() => (engine.sharkFrame.value === 1 ? 1 : 0), [engine.sharkFrame]);
  const op2 = useDerivedValue(() => (engine.sharkFrame.value === 2 ? 1 : 0), [engine.sharkFrame]);
  const ops = [op0, op1, op2];

  return (
    <Group transform={transform}>
      {frames.map((img, i) =>
        img ? (
          <Group key={i} opacity={ops[i]}>
            <SkiaImage
              image={img}
              x={drawX}
              y={drawY}
              width={SHARK.drawW}
              height={SHARK.drawH}
              fit="contain"
            />
          </Group>
        ) : null,
      )}
    </Group>
  );
}

// =============================================================================
// Trail emitter — pulls shark position off the UI thread at a throttled cadence
// and drips particles behind it (juice, quality bar #3).
// =============================================================================

function TrailEmitter({
  engine,
  trailRef,
  fever,
  tailX,
}: {
  engine: ReturnType<typeof useSharkyEngine>;
  trailRef: React.RefObject<ParticleHandle | null>;
  fever: boolean;
  /** Fixed on-screen x of the shark's tail (its x is fixed in a side-scroller). */
  tailX: number;
}) {
  const lastEmit = useSharedValue(0);

  const drop = useCallback(
    (y: number, hot: boolean) => {
      trailRef.current?.trail(tailX, y, hot ? GAME_COLORS.gold : GAME_COLORS.blue);
    },
    [trailRef, tailX],
  );

  // Runs every real frame (depends on scrollX which advances continuously while
  // the loop runs). Throttle to ~18Hz so the trail reads without flooding the
  // pool. When the loop is paused scrollX stops changing → no emissions.
  useDerivedValue(() => {
    'worklet';
    // Touch scrollX so this recomputes each frame the world moves.
    const moving = engine.scrollX.value;
    const now = Date.now();
    if (now - lastEmit.value < 55) return;
    lastEmit.value = now;
    if (moving >= 0) runOnJS(drop)(engine.sharkY.value, fever);
  }, [engine.sharkY, engine.scrollX, fever]);

  return null;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: GAME_COLORS.bgDeep },
});

export default SharkySwim;
