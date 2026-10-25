/**
 * Coins that fly to where they live: from the thing you tapped into your wallet (a gain), or out of
 * your wallet into the thing you bought (a spend). A 7-year-old can point to where the coins went.
 *
 *   <CoinFlightHost />                                    // mounted once in Root, above the screens
 *   flyCoins({ from, to, count: 5, onLand: i => ... });   // window points
 *   const off = registerCoinTarget(id, measure);          // a wallet chip that coins can fly into
 *
 * Each coin leaves COIN_FLIGHT.staggerMs after the one before, arcs up over the straight line
 * between the two points (EASE.inOut, a little spin, a pop past full size mid-air) and lands with a
 * small squash. Counts go through momentParticles at the call site and never pass COIN_FLIGHT.max.
 * Transforms and opacity only, on the UI thread; the host renders nothing while no coins fly.
 */
import { memo, useEffect, useState } from 'react';
import { Image as RNImage, StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withTiming,
  type SharedValue } from 'react-native-reanimated';
import CoinTrails from '../fx/CoinTrails';
import { ICON_SOURCES, type GameIconName } from './GameIcon';
import { resolveIconName } from './iconNames';
import SparkleBurst from './SparkleBurst';
import { DURATION, EASE } from './motionEasing';
import { BEZIER } from './motion';
import { Z } from './tokens';

export interface Point { readonly x: number; readonly y: number }

/** EASE.inOut as a plain worklet curve (the coin reads its own window of one shared clock). */
/** EASE.out for a prize: it leaves the card at once (an ease-in start read as a gift parked on the screen). */
export const PRIZE_OUT = Easing.bezierFn(BEZIER.out[0], BEZIER.out[1], BEZIER.out[2], BEZIER.out[3]);
export const IN_OUT = Easing.bezierFn(BEZIER.inOut[0], BEZIER.inOut[1], BEZIER.inOut[2], BEZIER.inOut[3]);

/** The coin flight (pure data, unit tested). */
export const COIN_FLIGHT = {
  /** Coins in one flight at most: a handful a kid can see pour in (still under the 12-sprite cap). */
  max: 10,
  flyMs: 560,
  staggerMs: 55,
  /** Coin size (pt): a real coin on a phone, not a dot. */
  size: 26,
  /** How high the arc rises over the straight line (pt), plus a little per coin. */
  arcPt: 96,
  arcStepPt: 12,
  /** How wide the coins fan out around the arc (pt). */
  spreadPt: 200,
  /** Mid-air pop past full size. */
  midScale: 1.22,
  /** Gold stars that pop where the last coin lands (gains only, through the power budget). */
  endSparkles: 7,
  /**
   * A big gain (a hundred coins or more) is a bigger show: bigger coins thrown in a wider fan, each one
   * pulling a short gold trail, with more stars where they land.
   */
  big: { size: 34, spreadPt: 320, arcPt: 130, trailDots: 4, trailStep: 0.045, trailPt: 7, endSparkles: 10 },
  /** A prize going to the shelf: a low arc (it heads for the shelf at once, never up and away first). */
  prizeArcPt: 44,
} as const;

/** Where coin i of n starts and lands (it leaves i * staggerMs late). Pure (unit tested). */
export function coinLandTimes(n: number, startAt = 0): number[] {
  const k = Math.max(0, Math.min(COIN_FLIGHT.max, Math.floor(n)));
  return Array.from({ length: k }, (_, i) => startAt + i * COIN_FLIGHT.staggerMs + COIN_FLIGHT.flyMs);
}

/** Coin i of n at flight time t (0 to 1): a quadratic arc from `from` to `to`. Pure worklet (unit tested). */
export function coinAt(t: number, i: number, n: number, from: Point, to: Point, big = false, arcPt?: number):
  { x: number; y: number; scale: number; rot: number } {
  'worklet';
  const spread = n > 1 ? i / (n - 1) - 0.5 : 0;
  // The control point: above the middle of the line, fanned a little per coin so they read as several
  // (a big gain throws a wider, higher fan).
  const cx = (from.x + to.x) / 2 + spread * (big ? COIN_FLIGHT.big.spreadPt : COIN_FLIGHT.spreadPt);
  const cy = Math.min(from.y, to.y) - (arcPt ?? (big ? COIN_FLIGHT.big.arcPt : COIN_FLIGHT.arcPt)) - (i % 3) * COIN_FLIGHT.arcStepPt;
  const u = 1 - t;
  const x = u * u * from.x + 2 * u * t * cx + t * t * to.x;
  const y = u * u * from.y + 2 * u * t * cy + t * t * to.y;
  const scale = t < 0.5 ? 0.7 + (COIN_FLIGHT.midScale - 0.7) * (t / 0.5) : COIN_FLIGHT.midScale - (COIN_FLIGHT.midScale - 0.85) * ((t - 0.5) / 0.5);
  return { x, y, scale, rot: (i % 2 ? 1 : -1) * 220 * t };
}

export type Flight = { id: number; from: Point; to: Point; count: number; size: number; onLand?: (i: number) => void; onDone?: () => void;
  /** The moment the coins really start moving (the host mounted the flight), to time what answers them. */
  onStart?: () => void;
  /** Counted up on the UI thread as each coin lands (the wallet squashes and rolls on the same frame). */
  landed?: SharedValue<number>;
  /** Counted up on the UI thread as each coin leaves. */
  left?: SharedValue<number>;
  /** A little pop of gold stars where the last coin lands (a gain coming home). */
  sparkleEnd?: boolean;
  /** A big gain: bigger coins in a wider fan, each with a gold trail (COIN_FLIGHT.big). */
  big?: boolean;
  /** The coins leave this long after the call (timed on the UI thread, never a JS timer). */
  delayMs?: number;
  /** Fly this icon instead of a coin (a prize going to the shelf). */
  icon?: GameIconName;
  /** The size it lands at, as a share of its size (a big prize shrinks into a small footer icon). */
  endScale?: number };
let nextId = 1;
const hosts = new Set<(f: Flight) => void>();

/** Fly `count` coins from one window point to another. Returns false when no host is mounted. */
export function flyCoins(f: Omit<Flight, 'id' | 'size'> & { readonly size?: number }): boolean {
  if (!hosts.size || f.count <= 0) return false;
  const flight: Flight = { ...f, id: nextId++, count: Math.min(COIN_FLIGHT.max, Math.floor(f.count)),
    size: f.size ?? (f.big ? COIN_FLIGHT.big.size : COIN_FLIGHT.size) };
  hosts.forEach(h => h(flight));
  return true;
}

/** Wallet chips coins can fly into (the newest focused one wins). `onHit` runs as each coin lands in it. */
type Measure = (done: (p: Point | null) => void) => void;
/** How a wallet chip answers coins sent to it: a JS hit, a UI-thread landing counter, and a heads-up when coins leave for it. */
export interface CoinTargetAnswer {
  readonly onHit?: (i: number) => void;
  readonly landed?: SharedValue<number>;
  /** Coins are on their way and land within `ms`: a gain that shows up now waits for them instead of flying its own. */
  readonly onIncoming?: (ms: number) => void;
}
type Target = { id: string; measure: Measure } & CoinTargetAnswer;
const targets: Target[] = [];
export function registerCoinTarget(id: string, measure: Measure, answer: CoinTargetAnswer = {}): () => void {
  const entry: Target = { id, measure, ...answer };
  targets.push(entry);
  return () => { const i = targets.indexOf(entry); if (i >= 0) targets.splice(i, 1); };
}
/** Where coins should land right now (the newest registered wallet chip), or null, with how it answers. */
export function measureCoinTarget(done: (p: Point | null, answer?: CoinTargetAnswer) => void): void {
  const top = targets[targets.length - 1];
  if (!top) { done(null); return; }
  top.measure(p => done(p, top));
}
/**
 * Coins are about to be sent to the wallet chip on screen (a reward toast was just asked for): tell it
 * now, synchronously, so a gain that lands in the same tap rolls under those coins instead of flying its own.
 */
export function announceIncomingCoins(ms: number): void {
  targets[targets.length - 1]?.onIncoming?.(ms);
}

/**
 * The shelf: where a prize goes when a kid takes it (the Profile tab, home of the coin shelf). The focused screen's
 * footer registers it with a landing counter, so its icon squashes on the frame the prize lands.
 */
type ShelfTarget = { measure: Measure; landed?: SharedValue<number> };
const shelves: ShelfTarget[] = [];
export function registerShelfTarget(measure: Measure, landed?: SharedValue<number>): () => void {
  const entry: ShelfTarget = { measure, landed };
  shelves.push(entry);
  return () => { const i = shelves.indexOf(entry); if (i >= 0) shelves.splice(i, 1); };
}
/** Where the shelf is right now (the newest registered footer), or null when no footer is on screen. */
export function measureShelfTarget(done: (p: Point | null, landed?: SharedValue<number>) => void): void {
  const top = shelves[shelves.length - 1];
  if (!top) { done(null); return; }
  top.measure(p => done(p, top.landed));
}

/** How long a flight of n coins takes from its first coin leaving to its last coin landing (ms). Pure. */
export function flightMs(n: number): number {
  const k = Math.max(1, Math.min(COIN_FLIGHT.max, Math.floor(n)));
  return (k - 1) * COIN_FLIGHT.staggerMs + COIN_FLIGHT.flyMs;
}

export function CoinFlightHost() {
  const [flights, setFlights] = useState<Flight[]>([]);
  useEffect(() => {
    const add = (f: Flight) => setFlights(prev => [...prev, f]);
    hosts.add(add);
    return () => { hosts.delete(add); };
  }, []);
  if (!flights.length) return null;
  const done = (id: number) => setFlights(prev => prev.filter(f => f.id !== id));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: Z.toast + 1, elevation: Z.toast + 1 }]}>
      {flights.map(f => <FlightRun key={f.id} flight={f} onDone={() => { f.onDone?.(); done(f.id); }} />)}
    </View>
  );
}

function FlightRun({ flight, onDone }: { readonly flight: Flight; readonly onDone: () => void }) {
  const p = useSharedValue(0);
  const total = (flight.count - 1) * COIN_FLIGHT.staggerMs + COIN_FLIGHT.flyMs;
  useEffect(() => {
    // One clock for the whole flight; each coin reads its own window of it.
    p.value = withDelay(flight.delayMs ?? 0, withTiming(total, { duration: total }, finished => { if (finished) runOnJS(onDone)(); }));
    flight.onStart?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The last coin home: a pop of gold stars right where it lands.
  const end = useSharedValue(0);
  const lastLand = total;
  useAnimatedReaction(() => p.value >= lastLand - 10, (now, before) => {
    if (now && !before && flight.sparkleEnd) end.value = withDelay(0, withTiming(1, { duration: DURATION.sparkle, easing: EASE.out }));
  });
  return <>
    {flight.big && <CoinTrails clock={p} count={flight.count} from={flight.from} to={flight.to} prize={flight.icon != null} />}
    {Array.from({ length: flight.count }, (_, i) => <FlyingCoin key={i} clock={p} i={i} flight={flight} />)}
    {flight.sparkleEnd && <SparkleBurst progress={end} count={flight.big ? COIN_FLIGHT.big.endSparkles : COIN_FLIGHT.endSparkles}
      x={flight.to.x} y={flight.to.y} dist={flight.big ? [30, 58] : [22, 42]} size={flight.big ? [16, 24] : [14, 20]} gravity={14} seed={flight.id} />}
  </>;
}

const FlyingCoin = memo(function FlyingCoin({ clock, i, flight }: { readonly clock: SharedValue<number>; readonly i: number; readonly flight: Flight }) {
  const n = flight.count;
  const half = flight.size / 2;
  const onLand = flight.onLand;
  const landed = flight.landed;
  const left = flight.left;
  const prize = flight.icon != null;
  const endScale = flight.endScale ?? 1;
  useAnimatedReaction(() => clock.value >= i * COIN_FLIGHT.staggerMs + COIN_FLIGHT.flyMs, (now, before) => {
    if (!now || before) return;
    if (landed) landed.value += 1;
    if (onLand) runOnJS(onLand)(i);
  });
  useAnimatedReaction(() => clock.value > i * COIN_FLIGHT.staggerMs, (now, before) => {
    if (now && !before && left) left.value += 1;
  });
  const style = useAnimatedStyle(() => {
    const raw = (clock.value - i * COIN_FLIGHT.staggerMs) / COIN_FLIGHT.flyMs;
    if (raw <= 0 || raw >= 1) return { opacity: 0 };
    const t = prize ? PRIZE_OUT(raw) : IN_OUT(raw);
    const at = coinAt(t, i, n, flight.from, flight.to, flight.big === true, prize ? COIN_FLIGHT.prizeArcPt : undefined);
    const shrink = 1 - (1 - endScale) * t;
    // A prize leaves at full size where it stood (no fade in, no spin); coins fade in and spin.
    return {
      opacity: prize || raw >= 0.08 ? 1 : raw / 0.08,
      transform: [{ translateX: at.x - half }, { translateY: at.y - half }, { rotate: `${prize ? at.rot * 0.15 : at.rot}deg` },
        { scale: (prize ? 1 + (at.scale - 1) * 0.5 : at.scale) * shrink }],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: flight.size, height: flight.size }, style]}>
      {/* A plain image view: a pooled expo-image view handed on after a flight showed its gift for a few frames
          on the map's own markers. */}
      <RNImage source={ICON_SOURCES[resolveIconName(flight.icon ?? 'coin') ?? 'coin']} fadeDuration={0} resizeMode="contain"
        style={{ width: flight.size, height: flight.size }} />
    </Animated.View>
  );
});

