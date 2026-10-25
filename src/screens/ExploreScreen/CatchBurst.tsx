/**
 * Wave 4: the catch's gold burst in ONE Skia canvas, every transform read straight from the UI-thread clock.
 *
 * Round 5 drew the bloom, the inked rays and Alex's ink burst as Animated.View wrappers. On Fabric with
 * Reanimated 3.16.7 a view's animated style can be reset by a React commit (its first-render style is the
 * hidden one), and the clips showed the burst blinking out for 40 to 200 ms mid-hold. Skia nodes take shared
 * values as props and redraw on the UI thread, so no React commit is ever on the burst's path: the canvas
 * mounts once per catch (during the wind-up, long before the burst) and nothing in it re-renders until it goes.
 * Wave 5: it also redraws only inside the burst's window (the gold, the ink, the confetti), never in the wind-up or flight.
 *
 * What it draws, from back to front: the soft gold bloom, on milestones the hand-inked spike fan (CatchRaysArt) and
 * a second ring of rays turning the other way, Alex's inked gold burst image, and on the grand
 * catch a capped shower of gold, white and blue confetti with navy ink edges. Blue, white and gold only.
 */
import { memo, useEffect, useState } from 'react';
import { Image as RNImage, StyleSheet } from 'react-native';
import { Canvas, Group, Image as SkImageNode, RoundedRect, Skia, type SkImage } from '@shopify/react-native-skia';
import { useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { CatchRaysArt } from './CatchRays';
import { CONFETTI, catchFrame, confettiAt, type CatchFrame, type CatchPlan } from '../../components/map/alive/mapWow';
import { BRAND } from '../../ui';
import { GOLD_FX } from '../../ui/motion';

const INK_BURST = require('../../../assets/fx/burst-gold.webp');
export const BURST_INK_SIZE = 220;

/** Alex's ink burst as a Skia image, decoded once for the app's life (every catch reuses it). */
let inkImage: SkImage | null = null;
let inkLoad: Promise<SkImage | null> | null = null;
export function loadBurstInk(): Promise<SkImage | null> {
  if (inkImage) return Promise.resolve(inkImage);
  if (!inkLoad) {
    const uri = RNImage.resolveAssetSource(INK_BURST)?.uri;
    inkLoad = !uri ? Promise.resolve(null) : Skia.Data.fromURI(uri)
      .then(data => { inkImage = Skia.Image.MakeImageFromEncoded(data); return inkImage; })
      .catch(() => { inkLoad = null; return null; });
  }
  return inkLoad;
}

const HIDE = [{ translateX: -9999 }, { translateY: -9999 }, { scale: 0 }];
const CONFETTI_TINTS = [GOLD_FX.rays, BRAND.white, GOLD_FX.glow, BRAND.skyDeep];

export interface BurstValues {
  readonly frame: SharedValue<CatchFrame>;
  readonly clock: SharedValue<number>;
  readonly plan: SharedValue<CatchPlan>;
  /** 1 while a common's clock drives the catch. */
  readonly on: SharedValue<number>;
  readonly sx: SharedValue<number>;
  readonly sy: SharedValue<number>;
  /** The burst variant's size, its per-catch turn (deg) and the grand flag (0 or 1). */
  readonly inkScale: SharedValue<number>;
  readonly inkTurn: SharedValue<number>;
  readonly grand: SharedValue<number>;
  /** Wave 5 round 2: 1 on milestones: the spike fan behind Alex's star, and the second ring turning the other way. */
  readonly fan: SharedValue<number>;
  readonly ring2: SharedValue<number>;
}

/** One confetti piece: a small inked card that pops out and flutters down (UI thread, no React). */
function Confetto({ index, count, v, bt }: { readonly index: number; readonly count: number; readonly v: BurstValues; readonly bt: SharedValue<number> }) {
  const w = index % 3 === 0 ? 20 : 14, h = index % 3 === 0 ? 11 : 17;
  const transform = useDerivedValue(() => {
    const c = bt.value >= 0 && v.grand.value ? confettiAt(bt.value, v.plan.value, index, count) : null;
    if (!c) return HIDE;
    return [{ translateX: v.sx.value + c.x }, { translateY: v.sy.value + c.y }, { rotate: c.rot }, { scaleX: Math.max(0.15, Math.abs(c.sx)) }];
  });
  const opacity = useDerivedValue(() => {
    const c = bt.value >= 0 && v.grand.value ? confettiAt(bt.value, v.plan.value, index, count) : null;
    return c ? c.alpha : 0;
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <RoundedRect x={-w / 2} y={-h / 2} width={w} height={h} r={2} color={CONFETTI_TINTS[index % CONFETTI_TINTS.length]} />
      <RoundedRect x={-w / 2} y={-h / 2} width={w} height={h} r={2} color={BRAND.navy} style="stroke" strokeWidth={1.2} />
    </Group>
  );
}

function CatchBurst({ v, goldSize, confetti }: { readonly v: BurstValues; readonly goldSize: number; readonly confetti: number }) {
  const [ink, setInk] = useState<SkImage | null>(inkImage);
  useEffect(() => {
    if (ink) return undefined;
    let live = true;
    void loadBurstInk().then(image => { if (live && image) setInk(image); });
    return () => { live = false; };
  }, [ink]);
  const half = goldSize / 2;

  // Wave 5: the canvas only redraws while something in it shows. `bt` is the catch clock inside the burst's window
  // (the gold, the ink and the grand confetti) and -1 everywhere else, written only when it changes, so the
  // wind-up, the flight and the rest of the catch never redraw this full-screen canvas.
  const bt = useSharedValue(-1);
  useAnimatedReaction(() => {
    if (!v.on.value) return -1;
    const f = v.frame.value;
    const t = v.clock.value;
    const p = v.plan.value;
    const confettiLive = v.grand.value > 0 && t >= p.burstAt && t < p.burstAt + CONFETTI.ms;
    return f.gold > 0 || f.ink >= 0 || confettiLive ? t : -1;
  }, (t, prev) => { if (t !== prev) bt.value = t; });
  const bf = useDerivedValue<CatchFrame | null>(() => (bt.value < 0 ? null : catchFrame(bt.value, v.plan.value)));

  // The bloom and rays: swell in with the burst, breathe and turn slowly through the hold, then suck back into the find.
  const goldT = useDerivedValue(() => {
    const f = bf.value;
    const g = f ? f.gold : 0;
    if (!f || g <= 0) return HIDE;
    const b = bt.value - v.plan.value.burstAt;
    const breathe = 1 + 0.03 * Math.sin(b / 85);
    const s = v.inkScale.value * (0.5 + 0.5 * g + 0.12 * f.bloom) * breathe * (1 - f.suck * f.suck);
    return [{ translateX: v.sx.value }, { translateY: v.sy.value }, { scale: s },
      { rotate: (v.inkTurn.value * 0.5 + b * 0.018) * Math.PI / 180 }, { translateX: -half }, { translateY: -half }];
  });
  const goldO = useDerivedValue(() => {
    const f = bf.value;
    const g = f ? f.gold : 0;
    if (!f || g <= 0) return 0;
    return Math.min(1, g * 1.1) * (f.suck < 0.6 ? 1 : 1 - (f.suck - 0.6) / 0.4);
  });
  // Wave 5 round 2: the spike fan only on milestones (a common is Alex's star on the bloom alone).
  const fanO = useDerivedValue(() => (v.fan.value ? goldO.value : 0));
  // The milestone's second ring: a touch bigger, turning the other way, under the ink.
  const ringT = useDerivedValue(() => {
    const f = bf.value;
    const g = f && v.ring2.value ? f.gold : 0;
    if (!f || g <= 0) return HIDE;
    const b = bt.value - v.plan.value.burstAt;
    const s = v.inkScale.value * 1.16 * (0.45 + 0.55 * g) * (1 - f.suck * f.suck);
    return [{ translateX: v.sx.value }, { translateY: v.sy.value }, { scale: s },
      { rotate: (11.25 - b * 0.05) * Math.PI / 180 }, { translateX: -half }, { translateY: -half }];
  });
  const ringO = useDerivedValue(() => {
    const f = bf.value;
    const g = f && v.ring2.value ? f.gold : 0;
    return !f || g <= 0 ? 0 : 0.85 * Math.min(1, g * 1.1) * (f.suck < 0.5 ? 1 : 1 - (f.suck - 0.5) / 0.5);
  });
  // Alex's inked burst: snaps out past full size, holds (the screenshot frame), then sucks back into the find.
  const inkT = useDerivedValue(() => {
    const f = bf.value;
    const p = f ? f.ink : -1;
    if (!f || p < 0) return HIDE;
    const b = bt.value - v.plan.value.burstAt;
    const grow = Math.min(1, b / 140);
    const suck = f.suck;
    const pull = 1 - suck * suck * suck;
    // The ink grows with the tier only up to 1.25x (the grand's extra size goes to the rays and bloom, so it reads
    // as a bigger sunburst, never a heavier mace).
    const s = Math.min(1.25, v.inkScale.value) * 0.78 * (0.35 + 0.85 * (1 - (1 - grow) * (1 - grow)) + 0.08 * p) * (1 + 0.025 * Math.sin(b / 70)) * pull;
    return [{ translateX: v.sx.value }, { translateY: v.sy.value }, { scale: s },
      { rotate: (v.inkTurn.value + 12 * p - 40 * suck) * Math.PI / 180 }];
  });
  const inkO = useDerivedValue(() => {
    const f = bf.value;
    const p = f ? f.ink : -1;
    if (!f || p < 0) return 0;
    const suck = f.suck;
    return suck < 0.7 ? 1 : Math.max(0, 1 - (suck - 0.7) / 0.3);
  });

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group transform={goldT} opacity={goldO}>
        <CatchRaysArt size={goldSize} bloomOnly />
      </Group>
      <Group transform={goldT} opacity={fanO}>
        <CatchRaysArt size={goldSize} raysOnly />
      </Group>
      <Group transform={ringT} opacity={ringO}>
        <CatchRaysArt size={goldSize} raysOnly />
      </Group>
      {ink && <Group transform={inkT} opacity={inkO}>
        <SkImageNode image={ink} x={-BURST_INK_SIZE / 2} y={-BURST_INK_SIZE / 2} width={BURST_INK_SIZE} height={BURST_INK_SIZE} fit="contain" />
      </Group>}
      {Array.from({ length: confetti }, (_, index) => <Confetto key={index} index={index} count={confetti} v={v} bt={bt} />)}
    </Canvas>
  );
}

export default memo(CatchBurst);
