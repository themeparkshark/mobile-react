/**
 * BonkBoard: one player's Bonk Race board. Every phone in the room plays the
 * same seeded timeline on its own board; this component renders it, reads
 * touch-downs, and shows the juice. It never decides the score that counts:
 * the tap log goes to the server, which replays it with the same sim.
 *
 * Walk-safe: big cells in the bottom of the screen (one thumb), every target
 * stays up 2.25-3 beats, a stray bump is a free whiff, and nothing pauses when
 * the line moves. Audio and haptics mark every hit so a glance is enough.
 *
 * v2 (design rev 6, 7.1): the board lives on the beat of the room loop. Rims
 * bump on every beat (harder on the bar downbeat). On bars 2/4/6/8/10 a
 * Shared Golden rises on the same hole on every phone: its rim glows and
 * pulses for one beat first, and it rises inside a ring of pips in every
 * seated player's color. Bonk it first after the beat to SNATCH it. The
 * LAST 2 BARS get a banner and a gold vignette. All of this is render-only:
 * nothing here writes board-ms.
 *
 * Art: Alex's Whack-a-Shark pieces (hole plate, park Finn peek/pop/dazed,
 * golden shark, anglerfish lure) over the underwater playfield. The hole's
 * interior is code-drawn teal water so there are no black voids.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Circle,
  Group,
  Image as SkiaImage,
  LinearGradient,
  Oval,
  Skia,
  useImage,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ParticleField, type ParticleHandle } from '../Particles';
import { useFlash, useShake } from '../Juice';
import { haptic } from '../Haptics';
import { playSfx } from '../SFX';
import { BRAND, FONT } from '../../ui/tokens';
import { botTaps, LAST_BARS_FROM, lureDrop, multTenths, resolve, type BotProfile, type Spawn, type Tap } from '../../games/party/bonkRace';
import { BOARD } from './partyArt';

export interface BonkBoardProps {
  spawns: Spawn[];
  seed: number;
  goAt: number;
  durationMs: number;
  perfNow: () => number;
  /** Records the tap with the client; returns ms since GO or null outside play. */
  onTap: (hole: number) => number | null;
  onProgress?: (score: number, streak: number) => void;
  /** Dev-only demo hands (recorded proof runs): a human-paced bot plays this board. */
  autoplay?: BotProfile | null;
  /** Board time drives the HUD above the board (parent owns the strip). */
  onTick?: (boardMs: number, score: number) => void;
  /** The client's board clock (ms since GO, frozen during a personal HOLD). */
  boardClock?: () => number | null;
  /** Bright seat colors for the Shared Golden pip ring (one per seated player). */
  pipColors?: string[];
  /** I bonked Shared Golden `sg` (1-5) with this replay-exact reaction. */
  onShared?: (sg: number, reactionMs: number) => void;
  /** Bumps when this phone stamps SNATCHED for me (one beat after the window). */
  snatchedKey?: number;
}

type OccPhase = 'tell' | 'peek' | 'up' | 'bonked' | 'none';
interface Occ { id: number; kind: Spawn['kind']; phase: OccPhase; sg: number }
const EMPTY: Occ = { id: -1, kind: 'finn', phase: 'none', sg: 0 };
const PEEK_MS = 140;
const BONKED_HOLD_MS = 280;

interface Cell { x: number; y: number; size: number; cx: number; cy: number }

function grid(w: number, h: number): Cell[] {
  const padX = w * 0.05;
  const gapFrac = 0.1;
  const size = Math.min((w - padX * 2) / (3 + 2 * gapFrac), (h * 0.96) / (3 + 2 * gapFrac));
  const gap = size * gapFrac;
  const gw = 3 * size + 2 * gap;
  const x0 = (w - gw) / 2;
  const y0 = h - gw - h * 0.02;
  const cells: Cell[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x = x0 + c * (size + gap);
    const y = y0 + r * (size + gap);
    cells.push({ x, y, size, cx: x + size / 2, cy: y + size / 2 });
  }
  return cells;
}

interface FlyUp { key: number; x: number; y: number; text: string; color: string; big: boolean }

function BonkBoard({ spawns, seed, goAt, durationMs, perfNow, onTap, onProgress, autoplay, onTick, boardClock, pipColors, onShared, snatchedKey }: BonkBoardProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const cells = useMemo(() => (size.w ? grid(size.w, size.h) : []), [size]);
  const [occ, setOcc] = useState<Occ[]>(() => Array(9).fill(EMPTY));
  const [flyUps, setFlyUps] = useState<FlyUp[]>([]);
  const [tier, setTier] = useState(10);
  const taps = useRef<Tap[]>([]);
  const hitAt = useRef(new Map<number, number>());
  const streak = useRef(0);
  const lastResult = useRef(resolve(spawns, []));
  const particles = useRef<ParticleHandle>(null);
  const shake = useShake();
  const coralFlash = useFlash();
  const flyKey = useRef(0);
  // Beat decor: one shared pulse for every rim (render clock only).
  const pulse = useSharedValue(1);
  const lastBeat = useRef(-1);
  const [lastBars, setLastBars] = useState(false);
  const byHole = useMemo(() => {
    const m: Spawn[][] = Array.from({ length: 9 }, () => []);
    spawns.forEach((s) => m[s.hole].push(s));
    return m;
  }, [spawns]);
  const auto = useMemo(() => (autoplay ? botTaps(spawns, seed, 17 + Math.floor(Math.random() * 40), autoplay) : []), [autoplay, spawns, seed]);
  const autoIndex = useRef(0);
  const lastBarsRef = useRef(false);

  const addFlyUp = useCallback((cell: Cell, text: string, color: string, big = false) => {
    const key = ++flyKey.current;
    setFlyUps((list) => [...list.filter((f) => key - f.key < 6), { key, x: cell.cx, y: cell.y, text, color, big }]);
  }, []);

  const bonk = useCallback((hole: number) => {
    const cell = cells[hole];
    if (!cell) return;
    const t = onTap(hole);
    if (t === null) return;
    taps.current.push([t, hole]);
    const before = lastResult.current;
    const r = resolve(spawns, taps.current);
    lastResult.current = r;

    if (r.hits > before.hits) {
      const id = r.hitIds[r.hitIds.length - 1];
      hitAt.current.set(id, perfNow());
      streak.current += 1;
      const shared = r.sgHits > before.sgHits;
      const golden = r.goldens > before.goldens;
      const quick = r.quick > before.quick;
      const gained = r.score - before.score;
      const nextTier = multTenths(streak.current);
      if (nextTier !== tier) {
        setTier(nextTier);
        if (nextTier > tier) { haptic('comboHeavy'); playSfx('combo', 0.8); }
      }
      if (shared) {
        // Flat +100 now; the +200 SNATCH is settled room-wide one beat after the window.
        const n = r.sgReactions.findIndex((v, i) => v >= 0 && before.sgReactions[i] < 0);
        if (n >= 0) onShared?.(n + 1, r.sgReactions[n]);
        particles.current?.burst({ x: cell.cx, y: cell.cy - cell.size * 0.2, preset: 'coins', count: 16, colors: ['#ffcf3b', '#ffe07a', '#ffffff'] });
        haptic('success');
        playSfx('coin');
        addFlyUp(cell, `+${gained}`, BRAND.gold, true);
      } else if (golden) {
        // Local burst only: no full-screen flash in Bonk Race (design 13.2).
        particles.current?.burst({ x: cell.cx, y: cell.cy - cell.size * 0.2, preset: 'coins', count: 22, colors: ['#ffcf3b', '#ffe07a', '#ffffff'] });
        haptic('success');
        playSfx('coin');
        addFlyUp(cell, `GOLDEN +${gained}`, BRAND.gold, true);
      } else {
        particles.current?.burst({ x: cell.cx, y: cell.cy - cell.size * 0.2, preset: 'burst', count: quick ? 16 : 9, colors: quick ? ['#ffffff', '#ffcf3b', '#7cc6f5'] : ['#ffffff', '#7cc6f5'], speed: quick ? 1.3 : 1 });
        haptic('hitMedium');
        playSfx('hit', quick ? 1 : 0.8);
        addFlyUp(cell, quick ? `QUICK +${gained}` : `+${gained}`, quick ? BRAND.gold : BRAND.white, quick);
      }
    } else if (r.lureHits > before.lureHits) {
      const id = r.hitIds[r.hitIds.length - 1];
      hitAt.current.set(id, perfNow());
      // A lure drops ONE tier (x3 -> x2.5), never all the way.
      streak.current = lureDrop(streak.current);
      setTier(multTenths(streak.current));
      shake.shake(3, 90);
      coralFlash.flash(0.22, 160);
      haptic('comboHeavy');
      setTimeout(() => haptic('hitMedium'), 60);
      playSfx('fail', 0.9);
      addFlyUp(cell, `${r.score - before.score === 0 ? '-150' : r.score - before.score}`, '#ff8a5c', true);
    } else if (r.butterfingers > before.butterfingers) {
      streak.current = 0;
      setTier(10);
      haptic('warning');
      addFlyUp(cell, 'BUTTERFINGERS', '#ff8a5c');
    } else {
      playSfx('tap', 0.25);
    }
    onProgress?.(r.score, streak.current);
  }, [addFlyUp, cells, coralFlash, onProgress, onShared, onTap, perfNow, shake, spawns, tier]);
  const bonkRef = useRef(bonk);
  bonkRef.current = bonk;

  // One loop reads the board clock, moves occupants between peek/up/bonked,
  // fires demo taps, and feeds the HUD. React only re-renders on changes.
  useEffect(() => {
    let raf = 0;
    let lastSecond = -1;
    const frame = () => {
      const now = perfNow();
      const t = boardClock?.() ?? now - goAt;
      const next: Occ[] = [];
      let changed = false;
      for (let h = 0; h < 9; h++) {
        let o: Occ = EMPTY;
        for (const s of byHole[h]) {
          if (t < Math.min(s.tell, s.at - PEEK_MS)) break;
          const hitTime = hitAt.current.get(s.id);
          if (hitTime !== undefined) {
            if (now - hitTime < BONKED_HOLD_MS) { o = { id: s.id, kind: s.kind, phase: 'bonked', sg: s.sg }; }
            continue;
          }
          if (t < s.at - PEEK_MS) { o = { id: s.id, kind: s.kind, phase: 'tell', sg: s.sg }; break; }
          if (t < s.at) { o = { id: s.id, kind: s.kind, phase: 'peek', sg: s.sg }; break; }
          if (t < s.at + s.up) { o = { id: s.id, kind: s.kind, phase: 'up', sg: s.sg }; break; }
        }
        next.push(o);
      }
      setOcc((prev) => {
        for (let h = 0; h < 9; h++) if (prev[h].id !== next[h].id || prev[h].phase !== next[h].phase) { changed = true; break; }
        return changed ? next : prev;
      });
      if (auto.length && t >= 0 && t <= durationMs) {
        while (autoIndex.current < auto.length && auto[autoIndex.current][0] <= t) {
          bonkRef.current(auto[autoIndex.current][1]);
          autoIndex.current += 1;
        }
      }
      // Rims bump on every beat of the room loop, harder on the bar downbeat.
      if (t >= 0 && t < durationMs) {
        const b = Math.floor((t * 1000) / 441180);
        if (b !== lastBeat.current) {
          lastBeat.current = b;
          const peak = b % 4 === 0 ? 1.03 : 1.015;
          pulse.value = withSequence(withTiming(peak, { duration: 60, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 160, easing: Easing.inOut(Easing.quad) }));
        }
        if (t >= LAST_BARS_FROM !== lastBarsRef.current) {
          lastBarsRef.current = t >= LAST_BARS_FROM;
          setLastBars(lastBarsRef.current);
        }
      }
      const second = Math.floor(t / 250);
      if (second !== lastSecond) {
        lastSecond = second;
        onTick?.(t, lastResult.current.score);
        const left = Math.ceil((durationMs - t) / 1000);
        if (t > 0 && t < durationMs && left <= 3 && t % 1000 < 250) haptic('tickSelection');
      }
      if (t < durationMs + 400) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [auto, boardClock, byHole, durationMs, goAt, onTick, perfNow, pulse]);

  const onTouch = useCallback((x: number, y: number) => {
    // Generous hitboxes: the whole cell plus slop, and the rising sprite above it.
    let best = -1;
    let bestD = Infinity;
    cells.forEach((c, i) => {
      const inside = x >= c.x - 10 && x <= c.x + c.size + 10 && y >= c.y - c.size * 0.35 && y <= c.y + c.size + 10;
      if (!inside) return;
      const d = (x - c.cx) ** 2 + (y - c.cy) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0) bonkRef.current(best);
  }, [cells]);

  const gesture = useMemo(() => Gesture.Manual()
    .onTouchesDown((e) => {
      'worklet';
      for (const touch of e.changedTouches) runOnJS(onTouch)(touch.x, touch.y);
    }), [onTouch]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ w: width, h: height });
  }, []);

  return (
    <View style={styles.fill}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.fill, shake.style]} onLayout={onLayout}>
          {size.w > 0 ? <Holes cells={cells} occ={occ} pulse={pulse} pipColors={pipColors ?? []} /> : null}
          <ParticleField ref={particles} width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none" />
          {flyUps.map(({ key, ...f }) => <FlyUpText key={key} {...f} />)}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.coralWash, coralFlash.style]} />
        </Animated.View>
      </GestureDetector>
      {lastBars ? <LastBars /> : null}
      {tier > 10 ? <TierBadge tier={tier} /> : null}
      {snatchedKey ? <SnatchStamp key={snatchedKey} /> : null}
    </View>
  );
}

export default memo(BonkBoard);

// ---------------------------------------------------------------- holes

function Holes({ cells, occ, pulse, pipColors }: { cells: Cell[]; occ: Occ[]; pulse: SharedValue<number>; pipColors: string[] }) {
  const hole = useImage(BOARD.hole);
  const lure = useImage(BOARD.lure);
  const golden = useImage(BOARD.golden);
  const peek = useImage(BOARD.finn[0]);
  const pop = useImage(BOARD.finn[1]);
  const dazed = useImage(BOARD.finn[2]);
  const w = cells.length ? cells[8].x + cells[8].size + cells[0].x : 0;
  const h = cells.length ? cells[8].y + cells[8].size + 20 : 0;
  return (
    <Canvas style={[StyleSheet.absoluteFill, { width: w, height: h }]} pointerEvents="none">
      {cells.map((cell, i) => (
        <Hole key={i} cell={cell} occ={occ[i]} pulse={pulse} pipColors={pipColors} images={{ hole, lure, golden, peek, pop, dazed }} />
      ))}
    </Canvas>
  );
}

interface HoleImages { hole: SkImage | null; lure: SkImage | null; golden: SkImage | null; peek: SkImage | null; pop: SkImage | null; dazed: SkImage | null }

const Hole = memo(function Hole({ cell, occ, images, pulse, pipColors }: { cell: Cell; occ: Occ; images: HoleImages; pulse: SharedValue<number>; pipColors: string[] }) {
  const rise = useSharedValue(0);
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  // Shared Golden telegraph: the rim glows gold and pulses at 4 Hz for the beat before it rises.
  const glow = useSharedValue(0);
  const spin = useSharedValue(0);
  const shared = occ.sg > 0 && (occ.phase === 'tell' || occ.phase === 'peek' || occ.phase === 'up');

  useEffect(() => {
    if (shared) {
      glow.value = withRepeat(withSequence(withTiming(1, { duration: 125 }), withTiming(0.45, { duration: 125 })), -1, false);
      spin.value = 0;
      spin.value = withRepeat(withTiming(Math.PI * 2, { duration: 1800, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(glow);
      cancelAnimation(spin);
      glow.value = withTiming(0, { duration: 120 });
    }
  }, [glow, shared, spin]);

  useEffect(() => {
    if (occ.phase === 'tell') {
      rise.value = 0;
    } else if (occ.phase === 'peek') {
      rise.value = withTiming(0.28, { duration: 120, easing: Easing.out(Easing.quad) });
      sx.value = 1; sy.value = 1;
    } else if (occ.phase === 'up') {
      rise.value = withTiming(1, { duration: 130, easing: Easing.out(Easing.back(1.6)) });
      sx.value = withSequence(withTiming(1.12, { duration: 70 }), withSpring(1, { damping: 10, stiffness: 380, mass: 0.5 }));
      sy.value = withSequence(withTiming(0.9, { duration: 70 }), withSpring(1, { damping: 10, stiffness: 380, mass: 0.5 }));
    } else if (occ.phase === 'bonked') {
      sx.value = withSequence(withTiming(1.25, { duration: 45 }), withSpring(1, { damping: 8, stiffness: 420 }));
      sy.value = withSequence(withTiming(0.7, { duration: 45 }), withSpring(1, { damping: 8, stiffness: 420 }));
    } else {
      rise.value = withTiming(0, { duration: 170, easing: Easing.in(Easing.back(1.4)) });
    }
  }, [occ.id, occ.phase, rise, sx, sy]);

  const img = occ.kind === 'lure' ? images.lure : occ.kind === 'golden' ? images.golden
    : occ.phase === 'bonked' ? images.dazed : occ.phase === 'peek' ? images.peek : images.pop;

  // Geometry from the hole art (1024 px square): the plate spans 861 px, the
  // mouth (the dark interior) is centred at (514, 478) with radii 314 x 166.
  const g = useMemo(() => {
    const S = (cell.size * 1024) / 861;
    const u = S / 1024;
    const mx = cell.cx;
    const my = cell.y + cell.size * 0.68;
    const rx = 314 * u;
    const ry = 166 * u;
    const clip = Skia.Path.Make();
    clip.addRect(Skia.XYWHRect(cell.x - 20, cell.y - cell.size, cell.size + 40, my - (cell.y - cell.size)));
    clip.addOval(Skia.XYWHRect(mx - rx, my - ry, rx * 2, ry * 2));
    return { S, imgX: mx - 514 * u, imgY: my - 478 * u, mx, my, rx, ry, clip };
  }, [cell]);

  // Every rim bumps on the beat (render only).
  const plateX = useDerivedValue(() => g.mx - (g.S * pulse.value) / 2 + (g.imgX - (g.mx - g.S / 2)) * pulse.value);
  const plateY = useDerivedValue(() => g.my - (g.S * pulse.value) / 2 + (g.imgY - (g.my - g.S / 2)) * pulse.value);
  const plateS = useDerivedValue(() => g.S * pulse.value);
  const glowOpacity = useDerivedValue(() => glow.value);
  const pips = useMemo(() => {
    const colors = pipColors.length ? pipColors : [BRAND.gold];
    const n = Math.max(6, colors.length * 3);
    return Array.from({ length: n }, (_, i) => ({ i, n, color: colors[i % colors.length] }));
  }, [pipColors]);

  const sprite = cell.size * 1.12;
  const travel = cell.size * 0.5;
  const x = useDerivedValue(() => g.mx - (sprite * sx.value) / 2);
  const y = useDerivedValue(() => g.my + g.ry * 0.9 - sprite * sy.value * (0.05 + 0.95 * rise.value) - travel * 0.25 * rise.value);
  const ww = useDerivedValue(() => sprite * sx.value);
  const hh = useDerivedValue(() => sprite * sy.value);

  return (
    <Group>
      {shared ? (
        <Group opacity={glowOpacity}>
          <Oval x={g.mx - g.rx * 1.42} y={g.my - g.ry * 1.75} width={g.rx * 2.84} height={g.ry * 3.5} color="rgba(255,207,59,0.55)" />
          <Oval x={g.mx - g.rx * 1.42} y={g.my - g.ry * 1.75} width={g.rx * 2.84} height={g.ry * 3.5} color={BRAND.gold} style="stroke" strokeWidth={5} />
        </Group>
      ) : null}
      {images.hole ? <SkiaImage image={images.hole} x={plateX} y={plateY} width={plateS} height={plateS} fit="fill" />
        : <Oval x={g.mx - g.rx * 1.35} y={g.my - g.ry * 1.6} width={g.rx * 2.7} height={g.ry * 3.2} color={BRAND.navy} />}
      {/* Teal water in the mouth (no black voids) with a white back-lip rim light. */}
      <Oval x={g.mx - g.rx * 0.99} y={g.my - g.ry * 0.98} width={g.rx * 1.98} height={g.ry * 1.96}>
        <LinearGradient start={vec(0, g.my - g.ry)} end={vec(0, g.my + g.ry)} colors={['#1c8fa6', '#46c3d1']} />
      </Oval>
      <Oval x={g.mx - g.rx * 0.8} y={g.my - g.ry * 0.9} width={g.rx * 1.6} height={g.ry * 0.5} color="rgba(255,255,255,0.28)" />
      {occ.phase !== 'none' && occ.phase !== 'tell' && img ? (
        <Group clip={g.clip}>
          <SkiaImage image={img} x={x} y={y} width={ww} height={hh} fit="contain" />
        </Group>
      ) : null}
      {shared && occ.phase !== 'tell' ? pips.map((p) => <Pip key={p.i} index={p.i} count={p.n} color={p.color} spin={spin} cx={g.mx} cy={g.my - g.ry * 0.4} rx={g.rx * 1.25} ry={g.ry * 1.9} />) : null}
    </Group>
  );
});

/** One pip of the Shared Golden ring, in a seated player's color: it reads "everyone's". */
function Pip({ index, count, color, spin, cx, cy, rx, ry }: { index: number; count: number; color: string; spin: SharedValue<number>; cx: number; cy: number; rx: number; ry: number }) {
  const px = useDerivedValue(() => cx + rx * Math.cos(spin.value + (index * Math.PI * 2) / count));
  const py = useDerivedValue(() => cy + ry * Math.sin(spin.value + (index * Math.PI * 2) / count));
  return (
    <Group>
      <Circle cx={px} cy={py} r={7} color={BRAND.navy} />
      <Circle cx={px} cy={py} r={4.5} color={color} />
    </Group>
  );
}

// ---------------------------------------------------------------- juice

/** LAST 2 BARS: a banner for one beat and a gold vignette that breathes on the beat. */
function LastBars() {
  const banner = useSharedValue(0);
  const vignette = useSharedValue(0);
  useEffect(() => {
    banner.value = withSequence(withTiming(1, { duration: 240, easing: Easing.out(Easing.back(1.8)) }), withTiming(1, { duration: 441 }), withTiming(0, { duration: 200 }));
    vignette.value = withTiming(1, { duration: 400 });
  }, [banner, vignette]);
  const bStyle = useAnimatedStyle(() => ({ opacity: banner.value, transform: [{ scale: 0.7 + 0.3 * banner.value }] }));
  const vStyle = useAnimatedStyle(() => ({ opacity: vignette.value }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.vignette, vStyle]} />
      <Animated.View pointerEvents="none" style={[styles.lastBars, bStyle]}>
        <Text style={styles.lastBarsText}>LAST 2 BARS</Text>
      </Animated.View>
    </>
  );
}

/** My SNATCH: the stamp slams onto the board edge (1.8 -> 1.0 in 120 ms). */
function SnatchStamp() {
  const s = useSharedValue(1.8);
  const o = useSharedValue(1);
  useEffect(() => {
    s.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.back(2)) });
    o.value = withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 220 }));
  }, [o, s]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }, { rotate: '-6deg' }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.snatchWrap, style]}>
      <View style={styles.snatch}>
        <Text style={styles.snatchText}>SNATCHED</Text>
        <Text style={styles.snatchSub}>+200</Text>
      </View>
    </Animated.View>
  );
}

const FlyUpText = memo(function FlyUpText({ x, y, text, color, big }: Omit<FlyUp, 'key'>) {
  const s = useSharedValue(0.6);
  const ty = useSharedValue(0);
  const o = useSharedValue(1);
  useEffect(() => {
    s.value = withSequence(withTiming(1.15, { duration: 80 }), withSpring(1, { damping: 10, stiffness: 300 }));
    ty.value = withTiming(-52, { duration: 560, easing: Easing.out(Easing.cubic) });
    o.value = withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 180 }));
  }, [o, s, ty]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: ty.value }, { scale: s.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.flyWrap, { left: x - 90, top: y - 18 }, style]}>
      <Text style={[styles.fly, { color, fontSize: big ? 26 : 20 }]}>{text}</Text>
    </Animated.View>
  );
});

function TierBadge({ tier }: { tier: number }) {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withSequence(withTiming(1.3, { duration: 120, easing: Easing.out(Easing.back(2)) }), withSpring(1, { damping: 9, stiffness: 300 }));
  }, [s, tier]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const color = tier >= 30 ? '#ff8a5c' : tier >= 20 ? BRAND.gold : tier >= 15 ? '#1fc8b8' : '#00a5f5';
  return (
    <Animated.View pointerEvents="none" style={[styles.tier, { backgroundColor: color }, style]}>
      <Text style={styles.tierText}>{`x${(tier / 10).toString()}`}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  vignette: { borderWidth: 18, borderColor: 'rgba(255,207,59,0.22)', borderRadius: 24 },
  lastBars: { position: 'absolute', top: 6, alignSelf: 'center', backgroundColor: BRAND.gold, borderColor: BRAND.navy, borderWidth: 3, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4 },
  lastBarsText: { fontFamily: FONT.display, fontSize: 24, color: BRAND.white, letterSpacing: 1, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  snatchWrap: { position: 'absolute', left: 12, top: 8 },
  snatch: { backgroundColor: BRAND.white, borderColor: BRAND.gold, borderWidth: 4, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 2, alignItems: 'center' },
  snatchText: { fontFamily: FONT.display, fontSize: 26, color: BRAND.gold, letterSpacing: 1, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  snatchSub: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy },
  coralWash: { backgroundColor: 'rgba(255,107,92,0.45)' },
  flyWrap: { position: 'absolute', width: 180, alignItems: 'center' },
  fly: {
    fontFamily: FONT.display,
    textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0.1,
    letterSpacing: 0.5,
  },
  tier: {
    position: 'absolute',
    right: 14,
    top: 10,
    borderColor: BRAND.navy,
    borderWidth: 3,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  tierText: {
    fontFamily: FONT.display,
    fontSize: 24,
    color: BRAND.white,
    textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0.1,
  },
});
