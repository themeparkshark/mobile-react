/**
 * The one callout queue on screen (design v7.1 11.10): at most one drawn hero
 * wordmark (K10, 2 boil frames at 12 fps) in the hero zone over the boss's
 * upper body, and one small callout (display font, white fill, 3 pt navy
 * line, 2 pt drop) in the lane above its head. Rules live in callouts.ts;
 * this only draws the queue's state on the UI thread from the fx clock, so
 * hit-stop freezes callouts with the arena.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  Canvas, Group, Paint, Rect, Text as SkText, useFont,
} from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  POP_OUT_MS, calloutZones, emptyCallouts, holdRibbon, pushCallout, visibleCallouts, type CalloutSpec, type Wordmark,
} from './callouts';

const WM: Record<Wordmark, [number, number]> = {
  perfect: [require('../../assets/games/boss/wm/perfect_f0.png'), require('../../assets/games/boss/wm/perfect_f1.png')],
  break: [require('../../assets/games/boss/wm/break_f0.png'), require('../../assets/games/boss/wm/break_f1.png')],
  finish: [require('../../assets/games/boss/wm/finish_f0.png'), require('../../assets/games/boss/wm/finish_f1.png')],
  knockout: [require('../../assets/games/boss/wm/knockout_f0.png'), require('../../assets/games/boss/wm/knockout_f1.png')],
  getup: [require('../../assets/games/boss/wm/getup_f0.png'), require('../../assets/games/boss/wm/getup_f1.png')],
  teamstrike: [require('../../assets/games/boss/wm/teamstrike_f0.png'), require('../../assets/games/boss/wm/teamstrike_f1.png')],
  fury: [require('../../assets/games/boss/wm/fury_f0.png'), require('../../assets/games/boss/wm/fury_f1.png')],
  nice: [require('../../assets/games/boss/wm/nice_f0.png'), require('../../assets/games/boss/wm/nice_f1.png')],
  great: [require('../../assets/games/boss/wm/great_f0.png'), require('../../assets/games/boss/wm/great_f1.png')],
  superb: [require('../../assets/games/boss/wm/superb_f0.png'), require('../../assets/games/boss/wm/superb_f1.png')],
};
export const WORDMARK_SRC = WM;
const WM_KEYS = Object.keys(WM) as Wordmark[];
/** Hero wordmark widths (pt) before the per-callout scale. */
const WM_W: Record<Wordmark, number> = {
  perfect: 236, break: 224, finish: 230, knockout: 296, getup: 220, teamstrike: 296, fury: 190, nice: 170, great: 210, superb: 230,
};

const NAVY = '#1B2A4A';
const TONE: Record<string, string> = { white: '#FFFFFF', coral: '#FF6B5C', lime: '#7BD94A' };
const SMALL_PX = 26;

/** UI-thread snapshot of the visible queue. */
interface Shown {
  id: number;
  at: number;
  ms: number;
  wm: number; // index into WM_KEYS, -1 text
  text: string;
  tone: string;
  underline: boolean;
  scale: number;
  slam: boolean;
  /** Pop-out start (fx ms) when replaced, -1 none. */
  out: number;
}
interface QueueView { hero: Shown | null; small: Shown | null; prevHero: Shown | null; prevSmall: Shown | null }

export interface CalloutLayerHandle {
  show: (spec: CalloutSpec) => void;
  ribbon: (ms: number) => void;
  clear: () => void;
}

interface Props { width: number; height: number; fx: SharedValue<number>; cx?: number }

function toShown(c: ReturnType<typeof visibleCallouts>['hero']): Shown | null {
  if (!c) return null;
  return {
    id: c.id, at: c.at, ms: c.ms, wm: c.wordmark ? WM_KEYS.indexOf(c.wordmark) : -1, text: c.text, tone: TONE[c.tone ?? 'white'],
    underline: !!c.underline, scale: c.scale ?? 1, slam: c.entry === 'slam', out: -1,
  };
}

export const CalloutLayer = forwardRef<CalloutLayerHandle, Props>(function CalloutLayer({ width, height, fx, cx }, ref) {
  const z = useMemo(() => calloutZones(width, height), [width, height]);
  const state = useRef(emptyCallouts());
  const q = useSharedValue<QueueView>({ hero: null, small: null, prevHero: null, prevSmall: null });
  const font = useFont(require('../../../assets/fonts/shark-random-funnyness-2.ttf'), SMALL_PX);
  const midX = cx ?? width / 2;

  const [heroNow, setHeroNow] = useState<Shown | null>(null);
  const publish = (now: number) => {
    const v = visibleCallouts(state.current, now);
    const h = toShown(v.hero);
    setHeroNow((cur) => (cur && h && cur.id === h.id ? cur : h));
    const prev = q.value;
    const hero = toShown(v.hero);
    const small = toShown(v.small);
    const outOf = (old: Shown | null, next: Shown | null) => (old && (!next || next.id !== old.id) && now < old.at + old.ms ? { ...old, out: now } : null);
    q.value = { hero, small, prevHero: outOf(prev.hero, hero), prevSmall: outOf(prev.small, small) };
  };

  useImperativeHandle(ref, () => ({
    show: (spec) => {
      const now = fx.value;
      const r = pushCallout(state.current, spec, now);
      if (r !== 'dropped') publish(now);
    },
    ribbon: (ms) => {
      const now = fx.value;
      holdRibbon(state.current, now, ms);
      publish(now);
    },
    clear: () => {
      state.current = emptyCallouts();
      q.value = { hero: null, small: null, prevHero: null, prevSmall: null };
      setHeroNow(null);
    },
  }));

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Canvas style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
        <SmallSlot q={q} which="small" fx={fx} font={font} x={midX} y={z.smallY} />
      </Canvas>
      {heroNow ? <HeroView key={heroNow.id} c={heroNow} fx={fx} x={midX} y={z.heroY} maxW={z.heroMaxW} /> : null}
    </View>
  );
});

/** Hero wordmark (K10 drawn art, boil f0/f1 at 12 fps) or a display-font hero word, on the fx clock. */
function HeroView({ c, fx, x, y, maxW }: { c: Shown; fx: SharedValue<number>; x: number; y: number; maxW: number }) {
  const key = c.wm >= 0 ? WM_KEYS[c.wm] : null;
  const w = key ? Math.min(maxW, WM_W[key]) : maxW;
  const h = key ? w / 3.6 : 60;
  const style = useAnimatedStyle(() => {
    const e = envelope(c, fx.value);
    return { opacity: e.o, transform: [{ scale: e.s * c.scale }, { rotate: '-3deg' }] };
  });
  const f0 = useAnimatedStyle(() => ({ opacity: Math.floor(fx.value / 83) % 2 === 0 ? 1 : 0 }));
  const f1 = useAnimatedStyle(() => ({ opacity: Math.floor(fx.value / 83) % 2 === 1 ? 1 : 0 }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x - w / 2, top: y - h / 2, width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      {key ? (
        <>
          <Animated.Image source={WM[key][0]} style={[StyleSheet.absoluteFill, { width: w, height: h }, f0]} resizeMode="contain" />
          <Animated.Image source={WM[key][1]} style={[StyleSheet.absoluteFill, { width: w, height: h }, f1]} resizeMode="contain" />
        </>
      ) : (
        <Text style={heroText.t} numberOfLines={1} adjustsFontSizeToFit>{c.text}</Text>
      )}
    </Animated.View>
  );
}

const heroText = StyleSheet.create({
  t: { fontFamily: 'Shark', fontSize: 50, color: '#FFFFFF', textShadowColor: '#1B2A4A', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 1 },
});

function easeOutBack(x: number, s = 1.7): number {
  'worklet';
  const t = Math.min(1, Math.max(0, x)) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
}

/** Scale and opacity of a callout at fx time f (entry pop or slam, exit fade, replace pop-out). */
function envelope(c: Shown | null, f: number): { s: number; o: number } {
  'worklet';
  if (!c || f < c.at) return { s: 0, o: 0 };
  if (c.out >= 0) {
    const k = (f - c.out) / POP_OUT_MS;
    return k >= 1 ? { s: 0, o: 0 } : { s: 1 + 0.15 * k, o: 1 - k };
  }
  const e = f - c.at;
  if (e >= c.ms) return { s: 0, o: 0 };
  let s: number;
  if (c.slam) s = e < 180 ? 1.4 - 0.4 * easeOutBack(e / 180, 1.4) : 1;
  else s = e < 90 ? 1.15 * easeOutBack(e / 90, 1.2) : e < 160 ? 1.15 - 0.15 * ((e - 90) / 70) : 1;
  const tail = c.ms - e;
  const o = tail < 160 ? tail / 160 : 1;
  return { s, o };
}

function SmallSlot({ q, which, fx, font, x, y }: {
  q: SharedValue<QueueView>; which: 'small' | 'prevSmall'; fx: SharedValue<number>; font: ReturnType<typeof useFont>; x: number; y: number;
}) {
  const env = useDerivedValue(() => envelope(q.value[which], fx.value));
  const op = useDerivedValue(() => env.value.o);
  const text = useDerivedValue(() => (q.value[which] ? q.value[which]!.text : ''));
  const color = useDerivedValue(() => (q.value[which] ? q.value[which]!.tone : '#FFFFFF'));
  const tw = useDerivedValue(() => (font ? font.measureText(text.value).width : 0));
  const tr = useDerivedValue(() => {
    const e = env.value;
    // Rises 10 pt over its life, -6 deg (design 11.1).
    const c = q.value[which];
    const life = c ? Math.min(1, (fx.value - c.at) / Math.max(1, c.ms)) : 0;
    return [{ translateX: x }, { translateY: y - 10 * life }, { rotate: -0.1 }, { scale: e.s }];
  });
  const tx = useDerivedValue(() => -tw.value / 2);
  const ul = useDerivedValue(() => (q.value[which] && q.value[which]!.underline ? 1 : 0));
  const ulW = useDerivedValue(() => tw.value * 0.9);
  const ulX = useDerivedValue(() => -tw.value * 0.45);
  if (!font) return null;
  return (
    <Group opacity={op} transform={tr}>
      <SkText text={text} x={tx} y={SMALL_PX * 0.35 + 2} font={font} color={NAVY} />
      <SkText text={text} x={tx} y={SMALL_PX * 0.35} font={font} color={color}>
        <Paint style="stroke" strokeWidth={6} color={NAVY} />
        <Paint color={color} />
      </SkText>
      <Group opacity={ul}>
        <RoundBar x={ulX} w={ulW} y={SMALL_PX * 0.35 + 7} />
      </Group>
    </Group>
  );
}

function RoundBar({ x, w, y }: { x: SharedValue<number>; w: SharedValue<number>; y: number }) {
  const x2 = useDerivedValue(() => x.value + 2);
  const w2 = useDerivedValue(() => w.value - 4);
  return (
    <Group>
      <Rect x={x} y={y - 1} width={w} height={7} color={NAVY} />
      <Rect x={x2} y={y + 1} width={w2} height={3} color="#7BD94A" />
    </Group>
  );
}
