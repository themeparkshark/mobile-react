/**
 * <RollingNumber>: a number that rolls like a real odometer instead of jumping.
 *
 *   <RollingNumber value={coins} style={styles.coinsText} />
 *
 * One value rolls, never separate columns: on a change a single number `v` runs from the old value
 * to the new one on the UI thread (COUNT.ms, EASE.out), and every digit wheel is worked out from
 * `v` the way a car odometer's wheels are geared together. The ones wheel turns with `v`; a wheel to
 * its left only moves while every wheel to its right is turning over from 9 to 0, on the same frame.
 * So every frame reads as a number between the old and the new value (690 to 715 passes 699, 700,
 * 701, never 603), and a gain never looks like a loss.
 * Whole digits hold for most of every step, then slide (an odometer tick); sliding digits stretch a
 * little with speed. A change that arrives mid-roll carries on from where the wheels are (one longer
 * roll, never a restart from the old number). The number lands with a COUNT.finalBump on SPRING.stamp.
 * The first value on screen never rolls (a screen load is silent and still).
 * `celebrate`: the digits of a gain the player just earned glow gold and land with a selection tick;
 * a loss glows a calm sky blue (never red) and lands quietly. Digits only: no box behind them.
 * `hold`: keep showing the last number (for example while a sheet covers the wallet); when the hold
 * lifts, it rolls to the new number where the kid can see it.
 * `gate`: roll only once it reaches 1 (set on the UI thread, for example by the first coin landing).
 * Formats that are not plain whole numbers with separators (12.4K) never roll: they change in place
 * with the bump. Reduce Motion: the new number is simply there.
 * Transforms and opacity only, all timing on the UI thread (no per-frame React render, no JS timers).
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring,
  withTiming, type SharedValue } from 'react-native-reanimated';
import { queueHaptic } from '../gamekit/Haptics';
import { COUNT, EASE, GOLD_FX, HUD_BUMP } from './motionEasing';
import useUiReducedMotion from './useUiReducedMotion';

export interface RollingNumberProps {
  readonly value: number;
  /** How to print the number (default: whole number with commas). */
  readonly format?: (value: number) => string;
  readonly style?: StyleProp<TextStyle>;
  readonly maxFontSizeMultiplier?: number;
  /** Bump when it lands (default true). */
  readonly bump?: boolean;
  /** Called when a roll finishes (JS). */
  readonly onLanded?: () => void;
  /** A change the player just caused: a light flash and, for gains, a landing tick. */
  readonly celebrate?: boolean;
  /** Keep the last number on screen until this turns false, then roll. */
  readonly hold?: boolean;
  /** Wait this long (ms, on the UI thread) before the digits start rolling, e.g. while coins fly in. */
  readonly startDelayMs?: number;
  /**
   * Roll only once this reaches 1 (set on the UI thread, for example by the first coin landing in the
   * wallet), so the digits answer the coins on the same frame however busy the JS thread is.
   */
  readonly gate?: SharedValue<number>;
}

/** Rolling digit look: the clip is the glyph height, the rolling strip stretches a little with speed. */
export const ROLL_LOOK = {
  /** The clip window as a share of the font size (digits have no descenders). */
  clipEm: 1.0,
  /** Gap between digits on the strip, as a share of the line height (none: a sliding digit never shows an empty slot). */
  cellGap: 0,
  /**
   * The roll ticks: each step holds a whole digit for this share of its time, then slides to the next.
   * So almost every frame of a roll reads as a number (never blank or half glyphs for long).
   */
  holdShare: 0.55,
  /** How much the rolling digits stretch at full speed. */
  stretch: 0.16,
  /** The digit glow at its peak (share of the way to the flash colour). */
  flashPeak: 1,
  gainFlash: GOLD_FX.glow,
  lossFlash: '#bfe5ff',
} as const;

export const defaultFormat = (value: number) => Math.round(value).toLocaleString('en-US');

const isDigit = (c: string) => c >= '0' && c <= '9';

/**
 * True when `format` prints whole numbers place by place (digits plus separators such as commas),
 * so the wheels can be geared to the value. 12.4K or -5 are not: those change in place. Pure.
 */
export function positionalFormat(format: (value: number) => string, values: readonly number[]): boolean {
  return values.every(v => Number.isInteger(v) && v >= 0 && format(v).replace(/[^0-9]/g, '') === String(v)
    && /^[0-9][0-9,.\s ']*$/.test(format(v)));
}

export interface WheelColumn {
  /** 'digit' wheels show the value at `place` (1, 10, 100...); 'sep' is a separator such as a comma. */
  readonly kind: 'digit' | 'sep';
  readonly char: string;
  /** Digit: its own place. Separator: the place of the digit just to its left (it shows when that digit does). */
  readonly place: number;
  /** Digit: this wheel turns during the roll (its whole-number part changes), so it is sized for any digit. */
  readonly turns: boolean;
}

/**
 * The wheels for a roll between two values: the longer of the two printed numbers, right-aligned.
 * Pure (unit tested).
 */
export function wheelColumns(fromText: string, toText: string, from: number, to: number): WheelColumn[] {
  const text = fromText.length > toText.length ? fromText : toText;
  const out: WheelColumn[] = new Array(text.length);
  let place = 1;
  let lastDigitPlace = 1;
  for (let i = text.length - 1; i >= 0; i--) {
    const c = text[i];
    if (isDigit(c)) {
      out[i] = { kind: 'digit', char: c, place, turns: Math.floor(from / place) !== Math.floor(to / place) };
      lastDigitPlace = place;
      place *= 10;
    } else {
      out[i] = { kind: 'sep', char: c, place: lastDigitPlace * 10, turns: false };
    }
  }
  return out;
}

/**
 * The odometer tick: a step holds its whole digit for ROLL_LOOK.holdShare of the way, then slides
 * on a smoothstep. Pure worklet: tickPos(3.2) is 3, tickPos(3.9) is between 3 and 4.
 */
const HOLD_SHARE: number = ROLL_LOOK.holdShare;
export function tickPos(p: number, holdShare?: number): number {
  'worklet';
  const hold = holdShare === undefined ? HOLD_SHARE : holdShare;
  const base = Math.floor(p);
  const f = p - base;
  if (f <= hold) return base;
  const u = (f - hold) / (1 - hold);
  return base + u * u * (3 - 2 * u);
}
/** How fast the strip is sliding at p (0 holding, 1 mid-slide), for the speed stretch. Pure worklet. */
export function tickSlide(p: number, holdShare?: number): number {
  'worklet';
  const hold = holdShare === undefined ? HOLD_SHARE : holdShare;
  const f = p - Math.floor(p);
  if (f <= hold) return 0;
  const u = (f - hold) / (1 - hold);
  return Math.sin(u * Math.PI);
}

/**
 * Where the wheel for `place` sits when the whole number reads `v` (0 to 10 on the strip; 9.4 is a
 * 9 sliding toward the next 0). Geared like a car odometer: the wheel only moves while every wheel
 * to its right is on its last step (9 turning over to 0), and it moves exactly with the ones wheel.
 * Pure worklet (unit tested).
 */
/**
 * The shared slide of the carried wheels, snapped to 1/4096 (far under a pixel; a power of two, so
 * 9 + slide and 0 + slide round the same way and every carried wheel turns over on the same frame).
 */
function wheelSlide(f: number): number {
  'worklet';
  return Math.round(tickPos(f) * 4096) / 4096;
}

export function wheelPos(v: number, place: number): number {
  'worklet';
  // Whole-number maths for the gearing (exact), and one shared fraction for every carried wheel, so
  // all of them slide on exactly the same frame.
  const n = Math.floor(v);
  const q = Math.floor(n / place);
  const carrying = n - q * place === place - 1;
  return (q % 10) + (carrying ? wheelSlide(v - n) : 0);
}

/** A leading wheel (or the separator next to it) fades in as its 1 turns up, like a blank wheel. Pure worklet. */
export function wheelOpacity(v: number, place: number): number {
  'worklet';
  const n = Math.floor(v);
  if (place <= 1 || n >= place) return 1;
  return n === place - 1 ? wheelSlide(v - n) : 0;
}

/** The number a kid reads off the wheels at `v` ('floor': the digit leaving, 'round': the one mostly showing). Pure, for tests. */
export function readWheels(v: number, columns: readonly WheelColumn[], mode: 'floor' | 'round'): number {
  let n = 0;
  for (const col of columns) {
    if (col.kind !== 'digit' || wheelOpacity(v, col.place) < 0.5) continue;
    const p = wheelPos(v, col.place);
    const d = (mode === 'floor' ? Math.floor(p) : Math.round(p)) % 10;
    n += d * col.place;
  }
  return n;
}

const STRIP = '01234567890'.split('');

function RollingNumber({ value: incoming, format = defaultFormat, style, maxFontSizeMultiplier = 1.3, bump = true, onLanded,
  celebrate = false, hold = false, startDelayMs = 0, gate }: RollingNumberProps) {
  const reduced = useUiReducedMotion();
  // While held, the last number stays put; the roll plays when the hold lifts.
  const heldValue = useRef(incoming);
  if (!hold) heldValue.current = incoming;
  const value = hold ? heldValue.current : incoming;
  const text = format(value);
  /** The whole number the wheels show, rolled on the UI thread. */
  const v = useSharedValue(value);
  const flash = useSharedValue(0);
  const scale = useSharedValue(1);
  /** A gated roll waits here (1) until the gate opens; then it rolls from the UI thread. */
  const armed = useSharedValue(0);
  const target = useSharedValue(value);
  const rising = useRef(true);
  const previous = useRef<number | null>(null);
  // The roll's wheels: from where the wheels are now to the new value. They stay laid out for that roll
  // until the next change, except a roll down that dropped a column (1,000 to 990), which settles.
  const roll = useRef<{ from: number; to: number } | null>(null);
  const [, setSettled] = useState(0);

  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? 16;
  const lineHeight = flat.lineHeight ?? Math.round(fontSize * 1.25);

  const changed = previous.current !== null && previous.current !== value;
  const positional = positionalFormat(format, [value, previous.current ?? value]);
  if (changed && positional && !reduced) {
    // Mid-roll: carry on from wherever the wheels are (one longer roll, never a restart).
    const from = roll.current ? Math.round(v.value) : previous.current!;
    rising.current = value >= from;
    roll.current = { from, to: value };
  } else if (changed) {
    rising.current = value >= (previous.current ?? value);
    roll.current = null;
  }
  const columns = roll.current
    ? wheelColumns(format(Math.max(roll.current.from, roll.current.to)), text, roll.current.from, roll.current.to)
    : positional ? wheelColumns(text, text, value, value) : null;

  const landedJs = (gain: boolean, landedValue: number) => {
    if (celebrate && gain) queueHaptic('tickSelection');
    onLanded?.();
    // The wheels keep their roll layout after landing (a re-layout here re-committed a stale wheel
    // transform for one frame: 714 after 715). Only a roll down that dropped a column (1,000 to 990)
    // re-lays out, so no blank wheel is left on the left.
    const r = roll.current;
    if (r && r.to === landedValue && format(r.to).length < format(Math.max(r.from, r.to)).length) { roll.current = null; setSettled(n => n + 1); }
  };

  const startRoll = (to: number, delay: number, gain: boolean) => {
    'worklet';
    const landing = () => {
      'worklet';
      if (bump) scale.value = withSequence(withTiming(COUNT.finalBump, { duration: 90 }), withSpring(1, HUD_BUMP.spring));
      if (celebrate) flash.value = withTiming(0, { duration: 360, easing: EASE.in });
      runOnJS(landedJs)(gain, to);
    };
    if (celebrate) flash.value = withDelay(delay, withTiming(1, { duration: 120, easing: EASE.out }));
    v.value = withDelay(delay, withTiming(to, { duration: COUNT.ms, easing: EASE.out }, done => {
      if (done) landing();
    }));
  };

  useAnimatedReaction(() => (gate ? gate.value >= 1 && armed.value === 1 : false), (ready, was) => {
    if (!ready || was) return;
    armed.value = 0;
    startRoll(target.value, 0, target.value >= v.value);
  });

  useEffect(() => {
    const first = previous.current === null;
    const didChange = !first && previous.current !== value;
    previous.current = value;
    if (!didChange) return;
    const gain = rising.current;
    if (reduced || !roll.current) {
      // Reduce Motion, or a format that cannot roll: the new number is simply there (a bump says it changed).
      cancelAnimation(v); armed.value = 0;
      v.value = value;
      if (!reduced && bump) {
        cancelAnimation(scale);
        scale.value = withSequence(withTiming(COUNT.finalBump, { duration: 90 }), withSpring(1, HUD_BUMP.spring));
      }
      landedJs(gain, value);
      return;
    }
    target.value = value;
    if (gate && gate.value < 1) {
      // Wait for the gate; a roll already running keeps going toward its old number until then.
      armed.value = 1;
      return;
    }
    armed.value = 0;
    startRoll(value, startDelayMs, gain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);

  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const flashColor = rising.current ? ROLL_LOOK.gainFlash : ROLL_LOOK.lossFlash;
  // The glow is a second, flash-coloured copy of each digit strip faded in on top (one opacity per column),
  // never an animated text colour on every digit cell.
  // Stable across re-renders that change nothing (a parent's inline style object): a wheel face that
  // re-renders lets React commit its first-mount transform for a frame, which showed a stale digit (714 after 715).
  const styleKey = JSON.stringify(flat);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const textStyle: StyleProp<TextStyle> = useMemo(() => [flat, { lineHeight, includeFontPadding: false }], [styleKey, lineHeight]);

  if (!columns) {
    return (
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center' }, bumpStyle]} accessible accessibilityRole="text" accessibilityLabel={text}>
        <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={textStyle}>{text}</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center' }, bumpStyle]}
      accessible accessibilityRole="text" accessibilityLabel={text}>
      {columns.map((col, i) => col.kind === 'sep'
        ? <Separator key={`s${columns.length - i}`} char={col.char} place={col.place} v={v} textStyle={textStyle} maxFontSizeMultiplier={maxFontSizeMultiplier} />
        : <DigitWheel key={`d${col.place}`} col={col} v={v} lineHeight={lineHeight} fontSize={fontSize} textStyle={textStyle}
          flash={celebrate ? flash : undefined} flashColor={flashColor} maxFontSizeMultiplier={maxFontSizeMultiplier} />)}
    </Animated.View>
  );
}

const Separator = memo(function Separator({ char, place, v, textStyle, maxFontSizeMultiplier }: {
  readonly char: string; readonly place: number; readonly v: SharedValue<number>; readonly textStyle: StyleProp<TextStyle>;
  readonly maxFontSizeMultiplier: number;
}) {
  const fade = useAnimatedStyle(() => ({ opacity: wheelOpacity(v.value, place) }));
  return <Animated.Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[textStyle, fade]}>{char}</Animated.Text>;
});

/** Sizing for a wheel that turns: as wide as the widest digit, so no digit is clipped while it passes. */
const WidestDigit = memo(function WidestDigit({ textStyle, lineHeight, maxFontSizeMultiplier }: {
  readonly textStyle: StyleProp<TextStyle>; readonly lineHeight: number; readonly maxFontSizeMultiplier: number;
}) {
  return (
    <View style={{ height: lineHeight, overflow: 'hidden', opacity: 0 }}>
      {STRIP.slice(0, 10).map(d => <Text key={d} maxFontSizeMultiplier={maxFontSizeMultiplier} style={textStyle}>{d}</Text>)}
    </View>
  );
});

function DigitWheel({ col, v, lineHeight, fontSize, textStyle, flash, flashColor, maxFontSizeMultiplier }: {
  readonly col: WheelColumn; readonly v: SharedValue<number>; readonly lineHeight: number; readonly fontSize: number;
  readonly textStyle: StyleProp<TextStyle>; readonly flash?: SharedValue<number>; readonly flashColor: string;
  readonly maxFontSizeMultiplier: number;
}) {
  return (
    <View style={{ height: lineHeight }}>
      {/* The resting digit sizes a still wheel; a turning wheel is as wide as the widest digit. The face rolls over it. */}
      {col.turns
        ? <WidestDigit textStyle={textStyle} lineHeight={lineHeight} maxFontSizeMultiplier={maxFontSizeMultiplier} />
        : <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[textStyle, { opacity: 0 }]}>{col.char}</Text>}
      <WheelFace place={col.place} v={v} lineHeight={lineHeight} fontSize={fontSize} textStyle={textStyle} flash={flash}
        flashColor={flashColor} maxFontSizeMultiplier={maxFontSizeMultiplier} />
    </View>
  );
}

/**
 * The rolling face of one wheel. Memoized on stable props, so a re-render that only resizes the wheel
 * (or a parent re-render) never re-commits its animated transform; the UI thread alone moves it.
 */
const WheelFace = memo(function WheelFace({ place, v, lineHeight, fontSize, textStyle, flash, flashColor, maxFontSizeMultiplier }: {
  readonly place: number; readonly v: SharedValue<number>; readonly lineHeight: number; readonly fontSize: number;
  readonly textStyle: StyleProp<TextStyle>; readonly flash?: SharedValue<number>; readonly flashColor: string;
  readonly maxFontSizeMultiplier: number;
}) {
  // The clip is the glyph's own height, centred on the line, so no neighbour digit peeks out of a pill.
  const clipH = Math.min(lineHeight, Math.ceil(fontSize * ROLL_LOOK.clipEm));
  const cell = lineHeight * (1 + ROLL_LOOK.cellGap);
  const inset = (lineHeight - clipH) / 2;
  const strip = useAnimatedStyle(() => ({ transform: [{ translateY: -wheelPos(v.value, place) * cell - (cell - lineHeight) / 2 - inset }] }));
  const wheel = useAnimatedStyle(() => {
    const p = wheelPos(v.value, place);
    // The digit stretches a little while it slides (a whole digit holds unstretched), like a smear on a spinning wheel.
    const slide = p - Math.floor(p);
    return { opacity: wheelOpacity(v.value, place), transform: [{ scaleY: 1 + ROLL_LOOK.stretch * Math.sin(slide * Math.PI) }] };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: flash ? flash.value * ROLL_LOOK.flashPeak : 0 }));
  const glowText = useMemo(() => [textStyle, { color: flashColor }], [textStyle, flashColor]);
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: inset, height: clipH, overflow: 'hidden' }, wheel]}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, strip]}>
        <DigitStrip cell={cell} lineHeight={lineHeight} textStyle={textStyle} maxFontSizeMultiplier={maxFontSizeMultiplier} />
        {flash && <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
          <DigitStrip cell={cell} lineHeight={lineHeight} textStyle={glowText} maxFontSizeMultiplier={maxFontSizeMultiplier} />
        </Animated.View>}
      </Animated.View>
    </Animated.View>
  );
});

/** The 0 to 9 then 0 digit strip (static text; only its parent moves). */
const DigitStrip = memo(function DigitStrip({ cell, lineHeight, textStyle, maxFontSizeMultiplier }: {
  readonly cell: number; readonly lineHeight: number; readonly textStyle: StyleProp<TextStyle>; readonly maxFontSizeMultiplier: number;
}) {
  return <>{STRIP.map((d, i) => <View key={i} style={{ height: cell, justifyContent: 'center' }}>
    <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[textStyle, { textAlign: 'center', height: lineHeight }]}>{d}</Text>
  </View>)}</>;
});

export default memo(RollingNumber);
