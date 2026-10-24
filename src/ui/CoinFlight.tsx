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
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import GameIcon from './GameIcon';
import { BEZIER } from './motion';
import { Z } from './tokens';

export interface Point { readonly x: number; readonly y: number }

/** EASE.inOut as a plain worklet curve (the coin reads its own window of one shared clock). */
const IN_OUT = Easing.bezierFn(BEZIER.inOut[0], BEZIER.inOut[1], BEZIER.inOut[2], BEZIER.inOut[3]);

/** The coin flight (pure data, unit tested). */
export const COIN_FLIGHT = {
  /** Coins in one flight at most (inside the 12-sprite cap with room to spare). */
  max: 6,
  flyMs: 560,
  staggerMs: 70,
  /** Coin size (pt): big enough to read as a coin on a phone. */
  size: 22,
  /** How high the arc rises over the straight line (pt), plus a little per coin. */
  arcPt: 90,
  arcStepPt: 10,
  /** Mid-air pop past full size. */
  midScale: 1.18,
} as const;

/** Where coin i of n starts and lands (it leaves i * staggerMs late). Pure (unit tested). */
export function coinLandTimes(n: number, startAt = 0): number[] {
  const k = Math.max(0, Math.min(COIN_FLIGHT.max, Math.floor(n)));
  return Array.from({ length: k }, (_, i) => startAt + i * COIN_FLIGHT.staggerMs + COIN_FLIGHT.flyMs);
}

/** Coin i of n at flight time t (0 to 1): a quadratic arc from `from` to `to`. Pure worklet (unit tested). */
export function coinAt(t: number, i: number, n: number, from: Point, to: Point): { x: number; y: number; scale: number; rot: number } {
  'worklet';
  const spread = n > 1 ? i / (n - 1) - 0.5 : 0;
  // The control point: above the middle of the line, fanned a little per coin so they read as several.
  const cx = (from.x + to.x) / 2 + spread * 70;
  const cy = Math.min(from.y, to.y) - COIN_FLIGHT.arcPt - (i % 3) * COIN_FLIGHT.arcStepPt;
  const u = 1 - t;
  const x = u * u * from.x + 2 * u * t * cx + t * t * to.x;
  const y = u * u * from.y + 2 * u * t * cy + t * t * to.y;
  const scale = t < 0.5 ? 0.7 + (COIN_FLIGHT.midScale - 0.7) * (t / 0.5) : COIN_FLIGHT.midScale - (COIN_FLIGHT.midScale - 0.85) * ((t - 0.5) / 0.5);
  return { x, y, scale, rot: (i % 2 ? 1 : -1) * 220 * t };
}

type Flight = { id: number; from: Point; to: Point; count: number; size: number; onLand?: (i: number) => void; onDone?: () => void };
let nextId = 1;
const hosts = new Set<(f: Flight) => void>();

/** Fly `count` coins from one window point to another. Returns false when no host is mounted. */
export function flyCoins(f: Omit<Flight, 'id' | 'size'> & { readonly size?: number }): boolean {
  if (!hosts.size || f.count <= 0) return false;
  const flight: Flight = { ...f, id: nextId++, count: Math.min(COIN_FLIGHT.max, Math.floor(f.count)), size: f.size ?? COIN_FLIGHT.size };
  hosts.forEach(h => h(flight));
  return true;
}

/** Wallet chips coins can fly into (the newest focused one wins). `onHit` runs as each coin lands in it. */
type Measure = (done: (p: Point | null) => void) => void;
type Target = { id: string; measure: Measure; onHit?: (i: number) => void };
const targets: Target[] = [];
export function registerCoinTarget(id: string, measure: Measure, onHit?: (i: number) => void): () => void {
  const entry: Target = { id, measure, onHit };
  targets.push(entry);
  return () => { const i = targets.indexOf(entry); if (i >= 0) targets.splice(i, 1); };
}
/** Where coins should land right now (the newest registered wallet chip), or null, with its hit answer. */
export function measureCoinTarget(done: (p: Point | null, onHit?: (i: number) => void) => void): void {
  const top = targets[targets.length - 1];
  if (!top) { done(null); return; }
  top.measure(p => done(p, top.onHit));
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
    p.value = withTiming(total, { duration: total }, finished => { if (finished) runOnJS(onDone)(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{Array.from({ length: flight.count }, (_, i) => <FlyingCoin key={i} clock={p} i={i} flight={flight} />)}</>;
}

const FlyingCoin = memo(function FlyingCoin({ clock, i, flight }: { readonly clock: SharedValue<number>; readonly i: number; readonly flight: Flight }) {
  const n = flight.count;
  const half = flight.size / 2;
  const onLand = flight.onLand;
  useAnimatedReaction(() => clock.value >= i * COIN_FLIGHT.staggerMs + COIN_FLIGHT.flyMs, (now, before) => {
    if (now && !before && onLand) runOnJS(onLand)(i);
  });
  const style = useAnimatedStyle(() => {
    const raw = (clock.value - i * COIN_FLIGHT.staggerMs) / COIN_FLIGHT.flyMs;
    if (raw <= 0 || raw >= 1) return { opacity: 0 };
    const t = IN_OUT(raw);
    const at = coinAt(t, i, n, flight.from, flight.to);
    return {
      opacity: raw < 0.08 ? raw / 0.08 : 1,
      transform: [{ translateX: at.x - half }, { translateY: at.y - half }, { rotate: `${at.rot}deg` }, { scale: at.scale }],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: flight.size, height: flight.size }, style]}>
      <GameIcon name="coin" size={flight.size} />
    </Animated.View>
  );
});
