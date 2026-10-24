/**
 * <RollingNumber>: a number that rolls like an odometer instead of jumping.
 *
 *   <RollingNumber value={coins} style={styles.coinsText} />
 *   <RollingNumber value={xp} format={n => `${n} XP`} />
 *
 * On a change every digit column rolls to its new digit on the UI thread (COUNT.ms, EASE.out),
 * the ones column first and each column to its left COUNT.digitStaggerMs later, then the
 * number lands with a COUNT.finalBump on SPRING.stamp. Gains roll up, losses roll down.
 * A big jump (over 10,000) rolls only the top columns; the rest snap.
 * The first value on screen never rolls (a screen load is silent and still).
 * Reduce Motion: the new number is simply there.
 * Transforms only (no per-frame React render, no layout animation).
 */
import { memo, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring,
  withTiming } from 'react-native-reanimated';
import { COUNT, EASE, HUD_BUMP } from './motionEasing';
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
}

export const defaultFormat = (value: number) => Math.round(value).toLocaleString('en-US');

export interface RollColumn {
  /** The character shown at rest in this slot. */
  readonly char: string;
  /** For digits: where the strip starts and ends (0 to 19, two stacked 0-9 runs). Null for commas and letters. */
  readonly from: number | null;
  readonly to: number | null;
  /** When this column starts rolling (ms). */
  readonly delay: number;
}

const isDigit = (c: string) => c >= '0' && c <= '9';

/**
 * Plan the roll from one printed number to another, right-aligned so the ones column lines up.
 * Pure, so it is unit tested. Columns that do not change do not move.
 */
export function planRoll(fromText: string, toText: string, rising: boolean, bigJump: boolean): RollColumn[] {
  const width = toText.length;
  const padded = fromText.length >= width ? fromText.slice(fromText.length - width) : fromText.padStart(width, ' ');
  const digitsTotal = [...toText].filter(isDigit).length;
  let digitIndexFromRight = 0;
  const out: RollColumn[] = new Array(width);
  for (let i = width - 1; i >= 0; i--) {
    const c = toText[i];
    if (!isDigit(c)) { out[i] = { char: c, from: null, to: null, delay: 0 }; continue; }
    const d1 = Number(c);
    const prev = padded[i];
    const d0 = isDigit(prev) ? Number(prev) : 0;
    const k = digitIndexFromRight++;
    // A big jump rolls only the top two columns; the rest snap to their new digit.
    const rolls = d0 !== d1 && (!bigJump || k >= digitsTotal - 2);
    let from = d0;
    let to = d1;
    if (rolls) {
      // Gains roll up through 9 to 0, losses roll down: the strip has two runs of 0-9.
      if (rising) { if (to < from) to += 10; } else if (from < to) from += 10;
    } else { from = d1; to = d1; }
    out[i] = { char: c, from, to, delay: rolls ? k * COUNT.digitStaggerMs : 0 };
  }
  return out;
}

const STRIP = '01234567890123456789'.split('');

function RollingNumber({ value, format = defaultFormat, style, maxFontSizeMultiplier = 1.3, bump = true, onLanded }: RollingNumberProps) {
  const reduced = useUiReducedMotion();
  const text = format(value);
  const previous = useRef<{ text: string; value: number } | null>(null);
  const plan = useRef<RollColumn[]>([]);
  const rollId = useRef(0);
  const scale = useSharedValue(1);

  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? 16;
  const lineHeight = flat.lineHeight ?? Math.round(fontSize * 1.25);

  // Work out this render's roll before the columns render, so they start where the old number was.
  if (previous.current === null) {
    plan.current = [...text].map(char => ({ char, from: isDigit(char) ? Number(char) : null, to: isDigit(char) ? Number(char) : null, delay: 0 }));
  } else if (previous.current.text !== text) {
    const rising = value >= previous.current.value;
    const big = Math.abs(value - previous.current.value) > 10_000;
    plan.current = reduced
      ? [...text].map(char => ({ char, from: isDigit(char) ? Number(char) : null, to: isDigit(char) ? Number(char) : null, delay: 0 }))
      : planRoll(previous.current.text, text, rising, big);
    rollId.current += 1;
  }

  useEffect(() => {
    const first = previous.current === null;
    const changed = !first && previous.current!.text !== text;
    previous.current = { text, value };
    if (!changed || reduced) return undefined;
    const longest = plan.current.reduce((m, c) => Math.max(m, c.delay), 0) + COUNT.ms;
    if (bump) {
      cancelAnimation(scale);
      scale.value = withDelay(longest - 60, withSequence(withTiming(COUNT.finalBump, { duration: 90 }), withSpring(1, HUD_BUMP.spring)));
    }
    if (onLanded) {
      const t = setTimeout(onLanded, longest);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [text, value, reduced, bump, onLanded, scale]);

  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const textStyle: StyleProp<TextStyle> = [style, { lineHeight, includeFontPadding: false }];

  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center' }, bumpStyle]}
      accessible accessibilityRole="text" accessibilityLabel={text}>
      {plan.current.map((col, i) => col.from === null || col.to === null
        ? <Text key={`c${plan.current.length - i}`} maxFontSizeMultiplier={maxFontSizeMultiplier} style={textStyle}>{col.char}</Text>
        : <DigitColumn key={`d${plan.current.length - i}`} col={col} rollId={rollId.current} lineHeight={lineHeight}
          textStyle={textStyle} maxFontSizeMultiplier={maxFontSizeMultiplier} />)}
    </Animated.View>
  );
}

function DigitColumn({ col, rollId, lineHeight, textStyle, maxFontSizeMultiplier }: {
  readonly col: RollColumn; readonly rollId: number; readonly lineHeight: number;
  readonly textStyle: StyleProp<TextStyle>; readonly maxFontSizeMultiplier: number;
}) {
  const pos = useSharedValue(col.from ?? 0);
  const lastRoll = useRef(rollId);
  useEffect(() => {
    if (col.from === null || col.to === null) return;
    if (lastRoll.current === rollId && pos.value === col.to) return;
    lastRoll.current = rollId;
    cancelAnimation(pos);
    if (col.from === col.to) { pos.value = col.to; return; }
    pos.value = col.from;
    const rest = col.to % 10;
    pos.value = withDelay(col.delay, withTiming(col.to, { duration: COUNT.ms, easing: EASE.out }, done => {
      if (done) pos.value = rest;
    }));
  }, [rollId, col.from, col.to, col.delay, pos]);
  const strip = useAnimatedStyle(() => ({ transform: [{ translateY: -pos.value * lineHeight }] }));
  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      {/* The resting digit sizes the column; the strip rolls over it. */}
      <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={[textStyle, { opacity: 0 }]}>{col.char}</Text>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, strip]}>
        {STRIP.map((d, i) => <Text key={i} maxFontSizeMultiplier={maxFontSizeMultiplier}
          style={[textStyle, { textAlign: 'center', height: lineHeight }]}>{d}</Text>)}
      </Animated.View>
    </View>
  );
}

export default memo(RollingNumber);
