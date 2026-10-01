/**
 * StampLayer: bubble-letter stamps (CLOSE!, FEVER!, x4 COMBO, SNATCHED,
 * FINISH!) drawn in the Shark display font in 3 Skia passes:
 *   1. ink drop shadow (3 pt down, navy),
 *   2. thick outline (7 pt, #23384f, round joins),
 *   3. fill (white by default, gold for rewards).
 * Poses come from core/stamps.ts (slam with outBack, squash frame, hold,
 * drift up, fade), on this layer's own fx clock, so pass `timeScale`
 * (clock.fxScale) and a hit-stop freezes the stamp mid-slam.
 *
 *   const stamps = useRef<StampLayerHandle>(null);
 *   <StampLayer ref={stamps} width={W} height={H} timeScale={clock.fxScale} queue={{ maxLive: 1 }} />
 *   stamps.current?.push('CLOSE!', { x, y, style: 'sharky', color: '#ffcf3b' });
 *
 * Queue rules (core/stamps): FIFO by priority, `maxLive` on screen, spacing,
 * and stale items dropped. Reduced motion: no slam scale, a plain fade.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Group, Text as SkText, useFont, type SkFont } from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  STAMP_STYLES,
  createStampQueue,
  stampEnqueue,
  stampNextCheckMs,
  stampPose,
  stampTake,
  type StampItem,
  type StampQueueConfig,
  type StampStyle,
  type StampStyleName,
} from '../core/stamps';

const FONT_PX = 64;
const INK = '#23384f';
const MAX_SLOTS = 3;

export interface StampOptions {
  x?: number;
  y?: number;
  style?: StampStyleName | StampStyle;
  /** Fill colour (white default; gold for rewards, coral for danger). */
  color?: string;
  /** Cap height-ish size in pt (22 minimum, 34 default). */
  size?: number;
  priority?: number;
}

export interface StampLayerHandle {
  push(text: string, opts?: StampOptions): void;
  clear(): void;
}

export interface StampLayerProps {
  width: number;
  height: number;
  timeScale?: SharedValue<number>;
  queue?: Partial<StampQueueConfig>;
  reducedMotion?: boolean;
  /** Keep stamps inside this band (Trivia: the stage band). */
  minY?: number;
  maxY?: number;
}

interface SlotData {
  text: string;
  color: string;
}

export const StampLayer = React.memo(forwardRef<StampLayerHandle, StampLayerProps>(function StampLayer(
  { width, height, timeScale, queue, reducedMotion = false, minY = 40, maxY },
  ref,
) {
  const font = useFont(require('../../../assets/fonts/shark-random-funnyness-2.ttf'), FONT_PX);
  const clock = useSharedValue(0);
  // Per slot: start time (fx ms), x, y, scale factor, measured width, style fields.
  const slotsSv = useSharedValue<number[][]>(Array.from({ length: MAX_SLOTS }, () => [-1, 0, 0, 1, 0]));
  const stylesSv = useSharedValue<StampStyle[]>(Array.from({ length: MAX_SLOTS }, () => STAMP_STYLES.sharky));
  const [slots, setSlots] = useState<SlotData[]>(() => Array.from({ length: MAX_SLOTS }, () => ({ text: '', color: '#ffffff' })));
  const q = useRef(createStampQueue({ ...queue, maxLive: Math.min(MAX_SLOTS, queue?.maxLive ?? 1) }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotEnds = useRef<number[]>(Array.from({ length: MAX_SLOTS }, () => 0));
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  useFrameCallback((info) => {
    'worklet';
    const raw = info.timeSincePreviousFrame;
    if (raw == null) return;
    clock.value += (raw > 50 ? 50 : raw) * (timeScale ? timeScale.value : 1);
  });

  const start = useCallback((item: StampItem, now: number) => {
    let slot = slotEnds.current.findIndex((e) => e <= now);
    if (slot < 0) slot = 0;
    const style = reducedRef.current ? { ...item.style, from: 1, back: 0, squash: false, rise: 0, fromAlpha: 0 } : item.style;
    const total = style.inMs + style.holdMs + style.outMs;
    slotEnds.current[slot] = now + total;
    const k = Math.max(22, item.size) / FONT_PX * 1.35;
    const w = measure(font, item.text) * k;
    const x = Math.max(w / 2 + 8, Math.min(width - w / 2 - 8, item.x));
    const y = Math.max(minY + FONT_PX * k, Math.min(maxY ?? height - 20, item.y));
    setSlots((prev) => prev.map((s, i) => (i === slot ? { text: item.text, color: item.color } : s)));
    const startAt = clock.value;
    const next = slotsSv.value.map((row, i) => (i === slot ? [startAt, x, y, k, w] : row));
    const styles = stylesSv.value.map((st, i) => (i === slot ? style : st));
    stylesSv.value = styles;
    slotsSv.value = next;
  }, [font, width, height, minY, maxY, clock, slotsSv, stylesSv]);

  const pump = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const now = Date.now();
    let item = stampTake(q.current, now);
    while (item) {
      start(item, now);
      item = stampTake(q.current, now);
    }
    const wait = stampNextCheckMs(q.current, now);
    if (wait >= 0) timer.current = setTimeout(pump, wait + 1);
  }, [start]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useImperativeHandle(ref, () => ({
    push(text, opts = {}) {
      const style = typeof opts.style === 'string' ? STAMP_STYLES[opts.style] : opts.style ?? STAMP_STYLES.sharky;
      stampEnqueue(q.current, {
        text,
        x: opts.x ?? width / 2,
        y: opts.y ?? height * 0.4,
        style,
        color: opts.color ?? '#ffffff',
        size: opts.size ?? 34,
        priority: opts.priority ?? 0,
        pushedAt: Date.now(),
      });
      pump();
    },
    clear() {
      q.current.waiting = [];
      q.current.liveEnds = [];
      slotEnds.current = slotEnds.current.map(() => 0);
      slotsSv.value = slotsSv.value.map(() => [-1, 0, 0, 1, 0]);
    },
  }), [pump, width, height, slotsSv]);

  const children = useMemo(() => slots.map((s, i) => (
    <StampSlot key={i} index={i} data={s} font={font} clock={clock} slots={slotsSv} styles={stylesSv} />
  )), [slots, font, clock, slotsSv, stylesSv]);

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      {font ? children : null}
    </Canvas>
  );
}));

function measure(font: SkFont | null, text: string): number {
  if (!font) return text.length * FONT_PX * 0.55;
  try {
    return font.measureText(text).width;
  } catch {
    return text.length * FONT_PX * 0.55;
  }
}

function StampSlot({ index, data, font, clock, slots, styles }: {
  index: number;
  data: SlotData;
  font: SkFont | null;
  clock: SharedValue<number>;
  slots: SharedValue<number[][]>;
  styles: SharedValue<StampStyle[]>;
}) {
  const pose = useDerivedValue(() => {
    const row = slots.value[index];
    if (row[0] < 0) return null;
    return stampPose(clock.value - row[0], styles.value[index]);
  });
  const opacity = useDerivedValue(() => (pose.value && !pose.value.done ? pose.value.alpha : 0));
  const transform = useDerivedValue(() => {
    const row = slots.value[index];
    const p = pose.value;
    const k = row[3];
    const w = row[4];
    const sc = p ? p.scale * k : k;
    return [
      { translateX: row[1] },
      { translateY: row[2] + (p ? p.dy : 0) },
      { rotate: ((p ? p.rotate : 0) * Math.PI) / 180 },
      { scaleX: sc * (p ? p.sx : 1) },
      { scaleY: sc * (p ? p.sy : 1) },
      { translateX: -w / (2 * k) },
      { translateY: FONT_PX * 0.35 },
    ];
  });
  if (!font || !data.text) return null;
  return (
    <Group transform={transform} opacity={opacity}>
      <SkText x={0} y={3} text={data.text} font={font} color={INK} style="stroke" strokeWidth={7} strokeJoin="round" opacity={0.55} />
      <SkText x={0} y={0} text={data.text} font={font} color={INK} style="stroke" strokeWidth={7} strokeJoin="round" />
      <SkText x={0} y={0} text={data.text} font={font} color={data.color} />
    </Group>
  );
}
