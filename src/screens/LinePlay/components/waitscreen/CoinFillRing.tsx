/**
 * CoinFillRing: the ring around the wait screen coin, drawn in Skia on the UI
 * thread. One notch per Part the next level costs, so each Part that lands
 * lights the next notch.
 *
 * Layers, back to front: tier halo (breathes when ready), the inked navy
 * outline (the house hand-drawn keyline), the water track, the gold fill arc
 * with a white highlight, notch ticks, the "ready" comet that circles the rim,
 * and the landing spark at the fill head when a Part arrives.
 *
 * Battery: every loop runs only while `active` (screen focused, app in the
 * foreground, no game covering it) and never under Reduce Motion. A Part
 * landing is a one-shot 700 ms tween. Nothing re-renders React per frame.
 */
import { memo, useEffect, useMemo } from 'react';
import { Blur, Canvas, Circle, Group, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { coinTier } from '../../../../constants/coinTiers';
import { BRAND } from '../../../../ui/tokens';

export interface CoinFillRingProps {
  readonly size: number;
  readonly level: number;
  /** 0..1 toward the next level. */
  readonly fill: number;
  /** 0 draws a smooth arc. */
  readonly notches: number;
  readonly ready: boolean;
  readonly maxed: boolean;
  /** Bump to play the landing spark (a Part just landed). */
  readonly landKey: number;
  /** Bump to play the level-up charge spin. */
  readonly chargeKey: number;
  readonly active: boolean;
  readonly reducedMotion: boolean;
  /** Unowned coin: a quiet dashed ring. */
  readonly ghost?: boolean;
}

const SPARKS = 7;

function CoinFillRing({ size, level, fill, notches, ready, maxed, landKey, chargeKey, active, reducedMotion,
  ghost = false }: CoinFillRingProps) {
  const tier = coinTier(level);
  const stroke = Math.max(8, Math.round(size * 0.075));
  const ink = Math.max(2, Math.round(stroke * 0.32));
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - stroke / 2 - ink - 6;

  const progress = useSharedValue(fill);
  const land = useSharedValue(0);
  const breathe = useSharedValue(0);
  const spin = useSharedValue(0);
  const charge = useSharedValue(0);

  // The fill eases to each new Part with a soft overshoot.
  useEffect(() => {
    const target = maxed ? 1 : Math.max(0, Math.min(1, fill));
    progress.value = reducedMotion ? target
      : withDelay(120, withSpring(target, { damping: 14, stiffness: 90, mass: 0.9 }));
  }, [fill, maxed, reducedMotion, progress]);

  useEffect(() => {
    if (landKey === 0 || reducedMotion) return undefined;
    land.value = 0;
    land.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(land);
  }, [landKey, reducedMotion, land]);

  useEffect(() => {
    if (chargeKey === 0 || reducedMotion) return undefined;
    charge.value = 0;
    charge.value = withSequence(withTiming(1, { duration: 900, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: 260 }));
    return () => cancelAnimation(charge);
  }, [chargeKey, reducedMotion, charge]);

  // Idle loops: only while active, never under Reduce Motion.
  const loops = active && !reducedMotion && !ghost && (ready || maxed);
  useEffect(() => {
    if (!loops) {
      cancelAnimation(breathe); cancelAnimation(spin);
      breathe.value = ready ? 0.6 : 0;
      return undefined;
    }
    breathe.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: ready ? 2200 : 6000, easing: Easing.linear }), -1, false);
    return () => { cancelAnimation(breathe); cancelAnimation(spin); };
  }, [loops, ready, breathe, spin]);

  const track = useMemo(() => { const p = Skia.Path.Make(); p.addCircle(cx, cy, r); return p; }, [cx, cy, r]);
  const ticks = useMemo(() => {
    const p = Skia.Path.Make();
    if (notches < 2) return p;
    for (let i = 0; i < notches; i++) {
      const a = -Math.PI / 2 + (i / notches) * Math.PI * 2;
      const inner = r - stroke / 2 - 1;
      const outer = r + stroke / 2 + 1;
      p.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      p.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    }
    return p;
  }, [notches, cx, cy, r, stroke]);

  const arc = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    const f = Math.max(0, Math.min(1, progress.value));
    if (f > 0.001) p.addArc(Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2), -90, 360 * f);
    return p;
  }, [progress, cx, cy, r]);
  const shine = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    const f = Math.max(0, Math.min(1, progress.value));
    const inset = stroke * 0.22;
    if (f > 0.02) p.addArc(Skia.XYWHRect(cx - r + inset, cy - r + inset, (r - inset) * 2, (r - inset) * 2),
      -86, Math.max(0, 360 * f - 8));
    return p;
  }, [progress, cx, cy, r, stroke]);
  const comet = useDerivedValue<SkPath>(() => {
    const p = Skia.Path.Make();
    const t = spin.value + charge.value * 1.5;
    if (!(ready || maxed) && charge.value === 0) return p;
    p.addArc(Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2), -90 + t * 360, 46 + charge.value * 120);
    return p;
  }, [spin, charge, cx, cy, r, ready, maxed]);
  const haloOpacity = useDerivedValue(() =>
    (ready || maxed ? 0.35 + breathe.value * 0.4 : 0.18) + land.value * (1 - land.value) * 1.6 + charge.value * 0.5,
  [breathe, land, charge, ready, maxed]);
  const haloRadius = useDerivedValue(() => r + stroke * (0.6 + breathe.value * 0.35 + charge.value * 0.8), [breathe, charge]);
  const sparkOpacity = useDerivedValue(() => (land.value > 0 && land.value < 1 ? 1 - land.value : 0), [land]);

  // Sparks fly from the head of the fill (where the newest Part landed).
  const sparks = useDerivedValue(() => {
    const p = Skia.Path.Make();
    if (land.value <= 0 || land.value >= 1) return p;
    const head = -Math.PI / 2 + Math.max(0, Math.min(1, progress.value)) * Math.PI * 2;
    const hx = cx + Math.cos(head) * r;
    const hy = cy + Math.sin(head) * r;
    for (let i = 0; i < SPARKS; i++) {
      const a = head + (i / SPARKS) * Math.PI * 2;
      const d = stroke * (0.6 + land.value * 2.4);
      const s = Math.max(0.5, stroke * 0.3 * (1 - land.value));
      p.addCircle(hx + Math.cos(a) * d, hy + Math.sin(a) * d, s);
    }
    return p;
  }, [land, progress, cx, cy, r, stroke]);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={cx} cy={cy} r={haloRadius} color={tier.halo} opacity={ghost ? 0 : haloOpacity}>
        <Blur blur={stroke * 0.9} />
      </Circle>
      {/* The inked keyline under the ring: the house hand-drawn outline. */}
      <Path path={track} style="stroke" strokeWidth={stroke + ink * 2} color={BRAND.navy} opacity={ghost ? 0.35 : 0.9} />
      <Path path={track} style="stroke" strokeWidth={stroke} color={ghost ? 'rgba(255,255,255,0.18)' : 'rgba(191,229,255,0.55)'} />
      {!ghost && (
        <Group>
          <Path path={arc} style="stroke" strokeWidth={stroke} strokeCap="round"
            color={maxed ? BRAND.gold : tier.level >= 6 ? tier.ring : BRAND.gold} />
          <Path path={shine} style="stroke" strokeWidth={Math.max(1.5, stroke * 0.22)} strokeCap="round"
            color="rgba(255,255,255,0.75)" />
          <Path path={comet} style="stroke" strokeWidth={stroke * 0.5} strokeCap="round" color="#ffffff" opacity={0.85} />
        </Group>
      )}
      <Path path={ticks} style="stroke" strokeWidth={Math.max(1.5, ink * 0.9)} color={BRAND.navy} opacity={ghost ? 0.3 : 0.75} />
      <Path path={sparks} color="#fff6c7" opacity={sparkOpacity} />
    </Canvas>
  );
}

export default memo(CoinFillRing);
