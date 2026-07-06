/**
 * BananaBasketGame.tsx — native Skia rebuild of the Banana Basket minigame.
 *
 * Drag a picnic basket across the bottom third with one thumb; catch falling
 * bananas (+points) and golden churros (combo fever), dodge bombs (life + shake
 * + failBuzz). Frenzy bursts, near-miss slow-mo, particles on every catch.
 *
 * Everything visual/physical runs on the UI thread:
 *   - Simulation: useBananaBasketEngine (GameKit useGameLoop, fixed timestep).
 *   - Input: gesture-handler Gesture.Pan → basketX SharedValue (UI thread).
 *   - Render: Skia <Canvas> — per-item <Atlas> buffers + basket <Image>, driven
 *     by useRSXformBuffer modifiers that read the item pool with zero per-frame
 *     JS work.
 *
 * The JS thread only reacts to discrete gameplay events (catch/miss/near-miss)
 * to fire haptics, SFX, particle bursts, score + combo updates.
 *
 * Reports {score, maxCombo, seed} to the shell for server-authoritative rewards.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet, Text, Dimensions } from 'react-native';
import {
  Canvas,
  Atlas,
  Image as SkiaImage,
  useImage,
  useRSXformBuffer,
  rect,
  type SkImage,
} from '@shopify/react-native-skia';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  GameShellV2,
  ParticleField,
  Haptic,
  playSfx,
  useShake,
  useFlash,
  useCombo,
  GAME_COLORS,
  type GameShellV2Handle,
  type GameResult,
  type ParticleHandle,
} from '../../gamekit';
import { useBananaBasketEngine } from './useBananaBasketEngine';
import { makeSeed } from './rng';
import {
  ITEM,
  MAX_ITEMS,
  ITEM_SIZE,
  CHURRO_SIZE,
  BASKET_W,
  BASKET_H,
  POINTS,
  BOMB_PENALTY,
  MISS_PENALTY,
  MIN_SCORE,
  START_LIVES,
  ROUND_SECONDS,
  STAR_TARGET_BASE,
  BEST_KEY,
} from './constants';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Sprite source resolution (the @3x master is 1024²; we sample the whole image).
const SPRITE_SRC = 1024;

export interface BananaBasketGameProps {
  visible: boolean;
  /** 1-3, chosen by session context. Defaults to 2. */
  difficulty?: 1 | 2 | 3;
  /** Deterministic seed. Defaults to a fresh one per mount. */
  seed?: number;
  /** Preserved external contract used by MiniGameSelector. */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  /** Ref so LinePlay can pause the game when the line moves. */
  shellRef?: React.Ref<GameShellV2Handle>;
}

export function BananaBasketGame({
  visible,
  difficulty = 2,
  seed: seedProp,
  onComplete,
  onClose,
  shellRef,
}: BananaBasketGameProps) {
  // -- Assets (hooks must be unconditional / top level). --------------------
  const basketImg = useImage(require('../../assets/games/banana-basket/basket.png'));
  const bananaImg = useImage(require('../../assets/games/banana-basket/banana.png'));
  const bombImg = useImage(require('../../assets/games/banana-basket/bomb.png'));
  const churroImg = useImage(require('../../assets/games/banana-basket/golden-churro.png'));

  // Stable per-mount seed.
  const seed = useMemo(() => makeSeed(seedProp ?? Date.now()), [seedProp]);

  // Play-area size (measured from the field container).
  const [field, setField] = useState({ w: SCREEN_W, h: SCREEN_H });

  // Score / combo / lives HUD state.
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const combo = useCombo();
  const [livesLeft, setLivesLeft] = useState(START_LIVES);
  const [result, setResult] = useState<GameResult | null>(null);
  const [best, setBest] = useState<number | undefined>(undefined);
  const endedRef = useRef(false);

  // Juice.
  const shake = useShake();
  const flash = useFlash();
  const particlesRef = useRef<ParticleHandle>(null);
  const internalShell = useRef<GameShellV2Handle>(null);

  // -- Load personal best. ---------------------------------------------------
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(BEST_KEY)
      .then((v) => {
        if (alive && v != null) {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n)) setBest(n);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // -- Score mutation helper (clamped, ref-mirrored). ------------------------
  const addScore = useCallback((delta: number, mult: number) => {
    const next = Math.max(MIN_SCORE, scoreRef.current + Math.round(delta * mult));
    scoreRef.current = next;
    setScore(next);
  }, []);

  // -- Event callbacks (JS thread). ------------------------------------------
  const onCatchBanana = useCallback(
    (x: number, y: number) => {
      const c = combo.hit();
      addScore(POINTS.BANANA, c.multiplier);
      Haptic.hitMedium();
      playSfx('coin');
      particlesRef.current?.burst({
        x,
        y,
        preset: 'burst',
        count: 12,
        colors: [GAME_COLORS.gold, '#ffe27a', '#fff2b0'],
      });
    },
    [combo, addScore],
  );

  const onCatchChurro = useCallback(
    (x: number, y: number) => {
      const c = combo.hit();
      addScore(POINTS.CHURRO, c.multiplier);
      Haptic.comboHeavy();
      playSfx(c.fever ? 'combo' : 'star');
      particlesRef.current?.burst({
        x,
        y,
        preset: 'coins',
        count: 16,
        colors: [GAME_COLORS.gold, GAME_COLORS.coral, '#ffd54a'],
      });
      if (c.fever) flash.flash(0.35, 220);
    },
    [combo, addScore, flash],
  );

  const onCatchBomb = useCallback(
    (x: number, y: number) => {
      combo.miss();
      addScore(-BOMB_PENALTY, 1);
      Haptic.failBuzz();
      playSfx('fail');
      shake.shake(14, 110);
      flash.flash(0.5, 160);
      particlesRef.current?.burst({
        x,
        y,
        preset: 'burst',
        count: 20,
        colors: [GAME_COLORS.danger, '#333', '#111', GAME_COLORS.coral],
        speed: 1.3,
      });
      setLivesLeft((n) => Math.max(0, n - 1));
    },
    [combo, addScore, shake, flash],
  );

  const onMissBanana = useCallback(
    (x: number, _y: number) => {
      combo.miss();
      addScore(-MISS_PENALTY, 1);
      Haptic.warning();
      playSfx('lose');
      shake.shake(7, 90);
      setLivesLeft((n) => Math.max(0, n - 1));
    },
    [combo, addScore, shake],
  );

  const onMissChurro = useCallback(() => {
    // Bonus item slipped by: only the combo breaks, no life lost, no score hit.
    combo.miss();
    Haptic.tickSelection();
  }, [combo]);

  const onNearMiss = useCallback(
    (_x: number, _y: number) => {
      // The slow-mo dip already happened on the UI thread; punctuate it.
      Haptic.tapLight();
      playSfx('whoosh');
      flash.flash(0.25, 180);
    },
    [flash],
  );

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    const finalScore = scoreRef.current;
    const maxCombo = combo.maxStreak;

    // Stars: fraction of a difficulty-scaled target. Any positive score earns
    // at least 1 star; 0 stars only when the player netted nothing.
    const target = STAR_TARGET_BASE * (0.7 + difficulty * 0.3);
    const ratio = finalScore / target;
    let stars = 0;
    if (finalScore > 0) {
      stars = ratio >= 1 ? 3 : ratio >= 0.6 ? 2 : 1;
    }

    // Persist personal best (client-side display only; rewards stay server-side).
    if (finalScore > (best ?? 0)) {
      setBest(finalScore);
      AsyncStorage.setItem(BEST_KEY, String(finalScore)).catch(() => undefined);
    }

    setResult({
      score: finalScore,
      stars,
      maxCombo,
      message:
        stars === 3 ? 'BASKET MASTER!' : stars === 2 ? 'NICE HAUL!' : stars === 1 ? 'GOT SOME!' : 'TRY AGAIN',
      // Server-authoritative: report inputs, never a client reward.
      meta: {
        score: finalScore,
        maxCombo,
        seed,
        difficulty,
        durationMs: Math.round(ROUND_SECONDS * 1000),
        game: 'banana-basket',
      },
    });
  }, [combo.maxStreak, difficulty, best, seed]);

  const onGameOver = useCallback(() => {
    finish();
  }, [finish]);

  const engine = useBananaBasketEngine({
    onCatchBanana,
    onCatchChurro,
    onCatchBomb,
    onMissBanana,
    onMissChurro,
    onNearMiss,
    onGameOver,
  });

  // -- Poll combo decay each frame (cheap; keeps the badge honest). ----------
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => combo.poll(), 120);
    return () => clearInterval(id);
  }, [visible, combo]);

  // -- Reset per open. -------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    endedRef.current = false;
    scoreRef.current = 0;
    setScore(0);
    setLivesLeft(START_LIVES);
    setResult(null);
    combo.reset();
    // engine.start is called by the shell's onStart (after countdown).
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Shell lifecycle. ------------------------------------------------------
  const handleStart = useCallback(() => {
    engine.start({ seed, width: field.w, height: field.h, difficulty });
  }, [engine, seed, field.w, field.h, difficulty]);

  const handlePause = useCallback(() => {
    engine.setPaused(true);
  }, [engine]);

  const handleResume = useCallback(() => {
    engine.setPaused(false);
  }, [engine]);

  const handleClose = useCallback(() => {
    engine.setPaused(true);
    onClose();
  }, [engine, onClose]);

  // -- Pan gesture: drag the basket horizontally in the bottom third. --------
  // Runs on the UI thread; writes basketX directly (no JS hop).
  const dragStartX = useSharedValue(0);
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          'worklet';
          dragStartX.value = engine.basketX.value;
        })
        .onChange((e) => {
          'worklet';
          const half = BASKET_W / 2;
          const w = field.w;
          let next = engine.basketX.value + e.changeX;
          if (next < half) next = half;
          if (next > w - half) next = w - half;
          engine.basketX.value = next;
        }),
    [engine.basketX, dragStartX, field.w],
  );

  // Also allow tap-anywhere-in-field to jump the basket toward the touch x,
  // so the first grab feels instant (still one thumb, bottom third).
  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onBegin((e) => {
        'worklet';
        const half = BASKET_W / 2;
        const w = field.w;
        let next = e.x;
        if (next < half) next = half;
        if (next > w - half) next = w - half;
        engine.basketX.value = next;
      }),
    [engine.basketX, field.w],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(panGesture, tapGesture),
    [panGesture, tapGesture],
  );

  // -- Skia render buffers. --------------------------------------------------
  // One Atlas per item sprite; each buffer places only its kind (others → 0).
  const bananaXforms = useItemXforms(engine.pool, ITEM.BANANA, ITEM_SIZE);
  const bombXforms = useItemXforms(engine.pool, ITEM.BOMB, ITEM_SIZE);
  const churroXforms = useItemXforms(engine.pool, ITEM.CHURRO, CHURRO_SIZE);

  const spriteRect = useMemo(() => rect(0, 0, SPRITE_SRC, SPRITE_SRC), []);
  const atlasRects = useMemo(
    () => new Array(MAX_ITEMS).fill(spriteRect),
    [spriteRect],
  );

  // Basket transform (position + a subtle catch squash could be added later).
  const basketRect = useDerivedValue(() => {
    'worklet';
    const bx = engine.basketX.value;
    const by = engine.basketY.value;
    return rect(bx - BASKET_W / 2, by - BASKET_H / 2, BASKET_W, BASKET_H);
  }, [engine.basketX, engine.basketY]);

  // Shake wraps the whole field for screen-shake on bomb hits.
  const shakeStyle = shake.style;
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.opacity.value }));

  const onFieldLayout = useCallback(
    (w: number, h: number) => {
      setField((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    },
    [],
  );

  const assetsReady = basketImg && bananaImg && bombImg && churroImg;

  return (
    <GameShellV2
      ref={mergeRefs(shellRef, internalShell)}
      visible={visible}
      title="Banana Basket"
      subtitle="Catch the churros, dodge the bombs"
      score={score}
      multiplier={combo.multiplier}
      fever={combo.fever}
      personalBest={best}
      objective="Drag the basket · catch bananas & churros · dodge bombs"
      result={result}
      onStart={handleStart}
      onPause={handlePause}
      onResume={handleResume}
      onComplete={onComplete}
      onClose={handleClose}
    >
      <GestureHandlerRootView style={styles.fill}>
        <View
          style={styles.fill}
          onLayout={(e) =>
            onFieldLayout(e.nativeEvent.layout.width, e.nativeEvent.layout.height)
          }
        >
          {/* Lives pips */}
          <View style={styles.livesRow} pointerEvents="none">
            {Array.from({ length: START_LIVES }).map((_, i) => (
              <Text
                key={i}
                style={[
                  styles.lifePip,
                  { opacity: i < livesLeft ? 1 : 0.22 },
                ]}
              >
                {'❤'}
              </Text>
            ))}
          </View>

          <GestureDetector gesture={composed}>
            <Animated.View style={[styles.fill, shakeStyle]}>
              <Canvas style={styles.fill}>
                {assetsReady ? (
                  <>
                    <Atlas
                      image={bananaImg as SkImage}
                      sprites={atlasRects}
                      transforms={bananaXforms}
                    />
                    <Atlas
                      image={churroImg as SkImage}
                      sprites={atlasRects}
                      transforms={churroXforms}
                    />
                    <Atlas
                      image={bombImg as SkImage}
                      sprites={atlasRects}
                      transforms={bombXforms}
                    />
                    <SkiaImage
                      image={basketImg as SkImage}
                      rect={basketRect}
                      fit="contain"
                    />
                  </>
                ) : null}
              </Canvas>

              {/* Catch particles above the play field, below the HUD overlays. */}
              <ParticleField
                ref={particlesRef}
                width={field.w}
                height={field.h}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              {/* Bomb / fever flash overlay. */}
              <Animated.View
                pointerEvents="none"
                style={[styles.flash, flashStyle]}
              />
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

// =============================================================================
// Skia buffer helper — place items of one kind, collapse the rest off-screen.
// =============================================================================

function useItemXforms(
  pool: ReturnType<typeof useBananaBasketEngine>['pool'],
  kind: number,
  drawSize: number,
) {
  return useRSXformBuffer(MAX_ITEMS, (val, i) => {
    'worklet';
    const p = pool.value[i];
    if (!p.alive || p.kind !== kind) {
      val.set(0, 0, -9999, -9999);
      return;
    }
    const scale = drawSize / SPRITE_SRC;
    const cos = Math.cos(p.rot) * scale;
    const sin = Math.sin(p.rot) * scale;
    const half = (SPRITE_SRC * scale) / 2;
    // RSXform anchors at top-left of the (rotated) sprite; offset to center.
    val.set(cos, sin, p.x - half, p.y - half);
  });
}

// =============================================================================
// Small util: merge an optional forwarded ref with an internal one.
// =============================================================================

function mergeRefs<T>(
  a: React.Ref<T> | undefined,
  b: React.MutableRefObject<T | null>,
): React.RefCallback<T> {
  return (value: T | null) => {
    b.current = value;
    if (typeof a === 'function') a(value);
    else if (a && typeof a === 'object') {
      (a as React.MutableRefObject<T | null>).current = value;
    }
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  livesRow: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    zIndex: 5,
  },
  lifePip: {
    color: GAME_COLORS.coral,
    fontSize: 20,
    marginHorizontal: 3,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GAME_COLORS.danger,
  },
});

export default BananaBasketGame;
