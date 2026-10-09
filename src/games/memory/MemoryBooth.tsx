/**
 * MemoryBooth.tsx: the booth wrap around the board (design v8 6.1, 6.7, 6.8, 5.2).
 *
 * Built from the pipeline's 9-slice kit (Alex style): the striped awning whose
 * scalloped lip overlaps the felt's top gutter, two bulb-lined wooden posts as
 * the side borders and the prize counter as the bottom border. Laid out by
 * layout.ts around the measured grid rect, so it always hugs the board.
 *
 *   Marquee      the bulbs ARE the chain readout: chain 1 lights segment 1,
 *                chain 2 segments 1-2, chain 3+ every bulb chasing on 8ths;
 *                a slip fizzles them to the 40% floor; Showtime holds 100%;
 *                one Skia canvas, 12 groups, never off, under 3 Hz per bulb
 *   Counter      one prize slot per pair (the pair lands with a squash), the
 *                Showtime pot at the centre, the rail token on its top edge
 *   Callouts     Medium: a gold ribbon unfurling across the awning lip.
 *                Large: SHOWTIME letters dropping into the awning.
 *
 * The whole front sits in the scene layer: camera beats move it, never the
 * board inside it.
 */

import React, { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Canvas, Circle, Group, Image as SkImage, useImage } from '@shopify/react-native-skia';
import type { BoothGeo, Rect, TileStrip } from './layout';
import { MM } from './theme';
import type { CardFace } from './MemoryCard';
import { FaceThumb } from './MemoryExtras';

const KIT = {
  awningCapL: require('../../assets/games/memory/v8/booth/awning_capL.png'),
  awningTile: require('../../assets/games/memory/v8/booth/awning_tile.png'),
  awningCapR: require('../../assets/games/memory/v8/booth/awning_capR.png'),
  postCapT: require('../../assets/games/memory/v8/booth/post_capT.png'),
  postTile: require('../../assets/games/memory/v8/booth/post_tile.png'),
  postCapB: require('../../assets/games/memory/v8/booth/post_capB.png'),
  counterCapL: require('../../assets/games/memory/v8/booth/counter_capL.png'),
  counterTile: require('../../assets/games/memory/v8/booth/counter_tile.png'),
  counterCapR: require('../../assets/games/memory/v8/booth/counter_capR.png'),
};
const HALO = require('../../assets/games/memory/v8/fx/glow_halo_1.png');
const RIBBON = require('../../assets/games/memory/v8/results_banner.png');

// -----------------------------------------------------------------------------
// Marquee state (shared values the game drives)
// -----------------------------------------------------------------------------

export interface Marquee {
  /** Lit level per segment, 0 (floor) .. 1 (100%). */
  seg: [SharedValue<number>, SharedValue<number>, SharedValue<number>];
  /** Chase amount (chain 3+). */
  chase: SharedValue<number>;
  /** Every bulb at 100% (Showtime world state, Sudden Death). */
  all: SharedValue<number>;
  /** Flash-all pulse (Showtime matches). */
  flash: SharedValue<number>;
  /** Rim/awning dim (Time Attack line bleed). */
  dim: SharedValue<number>;
}

export function useMarquee(): Marquee {
  const s0 = useSharedValue(0);
  const s1 = useSharedValue(0);
  const s2 = useSharedValue(0);
  const chase = useSharedValue(0);
  const all = useSharedValue(0);
  const flash = useSharedValue(0);
  const dim = useSharedValue(0);
  return useMemo(() => ({ seg: [s0, s1, s2], chase, all, flash, dim }), [s0, s1, s2, chase, all, flash, dim]);
}

/** Light segments for a chain (6.7). */
export function marqueeChain(m: Marquee, chain: number, reducedMotion: boolean): void {
  const on = [chain >= 1, chain >= 2, chain >= 3];
  m.seg.forEach((sv, i) => {
    sv.value = withTiming(on[i] ? 1 : 0, { duration: on[i] ? 120 : 260 });
  });
  m.chase.value = withTiming(chain >= 3 && !reducedMotion ? 1 : 0, { duration: 200 });
}

/** A slip fizzles lit segments down to the floor over 300ms with at most 2 dips. */
export function marqueeFizzle(m: Marquee): void {
  m.chase.value = withTiming(0, { duration: 120 });
  m.seg.forEach((sv) => {
    if (sv.value < 0.05) return;
    cancelAnimation(sv);
    sv.value = withSequence(
      withTiming(0.25, { duration: 60 }),
      withTiming(0.7, { duration: 50 }),
      withTiming(0.1, { duration: 70 }),
      withTiming(0.45, { duration: 40 }),
      withTiming(0, { duration: 80 }),
    );
  });
}

/** Showtime match: every bulb to 100% for 80ms, ease back over 200ms. */
export function marqueeFlash(m: Marquee): void {
  m.flash.value = withSequence(withTiming(1, { duration: 16 }), withTiming(1, { duration: 80 }), withTiming(0, { duration: 200 }));
}

// -----------------------------------------------------------------------------
// Booth front
// -----------------------------------------------------------------------------

export interface PrizeEntry {
  face: CardFace;
  /** 'gold' for Golden Coin, 'pot' while a pair waits in the Showtime pot. */
  tint?: 'gold';
}

export interface BoothFrontProps {
  geo: BoothGeo;
  marquee: Marquee;
  beat: SharedValue<number>;
  reducedMotion: boolean;
  /** Prize slots filled so far (index = slot). */
  prizes: (PrizeEntry | null)[];
  /** Pairs stacked in the Showtime pot and its running value. */
  pot: { faces: CardFace[]; value: number } | null;
  /** Rail token (Daily ghost, Line Duel rival). */
  rail: { art: ImageSourcePropType; slot: number; delta: string | null; ahead: boolean; label: string } | null;
  /** Counter bounce (board clear beat 2), bumped to retrigger. */
  bounceKey: number;
}

export const BoothFront = memo(function BoothFront({ geo, marquee, beat, reducedMotion, prizes, pot, rail, bounceKey }: BoothFrontProps) {
  const g = geo;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Posts first: the awning's band and the counter rail sit over their ends. */}
      <VStrip strip={g.postStrips[0]} />
      <VStrip strip={g.postStrips[1]} />
      <HStrip strip={g.counterStrip} capA={KIT.counterCapL} tile={KIT.counterTile} capB={KIT.counterCapR} clipTop={-20} />
      <Prizes geo={g} prizes={prizes} bounceKey={bounceKey} reducedMotion={reducedMotion} />
      {pot ? <Pot geo={g} pot={pot} reducedMotion={reducedMotion} /> : null}
      {rail ? <RailToken geo={g} rail={rail} reducedMotion={reducedMotion} /> : null}
      <HStrip strip={g.awningStrip} capA={KIT.awningCapL} tile={KIT.awningTile} capB={KIT.awningCapR} clipTop={0} />
      <MarqueeLights geo={g} marquee={marquee} beat={beat} still={reducedMotion} />
    </View>
  );
});

/** capA + clipped repeating tiles + capB (awning, counter). */
const HStrip = memo(function HStrip({ strip, capA, tile, capB, clipTop }: {
  strip: TileStrip; capA: ImageSourcePropType; tile: ImageSourcePropType; capB: ImageSourcePropType; clipTop: number;
}) {
  const a = strip.capA;
  const b = strip.capB;
  const x0 = a.x + a.w - 1;
  const x1 = b.x + 1;
  return (
    <>
      <View style={{ position: 'absolute', left: x0, top: a.y + clipTop, width: Math.max(0, x1 - x0), height: a.h - clipTop, overflow: 'hidden' }}>
        {strip.tiles.map((t, i) => (
          <Image key={i} source={tile} style={{ position: 'absolute', left: t.x - x0, top: -clipTop, width: t.w + 0.5, height: t.h }} resizeMode="stretch" />
        ))}
      </View>
      <Image source={capA} style={{ position: 'absolute', left: a.x, top: a.y, width: a.w, height: a.h }} resizeMode="stretch" />
      <Image source={capB} style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h }} resizeMode="stretch" />
    </>
  );
});

/** capT + clipped repeating tiles + capB (posts). */
const VStrip = memo(function VStrip({ strip }: { strip: TileStrip }) {
  const a = strip.capA;
  const b = strip.capB;
  const y0 = a.y + a.h - 1;
  const y1 = b.y + 1;
  return (
    <>
      <View style={{ position: 'absolute', left: a.x, top: y0, width: a.w, height: Math.max(0, y1 - y0), overflow: 'hidden' }}>
        {strip.tiles.map((t, i) => (
          <Image key={i} source={KIT.postTile} style={{ position: 'absolute', left: 0, top: t.y - y0, width: t.w, height: t.h + 0.5 }} resizeMode="stretch" />
        ))}
      </View>
      <Image source={KIT.postCapT} style={{ position: 'absolute', left: a.x, top: a.y, width: a.w, height: a.h }} resizeMode="stretch" />
      <Image source={KIT.postCapB} style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h }} resizeMode="stretch" />
    </>
  );
});

// -----------------------------------------------------------------------------
// Marquee lights: one Skia canvas, bulbs grouped by (segment, chase phase)
// -----------------------------------------------------------------------------

const CHASE_GROUPS = 4;

const MarqueeLights = memo(function MarqueeLights({ geo, marquee, beat, still }: {
  geo: BoothGeo; marquee: Marquee; beat: SharedValue<number>; still: boolean;
}) {
  const halo = useImage(HALO);
  const groups = useMemo(() => {
    const out: { seg: number; phase: number; bulbs: BoothGeo['bulbs'] }[] = [];
    for (let seg = 0; seg < 3; seg++) {
      for (let phase = 0; phase < CHASE_GROUPS; phase++) {
        out.push({ seg, phase, bulbs: geo.bulbs.filter((b) => b.seg === seg && b.order % CHASE_GROUPS === phase) });
      }
    }
    return out.filter((x) => x.bulbs.length);
  }, [geo.bulbs]);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {groups.map((gr) => (
        <BulbGroup key={`${gr.seg}-${gr.phase}`} seg={gr.seg} phase={gr.phase} bulbs={gr.bulbs} marquee={marquee} beat={beat} still={still} halo={halo} />
      ))}
    </Canvas>
  );
});

function BulbGroup({ seg, phase, bulbs, marquee, beat, still, halo }: {
  seg: number; phase: number; bulbs: BoothGeo['bulbs']; marquee: Marquee; beat: SharedValue<number>; still: boolean;
  halo: ReturnType<typeof useImage>;
}) {
  const level = marquee.seg[seg];
  const { chase, all, flash, dim } = marquee;
  const opacity = useDerivedValue(() => {
    const b = beat.value;
    // 0.5 Hz breathe on the 40% floor (38-45%), driven by the bar clock (129 BPM ~ 2.15 beats/s).
    const floor = still ? 0.4 : 0.415 + 0.035 * Math.sin((b * Math.PI * 2) / 4.3);
    const lit = floor + (1 - floor) * level.value;
    // Chase on 8ths: 4 groups, a smooth 40-100% envelope, each bulb peaks ~1 Hz.
    const head = (b * 2) % CHASE_GROUPS;
    let d = Math.abs(head - phase);
    d = Math.min(d, CHASE_GROUPS - d);
    const env = 0.4 + 0.6 * Math.max(0, 1 - d / 1.6) ** 2;
    const chased = lit * (1 - chase.value) + env * chase.value;
    const v = Math.max(chased, all.value, flash.value);
    return v * (1 - dim.value * 0.3);
  });
  return (
    <Group opacity={opacity}>
      {bulbs.map((b, i) => (
        <Group key={i}>
          {halo ? <SkImage image={halo} x={b.x - b.r * 3} y={b.y - b.r * 3} width={b.r * 6} height={b.r * 6} fit="contain" /> : null}
          <Circle cx={b.x} cy={b.y} r={b.r * 0.82} color="#fff7cf" />
          <Circle cx={b.x - b.r * 0.25} cy={b.y - b.r * 0.25} r={b.r * 0.3} color="#ffffff" />
        </Group>
      ))}
    </Group>
  );
}

// -----------------------------------------------------------------------------
// Prize counter
// -----------------------------------------------------------------------------

const Prizes = memo(function Prizes({ geo, prizes, bounceKey, reducedMotion }: { geo: BoothGeo; prizes: (PrizeEntry | null)[]; bounceKey: number; reducedMotion: boolean }) {
  return (
    <>
      {geo.prize.map((r, i) => (
        <PrizeSlot key={i} r={r} index={i} entry={prizes[i] ?? null} bounceKey={bounceKey} reducedMotion={reducedMotion} />
      ))}
    </>
  );
});

function PrizeSlot({ r, index, entry, bounceKey, reducedMotion }: { r: Rect; index: number; entry: PrizeEntry | null; bounceKey: number; reducedMotion: boolean }) {
  const sq = useSharedValue(1);
  const bounce = useSharedValue(0);
  useEffect(() => {
    if (!entry || reducedMotion) return;
    // 90ms landing squash.
    sq.value = withSequence(withTiming(0.86, { duration: 40 }), withTiming(1.06, { duration: 30 }), withTiming(1, { duration: 20 }));
  }, [entry, reducedMotion, sq]);
  useEffect(() => {
    if (!bounceKey || reducedMotion) return;
    bounce.value = withDelay(index * 20, withSequence(withTiming(-7, { duration: 80, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9, stiffness: 300 })));
  }, [bounceKey, index, reducedMotion, bounce]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }, { scaleY: sq.value }, { scaleX: 2 - sq.value }] }));
  const w = r.w * 0.82;
  const h = r.h * 0.86;
  return (
    <Animated.View style={[styles.slot, { left: r.x, top: r.y, width: r.w, height: r.h }, entry && styles.slotFull, st]}>
      {entry ? (
        <>
          <View style={[styles.mini, { left: -1, top: 1, transform: [{ rotateZ: '-6deg' }] }]}>
            <FaceThumb face={entry.face} w={w} h={h} radius={3} foil={entry.tint === 'gold'} />
          </View>
          <View style={[styles.mini, { left: r.w - w + 1, top: 0, transform: [{ rotateZ: '5deg' }] }]}>
            <FaceThumb face={entry.face} w={w} h={h} radius={3} foil={entry.tint === 'gold'} />
          </View>
        </>
      ) : null}
    </Animated.View>
  );
}

function Pot({ geo, pot, reducedMotion }: { geo: BoothGeo; pot: { faces: CardFace[]; value: number }; reducedMotion: boolean }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    pulse.value = withSequence(withTiming(1.12, { duration: 60 }), withTiming(1, { duration: 120 }));
  }, [pot.value, pot.faces.length, reducedMotion, pulse]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const cw = geo.prize[0]?.w ?? 26;
  const chh = geo.prize[0]?.h ?? 32;
  return (
    <Animated.View style={[styles.pot, { left: geo.pot.x - 60, top: geo.counter.y - chh * 0.65, width: 120, height: chh + 26 }, st]}>
      <View style={styles.potStack}>
        {pot.faces.map((f, i) => (
          <View key={i} style={{ position: 'absolute', left: 60 - cw / 2 + (i % 2 ? 4 : -4), top: 4 - i * 6, transform: [{ rotateZ: `${(i % 2 ? 1 : -1) * 6}deg` }] }}>
            <FaceThumb face={f} w={cw} h={chh * 0.9} radius={3} />
          </View>
        ))}
      </View>
      <View style={styles.potTag}>
        <Text style={styles.potText}>{pot.value.toLocaleString('en-US')}</Text>
      </View>
    </Animated.View>
  );
}

function RailToken({ geo, rail, reducedMotion }: { geo: BoothGeo; rail: NonNullable<BoothFrontProps['rail']>; reducedMotion: boolean }) {
  const slot = Math.max(0, Math.min(geo.prize.length - 1, rail.slot));
  const target = geo.prize[slot] ? geo.prize[slot].x + geo.prize[slot].w / 2 : geo.pot.x;
  const x = useSharedValue(target);
  const spin = useSharedValue(0);
  const [prevAhead, setPrevAhead] = useState(rail.ahead);
  useEffect(() => {
    x.value = reducedMotion ? target : withSpring(target, { damping: 16, stiffness: 140 });
  }, [target, reducedMotion, x]);
  useEffect(() => {
    if (rail.ahead && !prevAhead && !reducedMotion) {
      spin.value = 0;
      spin.value = withTiming(1, { duration: 360, easing: Easing.out(Easing.back(1.4)) });
    }
    setPrevAhead(rail.ahead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rail.ahead]);
  const size = 40;
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - size / 2 }, { rotateY: `${spin.value * 360}deg` }] }));
  return (
    <Animated.View style={[styles.token, { top: geo.railY - size * 0.95, width: size }, st]}>
      <Image source={rail.art} style={{ width: size, height: size, opacity: 0.6 }} resizeMode="contain" />
      <View style={[styles.railChip, rail.ahead ? styles.railChipAhead : null]}>
        <Text style={[styles.railChipText, rail.ahead && { color: MM.navyText }]} numberOfLines={1}>{rail.delta ?? rail.label}</Text>
      </View>
    </Animated.View>
  );
}

// -----------------------------------------------------------------------------
// Awning callouts: Medium ribbon and Large sign letters
// -----------------------------------------------------------------------------

export interface AwningCalloutsHandle {
  /** level > 0: a combo step; each one lands bigger than the last. */
  ribbon: (text: string, level?: number) => void;
  sign: (text: string) => void;
}

export const AwningCallouts = forwardRef<AwningCalloutsHandle, { geo: BoothGeo; reducedMotion: boolean }>(function AwningCallouts({ geo, reducedMotion }, ref) {
  const [ribbonText, setRibbonText] = useState('');
  const [signText, setSignText] = useState('');
  const [signKey, setSignKey] = useState(0);
  const unfurl = useSharedValue(0);
  const peak = useSharedValue(1);
  useImperativeHandle(ref, () => ({
    ribbon(text, level = 0) {
      setRibbonText(text);
      cancelAnimation(unfurl);
      unfurl.value = 0;
      peak.value = reducedMotion ? 1 : 1 + Math.min(0.3, level * 0.08);
      // Unfurl 180ms from centre, hold 600ms, roll up 160ms.
      unfurl.value = withSequence(
        withTiming(1, { duration: reducedMotion ? 60 : 180, easing: Easing.out(Easing.back(1.2)) }),
        withDelay(600, withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) })),
      );
    },
    sign(text) {
      setSignText(text);
      setSignKey((k) => k + 1);
    },
  }), [reducedMotion, unfurl, peak]);
  const rw = Math.min(geo.W * 0.66, 270);
  const rh = rw * (74 / 192);
  const ribbonStyle = useAnimatedStyle(() => ({ opacity: unfurl.value > 0.02 ? 1 : 0, transform: [{ scale: 1 + (peak.value - 1) * unfurl.value }, { scaleX: unfurl.value }, { scaleY: 0.85 + 0.15 * unfurl.value }] }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.ribbon, { left: geo.W / 2 - rw / 2, top: geo.ribbonY - rh * 0.95, width: rw, height: rh }, ribbonStyle]}>
        <Image source={RIBBON} style={{ position: 'absolute', width: rw, height: rh }} resizeMode="stretch" />
        <Text style={[styles.ribbonText, { fontSize: Math.round(rh * 0.36), marginTop: -rh * 0.08 }]} numberOfLines={1} adjustsFontSizeToFit>{ribbonText}</Text>
      </Animated.View>
      {signText ? <SignLetters key={signKey} text={signText} geo={geo} reducedMotion={reducedMotion} onDone={() => setSignText('')} /> : null}
    </View>
  );
});

function SignLetters({ text, geo, reducedMotion, onDone }: { text: string; geo: BoothGeo; reducedMotion: boolean; onDone: () => void }) {
  const letters = text.split('');
  const span = geo.W * 0.8;
  const step = span / letters.length;
  useEffect(() => {
    const t = setTimeout(onDone, 30 * letters.length + 1300);
    return () => clearTimeout(t);
  }, [letters.length, onDone]);
  return (
    <>
      {letters.map((ch, i) => (
        <SignLetter key={i} ch={ch} x={geo.W * 0.1 + i * step} w={step} y={geo.awning.y + geo.awning.h * 0.1} size={Math.min(geo.awning.h * 0.62, step * 1.25)} delay={i * 30} reducedMotion={reducedMotion} />
      ))}
    </>
  );
}

function SignLetter({ ch, x, w, y, size, delay, reducedMotion }: { ch: string; x: number; w: number; y: number; size: number; delay: number; reducedMotion: boolean }) {
  const drop = useSharedValue(reducedMotion ? 1 : 0);
  const sq = useSharedValue(1);
  const out = useSharedValue(0);
  useEffect(() => {
    if (!reducedMotion) {
      drop.value = withDelay(delay, withTiming(1, { duration: 140, easing: Easing.in(Easing.quad) }));
      sq.value = withDelay(delay + 140, withSequence(withTiming(1.12, { duration: 50 }), withTiming(1, { duration: 80 })));
    }
    out.value = withDelay(delay + 1100, withTiming(1, { duration: 180 }));
  }, [delay, reducedMotion, drop, sq, out]);
  const st = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 3) * (1 - out.value),
    transform: [{ translateY: (drop.value - 1) * 60 - out.value * 12 }, { scaleY: 2 - sq.value }, { scaleX: sq.value }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x, top: y, width: w, alignItems: 'center' }, st]}>
      <View style={styles.signTile}>
        <Text style={[styles.signLetter, { fontSize: size }]}>{ch}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute', borderRadius: 5, borderWidth: 1.5, borderColor: 'rgba(254,201,14,0.9)', borderStyle: 'dashed',
    backgroundColor: 'rgba(90,46,14,0.35)',
  },
  slotFull: { borderStyle: 'solid', borderColor: 'transparent', backgroundColor: 'transparent' },
  mini: { position: 'absolute' },
  pot: { position: 'absolute', alignItems: 'center' },
  potStack: { position: 'absolute', left: 0, top: 0, width: 120, height: 40 },
  potTag: {
    position: 'absolute', bottom: 0, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 9, backgroundColor: MM.gold,
    borderWidth: 2, borderColor: '#ffffff',
  },
  potText: { fontFamily: 'Shark', fontSize: 15, color: MM.navyText },
  token: { position: 'absolute', left: 0, alignItems: 'center' },
  railChip: { marginTop: -6, paddingHorizontal: 5, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1.5, borderColor: MM.ink, maxWidth: 88 },
  railChipAhead: { backgroundColor: MM.gold, borderColor: '#ffffff' },
  railChipText: { fontFamily: 'Shark', fontSize: 11, color: MM.ink },
  ribbon: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ribbonText: {
    fontFamily: 'Shark', color: '#ffffff', textShadowColor: MM.ink, textShadowOffset: { width: 1.5, height: 2 }, textShadowRadius: 1,
    paddingHorizontal: 30,
  },
  signTile: {
    backgroundColor: '#fff8e4', borderRadius: 6, borderWidth: 2.5, borderColor: MM.ink, paddingHorizontal: 2,
  },
  signLetter: {
    fontFamily: 'Shark', color: MM.goldDeep, textShadowColor: MM.ink, textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0.5,
  },
});
