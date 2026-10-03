/**
 * XpPotion: Alex's XP potion, live. The round bottle tilted to the left with a
 * short neck, a thick glass lip, chunky ooze over the lip and a cream XP label,
 * the same silhouette as assets/images/screens/explore/xp.png. Its glowing
 * green liquid fills to the progress inside the current level.
 *
 *   <XpPotion progress={0.52} level={5} size={70} paused={!onScreen} />
 *
 * - One small Skia canvas. The surface sloshes, bubbles rise and pop at the
 *   top, and now and then one escapes past the lip. One UI-thread clock
 *   redraws at about 30 fps and reuses its paths.
 * - XP gained: the liquid rises with a slosh and a fizz.
 * - Level up: the liquid brims, bursts into big drops and gold sparkles,
 *   drains, then refills for the new level. `onLevelUpBurst` fires at the
 *   burst (the caller pops the number, shows the ribbon, plays sound and
 *   haptic). Under Reduce Motion it fires at once and the vial stays still.
 * - Nothing is decided until the Reduce Motion preference is known
 *   (xpPotionModel.ts), so a level up earned elsewhere always plays.
 * - The clock stops when `paused`, in the background and under Reduce Motion.
 *
 * Decorative for VoiceOver: the parent card carries the label.
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import { AppState, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  Path,
  PathOp,
  RadialGradient,
  Skia,
  usePathValue,
  vec,
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
import { useReduceMotionPreference } from '../hooks/useReducedGameMotion';
import { potionTransition, type PotionState, type PotionTransition } from './xpPotionModel';

const INK = '#1d3550';
const LABEL_INK = '#3a0d12';
const GLASS = 'rgba(190, 228, 255, 0.8)';
const LIQUID = '#3fd14a';
const LIQUID_DEEP = '#22a834';
const LIQUID_TOP = '#a6f79a';
const GLOW = 'rgba(84, 240, 92, 0.85)';
const GOLD = '#ffcf3b';

// Design space: the potion is 100 x 120 inside a 150 x 170 canvas, so the glow,
// the escaping bubble and the level-up burst have room. Layout reserves only
// the potion box.
const PAD_X = 25;
const PAD_TOP = 34;
const DESIGN_W = 100 + PAD_X * 2;
const DESIGN_H = 120 + PAD_TOP + 16;
const CX = 52;
const CY = 76;
const R = 38;
const TILT = (-22 * Math.PI) / 180;
const FILL_BOTTOM = CY + R; // 114
const FILL_TOP = 30;
const FRAME_MS = 33;
// Lip centre after the tilt: where escaping bubbles and drops leave the bottle.
const MOUTH = { x: CX - Math.sin(-TILT) * (CY - 20), y: CY - Math.cos(-TILT) * (CY - 20) };

const BUBBLES = [
  { x: 36, speed: 12, r: 3.4, phase: 0 },
  { x: 58, speed: 16, r: 2.8, phase: 31 },
  { x: 47, speed: 10, r: 4.0, phase: 57 },
  { x: 66, speed: 14, r: 2.6, phase: 12 },
  { x: 30, speed: 18, r: 2.2, phase: 77 },
  { x: 54, speed: 13, r: 3.0, phase: 44 },
  { x: 62, speed: 11, r: 3.6, phase: 66 },
];
const DROPS = [
  { vx: -1.05, vy: 1.0, r: 11 },
  { vx: -0.6, vy: 1.4, r: 9 },
  { vx: -0.2, vy: 1.65, r: 12 },
  { vx: 0.2, vy: 1.55, r: 8.5 },
  { vx: 0.6, vy: 1.35, r: 10.5 },
  { vx: 1.05, vy: 0.95, r: 8 },
  { vx: -0.85, vy: 0.65, r: 7 },
  { vx: 0.9, vy: 0.6, r: 7.5 },
];
const SPARKS = [
  { a: -2.6, d: 62, s: 7 },
  { a: -2.0, d: 70, s: 9 },
  { a: -1.5, d: 74, s: 8 },
  { a: -1.0, d: 68, s: 10 },
  { a: -0.5, d: 60, s: 7 },
  { a: -2.9, d: 48, s: 6 },
  { a: -0.15, d: 50, s: 6 },
];

function tiltMatrix() {
  return Skia.Matrix().translate(CX, CY).rotate(TILT).translate(-CX, -CY);
}

function bottlePaths() {
  const body = Skia.Path.Make();
  body.addCircle(CX, CY, R);
  const neck = Skia.Path.Make();
  neck.addRRect(Skia.RRectXY(Skia.XYWHRect(CX - 18, 22, 36, 28), 6, 6));
  const flask = Skia.Path.MakeFromOp(body, neck, PathOp.Union) ?? body;
  const lip = Skia.Path.Make();
  lip.addRRect(Skia.RRectXY(Skia.XYWHRect(CX - 23, 12, 46, 15), 7.5, 7.5));
  const mouth = Skia.Path.Make();
  mouth.addOval(Skia.XYWHRect(CX - 16, 16, 32, 7));
  // The cream label: a band that wraps the lower body, curved with the sphere.
  const label = Skia.Path.Make();
  label.moveTo(CX - 40, 82);
  label.quadTo(CX, 92, CX + 40, 82);
  label.lineTo(CX + 40, 101);
  label.quadTo(CX, 111, CX - 40, 101);
  label.close();
  const labelClip = Skia.Path.MakeFromOp(label, body, PathOp.Intersect) ?? label;
  // "XP" in brush strokes, centred on the label.
  const letters = Skia.Path.Make();
  letters.moveTo(CX - 13, 90); letters.lineTo(CX - 3, 103);
  letters.moveTo(CX - 3, 90); letters.lineTo(CX - 13, 103);
  letters.moveTo(CX + 4, 104); letters.lineTo(CX + 4, 90);
  letters.quadTo(CX + 15, 89, CX + 14, 94);
  letters.quadTo(CX + 13, 98, CX + 5, 98);
  // Ooze over the lip, on the left, like Alex's.
  const ooze = Skia.Path.Make();
  ooze.moveTo(CX - 20, 15);
  ooze.quadTo(CX - 36, 17, CX - 35, 36);
  ooze.quadTo(CX - 34, 50, CX - 25, 48);
  ooze.quadTo(CX - 17, 46, CX - 19, 34);
  ooze.quadTo(CX - 18, 25, CX - 8, 22);
  ooze.close();
  const m = tiltMatrix();
  for (const p of [flask, lip, mouth, labelClip, letters, ooze]) p.transform(m);
  return { flask, lip, mouth, label: labelClip, letters, ooze };
}

export type XpPotionProps = {
  /** Progress inside the current level, 0 to 1. */
  readonly progress: number;
  /** The current level. Higher than last time plays the level up. */
  readonly level?: number;
  /** Width of the potion in points (height is 1.2x). */
  readonly size?: number;
  /** Stop the animation clock (off screen, covered, not focused). */
  readonly paused?: boolean;
  /** What this potion showed last time (no pour-in; a lower level plays the level up). */
  readonly initial?: PotionState;
  /** Called once per change with what will play. */
  readonly onTransition?: (kind: PotionTransition) => void;
  /** Called at the burst of a level up (at once under Reduce Motion). */
  readonly onLevelUpBurst?: () => void;
  readonly style?: StyleProp<ViewStyle>;
};

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function XpPotion({
  progress,
  level = 1,
  size = 70,
  paused = false,
  initial,
  onTransition,
  onLevelUpBurst,
  style,
}: XpPotionProps) {
  const reduced = useReduceMotionPreference();
  const target = clamp01(progress);
  const scale = size / 100;
  const art = useMemo(bottlePaths, []);

  const time = useSharedValue(0);
  const acc = useSharedValue(0);
  const fill = useSharedValue(initial ? clamp01(initial.progress) : 0);
  const slosh = useSharedValue(0);
  const fizz = useSharedValue(1);
  const burst = useSharedValue(0);
  const flash = useSharedValue(0);

  const last = useRef<PotionState | null>(initial ? { level: initial.level, progress: clamp01(initial.progress) } : null);
  const cbs = useRef({ onTransition, onLevelUpBurst });
  cbs.current = { onTransition, onLevelUpBurst };

  useEffect(() => {
    const next = { level, progress: target };
    const kind = potionTransition(last.current, next, reduced);
    if (kind === 'wait') return undefined;
    last.current = next;
    cbs.current.onTransition?.(kind);
    if (reduced) {
      cancelAnimation(fill);
      fill.value = target;
      slosh.value = 0;
      burst.value = 0;
      if (kind === 'levelUp') cbs.current.onLevelUpBurst?.();
      return undefined;
    }
    if (kind === 'levelUp') {
      fill.value = withSequence(
        withTiming(1.04, { duration: 520, easing: Easing.in(Easing.quad) }),
        // Stay brimming while the drops fly, then drain and refill for the new level.
        withDelay(420, withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })),
        withDelay(160, withSpring(target, { damping: 14, stiffness: 70 })),
      );
      burst.value = 0;
      burst.value = withDelay(520, withTiming(1, { duration: 1150, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) burst.value = 0;
      }));
      flash.value = withDelay(500, withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 700 })));
      slosh.value = withSequence(withTiming(6, { duration: 300 }), withTiming(0, { duration: 1600 }));
      fizz.value = withSequence(withTiming(3, { duration: 200 }), withTiming(1, { duration: 2200 }));
      const timer = setTimeout(() => cbs.current.onLevelUpBurst?.(), 520);
      return () => clearTimeout(timer);
    }
    fill.value = withSpring(target, { damping: 12, stiffness: kind === 'pour' ? 50 : 80 });
    if (kind === 'gain' || kind === 'pour') {
      slosh.value = withSequence(withTiming(kind === 'gain' ? 5 : 3.5, { duration: 220 }), withTiming(0, { duration: 1400 }));
      fizz.value = withSequence(withTiming(kind === 'gain' ? 2.6 : 1.8, { duration: 160 }), withTiming(1, { duration: 1800 }));
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
    const apply = () => frameRef.current.setActive(!paused && reduced === false && appActive.current);
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

  const liquid = usePathValue((p) => {
    'worklet';
    const y0 = surfaceY.value;
    const t = time.value;
    const amp = 1.4 + slosh.value;
    p.moveTo(0, y0);
    for (let x = 0; x <= 110; x += 5) {
      p.lineTo(x, y0 + Math.sin(x / 11 + t * 2.6) * amp * 0.6 + Math.sin(x / 7 - t * 1.7) * amp * 0.4);
    }
    p.lineTo(110, 130);
    p.lineTo(0, 130);
    p.close();
  });

  const surfaceLine = usePathValue((p) => {
    'worklet';
    const y0 = surfaceY.value + 1.8;
    const t = time.value;
    const amp = 1.4 + slosh.value;
    for (let x = 0; x <= 110; x += 5) {
      const y = y0 + Math.sin(x / 11 + t * 2.6) * amp * 0.6 + Math.sin(x / 7 - t * 1.7) * amp * 0.4;
      if (x === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
  });

  // Rising bubbles, and a ring where each one pops at the surface.
  const bubbles = usePathValue((p) => {
    'worklet';
    const top = surfaceY.value;
    const span = FILL_BOTTOM - top;
    if (span < 8) return;
    const t = time.value;
    const k = fizz.value;
    for (let i = 0; i < BUBBLES.length; i++) {
      const b = BUBBLES[i];
      if (i >= 4 && k < 1.4) continue;
      const travel = (b.phase + t * b.speed * k) % (span + 6);
      if (travel > span - 3) continue; // popping: drawn as a ring below
      const y = FILL_BOTTOM - 5 - travel;
      const x = b.x + Math.sin(t * 2 + b.phase) * 2;
      p.addCircle(x, y, b.r * (0.8 + 0.3 * (travel / span)));
    }
  });
  const pops = usePathValue((p) => {
    'worklet';
    const top = surfaceY.value;
    const span = FILL_BOTTOM - top;
    if (span < 8) return;
    const t = time.value;
    const k = fizz.value;
    for (let i = 0; i < BUBBLES.length; i++) {
      const b = BUBBLES[i];
      if (i >= 4 && k < 1.4) continue;
      const travel = (b.phase + t * b.speed * k) % (span + 6);
      if (travel <= span - 3) continue;
      const q = (travel - (span - 3)) / 9; // 0..1 through the pop
      const x = b.x + Math.sin(t * 2 + b.phase) * 2;
      p.addCircle(x, top + 1, b.r * (1 + q * 1.6));
    }
  });
  // Every 4 s one bubble leaves through the mouth, floats up and pops.
  const escape = usePathValue((p) => {
    'worklet';
    if (fill.value < 0.25) return;
    const cycle = time.value % 4;
    if (cycle > 1.1) return;
    const q = cycle / 1.1;
    p.addCircle(MOUTH.x + Math.sin(q * 9) * 3, MOUTH.y - q * 24, 3.8);
  });
  const escapePop = usePathValue((p) => {
    'worklet';
    if (fill.value < 0.25) return;
    const cycle = time.value % 4;
    if (cycle <= 1.1 || cycle > 1.4) return;
    const q = (cycle - 1.1) / 0.3;
    p.addCircle(MOUTH.x + Math.sin(9) * 3, MOUTH.y - 24, 4 + q * 7);
  });

  // Level-up burst: big drops that shrink away (never fade to grey), and gold sparkles.
  const drops = usePathValue((p) => {
    'worklet';
    const q = burst.value;
    if (q <= 0) return;
    for (let i = 0; i < DROPS.length; i++) {
      const d = DROPS[i];
      const r = d.r * (1 - q);
      if (r < 0.6) continue;
      p.addCircle(MOUTH.x + d.vx * q * 50, MOUTH.y - d.vy * q * 60 + q * q * 80, r);
    }
  });
  const sparks = usePathValue((p) => {
    'worklet';
    const q = burst.value;
    if (q <= 0) return;
    for (let i = 0; i < SPARKS.length; i++) {
      const s = SPARKS[i];
      const e = Math.min(1, q * 1.6);
      const x = MOUTH.x + Math.cos(s.a) * s.d * e;
      const y = MOUTH.y + Math.sin(s.a) * s.d * e;
      const r = s.s * Math.sin(Math.min(1, q * 1.25) * Math.PI);
      if (r < 0.5) continue;
      // Four-point star.
      p.moveTo(x, y - r);
      p.quadTo(x, y, x + r, y);
      p.quadTo(x, y, x, y + r);
      p.quadTo(x, y, x - r, y);
      p.quadTo(x, y, x, y - r);
      p.close();
    }
  });

  const glowOpacity = useDerivedValue(() => 0.75 + Math.sin(time.value * 1.6) * 0.15 + flash.value * 0.25);

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
        style={{ position: 'absolute', left: -PAD_X * scale, top: -PAD_TOP * scale, width: canvasW, height: canvasH }}
      >
        <Group transform={[{ scale }, { translateX: PAD_X }, { translateY: PAD_TOP }]}>
          {/* Glow: a radial gradient (no blur pass), only its opacity moves */}
          <Group opacity={glowOpacity}>
            <Circle cx={CX} cy={CY - 6} r={R + 26}>
              <RadialGradient c={vec(CX, CY - 6)} r={R + 26} colors={[GLOW, 'rgba(84, 240, 92, 0)']} positions={[0.55, 1]} />
            </Circle>
          </Group>
          {/* White sticker edge, then the glass */}
          <Path path={art.flask} style="stroke" strokeWidth={13} color="#ffffff" strokeJoin="round" />
          <Path path={art.lip} style="stroke" strokeWidth={13} color="#ffffff" strokeJoin="round" />
          <Path path={art.ooze} style="stroke" strokeWidth={11} color="#ffffff" strokeJoin="round" />
          <Path path={art.flask} color={GLASS} />
          {/* Liquid, level in the world (the bottle is tilted, the surface is not) */}
          <Group clip={art.flask}>
            <Path path={liquid} color={LIQUID} />
            <Group clip={liquid}>
              <Circle cx={CX + 16} cy={CY + 20} r={34} color={LIQUID_DEEP} />
              <Path path={bubbles} color="rgba(255,255,255,0.85)" />
              <Path path={bubbles} style="stroke" strokeWidth={1.2} color="rgba(20,90,30,0.5)" />
            </Group>
            <Path path={surfaceLine} style="stroke" strokeWidth={2.8} strokeCap="round" color={LIQUID_TOP} />
            <Path path={pops} style="stroke" strokeWidth={1.4} color="rgba(255,255,255,0.9)" />
            {/* The label sits on the glass, over the liquid */}
            <Path path={art.label} color="rgba(236, 244, 210, 0.82)" />
            <Path path={art.label} style="stroke" strokeWidth={3} color={INK} />
            <Path path={art.letters} style="stroke" strokeWidth={5} strokeCap="round" strokeJoin="round" color={LABEL_INK} />
          </Group>
          {/* Gloss: a long arc and a dot on the glass */}
          <Group transform={[{ translateX: CX }, { translateY: CY }, { rotate: TILT }, { translateX: -CX }, { translateY: -CY }]}>
            <Path path={`M ${CX - 29} 66 Q ${CX - 26} 50 ${CX - 12} 44`} style="stroke" strokeWidth={6} strokeCap="round"
              color="rgba(255,255,255,0.9)" />
            <Circle cx={CX - 28} cy={76} r={3} color="rgba(255,255,255,0.9)" />
            <Path path={`M ${CX - 8} 27 L ${CX - 8} 44`} style="stroke" strokeWidth={3.6} strokeCap="round" color="rgba(255,255,255,0.8)" />
          </Group>
          {/* Ink outline, lip and ooze */}
          <Path path={art.flask} style="stroke" strokeWidth={5.4} color={INK} strokeJoin="round" />
          <Path path={art.lip} color="#e6f6ff" />
          <Path path={art.mouth} color="#9fd2f2" />
          <Path path={art.mouth} style="stroke" strokeWidth={2.4} color={INK} />
          <Path path={art.lip} style="stroke" strokeWidth={4.8} color={INK} strokeJoin="round" />
          <Path path={art.ooze} color={LIQUID} />
          <Path path={art.ooze} style="stroke" strokeWidth={3.6} color={INK} strokeJoin="round" />
          {/* An escaping bubble */}
          <Path path={escape} color="rgba(255,255,255,0.9)" />
          <Path path={escape} style="stroke" strokeWidth={1.4} color="rgba(30,110,40,0.7)" />
          <Path path={escapePop} style="stroke" strokeWidth={1.6} color="rgba(255,255,255,0.95)" />
          {/* Level-up burst */}
          <Path path={drops} color={LIQUID} />
          <Path path={drops} style="stroke" strokeWidth={3} color={INK} />
          <Path path={sparks} color={GOLD} />
          <Path path={sparks} style="stroke" strokeWidth={1.6} color="#b07800" />
        </Group>
      </Canvas>
    </View>
  );
}

export default memo(XpPotion);
