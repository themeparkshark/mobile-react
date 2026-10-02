/**
 * FlightLayer.tsx: pairs flying off the board, and the small card tags
 * (design v8 6.4, 5.2, 6.12 layer 5).
 *
 *   Flights   60ms after the stamp the pair shrinks to 0.45 and flies a 280ms
 *             inOut(cubic) arc (apex 0.6W) to its counter slot, or to the pot
 *             during Showtime (stacking with a 6px offset). The real cards fade
 *             on the board, so the board itself never moves.
 *   Tags      SHARP, LUCKY, SEEN IT, QUICK +25, STOLEN, +3s: pinned to the card
 *             that earned them, at most 0.6W wide, 14pt; 1.3 -> 1.0 in 120ms,
 *             rising 8pt and fading over 500ms.
 */

import React, { forwardRef, memo, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { CardFace } from './MemoryCard';
import { FaceThumb } from './MemoryExtras';
import { MM } from './theme';

export interface FlightSpec {
  /** Top-left of each card at take-off. */
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** Landing rect (slot or pot). */
  to: { x: number; y: number; w: number; h: number };
  face: CardFace;
  w: number;
  h: number;
  delayMs?: number;
  /** Stack offset in the pot (index). */
  stack?: number;
  onLand?: () => void;
}

export interface FlightLayerHandle {
  fly: (f: FlightSpec) => void;
  tag: (text: string, cx: number, top: number, maxW: number, tone?: 'gold' | 'white' | 'cream' | 'blue' | 'coral') => void;
  clear: () => void;
}

const POOL = 6;
const TAGS = 6;

interface Slot {
  p: SharedValue<number>;
  spec: FlightSpec | null;
}

export const FlightLayer = memo(forwardRef<FlightLayerHandle, { reducedMotion: boolean; width: number }>(function FlightLayer({ reducedMotion, width }, ref) {
  const slots = useMemo<Slot[]>(() => Array.from({ length: POOL }, () => ({ p: makeMutable(0), spec: null })), []);
  const tags = useMemo(() => Array.from({ length: TAGS }, () => makeMutable(0)), []);
  const [specs, setSpecs] = useState<(FlightSpec | null)[]>(() => Array.from({ length: POOL }, () => null));
  const [tagSpecs, setTagSpecs] = useState<({ text: string; x: number; y: number; w: number; tone: string; key: number } | null)[]>(() => Array.from({ length: TAGS }, () => null));
  const next = useRef(0);
  const nextTag = useRef(0);
  const keyRef = useRef(0);

  useImperativeHandle(ref, () => ({
    fly(f) {
      const i = next.current++ % POOL;
      slots[i].spec = f;
      setSpecs((s) => {
        const c = s.slice();
        c[i] = f;
        return c;
      });
      const land = () => {
        f.onLand?.();
        setSpecs((s) => {
          if (s[i] !== f) return s;
          const c = s.slice();
          c[i] = null;
          return c;
        });
      };
      slots[i].p.value = 0;
      slots[i].p.value = withDelay((f.delayMs ?? 60) + 16, withTiming(1, { duration: reducedMotion ? 120 : 280, easing: Easing.inOut(Easing.cubic) }, (done) => {
        if (done) runOnJS(land)();
      }));
    },
    tag(text, cx, top, maxW, tone = 'gold') {
      const i = nextTag.current++ % TAGS;
      const w = Math.min(maxW, Math.max(44, text.length * 9 + 14));
      keyRef.current += 1;
      const key = keyRef.current;
      setTagSpecs((s) => {
        const c = s.slice();
        c[i] = { text, x: cx - w / 2, y: top, w, tone, key };
        return c;
      });
      tags[i].value = 0;
      tags[i].value = withSequence(withTiming(1, { duration: 1 }), withTiming(2, { duration: 500, easing: Easing.out(Easing.quad) }));
    },
    clear() {
      setSpecs(Array.from({ length: POOL }, () => null));
      slots.forEach((s) => { s.p.value = 0; });
    },
  }), [slots, tags, reducedMotion]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {specs.map((s, i) => (s ? <Flight key={`f${i}`} spec={s} p={slots[i].p} width={width} reducedMotion={reducedMotion} /> : null))}
      {tagSpecs.map((t, i) => (t ? <Tag key={`t${t.key}`} t={t} v={tags[i]} /> : null))}
    </View>
  );
}));

function Flight({ spec, p, width, reducedMotion }: { spec: FlightSpec; p: SharedValue<number>; width: number; reducedMotion: boolean }) {
  const apex = reducedMotion ? 0 : Math.max(24, spec.w * 0.6);
  void width;
  const scaleTo = Math.min(spec.to.w / spec.w, spec.to.h / spec.h);
  const card = (from: { x: number; y: number }, dx: number, rot: number) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAnimatedStyle(() => {
      const t = p.value;
      const tx = spec.to.x + spec.to.w / 2 - spec.w / 2 + dx;
      const ty = spec.to.y + spec.to.h / 2 - spec.h / 2 - (spec.stack ?? 0) * 6;
      const x = from.x + (tx - from.x) * t;
      const y = from.y + (ty - from.y) * t - Math.sin(t * Math.PI) * apex;
      const s = 1 + (scaleTo - 1) * t;
      return { opacity: t >= 1 ? 0 : 1, transform: [{ translateX: x }, { translateY: y }, { scale: s }, { rotateZ: `${rot * t}deg` }] };
    });
  };
  const a = card(spec.a, -3, -6);
  const b = card(spec.b, 3, 5);
  return (
    <>
      <Animated.View style={[styles.abs, a]}>
        <FaceThumb face={spec.face} w={spec.w} h={spec.h} radius={spec.w * 0.12} />
      </Animated.View>
      <Animated.View style={[styles.abs, b]}>
        <FaceThumb face={spec.face} w={spec.w} h={spec.h} radius={spec.w * 0.12} />
      </Animated.View>
    </>
  );
}

const TONE: Record<string, { bg: string; fg: string; border: string }> = {
  gold: { bg: MM.gold, fg: MM.navyText, border: '#ffffff' },
  white: { bg: '#ffffff', fg: MM.navyText, border: MM.ink },
  cream: { bg: MM.creamWarm, fg: MM.navyText, border: MM.gold },
  blue: { bg: MM.scout, fg: '#ffffff', border: '#ffffff' },
  coral: { bg: MM.coral, fg: '#ffffff', border: '#ffffff' },
};

function Tag({ t, v }: { t: { text: string; x: number; y: number; w: number; tone: string }; v: SharedValue<number> }) {
  const st = useAnimatedStyle(() => {
    const k = v.value;
    const pop = k <= 1 ? 1.3 : k < 1.24 ? 1.3 - ((k - 1) / 0.24) * 0.3 : 1;
    const life = Math.max(0, k - 1);
    return { opacity: k <= 0 ? 0 : life < 0.6 ? 1 : Math.max(0, 1 - (life - 0.6) / 0.4), transform: [{ translateY: -life * 8 }, { scale: pop }] };
  });
  const tone = TONE[t.tone] ?? TONE.gold;
  return (
    <Animated.View style={[styles.tag, { left: t.x, top: t.y, width: t.w, backgroundColor: tone.bg, borderColor: tone.border }, st]}>
      <Text style={[styles.tagText, { color: tone.fg }]} numberOfLines={1} adjustsFontSizeToFit>{t.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  tag: { position: 'absolute', alignItems: 'center', borderRadius: 8, borderWidth: 2, paddingVertical: 1 },
  tagText: { fontFamily: 'Shark', fontSize: 14 },
});
