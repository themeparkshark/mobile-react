/**
 * XpBar: the XP potion poured into a slim horizontal bar. Same green potion
 * liquid, same life, a fraction of the height (Dustin, Oct 8 2026: "make it
 * animated, horizontal and sleeker").
 *
 *   <XpBar progress={0.52} level={5} xp={{ current: 2405, needed: 4600 }} paused={!onScreen} />
 *
 * Built like Alex's pills: a thick ink outline, a white rim and a darker lip.
 *
 * - One Skia canvas and one UI-thread clock that reuses its paths. At rest it
 *   is calm (about 20 redraws a second: a gentle slosh on the liquid's front
 *   edge, two drifting bubbles, a soft shine every few seconds); during a gain
 *   or a level up it runs at the display rate with full energy.
 * - The XP numbers live on the UI thread too: they count up in a worklet, so a
 *   gain never re-renders React. The slash stays put while digits change.
 * - XP gained: the liquid surges with a slosh, a fizz and a glint on the front
 *   edge while the numbers count up.
 * - Level up: the liquid rushes to the end and fizzes, turns gold with one
 *   pulse, a gold shine sweeps along it, a small ring of gold stars puffs out
 *   of the end, LEVEL UP! shows on the bar, then it drains and refills while
 *   the new level's XP counts up. `onLevelUpBurst` fires at the burst (the
 *   caller pops the badge, plays the sound and haptic) and `onRefill` as the
 *   new level starts filling. Under Reduce Motion nothing moves: the bar fades
 *   to gold and back, with the same sound and haptic.
 * - The level-up rules are the potion's (xpPotionModel.ts): nothing is decided
 *   until the Reduce Motion answer is known, a refetch never cancels a
 *   celebration, a second level up is queued, and the refill always shows the
 *   latest XP.
 * - The clock stops when `paused`, in the background and under Reduce Motion.
 *
 * Decorative for VoiceOver: the parent row carries the label.
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
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotionPreference } from '../hooks/useReducedGameMotion';
import { BURST_AT_MS, REFILL_AT_MS, createPotionDriver, groupDigits, type PotionState, type PotionTransition } from './xpPotionModel';

const INK = '#05346e';
const LIP = '#032552';
const GLASS = '#e4f5ff';
const GLASS_DEEP = '#cbe8fb';
const LIQUID = '#3fd14a';
const LIQUID_DEEP = '#22a834';
const LIQUID_TOP = '#a6f79a';
const GOLD = '#ffcf3b';
const GOLD_DEEP = '#f0a800';
const GOLD_INK = '#b07800';

/** Bar height in points (outline included), plus the lip under it. */
export const XP_BAR_HEIGHT = 28;
export const XP_BAR_LIP = 3;
const OUTLINE = 3.5;
const RIM = 2;
const INSET = OUTLINE + RIM;
/** Room around the bar for the glow and the stars; layout reserves only the bar. */
const PAD_X = 16;
const PAD_TOP = 22;
const PAD_BOTTOM = 10;
const IDLE_FRAME_MS = 50;
const FONT_PX = 15;
/** Idle shine: one soft sweep every SHINE_EVERY seconds. */
const SHINE_EVERY = 7.5;
const SHINE_FOR = 0.9;
/** Level-up beat (ms from the burst): gold hold with one pulse, then the drain. */
const GOLD_HOLD_MS = 460;
const DRAIN_MS = 400;

const BUBBLES = [
  { phase: 0.0, speed: 18, rise: 7, r: 2.1 },
  { phase: 0.61, speed: 23, rise: 9, r: 2.4 },
  { phase: 0.37, speed: 14, rise: 6, r: 1.6 },
  { phase: 0.83, speed: 17, rise: 8, r: 1.5 },
  { phase: 0.18, speed: 21, rise: 9, r: 1.8 },
];
/** Stars puff out of the end of the bar, up and back along it: never more than ~16 pt above the bar. */
export const SPARKS = [
  { a: -2.85, d: 30, s: 6.5 },
  { a: -2.4, d: 24, s: 8 },
  { a: -1.95, d: 21, s: 7 },
  { a: -1.5, d: 19, s: 8.5 },
  { a: -1.05, d: 20, s: 7 },
  { a: -0.6, d: 18, s: 6 },
];

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export type XpNumbers = { readonly current: number; readonly needed: number };

export type XpBarProps = {
  /** Progress inside the current level, 0 to 1. */
  readonly progress: number;
  /** The current level. Higher than last time plays the level up. */
  readonly level?: number;
  /** The XP written on the bar (counts up on the UI thread). */
  readonly xp: XpNumbers;
  /** Stop the animation clock (off screen, covered, not focused). */
  readonly paused?: boolean;
  /** What this bar showed last time (no pour-in; a lower level plays the level up). */
  readonly initial?: PotionState & { readonly xp?: XpNumbers };
  /** Called once per change with what will play. */
  readonly onTransition?: (kind: PotionTransition) => void;
  /** Called at the burst of a level up (at once under Reduce Motion). */
  readonly onLevelUpBurst?: () => void;
  /** Called as the new level starts filling after a level up. */
  readonly onRefill?: () => void;
  readonly style?: StyleProp<ViewStyle>;
};

function XpBarImpl({
  progress,
  level = 1,
  xp,
  paused = false,
  initial,
  onTransition,
  onLevelUpBurst,
  onRefill,
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
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(1);
  const banner = useSharedValue(0);
  // The numbers on the bar: they lag the data through a level up and count on gains.
  const count = useSharedValue(initial?.xp ? initial.xp.current : xp.current);
  const shownNeeded = useSharedValue(initial?.xp ? initial.xp.needed : xp.needed);

  const latestXp = useRef(xp);
  latestXp.current = xp;
  const cbs = useRef({ onTransition, onLevelUpBurst, onRefill });
  cbs.current = { onTransition, onLevelUpBurst, onRefill };
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const driver = useMemo(() => createPotionDriver(
    initial ? { level: initial.level, progress: clamp01(initial.progress) } : null,
    {
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      burst: () => {
        banner.value = 1;
        if (reducedRef.current) {
          // Reduce Motion: a fade to gold and back, numbers set at once, the banner for 1.6 s.
          flash.value = withSequence(withTiming(1, { duration: 150 }), withDelay(500, withTiming(0, { duration: 300 })));
          const now = latestXp.current;
          shownNeeded.value = now.needed;
          count.value = now.current;
          if (bannerTimer.current) clearTimeout(bannerTimer.current);
          bannerTimer.current = setTimeout(() => { banner.value = 0; }, 1600);
        }
        cbs.current.onLevelUpBurst?.();
      },
      // The refill always shows the latest data, even if it changed during the celebration.
      refill: (latest) => {
        const now = latestXp.current;
        banner.value = 0;
        shownNeeded.value = now.needed;
        count.value = 0;
        count.value = withTiming(now.current, { duration: 700, easing: Easing.out(Easing.cubic) });
        fill.value = withSpring(latest.progress, { damping: 16, stiffness: 70 });
        slosh.value = withSequence(withTiming(1.4, { duration: 200 }), withTiming(0, { duration: 1200 }));
        fizz.value = withSequence(withTiming(2, { duration: 150 }), withTiming(1, { duration: 1400 }));
        cbs.current.onRefill?.();
      },
      play: (kind, next) => {
        cbs.current.onTransition?.(kind);
        const now = latestXp.current;
        if (reducedRef.current) {
          cancelAnimation(fill);
          fill.value = next.progress;
          slosh.value = 0;
          burst.value = 0;
          if (kind !== 'levelUp') {
            shownNeeded.value = now.needed;
            count.value = now.current;
          }
          return;
        }
        if (kind === 'levelUp') {
          // Anticipation: rush to the brim and fizz harder in the last 200 ms.
          fill.value = withSequence(
            withTiming(1, { duration: BURST_AT_MS, easing: Easing.in(Easing.quad) }),
            withDelay(GOLD_HOLD_MS, withTiming(0, { duration: DRAIN_MS, easing: Easing.inOut(Easing.quad) })),
          );
          slosh.value = withSequence(withTiming(0.6, { duration: BURST_AT_MS - 200 }), withTiming(2.2, { duration: 200 }),
            withTiming(0, { duration: 1300 }));
          fizz.value = withSequence(withTiming(1.4, { duration: BURST_AT_MS - 200 }), withTiming(3, { duration: 200 }),
            withTiming(1, { duration: 1800 }));
          flash.value = withSequence(
            withTiming(0.25, { duration: BURST_AT_MS - 40 }),
            withTiming(1, { duration: 40 }),
            withDelay(GOLD_HOLD_MS - 120, withTiming(0, { duration: DRAIN_MS })),
          );
          pulse.value = withDelay(BURST_AT_MS, withSequence(withTiming(1.045, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 260 })));
          sweep.value = 0;
          sweep.value = withDelay(BURST_AT_MS + 60, withTiming(1, { duration: GOLD_HOLD_MS - 60, easing: Easing.inOut(Easing.quad) }, (done) => {
            if (done) sweep.value = 0;
          }));
          burst.value = 0;
          burst.value = withDelay(BURST_AT_MS, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }, (done) => {
            if (done) burst.value = 0;
          }));
          return;
        }
        fill.value = withSpring(next.progress, { damping: 15, stiffness: kind === 'pour' ? 45 : 75 });
        shownNeeded.value = now.needed;
        if (kind === 'gain' || kind === 'pour') {
          if (kind === 'pour') count.value = 0;
          count.value = withTiming(now.current, { duration: kind === 'pour' ? 800 : 600, easing: Easing.out(Easing.cubic) });
          slosh.value = withSequence(withTiming(kind === 'gain' ? 2 : 1.3, { duration: 200 }), withTiming(0, { duration: 1300 }));
          fizz.value = withSequence(withTiming(kind === 'gain' ? 2.4 : 1.6, { duration: 160 }), withTiming(1, { duration: 1600 }));
        } else {
          count.value = now.current;
        }
        if (kind === 'gain') {
          glint.value = withDelay(120, withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 650 })));
        }
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), []);
  useEffect(() => () => {
    driver.dispose();
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, [driver]);

  useEffect(() => {
    driver.update({ level, progress: target }, reduced);
  }, [driver, target, level, reduced]);

  // The clock: UI thread. Calm at rest (about 20 redraws a second), display rate while something is happening.
  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    acc.value += Math.min(dt, 100);
    const busy = slosh.value > 0.05 || fizz.value > 1.05 || glint.value > 0 || burst.value > 0 || flash.value > 0;
    if (!busy && acc.value < IDLE_FRAME_MS) return;
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

  // Inner track (inside the outline and the white rim), in canvas space.
  const x0 = PAD_X + INSET;
  const y0 = PAD_TOP + INSET;
  const innerH = XP_BAR_HEIGHT - INSET * 2;

  // Where the liquid's front edge sits. At 0% a small living blob stays at the
  // start, so a fresh level never looks dead.
  const front = useDerivedValue(() => {
    const innerW = Math.max(1, w.value - INSET * 2);
    const base = Math.min(0.5, (innerH * 0.9) / innerW);
    const f = Math.max(0, Math.min(1, fill.value));
    return x0 + innerW * (base + f * (1 - base));
  });

  // The front edge: a smooth curve through a few points (quadratic midpoints), gentle at rest.
  const edgeX = (y: number, fx: number, t: number, amp: number) => {
    'worklet';
    return fx + Math.sin(y * 0.38 + t * 4.2) * amp * 0.65 + Math.sin(y * 0.21 - t * 2.6) * amp * 0.35;
  };
  const liquid = usePathValue((p) => {
    'worklet';
    const fx = front.value;
    const t = time.value;
    const amp = 0.6 + slosh.value * 1.6;
    const top = -2;
    const bottom = innerH + 2;
    const step = (bottom - top) / 4;
    p.moveTo(x0 - 2, y0 + top);
    let px = edgeX(top, fx, t, amp);
    let py = top;
    p.lineTo(px, y0 + py);
    for (let i = 1; i <= 4; i++) {
      const y = top + step * i;
      const x = edgeX(y, fx, t, amp);
      p.quadTo(px, y0 + py, (px + x) / 2, y0 + (py + y) / 2);
      px = x; py = y;
    }
    p.lineTo(px, y0 + py);
    p.lineTo(x0 - 2, y0 + bottom);
    p.close();
  });

  const edge = usePathValue((p) => {
    'worklet';
    const fx = front.value - 1;
    const t = time.value;
    const amp = 0.6 + slosh.value * 1.6;
    const step = innerH / 4;
    let px = edgeX(0, fx, t, amp);
    let py = 0;
    p.moveTo(px, y0);
    for (let i = 1; i <= 4; i++) {
      const y = step * i;
      const x = edgeX(y, fx, t, amp);
      p.quadTo(px, y0 + py, (px + x) / 2, y0 + (py + y) / 2);
      px = x; py = y;
    }
    p.lineTo(px, y0 + py);
  });

  // Bubbles drift along the liquid and rise a little: two at rest, more when it fizzes.
  const bubbles = usePathValue((p) => {
    'worklet';
    const len = front.value - x0 - 5;
    if (len < 10) return;
    const t = time.value;
    const k = fizz.value;
    for (let i = 0; i < BUBBLES.length; i++) {
      const b = BUBBLES[i];
      if (i >= 2 && k < 1.3) continue;
      const travel = (b.phase * len + t * b.speed * k) % len;
      const rise = ((b.phase * innerH) + t * b.rise * k) % Math.max(1, innerH - 4);
      p.addCircle(x0 + 3 + travel, y0 + innerH - 2 - rise, b.r);
    }
  });

  // A soft shine across the liquid: every few seconds at rest, and one gold sweep at a level up.
  const shine = usePathValue((p) => {
    'worklet';
    const span = front.value - x0 + 30;
    let x: number;
    if (sweep.value > 0) {
      x = x0 - 20 + sweep.value * span;
    } else {
      const phase = time.value % SHINE_EVERY;
      if (phase > SHINE_FOR) return;
      x = x0 - 20 + (phase / SHINE_FOR) * span;
    }
    p.moveTo(x + 6, y0 - 1);
    p.lineTo(x + 18, y0 - 1);
    p.lineTo(x + 10, y0 + innerH + 1);
    p.lineTo(x - 2, y0 + innerH + 1);
    p.close();
  });

  const sparks = usePathValue((p) => {
    'worklet';
    const q = burst.value;
    if (q <= 0) return;
    const cx = x0 + Math.max(1, w.value - INSET * 2) - 4;
    const cy = y0 + innerH / 2;
    for (let i = 0; i < SPARKS.length; i++) {
      const s = SPARKS[i];
      const e = Math.min(1, q * 1.6);
      const x = cx + Math.cos(s.a) * s.d * e;
      const y = cy + Math.sin(s.a) * s.d * e + q * q * 6;
      const r = s.s * Math.sin(Math.min(1, q * 1.2) * Math.PI);
      if (r < 0.6) continue;
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
  const shineColor = useDerivedValue(() => (sweep.value > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)'));

  const latestCurrent = useSharedValue(xp.current);
  useEffect(() => { latestCurrent.value = xp.current; }, [xp.current, latestCurrent]);
  // The label, formatted on the UI thread. The slash stays still while the left number counts.
  const text = useDerivedValue(() => {
    if (banner.value) return 'LEVEL UP!';
    const need = shownNeeded.value;
    return need > 0 ? `${groupDigits(count.value)} / ${groupDigits(need)} XP` : `${groupDigits(count.value)} XP`;
  });
  const textX = useDerivedValue(() => {
    const cx = PAD_X + w.value / 2;
    if (!font) return cx;
    const label = text.value;
    const slash = label.indexOf(' / ');
    if (banner.value || slash < 0) return cx - font.getTextWidth(label) / 2;
    // Centre the final label, then hold the slash where it lands.
    const right = label.slice(slash);
    const finalLeft = font.getTextWidth(groupDigits(latestCurrent.value));
    const total = finalLeft + font.getTextWidth(right);
    const slashAt = cx - total / 2 + finalLeft;
    return slashAt - font.getTextWidth(label.slice(0, slash));
  });
  const textY = PAD_TOP + XP_BAR_HEIGHT / 2 + FONT_PX * 0.36;

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const canvasW = width + PAD_X * 2;
  const canvasH = XP_BAR_HEIGHT + XP_BAR_LIP + PAD_TOP + PAD_BOTTOM;
  const innerW = Math.max(0, width - INSET * 2);
  const trackClip = useMemo(() => {
    const path = Skia.Path.Make();
    if (width > 0) path.addRRect(Skia.RRectXY(Skia.XYWHRect(x0, y0, innerW, innerH), innerH / 2, innerH / 2));
    return path;
  }, [width, x0, y0, innerW, innerH]);

  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={onLayout}
      style={[{ height: XP_BAR_HEIGHT + XP_BAR_LIP, alignSelf: 'stretch' }, style, pulseStyle]}
    >
      {width > 0 && (
        <Canvas style={{ position: 'absolute', left: -PAD_X, top: -PAD_TOP, width: canvasW, height: canvasH }}>
          {/* Gold glow behind the bar at the level-up burst (opacity only) */}
          <RoundedRect x={PAD_X - 5} y={PAD_TOP - 5} width={width + 10} height={XP_BAR_HEIGHT + XP_BAR_LIP + 10}
            r={(XP_BAR_HEIGHT + 10) / 2} color="rgba(255, 207, 59, 0.9)" opacity={glowOpacity} />
          {/* Alex's pill: dark lip, ink outline, white rim, then the glass track with a cel band */}
          <RoundedRect x={PAD_X} y={PAD_TOP + XP_BAR_LIP} width={width} height={XP_BAR_HEIGHT} r={XP_BAR_HEIGHT / 2} color={LIP} />
          <RoundedRect x={PAD_X} y={PAD_TOP} width={width} height={XP_BAR_HEIGHT} r={XP_BAR_HEIGHT / 2} color={INK} />
          <RoundedRect x={PAD_X + OUTLINE} y={PAD_TOP + OUTLINE} width={width - OUTLINE * 2} height={XP_BAR_HEIGHT - OUTLINE * 2}
            r={(XP_BAR_HEIGHT - OUTLINE * 2) / 2} color="#ffffff" />
          <Group clip={trackClip}>
            <Rect x={x0} y={y0} width={innerW} height={innerH} color={GLASS} />
            <Rect x={x0} y={deepTop} width={innerW} height={innerH} color={GLASS_DEEP} />
            {/* Liquid, cel shaded: base, a deeper bottom band, a light top band */}
            <Path path={liquid} color={LIQUID} />
            <Group clip={liquid}>
              <Rect x={x0} y={deepTop} width={innerW} height={innerH} color={LIQUID_DEEP} />
              <Rect x={x0} y={y0 + 2} width={innerW} height={2.5} color={LIQUID_TOP} opacity={0.75} />
              {/* Gold at the level up */}
              <Group opacity={goldOpacity}>
                <Rect x={x0} y={y0} width={innerW} height={innerH} color={GOLD} />
                <Rect x={x0} y={deepTop} width={innerW} height={innerH} color={GOLD_DEEP} />
              </Group>
              <Path path={bubbles} color="rgba(255,255,255,0.85)" />
              <Path path={shine} color={shineColor} />
            </Group>
            <Path path={edge} style="stroke" strokeWidth={2} strokeCap="round" color={LIQUID_TOP} />
            <Path path={edge} style="stroke" strokeWidth={4} strokeCap="round" color="#ffffff" opacity={glintOpacity} />
            {/* Glass gloss across the top */}
            <RoundedRect x={x0 + 6} y={y0 + 1.5} width={Math.max(0, innerW - 12)} height={2.6} r={1.3} color="rgba(255,255,255,0.7)" />
          </Group>
          {font ? (
            <Group>
              <SkText x={textX} y={textY} text={text} font={font} style="stroke" strokeWidth={4} strokeJoin="round" color={INK} />
              <SkText x={textX} y={textY} text={text} font={font} color="#ffffff" />
            </Group>
          ) : null}
          {/* Level-up stars */}
          <Path path={sparks} color={GOLD} />
          <Path path={sparks} style="stroke" strokeWidth={1.5} color={GOLD_INK} />
        </Canvas>
      )}
    </Animated.View>
  );
}

export default memo(XpBarImpl);
export { REFILL_AT_MS };
