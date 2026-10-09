/**
 * XpBar: the XP potion poured into a slim horizontal bar. Same green potion
 * liquid, same life, a fraction of the height (Dustin, Oct 8 2026: "make it
 * animated, horizontal and sleeker").
 *
 *   <XpBar progress={0.52} level={5} label="2,405 / 4,600 XP" paused={!onScreen} />
 *
 * - One Skia canvas, one UI-thread clock at about 30 redraws a second that
 *   reuses its paths. The liquid's front edge sloshes, a few bubbles drift
 *   through it and a soft shine sweeps across now and then.
 * - XP gained: the liquid surges forward with a slosh, a fizz and a glint on
 *   the front edge.
 * - Level up: the liquid rushes to the end, turns gold, gold stars burst from
 *   the end of the bar, then it drains and refills for the new level.
 *   `onLevelUpBurst` fires at the burst (the caller pops the level badge,
 *   plays the sound and haptic). Under Reduce Motion it fires at once and the
 *   bar stays still.
 * - The level-up rules are the potion's (xpPotionModel.ts): nothing is decided
 *   until the Reduce Motion answer is known, a refetch never cancels a
 *   celebration, and a second level up is queued.
 * - The clock stops when `paused`, in the background and under Reduce Motion.
 *
 * Decorative for VoiceOver: the parent card carries the label.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import {
  Canvas,
  Group,
  Path,
  Rect,
  RoundedRect,
  Skia,
  Text as SkText,
  useFont,
  usePathValue,
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
import { BURST_AT_MS, createPotionDriver, type PotionState, type PotionTransition } from './xpPotionModel';

const INK = '#05346e';
const GLASS = '#e4f5ff';
const GLASS_DEEP = '#cbe8fb';
const LIQUID = '#3fd14a';
const LIQUID_DEEP = '#22a834';
const LIQUID_TOP = '#a6f79a';
const GOLD = '#ffcf3b';
const GOLD_DEEP = '#f0a800';
const GOLD_INK = '#b07800';

/** Bar height in points (the outline included). */
export const XP_BAR_HEIGHT = 26;
const OUTLINE = 3;
/** Room around the bar for the glow and the level-up stars; layout reserves only the bar. */
const PAD = 16;
const FRAME_MS = 33;
const FONT_PX = 15;
/** Seconds between shine sweeps, and how long one sweep takes. */
const SHINE_EVERY = 3.4;
const SHINE_FOR = 0.8;

const BUBBLES = [
  { phase: 0.0, speed: 22, rise: 9, r: 2.2 },
  { phase: 0.37, speed: 16, rise: 7, r: 1.7 },
  { phase: 0.61, speed: 27, rise: 11, r: 2.5 },
  { phase: 0.83, speed: 19, rise: 8, r: 1.5 },
  { phase: 0.18, speed: 24, rise: 10, r: 1.9 },
];
const SPARKS = [
  { a: -2.75, d: 52, s: 10 },
  { a: -2.25, d: 60, s: 13 },
  { a: -1.75, d: 54, s: 11 },
  { a: -1.25, d: 50, s: 14 },
  { a: -0.75, d: 44, s: 10.5 },
  { a: -3.1, d: 70, s: 9 },
  { a: 2.85, d: 46, s: 8.5 },
  { a: -2.0, d: 30, s: 7 },
];

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export type XpBarProps = {
  /** Progress inside the current level, 0 to 1. */
  readonly progress: number;
  /** The current level. Higher than last time plays the level up. */
  readonly level?: number;
  /** Text drawn inside the bar (white with an ink outline), e.g. "2,405 / 4,600 XP". */
  readonly label?: string | null;
  /** Draw the label gold (the level-up beat). */
  readonly gold?: boolean;
  /** Stop the animation clock (off screen, covered, not focused). */
  readonly paused?: boolean;
  /** What this bar showed last time (no pour-in; a lower level plays the level up). */
  readonly initial?: PotionState;
  /** Called once per change with what will play. */
  readonly onTransition?: (kind: PotionTransition) => void;
  /** Called at the burst of a level up (at once under Reduce Motion). */
  readonly onLevelUpBurst?: () => void;
  readonly style?: StyleProp<ViewStyle>;
};

function XpBarImpl({
  progress,
  level = 1,
  label = null,
  gold = false,
  paused = false,
  initial,
  onTransition,
  onLevelUpBurst,
  style,
}: XpBarProps) {
  const reduced = useReduceMotionPreference();
  const target = clamp01(progress);
  const font = useFont(require('../../assets/fonts/shark-random-funnyness-2.ttf'), FONT_PX);
  const [width, setWidth] = useState(0);
  const w = useSharedValue(0);

  const time = useSharedValue(0);
  const acc = useSharedValue(0);
  const fill = useSharedValue(initial ? clamp01(initial.progress) : 0);
  const slosh = useSharedValue(0);
  const fizz = useSharedValue(1);
  const glint = useSharedValue(0);
  const burst = useSharedValue(0);
  const flash = useSharedValue(0);

  const cbs = useRef({ onTransition, onLevelUpBurst });
  cbs.current = { onTransition, onLevelUpBurst };
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const driver = useMemo(() => createPotionDriver(
    initial ? { level: initial.level, progress: clamp01(initial.progress) } : null,
    {
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      burst: () => cbs.current.onLevelUpBurst?.(),
      refill: (latest) => {
        fill.value = withSpring(latest.progress, { damping: 16, stiffness: 70 });
        slosh.value = withSequence(withTiming(1.4, { duration: 200 }), withTiming(0, { duration: 1200 }));
      },
      play: (kind, next) => {
        cbs.current.onTransition?.(kind);
        if (reducedRef.current) {
          cancelAnimation(fill);
          fill.value = next.progress;
          slosh.value = 0;
          burst.value = 0;
          flash.value = 0;
          return;
        }
        if (kind === 'levelUp') {
          fill.value = withSequence(
            withTiming(1, { duration: BURST_AT_MS, easing: Easing.in(Easing.quad) }),
            // Stay full and gold while the stars fly, then drain; the driver refills at REFILL_AT_MS.
            withDelay(560, withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })),
          );
          burst.value = 0;
          burst.value = withDelay(BURST_AT_MS, withTiming(1, { duration: 1050, easing: Easing.out(Easing.quad) }, (done) => {
            if (done) burst.value = 0;
          }));
          flash.value = withSequence(
            withTiming(0.35, { duration: BURST_AT_MS - 60 }),
            withTiming(1, { duration: 80 }),
            withDelay(480, withTiming(0, { duration: 420 })),
          );
          slosh.value = withSequence(withTiming(2.2, { duration: 300 }), withTiming(0, { duration: 1500 }));
          fizz.value = withSequence(withTiming(2.6, { duration: 200 }), withTiming(1, { duration: 2000 }));
          return;
        }
        fill.value = withSpring(next.progress, { damping: 15, stiffness: kind === 'pour' ? 45 : 75 });
        if (kind === 'gain' || kind === 'pour') {
          slosh.value = withSequence(withTiming(kind === 'gain' ? 2 : 1.3, { duration: 200 }), withTiming(0, { duration: 1300 }));
          fizz.value = withSequence(withTiming(kind === 'gain' ? 2.4 : 1.6, { duration: 160 }), withTiming(1, { duration: 1600 }));
        }
        if (kind === 'gain') {
          glint.value = withDelay(120, withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 650 })));
        }
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), []);
  useEffect(() => () => driver.dispose(), [driver]);

  useEffect(() => {
    driver.update({ level, progress: target }, reduced);
  }, [driver, target, level, reduced]);

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
    const apply = () => frameRef.current.setActive(!paused && reduced === false && appActive.current && width > 0);
    apply();
    const sub = AppState.addEventListener('change', (state) => {
      appActive.current = state === 'active';
      apply();
    });
    return () => {
      sub.remove();
      frameRef.current.setActive(false);
    };
  }, [paused, reduced, width]);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next !== width) {
      setWidth(next);
      w.value = next;
    }
  };

  // Inner track (inside the outline), in canvas space.
  const x0 = PAD + OUTLINE;
  const y0 = PAD + OUTLINE;
  const innerH = XP_BAR_HEIGHT - OUTLINE * 2;

  // Where the liquid's front edge sits. At 0% a small living blob stays at the
  // start, so a fresh level never looks dead.
  const front = useDerivedValue(() => {
    const innerW = Math.max(1, w.value - OUTLINE * 2);
    const base = Math.min(0.5, (innerH * 0.9) / innerW);
    const f = Math.max(0, Math.min(1, fill.value));
    return x0 + innerW * (base + f * (1 - base));
  });

  const liquid = usePathValue((p) => {
    'worklet';
    const fx = front.value;
    const t = time.value;
    const amp = 1.1 + slosh.value * 1.6;
    p.moveTo(x0 - 2, y0 - 2);
    for (let y = -2; y <= innerH + 2; y += 2) {
      const x = fx + Math.sin(y * 0.42 + t * 5.2) * amp * 0.65 + Math.sin(y * 0.23 - t * 3.1) * amp * 0.35;
      p.lineTo(x, y0 + y);
    }
    p.lineTo(x0 - 2, y0 + innerH + 2);
    p.close();
  });

  const edge = usePathValue((p) => {
    'worklet';
    const fx = front.value;
    const t = time.value;
    const amp = 1.1 + slosh.value * 1.6;
    for (let y = 0; y <= innerH; y += 2) {
      const x = fx - 1 + Math.sin(y * 0.42 + t * 5.2) * amp * 0.65 + Math.sin(y * 0.23 - t * 3.1) * amp * 0.35;
      if (y === 0) p.moveTo(x, y0 + y);
      else p.lineTo(x, y0 + y);
    }
  });

  // Bubbles drift along the liquid and rise a little; they only show inside it.
  const bubbles = usePathValue((p) => {
    'worklet';
    const len = front.value - x0 - 5;
    if (len < 10) return;
    const t = time.value;
    const k = fizz.value;
    for (let i = 0; i < BUBBLES.length; i++) {
      const b = BUBBLES[i];
      if (i >= 3 && k < 1.3) continue;
      const travel = (b.phase * len + t * b.speed * k) % len;
      const rise = ((b.phase * innerH) + t * b.rise * k) % (innerH - 4);
      p.addCircle(x0 + 3 + travel, y0 + innerH - 2 - rise, b.r);
    }
  });

  // A soft shine that sweeps across the liquid every few seconds.
  const shine = usePathValue((p) => {
    'worklet';
    const phase = time.value % SHINE_EVERY;
    if (phase > SHINE_FOR) return;
    const span = front.value - x0 + 30;
    const x = x0 - 20 + (phase / SHINE_FOR) * span;
    p.moveTo(x + 6, y0 - 1);
    p.lineTo(x + 16, y0 - 1);
    p.lineTo(x + 8, y0 + innerH + 1);
    p.lineTo(x - 2, y0 + innerH + 1);
    p.close();
  });

  const sparks = usePathValue((p) => {
    'worklet';
    const q = burst.value;
    if (q <= 0) return;
    const cx = x0 + Math.max(1, w.value - OUTLINE * 2) - 6;
    const cy = y0 + innerH / 2;
    for (let i = 0; i < SPARKS.length; i++) {
      const s = SPARKS[i];
      const e = Math.min(1, q * 1.5);
      const x = cx + Math.cos(s.a) * s.d * e;
      const y = cy + Math.sin(s.a) * s.d * e + q * q * 10;
      const r = s.s * Math.sin(Math.min(1, q * 1.2) * Math.PI);
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

  const deepTop = y0 + innerH * 0.6;
  const glintOpacity = useDerivedValue(() => glint.value * 0.9);
  const goldOpacity = useDerivedValue(() => flash.value);
  const glowOpacity = useDerivedValue(() => flash.value * 0.55);

  const canvasW = width + PAD * 2;
  const canvasH = XP_BAR_HEIGHT + PAD * 2;
  const trackClip = useMemo(() => {
    const path = Skia.Path.Make();
    if (width > 0) path.addRRect(Skia.RRectXY(Skia.XYWHRect(x0, y0, width - OUTLINE * 2, innerH), innerH / 2, innerH / 2));
    return path;
  }, [width, x0, y0, innerH]);

  // The label lives in shared values: the XP count-up never re-renders the canvas.
  const text = useSharedValue(label ?? '');
  const goldText = useSharedValue(gold ? 1 : 0);
  useEffect(() => { text.value = label ?? ''; }, [label, text]);
  useEffect(() => { goldText.value = gold ? 1 : 0; }, [gold, goldText]);
  const textX = useDerivedValue(() => {
    const tw = font ? font.getTextWidth(text.value) : 0;
    return PAD + (w.value - tw) / 2;
  });
  const textColor = useDerivedValue(() => (goldText.value ? GOLD : '#ffffff'));
  const textY = PAD + XP_BAR_HEIGHT / 2 + FONT_PX * 0.36;

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={onLayout}
      style={[{ height: XP_BAR_HEIGHT, alignSelf: 'stretch' }, style]}
    >
      {width > 0 && (
        <Canvas style={{ position: 'absolute', left: -PAD, top: -PAD, width: canvasW, height: canvasH }}>
          {/* Gold glow behind the bar at the level-up burst (opacity only) */}
          <RoundedRect x={PAD - 5} y={PAD - 5} width={width + 10} height={XP_BAR_HEIGHT + 10} r={(XP_BAR_HEIGHT + 10) / 2}
            color="rgba(255, 207, 59, 0.9)" opacity={glowOpacity} />
          {/* Ink outline, then the glass track with a cel band */}
          <RoundedRect x={PAD} y={PAD} width={width} height={XP_BAR_HEIGHT} r={XP_BAR_HEIGHT / 2} color={INK} />
          <Group clip={trackClip}>
            <Rect x={x0} y={y0} width={width} height={innerH} color={GLASS} />
            <Rect x={x0} y={deepTop} width={width} height={innerH} color={GLASS_DEEP} />
            {/* Liquid, cel shaded: base, a deeper bottom band, a light top band */}
            <Path path={liquid} color={LIQUID} />
            <Group clip={liquid}>
              <Rect x={x0} y={deepTop} width={width} height={innerH} color={LIQUID_DEEP} />
              <Rect x={x0} y={y0 + 2} width={width} height={3} color={LIQUID_TOP} opacity={0.75} />
              {/* Gold at the level up */}
              <Group opacity={goldOpacity}>
                <Rect x={x0} y={y0} width={width} height={innerH} color={GOLD} />
                <Rect x={x0} y={deepTop} width={width} height={innerH} color={GOLD_DEEP} />
              </Group>
              <Path path={bubbles} color="rgba(255,255,255,0.85)" />
              <Path path={shine} color="rgba(255,255,255,0.4)" />
            </Group>
            <Path path={edge} style="stroke" strokeWidth={2} strokeCap="round" color={LIQUID_TOP} />
            <Path path={edge} style="stroke" strokeWidth={4} strokeCap="round" color="#ffffff" opacity={glintOpacity} />
            {/* Glass gloss across the top */}
            <RoundedRect x={x0 + 7} y={y0 + 2} width={Math.max(0, width - OUTLINE * 2 - 14)} height={3.2} r={1.6}
              color="rgba(255,255,255,0.7)" />
          </Group>
          {font ? (
            <Group>
              <SkText x={textX} y={textY} text={text} font={font} style="stroke" strokeWidth={4} strokeJoin="round" color={INK} />
              <SkText x={textX} y={textY} text={text} font={font} color={textColor} />
            </Group>
          ) : null}
          {/* Level-up stars */}
          <Path path={sparks} color={GOLD} />
          <Path path={sparks} style="stroke" strokeWidth={1.5} color={GOLD_INK} />
        </Canvas>
      )}
    </View>
  );
}

export default memo(XpBarImpl);
