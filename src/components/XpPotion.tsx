/**
 * XpPotion: the XP bar as Alex's green XP potion, a glowing round flask whose
 * liquid fills to the progress inside the current level.
 *
 *   <XpPotion progress={0.52} level={5} size={78} paused={!onScreen} />
 *
 * - One small Skia canvas. The liquid surface sloshes, bubbles rise and the
 *   glow breathes, all from one UI-thread clock that redraws at about 30 fps.
 * - XP gained (progress goes up at the same level): the liquid rises with a
 *   slosh and a fizz of extra bubbles.
 * - Level up (level goes up): the liquid fills, overflows into a burst of
 *   drops, then refills from empty to the new progress. `onLevelUpBurst`
 *   fires at the burst so the caller can play a sound and a haptic.
 * - The clock stops when `paused` is true, when the app is in the background,
 *   and under Reduce Motion (a still, glowing vial at the right level).
 *
 * Art follows Alex's XP potion (assets/images/screens/explore/xp.png): dark
 * slate outline, white sticker edge, flat green fills with a darker cel band,
 * a glossy highlight and a green glow. Decorative: the parent card carries
 * the accessibility label.
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import { AppState, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Path,
  PathOp,
  RoundedRect,
  Skia,
  type SkPath,
} from '@shopify/react-native-skia';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import useReducedGameMotion from '../hooks/useReducedGameMotion';

const INK = '#1d3550';
const GLASS = 'rgba(190, 228, 255, 0.78)';
const LIQUID = '#3fd14a';
const LIQUID_DEEP = '#22a834';
const LIQUID_TOP = '#9cf58f';
const GLOW = '#54f05c';

// Design space: the potion is 100 x 120, drawn inside a 150 x 160 canvas so the
// glow and the level-up burst have room. Layout reserves only the potion box.
const PAD_X = 25;
const PAD_TOP = 30;
const DESIGN_W = 100 + PAD_X * 2;
const DESIGN_H = 120 + PAD_TOP + 10;
const BODY_CX = 50;
const BODY_CY = 78;
const BODY_R = 38;
const FILL_BOTTOM = BODY_CY + BODY_R; // 116
const FILL_TOP = 26; // just under the lip
const FRAME_MS = 33; // about 30 fps redraws

const BUBBLES = [
  { x: 34, speed: 13, r: 2.6, phase: 0 },
  { x: 58, speed: 17, r: 2.0, phase: 31 },
  { x: 45, speed: 11, r: 3.2, phase: 57 },
  { x: 68, speed: 15, r: 1.8, phase: 12 },
  { x: 28, speed: 19, r: 1.6, phase: 77 },
  { x: 52, speed: 14, r: 2.3, phase: 44 },
  { x: 63, speed: 12, r: 2.8, phase: 66 },
];
const DROPS = [
  { vx: -1.05, vy: 1.0, r: 6.2 },
  { vx: -0.6, vy: 1.4, r: 5.0 },
  { vx: -0.2, vy: 1.65, r: 6.8 },
  { vx: 0.2, vy: 1.55, r: 4.8 },
  { vx: 0.6, vy: 1.35, r: 6.0 },
  { vx: 1.05, vy: 0.95, r: 4.6 },
  { vx: -0.85, vy: 0.65, r: 4.0 },
  { vx: 0.9, vy: 0.6, r: 4.2 },
  { vx: -0.35, vy: 1.2, r: 3.4 },
  { vx: 0.4, vy: 1.1, r: 3.6 },
];

function flaskPath(): SkPath {
  const body = Skia.Path.Make();
  body.addCircle(BODY_CX, BODY_CY, BODY_R);
  const neck = Skia.Path.Make();
  neck.addRRect(Skia.RRectXY(Skia.XYWHRect(33, 16, 34, 40), 5, 5));
  return Skia.Path.MakeFromOp(body, neck, PathOp.Union) ?? body;
}

export type XpPotionProps = {
  /** Progress inside the current level, 0 to 1. */
  readonly progress: number;
  /** The current level. A higher value than last render plays the level-up overflow. */
  readonly level?: number;
  /** Width of the potion in points (height is 1.2x). */
  readonly size?: number;
  /** Stop the animation clock (off screen, covered, not focused). */
  readonly paused?: boolean;
  /** Start from this progress instead of empty on first mount (no pour-in). */
  readonly initialProgress?: number;
  /** The level `initialProgress` belongs to. Lower than `level` plays the level up on mount. */
  readonly initialLevel?: number;
  /** Called at the moment the vial bursts on a level up. */
  readonly onLevelUpBurst?: () => void;
  readonly style?: StyleProp<ViewStyle>;
};

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function XpPotion({
  progress,
  level = 1,
  size = 78,
  paused = false,
  initialProgress,
  initialLevel,
  onLevelUpBurst,
  style,
}: XpPotionProps) {
  const reduced = useReducedGameMotion();
  const target = clamp01(progress);
  const scale = size / 100;
  const flask = useMemo(flaskPath, []);

  const time = useSharedValue(0);
  const acc = useSharedValue(0);
  const fill = useSharedValue(clamp01(initialProgress ?? 0));
  const slosh = useSharedValue(0);
  const fizz = useSharedValue(1);
  const burst = useSharedValue(0);
  const flash = useSharedValue(0);

  const last = useRef<{ level: number; progress: number } | null>(
    initialProgress === undefined ? null : { level: initialLevel ?? level, progress: clamp01(initialProgress) },
  );
  const burstCb = useRef(onLevelUpBurst);
  burstCb.current = onLevelUpBurst;
  const fireBurst = () => burstCb.current?.();

  // Progress and level changes drive the liquid.
  useEffect(() => {
    const prev = last.current;
    last.current = { level, progress: target };
    if (reduced) {
      cancelAnimation(fill);
      fill.value = target;
      slosh.value = 0;
      burst.value = 0;
      return;
    }
    if (prev && level > prev.level) {
      // Fill, overflow and burst, then refill from empty for the new level.
      fill.value = withSequence(
        withTiming(1.04, { duration: 520, easing: Easing.in(Easing.quad) }),
        // Stay brimming while the drops fly, then drain and refill for the new level.
        withDelay(380, withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) })),
        withDelay(160, withSpring(target, { damping: 14, stiffness: 70 })),
      );
      burst.value = 0;
      burst.value = withDelay(520, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) burst.value = 0;
      }));
      flash.value = withDelay(500, withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 600 })));
      slosh.value = withSequence(withTiming(6, { duration: 300 }), withTiming(0, { duration: 1600 }));
      fizz.value = withSequence(withTiming(3, { duration: 200 }), withTiming(1, { duration: 2200 }));
      const timer = setTimeout(fireBurst, 520);
      return () => clearTimeout(timer);
    }
    const gained = !!prev && target > prev.progress + 0.001;
    const firstPour = !prev;
    fill.value = withSpring(target, { damping: 12, stiffness: firstPour ? 50 : 80 });
    if (gained || firstPour) {
      slosh.value = withSequence(withTiming(gained ? 5 : 3.5, { duration: 220 }), withTiming(0, { duration: 1400 }));
      fizz.value = withSequence(withTiming(gained ? 2.6 : 1.8, { duration: 160 }), withTiming(1, { duration: 1800 }));
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, level, reduced]);

  // The clock: UI thread, about 30 redraws a second, only while visible.
  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    acc.value += Math.min(dt, 100);
    if (acc.value < FRAME_MS) return;
    time.value += acc.value / 1000;
    acc.value = 0;
  }, false);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const appActive = useRef(AppState.currentState === 'active');
  useEffect(() => {
    const apply = () => frameRef.current.setActive(!paused && !reduced && appActive.current);
    apply();
    const sub = AppState.addEventListener('change', (state) => {
      appActive.current = state === 'active';
      apply();
    });
    return () => {
      sub.remove();
      frameRef.current.setActive(false);
    };
  }, [paused, reduced]);

  const surfaceY = useDerivedValue(() => {
    const f = Math.max(0, Math.min(1.04, fill.value));
    return FILL_BOTTOM - f * (FILL_BOTTOM - FILL_TOP);
  });

  const liquid = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    const y0 = surfaceY.value;
    const t = time.value;
    const amp = 1.4 + slosh.value;
    p.moveTo(0, y0);
    for (let x = 0; x <= 100; x += 5) {
      const y = y0 + Math.sin(x / 11 + t * 2.6) * amp * 0.6 + Math.sin(x / 7 - t * 1.7) * amp * 0.4;
      p.lineTo(x, y);
    }
    p.lineTo(100, 130);
    p.lineTo(0, 130);
    p.close();
    return p;
  });

  const surfaceLine = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    const y0 = surfaceY.value + 1.6;
    const t = time.value;
    const amp = 1.4 + slosh.value;
    for (let x = 0; x <= 100; x += 5) {
      const y = y0 + Math.sin(x / 11 + t * 2.6) * amp * 0.6 + Math.sin(x / 7 - t * 1.7) * amp * 0.4;
      if (x === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    return p;
  });

  const bubbles = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    const top = surfaceY.value;
    const span = FILL_BOTTOM - top;
    if (span < 6) return p;
    const t = time.value;
    const k = fizz.value;
    for (let i = 0; i < BUBBLES.length; i++) {
      const b = BUBBLES[i];
      // Extra bubbles only join while fizzing.
      if (i >= 4 && k < 1.4) continue;
      const travel = (b.phase + t * b.speed * k) % span;
      const y = FILL_BOTTOM - 4 - travel;
      const x = b.x + Math.sin(t * 2 + b.phase) * 2;
      const r = b.r * (0.75 + 0.35 * (travel / span));
      p.addCircle(x, y, r);
    }
    return p;
  });

  const drops = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    const q = burst.value;
    if (q <= 0) return p;
    for (let i = 0; i < DROPS.length; i++) {
      const d = DROPS[i];
      const x = 50 + d.vx * q * 46;
      const y = 14 - d.vy * q * 58 + q * q * 70;
      const r = d.r * (1 - q * 0.45);
      p.addCircle(x, y, r);
    }
    return p;
  });
  const dropsOpacity = useDerivedValue(() => (burst.value > 0 ? 1 - burst.value * burst.value * burst.value : 0));

  const glowOpacity = useDerivedValue(() => 0.62 + Math.sin(time.value * 1.6) * 0.12 + flash.value * 0.35);
  const glowRadius = useDerivedValue(() => BODY_R + 9 + flash.value * 10);

  const canvasW = DESIGN_W * scale;
  const canvasH = DESIGN_H * scale;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[{ width: size, height: size * 1.2 }, style]}
    >
      <Canvas
        style={{
          position: 'absolute',
          left: -PAD_X * scale,
          top: -PAD_TOP * scale,
          width: canvasW,
          height: canvasH,
        }}
      >
        <Group transform={[{ scale }, { translateX: PAD_X }, { translateY: PAD_TOP }]}>
          {/* Glow */}
          <Circle cx={BODY_CX} cy={BODY_CY} r={glowRadius} color={GLOW} opacity={glowOpacity}>
            <BlurMask blur={12} style="normal" />
          </Circle>
          {/* White sticker edge, then the glass */}
          <Path path={flask} style="stroke" strokeWidth={12} color="#ffffff" strokeJoin="round" />
          <Path path={flask} color={GLASS} />
          {/* Liquid, clipped to the flask */}
          <Group clip={flask}>
            <Path path={liquid} color={LIQUID} />
            <Group clip={liquid}>
              {/* Cel band: the darker lower-right of the liquid */}
              <Circle cx={66} cy={98} r={33} color={LIQUID_DEEP} />
              <Path path={bubbles} color="rgba(255,255,255,0.78)" />
              <Path path={bubbles} style="stroke" strokeWidth={1.1} color="rgba(20,90,30,0.45)" />
            </Group>
            <Path path={surfaceLine} style="stroke" strokeWidth={2.6} strokeCap="round" color={LIQUID_TOP} />
          </Group>
          {/* Glass highlights: a long gloss arc and a dot */}
          <Path
            path="M 25 66 Q 28 50 42 45"
            style="stroke"
            strokeWidth={5.5}
            strokeCap="round"
            color="rgba(255,255,255,0.9)"
          />
          <Circle cx={27} cy={78} r={2.8} color="rgba(255,255,255,0.9)" />
          <Path path="M 41 24 L 41 42" style="stroke" strokeWidth={3.4} strokeCap="round" color="rgba(255,255,255,0.8)" />
          {/* Ink outline */}
          <Path path={flask} style="stroke" strokeWidth={5.2} color={INK} strokeJoin="round" />
          {/* Lip */}
          <RoundedRect x={27} y={9} width={46} height={13} r={6} color="#e6f6ff" />
          <RoundedRect x={27} y={9} width={46} height={13} r={6} style="stroke" strokeWidth={4.6} color={INK} />
          <RoundedRect x={32} y={12} width={22} height={3.5} r={1.75} color="rgba(255,255,255,0.95)" />
          {/* Ooze over the lip, like Alex's potion */}
          <Path path="M 30 13 Q 21 15 22 29 Q 23 39 29 37 Q 34 35 33 26 Q 34 20 40 19 Z" color={LIQUID} />
          <Circle cx={26} cy={27} r={1.8} color="rgba(255,255,255,0.8)" />
          <Path
            path="M 30 13 Q 21 15 22 29 Q 23 39 29 37 Q 34 35 33 26 Q 34 20 40 19"
            style="stroke"
            strokeWidth={3.2}
            strokeJoin="round"
            color={INK}
          />
          {/* Level-up burst */}
          <Group opacity={dropsOpacity}>
            <Path path={drops} color={LIQUID} />
            <Path path={drops} style="stroke" strokeWidth={2.4} color={INK} />
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}

export default memo(XpPotion);
