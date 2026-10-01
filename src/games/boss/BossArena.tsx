/**
 * BossArena v7: the whole Kraken fight in one Skia canvas, driven on the UI
 * thread (design v7 sections 4, 6.2, 7, 11).
 *
 * Every telegraph, limb pose, sucker ring and fin is derived from the sim's
 * published BossView plus the bout clock `t` (integer sim ms, music-locked)
 * and the cosmetic fx clock `fx` (freezes on hit-stop). Nothing here decides
 * an outcome; it only shows the schedule the sim already fixed.
 *
 * Three tell channels that read with the sound off (4.4): the limb rising over
 * its lane with the body looming (read), the limb's shadow growing on the buoy
 * (timer), the lime ring with a chevron notch tightening into PERFECT (answer).
 * Fakes show something: a wink, a sky-blue sheen and a hollow white dashed
 * outline, no shadow, no ring.
 *
 * Colour grammar (11.4): lime = answer now; gold = hit here; sky-blue dashed =
 * fake; orange = danger; coral = your health; white thin ring = timing.
 */
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  BlendColor, Canvas, Circle, DashPathEffect, Group, Image as SkImage, ImageShader, LinearGradient, Oval, PaintStyle, Path,
  Picture, Rect, Skia, StrokeCap, StrokeJoin, Vertices, createPicture, vec, type SkCanvas, type SkImage as SkImageType,
  type SkPaint,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rootSide, viewLane, type ArenaLayout, type BossView } from './view';
import { aspectOf } from './useArenaImages';
import {
  bezierChain, bounceAt, chainAt, fractionAtX, lerpChain, newChain, stripIndices, stripVerts, JOINTS, type Pt,
} from './rig/tentacle';

export interface ArenaImages {
  sky: SkImageType | null;
  mid: SkImageType | null;
  fore: SkImageType | null;
  cloud: SkImageType | null;
  body: SkImageType | null;
  hat: SkImageType | null;
  boss: SkImageType | null;
  strip: SkImageType | null;
  buoy: SkImageType | null;
  lantern: SkImageType | null;
  plate: SkImageType | null;
  float: SkImageType | null;
  shark: SkImageType | null;
  sharkStrike: SkImageType | null;
  sharkBonk: SkImageType | null;
  sharkDizzy: SkImageType | null;
  sharkCheer: SkImageType | null;
  fin: SkImageType | null;
  anchor: SkImageType | null;
  star: SkImageType | null;
  starburst: SkImageType | null;
  fxImpact: SkImageType | null;
  fxCrown: SkImageType | null;
  fxPuff: SkImageType | null;
  fxSwirl: SkImageType | null;
  fxSparkle: SkImageType | null;
  fxBubble: SkImageType | null;
  fxGull: SkImageType | null;
  matFeather: SkImageType | null;
  matBarnacle: SkImageType | null;
  matPearl: SkImageType | null;
  matScale: SkImageType | null;
}

/** Event-driven timestamps (fx clock ms; -1 = never) the orchestrator sets from sim events. */
export interface ArenaAnim {
  entranceAt: SharedValue<number>;
  exitAt: SharedValue<number>;
  /** 1 KO, 2 retreat */
  exitKind: SharedValue<number>;
  hurtAt: SharedValue<number>;
  hurtK: SharedValue<number>;
  flashAt: SharedValue<number>;
  rimAt: SharedValue<number>;
  tauntAt: SharedValue<number>;
  beadAt: SharedValue<number>;
  beadLane: SharedValue<number>;
  hopAt: SharedValue<number>;
  hopLane: SharedValue<number>;
  flinchAt: SharedValue<number>;
  slamAt: SharedValue<number>;
  getupAt: SharedValue<number>;
  cheerAt: SharedValue<number>;
  padHeld: SharedValue<number>;
  buoyAt0: SharedValue<number>;
  buoyAt1: SharedValue<number>;
  buoyAt2: SharedValue<number>;
  splashAt: SharedValue<number>;
  splashLane: SharedValue<number>;
  /** Part-break launch (fx ms), which Break (1..3), and the impact side (-1 / 1). */
  partAt: SharedValue<number>;
  partN: SharedValue<number>;
  partDir: SharedValue<number>;
  matAt: SharedValue<number>;
  finalAt: SharedValue<number>;
  finalGrade: SharedValue<number>;
  catchAt: SharedValue<number>;
  catchLane: SharedValue<number>;
  caughtAt: SharedValue<number>;
  /** Phase pose: 0 shallows, 1 on the wreck, 2 whirlpool (fx ms of the change in phaseAt). */
  phase: SharedValue<number>;
  phaseAt: SharedValue<number>;
}

/** Presentation memory kept by the orchestrator (bout sim time). */
export interface Pres {
  /** Last resolved strike: lane, root side, impact, result (1 countered, 2 landed, 3 safe miss), resolved at. */
  sLane: number;
  sSide: number;
  sI: number;
  sRes: number;
  sAt: number;
  /** Pinned limb: side, start, end (sim ms); kind of the opening. */
  pinSide: number;
  pinStart: number;
  pinEnd: number;
  /** Training wheels (first rounds vs this boss, bout 1). */
  wheels: boolean;
  /** Retreat damage overlays: Breaks this round. */
  breaks: number;
  /** Walking (wind-ups +1 step, smaller loom, shake x0.3). */
  walking: boolean;
  /** Crew started this bout together: attack #2's lime ring wears crew pennants (TEAM STRIKE). */
  team: boolean;
}

export function emptyPres(): Pres {
  return { sLane: -1, sSide: 1, sI: -1e9, sRes: 0, sAt: -1e9, pinSide: -1, pinStart: -1e9, pinEnd: -1e9, wheels: false, breaks: 0, walking: false, team: false };
}

// Palette (design 11.4)
const LIME = '#7BD94A';
const GOLD = '#FFCF3B';
const SKY = '#8FD3FF';
const ORANGE = '#FF8A1F';
const NAVY = '#1B2A4A';
const INK = '#0E0C2A';
const WHITE = '#FFFFFF';
const CORAL = '#FF6B5C';
const CREAM = '#FFF1D6';
const LILAC = '#D7A6E6';
const LILAC_IN = '#9E6CC6';
const PURPLE = '#6A44B6';

// Sprite-space anchors on the 600 x 593 Kraken sprite (fractions).
const SPR_AR = 600 / 593;
const HAT = { x: 50 / 600, y: 0, w: 262 / 600, h: 196 / 593, px: 175 / 600, py: 150 / 593 };
const EYE_L = { x: 0.425, y: 0.476 };
const EYE_R = { x: 0.608, y: 0.481 };
const STRIP_TIP_U = 1;

function c01(x: number): number {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function outBack(x: number, s = 1.7): number {
  'worklet';
  const t = c01(x) - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
}
function inBack(x: number, s = 1.7): number {
  'worklet';
  const t = c01(x);
  return (s + 1) * t * t * t - s * t * t;
}
function inQuad(x: number): number {
  'worklet';
  const t = c01(x);
  return t * t;
}
function outQuad(x: number): number {
  'worklet';
  const t = c01(x);
  return 1 - (1 - t) * (1 - t);
}
/** 1 at an event, decaying to 0 over ms (0 when the event never happened or is in the future). */
function since(now: number, at: number, ms: number): number {
  'worklet';
  if (at < 0 || now < at) return 0;
  const p = (now - at) / ms;
  return p >= 1 ? 0 : 1 - p;
}
/** Beat-locked pulse: 1 on the beat, easing out to 0 by `width` of a beat later. */
function onBeat(beat: number, width = 0.35): number {
  'worklet';
  const f = beat - Math.floor(beat);
  return f < width ? 1 - f / width : 0;
}

interface Props {
  L: ArenaLayout;
  view: SharedValue<BossView>;
  t: SharedValue<number>;
  fx: SharedValue<number>;
  beat: SharedValue<number>;
  anim: ArenaAnim;
  pres: SharedValue<Pres>;
  img: ArenaImages;
  bossKind: number;
  reduced: boolean;
  bossArtScale: number;
}

export const BossArena = React.memo(function BossArena(p: Props) {
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Backdrop {...p} />
      <Starburst {...p} />
      <Rainbow {...p} />
      <BossRig {...p} />
      <WaterLip {...p} />
      {p.bossKind === 0 ? <Limbs {...p} /> : null}
      <RowPicture {...p} />
      <Fore {...p} />
      <Splash {...p} />
      <PlayerFloat {...p} />
      <FinPicture {...p} />
      <PopBead {...p} />
      <Parts {...p} />
      <SpeedLines {...p} />
      <WaterSheet {...p} />
    </Canvas>
  );
});

// ---------------------------------------------------------------------------
// Backdrop: Sunny Lagoon Cove (sky + sea, clouds, wreck), everything on the beat.

function Backdrop({ L, fx, beat, img, anim }: Props) {
  // Cover the screen with the sky/sea layer, horizon pinned just behind the boss's lower body.
  const sky = useMemo(() => {
    const ar = aspectOf(img.sky, 768 / 1152);
    const horizonFrac = 0.625;
    const hNeed = Math.max(L.H - L.horizonY + 20, 1) / (1 - horizonFrac);
    const h = Math.max(hNeed, L.W / ar);
    const w = h * ar;
    return { x: (L.W - w) / 2, y: L.horizonY - horizonFrac * h, w, h };
  }, [L, img.sky]);
  const cloudA = useDerivedValue(() => [{ translateX: ((fx.value * 0.008) % (L.W + 240)) - 200 }]);
  const cloudB = useDerivedValue(() => [{ translateX: ((fx.value * 0.005 + L.W * 0.6) % (L.W + 240)) - 200 }]);
  const midW = L.W * 1.25;
  const midH = midW * (768 / 1152);
  const midY = L.horizonY - midH * 0.62;
  const midX = (L.W - midW) / 2 + L.W * 0.08;
  // The wreck rocks one cycle per bar; on the wreck (phase 1) it leans 4 deg in Fury.
  const midTr = useDerivedValue(() => {
    const b = beat.value;
    const rock = Math.sin((b / 4) * Math.PI * 2) * 0.008;
    const tilt = anim.phase.value >= 2 ? 0.07 * c01((fx.value - anim.phaseAt.value) / 600) : 0;
    return [{ rotate: rock + tilt }];
  });
  // Seagull on the mast: hops on beat 1 of every 2nd bar.
  const gullTr = useDerivedValue(() => {
    const b = beat.value;
    const bar = Math.floor(b / 4);
    const hop = bar % 2 === 0 ? onBeat(b - bar * 4, 0.5) * (b - bar * 4 < 1 ? 1 : 0) : 0;
    return [{ translateX: midX + midW * 0.79 }, { translateY: midY + midH * 0.1 - 10 * hop }];
  });
  return (
    <Group>
      <Rect x={0} y={0} width={L.W} height={L.H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, L.H)} colors={['#4FB6FF', '#9FF0F5', '#3FD0E8']} />
      </Rect>
      {img.sky ? <SkImage image={img.sky} x={sky.x} y={sky.y} width={sky.w} height={sky.h} fit="fill" /> : null}
      {img.cloud ? (
        <Group opacity={0.95}>
          <Group transform={cloudA}><SkImage image={img.cloud} x={0} y={L.H * 0.06} width={116} height={78} /></Group>
          <Group transform={cloudB}><SkImage image={img.cloud} x={0} y={L.H * 0.13} width={84} height={56} /></Group>
        </Group>
      ) : null}
      {img.mid ? (
        <Group origin={vec(midX + midW / 2, midY + midH * 0.7)} transform={midTr}>
          <SkImage image={img.mid} x={midX} y={midY} width={midW} height={midH} fit="fill" />
        </Group>
      ) : null}
      {img.fxGull ? (
        <Group transform={gullTr}><SkImage image={img.fxGull} x={-18} y={-14} width={36} height={28} /></Group>
      ) : null}
    </Group>
  );
}

/** Alex's starburst behind the boss during a Break: 1 rev per 4 beats, pulsing 1.0 -> 1.06 on each beat. */
function Starburst({ L, view, beat, img }: Props) {
  const size = L.bossSize * 1.25;
  const op = useDerivedValue(() => (view.value.oOn && view.value.oKind === 1 ? 0.35 : 0));
  const tr = useDerivedValue(() => {
    const b = beat.value;
    return [{ rotate: (b / 4) * Math.PI * 2 }, { scale: 1 + 0.06 * onBeat(b) }];
  });
  if (!img.starburst) return null;
  return (
    <Group opacity={op} origin={vec(L.bossX, L.bossY)} transform={tr}>
      <SkImage image={img.starburst} x={L.bossX - size / 2} y={L.bossY - size / 2} width={size} height={size}>
        <BlendColor color={GOLD} mode="srcIn" />
      </SkImage>
    </Group>
  );
}

/** KO rainbow behind the sinking boss: 0 -> 0.7 -> 0 over 1 200 ms. */
function Rainbow({ L, fx, anim }: Props) {
  const op = useDerivedValue(() => {
    if (anim.exitKind.value !== 1 || anim.exitAt.value < 0) return 0;
    const p = (fx.value - anim.exitAt.value - 400) / 1200;
    if (p <= 0 || p >= 1) return 0;
    return 0.7 * Math.sin(p * Math.PI);
  });
  const arcs = useMemo(() => {
    const cols = ['#FF6B5C', '#FF8A1F', '#FFCF3B', '#7BD94A', '#3FA9FF'];
    return cols.map((c, i) => {
      const r = L.W * 0.62 - i * 11;
      const p = Skia.Path.Make();
      p.addArc({ x: L.bossX - r, y: L.horizonY - r * 0.7, width: r * 2, height: r * 1.4 }, 180, 180);
      return { p, c };
    });
  }, [L]);
  return (
    <Group opacity={op}>
      {arcs.map((a, i) => <Path key={i} path={a.p} style="stroke" strokeWidth={11} color={a.c} />)}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// The Kraken: body, hat (secondary spring), eyes, damage overlays, flashes.

function BossRig(p: Props) {
  const { L, view, t, fx, beat, anim, pres, img, reduced, bossArtScale, bossKind } = p;
  const S = L.bossSize * bossArtScale;
  const H = S / SPR_AR;
  const transform = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    const f = fx.value;
    const b = beat.value;
    const pr = pres.value;
    const walk = pr.walking;
    let dx = 0;
    let dy = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    // World on the beat: breath on each downbeat, bob one cycle per bar (low on beat 1), limp after Break 2.
    if (!reduced) {
      const breath = 0.02 * onBeat(b, 0.5);
      sx *= 1 + breath;
      sy *= 1 + breath;
      const amp = v.breaks >= 2 ? 4.2 : 6;
      dy += amp * Math.cos((b / 4) * Math.PI * 2) * -1;
    }
    // Phase look: half onto the wreck from bout 2.
    const ph = anim.phase.value;
    if (ph >= 1) dy -= 16 * outBack((f - anim.phaseAt.value) / 500);
    // Tell: lean away, loom 1.0 -> 1.12 through the anticipation hold, snap back on the strike.
    const lane = viewLane(v, now);
    if (v.aOn && lane >= 0) {
      const I = v.steps[v.step * 3 + 1];
      const T = Math.max(v.aT, I - v.aW);
      const dir = lane === 0 ? -1 : lane === 2 ? 1 : 0;
      if (now >= T && now < I - 80) {
        const k = inQuad((now - T) / Math.max(1, I - 80 - T));
        const loom = reduced ? 0 : walk ? 0.06 : 0.12;
        sx *= 1 + loom * k;
        sy *= 1 + loom * k;
        rot += -dir * 0.14 * outQuad((now - T) / 300);
        dx += -dir * 8 * k;
      } else if (now >= I - 80 && now < I + 220) {
        const k = now < I ? 1 - (I - now) / 80 : 1 - (now - I) / 220;
        dx += dir * 14 * c01(k);
        dy += 10 * c01(k);
        rot += dir * 0.06 * c01(k);
      }
    }
    // Fake: giggle (3 shakes at 9 Hz with a squash 0.96).
    if (v.aOn && v.feintLane >= 0 && now >= v.feintT0 && now < v.feintT0 + 340) {
      const g = (now - v.feintT0) / 1000;
      dx += Math.sin(g * Math.PI * 2 * 9) * 5;
      sy *= 0.96;
      sx *= 1.02;
    }
    // Pinned / exposed: the head dips and strains toward the pin.
    if (v.oOn && v.oKind !== 1) {
      const k = outBack((now - v.oStart) / 200, 1.4);
      dy += 14 * k;
      rot += pr.pinSide * 0.05 * k;
    }
    // Break: stunned, dropped, wobbling on the beat.
    if (v.oOn && v.oKind === 1) {
      dy += 22;
      rot += reduced ? 0 : Math.sin((b / 2) * Math.PI * 2) * 0.09;
      sx *= 1.03;
      sy *= 0.97;
    }
    // Hurt: impact squash 0.88 -> 1.04 -> 1.0 (50 / 120 / 100 ms).
    const ha = anim.hurtAt.value;
    if (ha >= 0 && f >= ha && f < ha + 270) {
      const e = f - ha;
      const k = anim.hurtK.value;
      const s = e < 50 ? 1 - 0.12 * k * (e / 50) : e < 170 ? 1 - 0.12 * k + (0.16 * k) * ((e - 50) / 120) : 1 + 0.04 * k * (1 - (e - 170) / 100);
      sy *= s;
      sx *= 2 - s;
      dy -= 6 * k * since(f, ha, 160);
    }
    // Taunt (a real tell landed): leans back laughing for 500 ms.
    const ta = anim.tauntAt.value;
    if (ta >= 0 && f >= ta && f < ta + 500) {
      const e = (f - ta) / 500;
      rot += Math.sin(e * Math.PI * 6) * 0.05 * (1 - e);
      dy -= 8 * Math.sin(e * Math.PI);
    }
    // Entrance = count-in: bursts up on beat 4 (y +160 -> 0, 700 ms out-back).
    const en = anim.entranceAt.value;
    if (en < 0) dy += L.bossSize * 1.2;
    else {
      const e = f - en - 3 * 464;
      dy += e < 0 ? L.bossSize * 1.2 : L.bossSize * 1.2 * (1 - outBack(e / 700, 1.4));
    }
    // KO sinks (out-back 1 100 ms after a 400 ms defeat hold); Retreat dives sulking.
    const xa = anim.exitAt.value;
    if (xa >= 0 && f >= xa) {
      const e = f - xa;
      if (anim.exitKind.value === 1) {
        dy += e < 400 ? 0 : L.bossSize * 1.2 * inBack((e - 400) / 1100, 1.4);
        rot += e < 400 ? Math.sin(e / 30) * 0.03 : 0.3 * c01((e - 400) / 1100);
      } else {
        dy += e < 1500 ? 0 : L.bossSize * 1.15 * inQuad((e - 1500) / 700);
        rot += e < 1500 ? Math.sin(e / 90) * 0.04 : 0;
      }
    }
    return [
      { translateX: L.bossX + dx },
      { translateY: L.bossY + dy },
      { rotate: rot },
      { scaleX: sx },
      { scaleY: sy },
    ];
  });
  const lipClip = useMemo(() => Skia.XYWHRect(-L.W, -L.H * 2, L.W * 3, L.lipY + 3 + L.H * 2), [L]);
  const flashOp = useDerivedValue(() => (anim.flashAt.value >= 0 && fx.value - anim.flashAt.value < 40 && fx.value >= anim.flashAt.value ? 0.9 : 0));
  const rimOp = useDerivedValue(() => since(fx.value, anim.rimAt.value, 160) * 0.9);
  const hatOn = useDerivedValue(() => (view.value.breaks >= 1 || (anim.partAt.value >= 0 && anim.partN.value >= 1) ? 0 : 1));
  const baldOn = useDerivedValue(() => 1 - hatOn.value);
  // Hat jiggle: spring 2-3 deg on every hurt and on the beat.
  const hatTr = useDerivedValue(() => {
    const f = fx.value;
    const ha = anim.hurtAt.value;
    const e = ha >= 0 && f >= ha ? (f - ha) / 1000 : 9;
    const spring = Math.exp(-8 * e) * Math.sin(e * 26) * 0.08;
    return [{ rotate: spring + 0.02 * onBeat(beat.value, 0.5) }];
  });
  const hatPivot = vec(-S / 2 + HAT.px * S, -H / 2 + HAT.py * H);
  const bodyImg = bossKind === 0 ? img.body : img.boss;
  return (
    <Group clip={lipClip}>
      <Group transform={transform}>
        <Group opacity={rimOp} transform={[{ scale: 1.045 }]}>
          {bodyImg ? (
            <SkImage image={bodyImg} x={-S / 2} y={-H / 2} width={S} height={H}>
              <BlendColor color={GOLD} mode="srcIn" />
            </SkImage>
          ) : null}
        </Group>
        {bodyImg ? <SkImage image={bodyImg} x={-S / 2} y={-H / 2} width={S} height={H} /> : null}
        {bossKind === 0 ? <DamageOverlays S={S} H={H} view={view} pres={pres} anim={anim} baldOn={baldOn} /> : null}
        {bossKind === 0 && img.hat ? (
          <Group opacity={hatOn} origin={hatPivot} transform={hatTr}>
            <SkImage image={img.hat} x={-S / 2 + HAT.x * S} y={-H / 2 + HAT.y * H} width={HAT.w * S} height={HAT.h * H} />
          </Group>
        ) : null}
        {bossKind === 0 ? <Eyes {...p} S={S} H={H} /> : null}
        <Group opacity={flashOp}>
          {bodyImg ? (
            <SkImage image={bodyImg} x={-S / 2} y={-H / 2} width={S} height={H}>
              <BlendColor color={WHITE} mode="srcIn" />
            </SkImage>
          ) : null}
        </Group>
      </Group>
    </Group>
  );
}

/** Plaster where the hat was (Break 1), tentacle sling (Break 2), cracked dome (Break 3). */
function DamageOverlays({ S, H, view, pres, anim, baldOn }: {
  S: number; H: number; view: SharedValue<BossView>; pres: SharedValue<Pres>; anim: ArenaAnim; baldOn: SharedValue<number>;
}) {
  const bx = -S / 2;
  const by = -H / 2;
  const plaster = useMemo(() => {
    const cx = bx + 0.33 * S;
    const cy = by + 0.2 * H;
    const w = 0.2 * S;
    const h = 0.065 * S;
    const mk = (a: number) => {
      const r = Skia.RRectXY(Skia.XYWHRect(-w / 2, -h / 2, w, h), h * 0.35, h * 0.35);
      const p = Skia.Path.Make();
      p.addRRect(r);
      const m = Skia.Matrix();
      m.translate(cx, cy);
      m.rotate(a);
      p.transform(m);
      return p;
    };
    return [mk(0.6), mk(-0.6)];
  }, [S, H, bx, by]);
  const sling = useMemo(() => {
    const p = Skia.Path.Make();
    const cx = bx + 0.22 * S;
    const cy = by + 0.7 * H;
    const r = Skia.RRectXY(Skia.XYWHRect(-0.09 * S, -0.032 * S, 0.18 * S, 0.064 * S), 0.03 * S, 0.03 * S);
    p.addRRect(r);
    const m = Skia.Matrix();
    m.translate(cx, cy);
    m.rotate(-0.5);
    p.transform(m);
    return p;
  }, [S, H, bx, by]);
  const cracks = useMemo(() => {
    const p = Skia.Path.Make();
    const x = bx + 0.62 * S;
    const y = by + 0.16 * H;
    p.moveTo(x, y);
    p.lineTo(x + 0.03 * S, y + 0.05 * S);
    p.lineTo(x + 0.01 * S, y + 0.09 * S);
    p.lineTo(x + 0.05 * S, y + 0.14 * S);
    p.moveTo(x + 0.03 * S, y + 0.05 * S);
    p.lineTo(x + 0.08 * S, y + 0.06 * S);
    return p;
  }, [S, H, bx, by]);
  const slingOn = useDerivedValue(() => (view.value.breaks >= 2 || pres.value.breaks >= 2 ? 1 : 0));
  const crackOn = useDerivedValue(() => (view.value.breaks >= 3 || pres.value.breaks >= 3 ? 1 : 0));
  // Retreat with no Break: one bandage pops on.
  const bandOn = useDerivedValue(() => (anim.exitKind.value === 2 && anim.exitAt.value >= 0 && pres.value.breaks === 0 ? 1 : 0));
  return (
    <Group>
      <Group opacity={baldOn}>
        {plaster.map((pp, i) => (
          <Group key={i}>
            <Path path={pp} color={CREAM} />
            <Path path={pp} style="stroke" strokeWidth={S * 0.012} color={INK} />
          </Group>
        ))}
      </Group>
      <Group opacity={slingOn}>
        <Path path={sling} color={CREAM} />
        <Path path={sling} style="stroke" strokeWidth={S * 0.012} color={INK} />
        <Circle cx={bx + 0.22 * S} cy={by + 0.7 * H} r={S * 0.028} color={CREAM} />
        <Circle cx={bx + 0.22 * S} cy={by + 0.7 * H} r={S * 0.028} style="stroke" strokeWidth={S * 0.01} color={INK} />
      </Group>
      <Group opacity={crackOn}>
        <Path path={cracks} style="stroke" strokeWidth={S * 0.014} strokeCap="round" strokeJoin="round" color={INK} />
      </Group>
      <Group opacity={bandOn}>
        <Path path={sling} color={CREAM} transform={[{ translateX: 0.42 * S }, { translateY: -0.28 * H }, { scale: 0.7 }]} />
      </Group>
    </Group>
  );
}

/** Eye overlays on the drawn face: commit glint, hurt squeeze, fake wink, stunned / defeated spirals. */
function Eyes(p: Props & { S: number; H: number }) {
  const { S, H, view, t, fx, anim, img } = p;
  const lx = -S / 2 + EYE_L.x * S;
  const ly = -H / 2 + EYE_L.y * H;
  const rx = -S / 2 + EYE_R.x * S;
  const ry = -H / 2 + EYE_R.y * H;
  const er = 0.05 * S;
  // 0 open, 1 hurt (> <), 2 wink (left eye), 3 swirl
  const mode = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    const f = fx.value;
    if (anim.exitAt.value >= 0 && f >= anim.exitAt.value && anim.exitKind.value === 1) return 3;
    if (v.oOn && v.oKind === 1) return 3;
    if (anim.hurtAt.value >= 0 && f >= anim.hurtAt.value && f - anim.hurtAt.value < 180) return 1;
    if (anim.exitAt.value >= 0 && f >= anim.exitAt.value && anim.exitKind.value === 2) return 1;
    if (v.aOn && v.feintLane >= 0 && now >= v.feintT0 && now < v.feintT0 + 170) return 2;
    return 0;
  });
  const lidL = useDerivedValue(() => (mode.value === 1 || mode.value === 2 ? 1 : 0));
  const lidR = useDerivedValue(() => (mode.value === 1 ? 1 : 0));
  const swirlOn = useDerivedValue(() => (mode.value === 3 ? 1 : 0));
  const hurtOn = useDerivedValue(() => (mode.value === 1 ? 1 : 0));
  const winkOn = useDerivedValue(() => (mode.value === 2 ? 1 : 0));
  const shapes = useMemo(() => {
    const sq = (cx: number, cy: number, dir: number) => {
      const q = Skia.Path.Make();
      q.moveTo(cx - dir * er * 0.7, cy - er * 0.55);
      q.lineTo(cx + dir * er * 0.55, cy);
      q.lineTo(cx - dir * er * 0.7, cy + er * 0.55);
      return q;
    };
    const wink = Skia.Path.Make();
    wink.moveTo(lx - er * 0.8, ly);
    wink.quadTo(lx, ly + er * 0.75, lx + er * 0.8, ly);
    const spiral = (cx: number, cy: number) => {
      const q = Skia.Path.Make();
      for (let i = 0; i <= 40; i++) {
        const a = i * 0.42;
        const r = (i / 40) * er * 0.85;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) q.moveTo(x, y);
        else q.lineTo(x, y);
      }
      return q;
    };
    return { hl: sq(lx, ly, 1), hr: sq(rx, ry, -1), wink, sl: spiral(lx, ly), sr: spiral(rx, ry) };
  }, [er, lx, ly, rx, ry]);
  // One-frame eye glint at the commit (I - 80) of a real tell.
  const glintOp = useDerivedValue(() => {
    const v = view.value;
    if (!v.aOn) return 0;
    const I = v.steps[v.step * 3 + 1];
    const now = t.value;
    return now >= I - 90 && now < I - 40 ? 1 : 0;
  });
  const sw = S * 0.016;
  return (
    <Group>
      <Group opacity={lidL}>
        <Oval x={lx - er * 1.08} y={ly - er * 0.98} width={er * 2.16} height={er * 1.96} color={PURPLE} />
      </Group>
      <Group opacity={lidR}>
        <Oval x={rx - er * 1.08} y={ry - er * 0.98} width={er * 2.16} height={er * 1.96} color={PURPLE} />
      </Group>
      <Group opacity={hurtOn}>
        <Path path={shapes.hl} style="stroke" strokeWidth={sw} strokeCap="round" strokeJoin="round" color={INK} />
        <Path path={shapes.hr} style="stroke" strokeWidth={sw} strokeCap="round" strokeJoin="round" color={INK} />
      </Group>
      <Group opacity={winkOn}>
        <Path path={shapes.wink} style="stroke" strokeWidth={sw} strokeCap="round" color={INK} />
      </Group>
      <Group opacity={swirlOn}>
        <Oval x={lx - er} y={ly - er * 0.9} width={er * 2} height={er * 1.8} color={WHITE} />
        <Oval x={rx - er} y={ry - er * 0.9} width={er * 2} height={er * 1.8} color={WHITE} />
        <Path path={shapes.sl} style="stroke" strokeWidth={sw * 0.8} strokeCap="round" color={INK} />
        <Path path={shapes.sr} style="stroke" strokeWidth={sw * 0.8} strokeCap="round" color={INK} />
      </Group>
      {img.fxSparkle ? (
        <Group opacity={glintOp}>
          <SkImage image={img.fxSparkle} x={rx + er * 0.1} y={ry - er * 1.6} width={er * 1.6} height={er * 1.6} />
          <SkImage image={img.fxSparkle} x={lx - er * 0.4} y={ly - er * 1.5} width={er * 1.2} height={er * 1.2} />
        </Group>
      ) : null}
    </Group>
  );
}

/** Foreground water lip the Kraken rises from (cyan, white foam, navy line); bulges on count-in beat 1. */
function WaterLip({ L, fx, anim, beat }: Props) {
  const y0 = L.lipY;
  const make = (closed: boolean) => {
    'worklet';
    const pth = Skia.Path.Make();
    const ph = fx.value / 520;
    const en = anim.entranceAt.value;
    const e = en >= 0 ? fx.value - en : -1;
    const bulge = e >= 0 && e < 464 * 3 ? 6 * Math.sin(Math.min(1, e / 464) * Math.PI) : 0;
    const groove = 1.5 * onBeat(beat.value, 0.4);
    pth.moveTo(0, y0);
    for (let x = 0; x <= L.W; x += 12) {
      const near = Math.max(0, 1 - Math.abs(x - L.bossX) / (L.bossSize * 0.6));
      pth.lineTo(x, y0 + Math.sin(x / 38 + ph) * 5 + Math.sin(x / 17 - ph * 1.3) * 2 - bulge * near - groove);
    }
    if (closed) {
      pth.lineTo(L.W, y0 + 70);
      pth.lineTo(0, y0 + 70);
      pth.close();
    }
    return pth;
  };
  const path = useDerivedValue(() => make(true));
  const foam = useDerivedValue(() => make(false));
  // Count-in beat 2: two ripple rings around the boss.
  const ripR = useDerivedValue(() => {
    const en = anim.entranceAt.value;
    const e = en >= 0 ? fx.value - en - 464 : -1;
    return e >= 0 && e < 900 ? 20 + e * 0.14 : 0;
  });
  const ripOp = useDerivedValue(() => (ripR.value > 0 ? 1 - (ripR.value - 20) / 126 : 0));
  const ripR2 = useDerivedValue(() => Math.max(0, ripR.value - 30));
  return (
    <Group>
      <Path path={path} opacity={0.9}>
        <LinearGradient start={vec(0, y0)} end={vec(0, y0 + 70)} colors={['#4FD8EC', 'rgba(79,216,236,0)']} />
      </Path>
      <Path path={foam} style="stroke" strokeWidth={7} color={NAVY} opacity={0.3} />
      <Path path={foam} style="stroke" strokeWidth={4} color={WHITE} />
      <Oval x={useDerivedValue(() => L.bossX - ripR.value * 1.6)} y={useDerivedValue(() => y0 - ripR.value * 0.3)}
        width={useDerivedValue(() => ripR.value * 3.2)} height={useDerivedValue(() => ripR.value * 0.6)}
        style="stroke" strokeWidth={3} color={WHITE} opacity={ripOp} />
      <Oval x={useDerivedValue(() => L.bossX - ripR2.value * 1.6)} y={useDerivedValue(() => y0 - ripR2.value * 0.3)}
        width={useDerivedValue(() => ripR2.value * 3.2)} height={useDerivedValue(() => ripR2.value * 0.6)}
        style="stroke" strokeWidth={3} color={WHITE} opacity={ripOp} />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Limbs: the striking tentacle (24-segment textured strip over a navy outline strip).

interface LimbFrame { on: number; chain: number[]; fake: number; sheen: number; flip: boolean; w: number }

/** Root of a limb at the lip on side s. */
function rootOf(L: ArenaLayout, s: number): Pt {
  'worklet';
  return { x: L.bossX + s * L.bossSize * 0.3, y: L.lipY + 8 };
}

/** Pose chains (design 11.6): hidden, hover (coiled over its lane), slam (tip on the buoy), pinned (across the row), punish (onto the float). */
function poseChain(L: ArenaLayout, kind: number, s: number, x: number, k: number, out: number[]): void {
  'worklet';
  const r = rootOf(L, s);
  const ty = L.targetY;
  if (kind === 0) {
    // Hidden under the lip.
    bezierChain(out, r.x, r.y + 30, r.x - s * 6, r.y + 34, r.x - s * 10, r.y + 36, r.x - s * 14, r.y + 38, 0);
  } else if (kind === 1) {
    // Hover: up from the root, over to the lane, tip coiled back (k = anticipation 0..1 lifts and coils).
    const top = ty - L.H * 0.2 - 30 * k;
    bezierChain(out, r.x, r.y, r.x + s * 10, r.y - L.H * 0.16, x + s * 70, top - 40, x + s * 8, top + 28, -s * (0.9 + 1.4 * k));
  } else if (kind === 2) {
    // Slam: tip on the buoy.
    bezierChain(out, r.x, r.y, r.x + s * 4, r.y - 30, x + s * 60, ty - 70, x, ty - 2, s * 0.25);
  } else if (kind === 3) {
    // Pinned: down beside the root, then flat across all three buoys, tip beyond the far lane.
    const near = s > 0 ? L.W * 0.9 : L.W * 0.1;
    const far = s > 0 ? L.W * 0.03 : L.W * 0.97;
    bezierChain(out, r.x, r.y, near + s * L.W * 0.02, r.y + (ty - r.y) * 0.45, near + s * L.W * 0.02, ty - 4, far, ty + 2 - 6 * k, s * 0.15);
  } else {
    // Punish: smacks the float.
    bezierChain(out, r.x, r.y, r.x + s * 10, r.y - 20, L.floatX + s * 70, L.floatY - L.floatR * 2.6, L.floatX, L.floatY - L.floatR * 1.1, 0);
  }
}

function blendPose(L: ArenaLayout, ka: number, kb: number, s: number, x: number, ca: number, cb: number, w: number, out: number[]): void {
  'worklet';
  const a = newChain();
  const bb = newChain();
  poseChain(L, ka, s, x, ca, a);
  poseChain(L, kb, s, x, cb, bb);
  lerpChain(out, a, bb, w);
}

function Limbs(p: Props) {
  const { L, view, t, pres } = p;
  // Slot A: the active strike (or the pinned / punishing limb); slot B: the previous step of a multi-slam; slot C: a fake.
  const frames = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    const pr = pres.value;
    const A: LimbFrame = { on: 0, chain: newChain(), fake: 0, sheen: 0, flip: false, w: 1 };
    const B: LimbFrame = { on: 0, chain: newChain(), fake: 0, sheen: 0, flip: false, w: 1 };
    const Cf: LimbFrame = { on: 0, chain: newChain(), fake: 1, sheen: 0, flip: false, w: 0.9 };
    if (v.on && v.aOn) {
      const lane = viewLane(v, now);
      const no = v.aNo + v.step;
      const s = rootSide(lane, no);
      const I = v.steps[v.step * 3 + 1];
      const T = v.step === 0 ? Math.max(v.aT, I - v.aW) : I - v.aW;
      const x = L.laneX[lane];
      if (now >= T - 60) {
        A.on = 1;
        A.flip = s < 0;
        if (now < I - 80) {
          const e = outQuad((now - T + 60) / 320);
          const k = inQuad((now - T) / Math.max(1, I - 80 - T));
          blendPose(L, 0, 1, s, x, 0, k, e, A.chain);
        } else {
          const k = inQuad((now - (I - 80)) / 80);
          blendPose(L, 1, 2, s, x, 1, 0, k, A.chain);
        }
      }
      // Previous step of a Double / Triple slam stays snagged on its buoy, then sinks.
      if (v.step > 0) {
        const pl = v.steps[(v.step - 1) * 3];
        const pI = v.steps[(v.step - 1) * 3 + 1];
        const ps = rootSide(pl, v.aNo + v.step - 1);
        const k = c01((now - pI - 200) / 300);
        if (k < 1) {
          B.on = 1;
          B.flip = ps < 0;
          blendPose(L, 2, 0, ps, L.laneX[pl], 0, 0, inBack(k), B.chain);
        }
      }
    }
    // Fake limb: rises over the fake lane with a sky-blue sheen and a hollow dashed outline, curls forward, sinks.
    if (v.on && v.aOn && v.feintLane >= 0 && now >= v.feintT0 && now < v.feintT1 + 220) {
      const s = rootSide(v.feintLane, v.aNo + 1);
      const x = L.laneX[v.feintLane];
      Cf.on = 1;
      Cf.flip = s < 0;
      Cf.sheen = c01((now - v.feintT0 - 80) / 200);
      if (now < v.feintT1) {
        blendPose(L, 0, 1, s, x, 0, 0.5, outQuad((now - v.feintT0) / 260), Cf.chain);
      } else {
        blendPose(L, 1, 0, s, x, 1.2, 0, inBack((now - v.feintT1) / 220), Cf.chain);
      }
    }
    // Resolved: pinned across the row for the opening; or the landed tell smacks the float.
    if (!A.on) {
      const pinOn = now >= pr.pinStart && now < pr.pinEnd + 160;
      if (pinOn) {
        const s = pr.pinSide;
        A.on = 1;
        A.flip = s > 0;
        const x = L.laneX[pr.sLane >= 0 ? pr.sLane : 1];
        if (now < pr.pinStart + 120) {
          blendPose(L, 2, 3, s, x, 0, 1, outBack((now - pr.pinStart) / 120, 1.2), A.chain);
        } else if (now < pr.pinEnd - 150) {
          // Strains on the beat while pinned.
          const strain = 0.5 + 0.5 * Math.sin((now - pr.pinStart) / (v.q * 4) * Math.PI * 2);
          poseChain(L, 3, s, x, strain, A.chain);
        } else {
          // Closing up: pulls back under the lip (150 ms in-back).
          blendPose(L, 3, 0, s, x, 0, 0, inBack((now - (pr.pinEnd - 150)) / 300), A.chain);
        }
      } else if (pr.sRes === 2 && now >= pr.sAt && now < pr.sAt + 700) {
        const s = pr.sSide;
        const x = L.laneX[pr.sLane];
        A.on = 1;
        A.flip = s < 0;
        const e = now - pr.sAt;
        if (e < 90) blendPose(L, 2, 4, s, x, 0, 0, outQuad(e / 90), A.chain);
        else if (e < 350) poseChain(L, 4, s, x, 0, A.chain);
        else blendPose(L, 4, 0, s, x, 0, 0, inQuad((e - 350) / 350), A.chain);
      } else if ((pr.sRes === 3 || pr.sRes === 1) && now >= pr.sAt && now < pr.sAt + 420) {
        const s = pr.sSide;
        A.on = 1;
        A.flip = s < 0;
        blendPose(L, 2, 0, s, L.laneX[pr.sLane], 0, 0, inBack((now - pr.sAt - 120) / 300), A.chain);
      }
    }
    return [A, B, Cf];
  });
  const idx = useMemo(() => stripIndices(), []);
  return (
    <Group>
      <Limb {...p} frames={frames} slot={1} idx={idx} />
      <Limb {...p} frames={frames} slot={2} idx={idx} />
      <Limb {...p} frames={frames} slot={0} idx={idx} />
    </Group>
  );
}

function Limb({ img, frames, slot, idx, L }: Props & { frames: SharedValue<LimbFrame[]>; slot: number; idx: number[] }) {
  const texW = img.strip ? img.strip.width() : 768;
  const texH = img.strip ? img.strip.height() : 246;
  const W0 = Math.max(18, L.bossSize * 0.105);
  const off = useMemo(() => {
    const pos: Pt[] = [];
    const tex: Pt[] = [];
    for (let i = 0; i < JOINTS * 2; i++) {
      pos.push({ x: -100, y: -100 });
      tex.push({ x: 0, y: 0 });
    }
    return { pos, tex, out: pos, otex: tex, on: 0, fake: 0, sheen: 0, dash: Skia.Path.Make() };
  }, []);
  const geo = useDerivedValue(() => {
    const f = frames.value[slot];
    // Off limbs return one stable object, so Skia skips them without re-uploading geometry.
    if (!f.on) return off;
    const pos: Pt[] = [];
    const tex: Pt[] = [];
    const out: Pt[] = [];
    const otex: Pt[] = [];
    stripVerts(f.chain, W0 * f.w, 0, 0, f.flip, texW, texH, STRIP_TIP_U, pos, tex);
    stripVerts(f.chain, W0 * f.w, 1.5, 1.5, f.flip, texW, texH, STRIP_TIP_U, out, otex);
    // Fake: hollow white dashed outline along both edges.
    const dash = Skia.Path.Make();
    if (f.fake) {
      for (let side = 0; side < 2; side++) {
        for (let j = 0; j < JOINTS; j++) {
          const q = pos[j * 2 + side];
          if (j === 0) dash.moveTo(q.x, q.y);
          else dash.lineTo(q.x, q.y);
        }
      }
    }
    return { pos, tex, out, otex, on: 1, fake: f.fake, sheen: f.sheen, dash };
  });
  const verts = useDerivedValue(() => geo.value.pos);
  const texs = useDerivedValue(() => geo.value.tex);
  const outVerts = useDerivedValue(() => geo.value.out);
  const op = useDerivedValue(() => geo.value.on);
  const outlineOp = useDerivedValue(() => (geo.value.on && !geo.value.fake ? 1 : 0));
  const sheenOp = useDerivedValue(() => (geo.value.fake ? 0.35 + 0.35 * Math.sin(geo.value.sheen * Math.PI) : 0));
  const dash = useDerivedValue(() => geo.value.dash);
  const dashOp = useDerivedValue(() => (geo.value.fake ? 1 : 0));
  const rect = useMemo(() => ({ x: 0, y: 0, width: texW, height: texH }), [texW, texH]);
  return (
    <Group opacity={op}>
      <Group opacity={outlineOp}>
        <Vertices vertices={outVerts} indices={idx} mode="triangles" color={INK} />
      </Group>
      {img.strip ? (
        <Vertices vertices={verts} textures={texs} indices={idx} mode="triangles">
          <ImageShader image={img.strip} tx="clamp" ty="clamp" fit="none" rect={rect} />
        </Vertices>
      ) : (
        <Vertices vertices={verts} indices={idx} mode="triangles" color={PURPLE} />
      )}
      <Group opacity={sheenOp}>
        <Vertices vertices={verts} indices={idx} mode="triangles" color={SKY} />
      </Group>
      <Group opacity={dashOp}>
        <Path path={dash} style="stroke" strokeWidth={3} strokeCap="round" color={WHITE}>
          <DashPathEffect intervals={[8, 6]} />
        </Path>
      </Group>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// The row, drawn as ONE recorded picture per frame (one UI-thread mapper instead of ~120): three buoys,
// the shadow (timer), the lime ring with a chevron notch (answer), the bubble; the pinned limb's suckers
// (gold = hit here) with look-ahead and ticked rings; the Final Pop anchor with its Anchor Stars.

interface Paints {
  fill: SkPaint;
  stroke: SkPaint;
  img: SkPaint;
}

function usePaints(): Paints {
  return useMemo(() => {
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    const stroke = Skia.Paint();
    stroke.setAntiAlias(true);
    stroke.setStyle(PaintStyle.Stroke);
    stroke.setStrokeCap(StrokeCap.Round);
    stroke.setStrokeJoin(StrokeJoin.Round);
    const img = Skia.Paint();
    img.setAntiAlias(true);
    return { fill, stroke, img };
  }, []);
}

function fillC(pt: Paints, color: string, a = 1): SkPaint {
  'worklet';
  pt.fill.setColor(Skia.Color(color));
  pt.fill.setAlphaf(a);
  return pt.fill;
}

function strokeC(pt: Paints, color: string, w: number, a = 1): SkPaint {
  'worklet';
  pt.stroke.setColor(Skia.Color(color));
  pt.stroke.setAlphaf(a);
  pt.stroke.setStrokeWidth(w);
  pt.stroke.setPathEffect(null);
  return pt.stroke;
}

function drawImg(canvas: SkCanvas, pt: Paints, im: SkImageType | null, x: number, y: number, w: number, h: number, a = 1): void {
  'worklet';
  if (!im) return;
  pt.img.setAlphaf(a);
  canvas.drawImageRect(im, Skia.XYWHRect(0, 0, im.width(), im.height()), Skia.XYWHRect(x, y, w, h), pt.img);
}

function RowPicture({ L, view, t, fx, beat, anim, img, bossKind, pres }: Props) {
  const pt = usePaints();
  const src = bossKind === 0 ? img.buoy : bossKind === 2 ? img.lantern : img.plate;
  const bh = bossKind === 1 ? 30 : 74;
  const bw = aspectOf(src, 317 / 384) * bh;
  const AW = 70;
  const AH = AW * 1.12;
  const picture = useDerivedValue(() => createPicture((canvas) => {
    const v = view.value;
    const now = t.value;
    const f = fx.value;
    const b = beat.value;
    const pr = pres.value;
    const ph = b % 4;
    const bump = (ph >= 1 && ph < 1.4 ? 1 - (ph - 1) / 0.4 : 0) + (ph >= 3 && ph < 3.4 ? 1 - (ph - 3) / 0.4 : 0);
    const pinned = v.oOn && now >= pr.pinStart + 100;
    const lane = viewLane(v, now);
    let I = 0;
    let T = 0;
    let teleOn = false;
    if (v.aOn && lane >= 0) {
      I = v.steps[v.step * 3 + 1];
      T = v.step === 0 ? Math.max(v.aT, I - v.aW) : I - v.aW;
      teleOn = now >= T && now <= I + 90;
    }
    const taps = [anim.buoyAt0.value, anim.buoyAt1.value, anim.buoyAt2.value];
    for (let i = 0; i < 3; i++) {
      const x = L.laneX[i];
      const y = L.targetY;
      canvas.drawOval(Skia.XYWHRect(x - 44, y + 22, 88, 20), fillC(pt, NAVY, 0.12));
      const tele = teleOn && lane === i;
      if (tele) {
        // Channel 2, the timer: the limb's shadow grows on the buoy (easeInQuad), full at impact.
        const sh = 0.3 + 0.7 * inQuad((now - T) / Math.max(1, I - T));
        canvas.drawOval(Skia.XYWHRect(x - 46 * sh, y + 30 - 15 * sh, 92 * sh, 30 * sh), fillC(pt, NAVY, 0.42));
      }
      let op = 1;
      if (pinned) op = 0.35;
      else if (now < v.greyUntil[i]) op = 0.4;
      else if (bossKind === 0 && v.bout === 0 && i === 1 && v.on && !v.oOn) op = 0.55;
      const k = since(f, taps[i], 220);
      const s = 1 - 0.16 * Math.sin(k * Math.PI);
      canvas.save();
      canvas.translate(x, y - 3 * bump);
      canvas.scale(2 - s, s);
      drawImg(canvas, pt, src, -bw / 2, -bh / 2, bw, bh, op);
      canvas.restore();
      if (tele) {
        // Training wheels: orange dashed arc from the limb tip to the buoy (first rounds, bout 1).
        if (pr.wheels && v.bout === 0) {
          const arc = Skia.Path.Make();
          const top = y - L.H * 0.2 - 10;
          arc.moveTo(x + 8, top + 40);
          arc.quadTo(x + 40, (top + y) / 2, x, y - 46);
          canvas.drawPath(arc, strokeC(pt, NAVY, 9, 0.5));
          const st = strokeC(pt, ORANGE, 5);
          st.setPathEffect(Skia.PathEffect.MakeDash([10, 8], -(f * 0.12) % 18));
          canvas.drawPath(arc, st);
          st.setPathEffect(null);
        }
        // Channel 3, the answer: lime ring with a downward chevron notch, tightening into PERFECT.
        const perfect = now >= I - 160 && now <= I + 40;
        const pp = c01(((now - T) / Math.max(1, I - T)) / Math.max(0.01, 1 - 160 / Math.max(1, v.aW)));
        const r = 42 * (1 + 0.9 * (1 - pp)) * (perfect ? 1 + 0.05 * Math.sin(f / 40) : 1);
        canvas.drawCircle(x, y, r, strokeC(pt, NAVY, 11));
        canvas.drawCircle(x, y, r, strokeC(pt, LIME, 6));
        canvas.drawCircle(x, y, Math.max(0, r - 4), strokeC(pt, WHITE, 2));
        const notch = Skia.Path.Make();
        notch.moveTo(x - 10, y - r - 10);
        notch.lineTo(x + 10, y - r - 10);
        notch.lineTo(x, y - r + 4);
        notch.close();
        canvas.drawPath(notch, fillC(pt, LIME));
        canvas.drawPath(notch, strokeC(pt, NAVY, 3));
        if (pr.team && v.aNo === 1) {
          // TEAM STRIKE: attack #2's ring wears small white crew pennants.
          const pen = Skia.Path.Make();
          for (const a of [-2.3, -0.84]) {
            const px = x + Math.cos(a) * (r + 4);
            const py = y + Math.sin(a) * (r + 4);
            pen.moveTo(px, py);
            pen.lineTo(px, py - 18);
            pen.lineTo(px + 13, py - 13);
            pen.lineTo(px, py - 8);
          }
          canvas.drawPath(pen, fillC(pt, WHITE));
          canvas.drawPath(pen, strokeC(pt, NAVY, 2.5));
        }
      }
      // Foam bubble: rides in on a wave, wobbles on the beat, blocks the buoy until tapped.
      if (v.bubLane === i && !v.bubPopped && now >= v.bubT0 && now < v.bubT1 && img.fxBubble) {
        const e = (now - v.bubT0) / 300;
        const from = i === 0 ? -60 : L.W + 60;
        const bx = e < 1 ? from + (x - from) * outQuad(e) : x + Math.sin(now / 120) * 2;
        const bs = 72 * (1 + 0.06 * onBeat(b));
        drawImg(canvas, pt, img.fxBubble, bx - bs / 2, y - 6 - bs / 2, bs, bs);
      }
    }
    // Pin and Pop suckers: only the current slot is lit; the next shows its look-ahead outline.
    if (v.oOn && now >= pr.pinStart + 100 && now <= v.oEnd - 120) {
      const R = 15;
      const look = v.look * v.q;
      let cur = -1;
      for (let j = 0; j < v.rings.length; j++) {
        if (v.used[j] === 0 && now <= v.rings[j] + v.popMs) {
          cur = j;
          break;
        }
      }
      const pulse = 0.85 + 0.15 * onBeat(b);
      for (let i = 0; i < 3; i++) {
        const x = L.laneX[i];
        const y = L.targetY - 4;
        let lit = 0;
        let ring = 0;
        let appr = 0;
        let lk = 0;
        if (cur >= 0) {
          const r = v.rings[cur];
          if (v.lanes[cur] === i && now >= r - look) {
            lk = 1;
            lit = 1;
            appr = 1 + c01((r - now) / look);
            if (now >= r - 2 * v.q) ring = 1 + 1.2 * c01((r - now) / (2 * v.q));
          } else if (v.oKind === 1 && now >= r - look) lit = 0.55;
          const nx = cur + 1;
          if (nx < v.rings.length && v.lanes[nx] === i && v.lanes[cur] !== i && now >= v.rings[nx] - look) {
            lk = 1;
            appr = Math.max(appr, 1 + c01((v.rings[nx] - now) / look));
          }
        }
        const splat = anim.beadLane.value === i ? since(f, anim.beadAt.value, 200) : 0;
        if (lit > 0) canvas.drawCircle(x, y, R * 2.1, fillC(pt, GOLD, lit * pulse * 0.45));
        canvas.save();
        canvas.translate(x, y);
        canvas.scale(1 + 0.35 * splat, 1 - 0.35 * splat);
        canvas.drawCircle(0, 0, R + 2.5, fillC(pt, INK));
        canvas.drawCircle(0, 0, R, fillC(pt, LILAC));
        canvas.drawCircle(0, 0, R * 0.55, strokeC(pt, LILAC_IN, 3));
        if (lit > 0) canvas.drawCircle(0, 0, R, fillC(pt, GOLD, lit * pulse * 0.75));
        canvas.restore();
        if (lk) {
          canvas.drawCircle(x, y, R + 4, strokeC(pt, GOLD, 4));
          canvas.drawCircle(x, y, R * 1.25 * appr, strokeC(pt, NAVY, 5, 0.5));
          canvas.drawCircle(x, y, R * 1.25 * appr, strokeC(pt, WHITE, 2.5));
        }
        if (ring > 0) {
          const rr = R * 1.35 * ring;
          canvas.drawCircle(x, y, rr, strokeC(pt, NAVY, 8));
          canvas.drawCircle(x, y, rr, strokeC(pt, GOLD, 5));
          const ticks = Skia.Path.Make();
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2 + f / 900;
            ticks.moveTo(x + Math.cos(a) * (rr + 3), y + Math.sin(a) * (rr + 3));
            ticks.lineTo(x + Math.cos(a) * (rr + 9), y + Math.sin(a) * (rr + 9));
          }
          canvas.drawPath(ticks, strokeC(pt, NAVY, 6));
          canvas.drawPath(ticks, strokeC(pt, GOLD, 3));
        }
        if (splat > 0) canvas.drawCircle(x, y, R + 30 * (1 - splat), strokeC(pt, LILAC, 4, splat));
      }
    }
    // Final Pop: the gold anchor rises over the lit sucker with its Anchor Star sockets, then drops on the tap.
    let aOp = 0;
    let ax = 0;
    let ay = 0;
    let as = 1;
    const fa = anim.finalAt.value;
    if (fa >= 0 && f >= fa && f < fa + 600) {
      const kk = inQuad((f - fa) / 220);
      const ln = anim.beadLane.value >= 0 ? anim.beadLane.value : 1;
      aOp = 1;
      ax = L.laneX[ln];
      ay = L.targetY - 140 + 110 * kk;
      as = 1 + 0.2 * kk;
    } else if (v.oOn && v.finalIdx >= 0 && v.used[v.finalIdx] === 0) {
      const r = v.rings[v.finalIdx];
      const start = r - 8 * v.q;
      if (now >= start) {
        const kk = outBack((now - start) / (4 * v.q), 1.3);
        aOp = 1;
        ax = L.laneX[v.lanes[v.finalIdx]];
        ay = L.targetY - 30 - 110 * kk;
        as = 0.7 + 0.3 * kk;
      }
    }
    if (aOp > 0) {
      canvas.save();
      canvas.translate(ax, ay);
      canvas.scale(as, as);
      drawImg(canvas, pt, img.anchor, -AW / 2, -AH / 2, AW, AH);
      for (let k = 0; k < 3; k++) drawImg(canvas, pt, img.star, -37 + k * 26, AH / 2 - 2 + (k === 1 ? 6 : 0), 22, 22, v.stars > k ? 1 : 0.25);
      canvas.restore();
    }
  }));
  return <Picture picture={picture} />;
}

/** Grit fins badge above your shark (the last fin pulses coral on every beat) and the Knockdown stars. */
function FinPicture({ L, view, fx, beat, anim, img }: Props) {
  const pt = usePaints();
  const SH = L.floatR * 1.95;
  const y = L.floatY - SH * 0.95 - 22;
  const FH = 26;
  const FW = FH * (145 / 194);
  const picture = useDerivedValue(() => createPicture((canvas) => {
    const v = view.value;
    const f = fx.value;
    if (v.on && !v.downOn) {
      const n = v.gritMax;
      const w = n * 26 + 14;
      const badge = Skia.RRectXY(Skia.XYWHRect(L.floatX - w / 2, y - 17, w, 34), 17, 17);
      canvas.drawRRect(badge, fillC(pt, WHITE, 0.92));
      canvas.drawRRect(badge, strokeC(pt, NAVY, 3));
      for (let k = 0; k < n; k++) {
        const x = L.floatX + (k - (n - 1) / 2) * 26;
        const has = k < v.grit;
        const last = v.grit === 1 && k === 0;
        const pulse = last ? onBeat(beat.value, 0.45) : 0;
        const pop = has ? 0 : since(f, anim.flinchAt.value, 320);
        const op = has ? 1 : 0.18 + pop * 0.8;
        const s = has ? 1 + 0.2 * pulse : 0.85 + pop * 0.5;
        const yy = y - pop * 22;
        if (last) canvas.drawCircle(x, yy + 1, 13, fillC(pt, CORAL, 0.4 + 0.5 * pulse));
        canvas.save();
        canvas.translate(x, yy);
        canvas.scale(s, s);
        drawImg(canvas, pt, img.fin, -FW / 2, -FH / 2, FW, FH, op);
        canvas.restore();
      }
    }
    if (v.downOn && img.star) {
      for (let k = 0; k < 3; k++) {
        const a = f / 280 + (k * Math.PI * 2) / 3;
        drawImg(canvas, pt, img.star, L.floatX - L.floatR * 0.2 + Math.cos(a) * 34 - 11, L.floatY - L.floatR * 0.6 + Math.sin(a) * 10 - 11, 22, 22);
      }
    }
  }));
  return <Picture picture={picture} />;
}

/** Sand bar foreground at the bottom edge (the hat floats here after Break 1). */
function Fore({ L, img }: Props) {
  if (!img.fore) return null;
  const w = L.W * 1.2;
  const h = Math.min(w * (768 / 1152), L.H * 0.34);
  return <SkImage image={img.fore} x={(L.W - w) / 2} y={L.H - h + h * 0.18} width={w} height={h} fit="fill" opacity={0.95} />;
}

/** Splash crown where a slam or punish lands. */
function Splash({ L, fx, anim, img }: Props) {
  const tr = useDerivedValue(() => {
    const lane = anim.splashLane.value;
    const k = 1 - since(fx.value, anim.splashAt.value, 520);
    const x = lane >= 0 && lane <= 2 ? L.laneX[lane] : L.floatX;
    const y = lane >= 0 && lane <= 2 ? L.targetY + 8 : L.floatY - 10;
    return [{ translateX: x }, { translateY: y }, { scale: 0.5 + 0.8 * outBack(k * 1.6, 1.4) }];
  });
  const op = useDerivedValue(() => {
    const k = since(fx.value, anim.splashAt.value, 520);
    return k > 0 ? Math.min(1, k * 2) : 0;
  });
  if (!img.fxCrown) return null;
  return (
    <Group transform={tr} opacity={op}>
      <SkImage image={img.fxCrown} x={-55} y={-80} width={110} height={90} />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// The player: float, shark, Grit fins, Knockdown, Easy Slam.

function PlayerFloat({ L, view, t, fx, beat, anim, img, reduced }: Props) {
  const R = L.floatR;
  const fw = R * 2.15;
  const SH = R * 1.95;
  const floatTr = useDerivedValue(() => [{ translateX: L.floatX }, { translateY: L.floatY + Math.sin((beat.value / 4) * Math.PI * 2) * 2.5 }]);
  const sh = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    const f = fx.value;
    const b = beat.value;
    let dx = 0;
    let dy = 0;
    let rot = 0;
    let sy = 1;
    // Head-bob on each beat; crouch as each sucker ring closes.
    dy += reduced ? 0 : 2 * onBeat(b, 0.3);
    if (v.oOn) {
      for (let j = 0; j < v.rings.length; j++) {
        const d = v.rings[j] - now;
        if (d >= 0 && d < 2 * v.q && v.used[j] === 0) sy = Math.min(sy, 0.9 + 0.1 * (d / (2 * v.q)));
      }
    }
    // Hop toward the lit lane on a POP (60 ms out, 140 ms back).
    const ha = anim.hopAt.value;
    if (ha >= 0 && f >= ha && f < ha + 200) {
      const e = f - ha;
      const k = e < 60 ? outQuad(e / 60) : 1 - (e - 60) / 140;
      const dir = anim.hopLane.value === 0 ? -1 : anim.hopLane.value === 2 ? 1 : 0;
      dx += dir * 40 * k;
      dy -= 26 * k;
    }
    // Easy Slam: crouched while held (charging), leaps onto the limb when it fires.
    if (anim.padHeld.value > 0 && v.slamArmed) sy = Math.min(sy, 0.86);
    const sa = anim.slamAt.value;
    if (sa >= 0 && f >= sa && f < sa + 360) {
      const e = (f - sa) / 360;
      dy -= Math.sin(e * Math.PI) * L.H * 0.14;
      rot += Math.sin(e * Math.PI * 2) * 0.4;
    }
    // Flinch on a Grit loss: squash 0.8 with 3 wobbles.
    const fl = anim.flinchAt.value;
    if (fl >= 0 && f >= fl && f < fl + 600) {
      const e = (f - fl) / 600;
      sy = Math.min(sy, 0.8 + 0.2 * e + Math.sin(e * Math.PI * 6) * 0.05 * (1 - e));
      rot += Math.sin(e * Math.PI * 6) * 0.08 * (1 - e);
    }
    // Knockdown: flopped on the float.
    if (v.downOn) {
      rot = -1.35;
      dy += R * 0.55;
      dx -= R * 0.2;
      sy = 1;
    }
    const ga = anim.getupAt.value;
    if (ga >= 0 && f >= ga && f < ga + 400) {
      const e = (f - ga) / 400;
      sy *= 1 + 0.2 * Math.sin(e * Math.PI);
    }
    return { dx, dy, rot, sy };
  });
  const sharkTr = useDerivedValue(() => [
    { translateX: L.floatX + sh.value.dx },
    { translateY: L.floatY - R * 0.32 + sh.value.dy },
    { rotate: sh.value.rot },
    { scaleX: 1 / Math.sqrt(sh.value.sy) },
    { scaleY: sh.value.sy },
  ]);
  // Pose: 0 idle, 1 strike (hop / slam), 2 bonk (flinch / down), 3 dizzy (DIZZY), 4 cheer
  const pose = useDerivedValue(() => {
    const v = view.value;
    const f = fx.value;
    if (v.downOn) return 2;
    if (anim.flinchAt.value >= 0 && f >= anim.flinchAt.value && f < anim.flinchAt.value + 600) return 2;
    if (v.on && t.value < v.lockUntil && v.lockUntil - t.value > 700) return 3;
    if (anim.cheerAt.value >= 0 && f >= anim.cheerAt.value && f < anim.cheerAt.value + 1400) return 4;
    if ((anim.hopAt.value >= 0 && f >= anim.hopAt.value && f < anim.hopAt.value + 180) ||
      (anim.slamAt.value >= 0 && f >= anim.slamAt.value && f < anim.slamAt.value + 360)) return 1;
    return 0;
  });
  const po = (k: number) => useDerivedValue<number>(() => (pose.value === k ? 1 : 0)); // eslint-disable-line react-hooks/rules-of-hooks
  const p0 = po(0);
  const p1 = po(1);
  const p2 = po(2);
  const p3 = po(3);
  const p4 = po(4);
  const sharkImg = (im: SkImageType | null, op: SharedValue<number>) => {
    if (!im) return null;
    const w = aspectOf(im, 0.75) * SH;
    return (
      <Group opacity={op}>
        <SkImage image={im} x={-w / 2} y={-SH * 0.82} width={w} height={SH} />
      </Group>
    );
  };
  // Easy Slam charge glow under the shark while the float is held.
  const glow = useDerivedValue(() => (anim.padHeld.value > 0 && view.value.slamArmed ? 0.45 + 0.25 * Math.sin(fx.value / 60) : 0));
  return (
    <Group>
      <Group transform={floatTr}>
        {img.float ? <SkImage image={img.float} x={-fw / 2} y={-fw / 2 * 0.62} width={fw} height={fw * 0.62} fit="fill" /> : null}
      </Group>
      <Circle cx={L.floatX} cy={L.floatY - R * 0.7} r={R * 0.95} color={GOLD} opacity={glow} />
      <Group transform={sharkTr}>
        {sharkImg(img.shark, p0)}
        {sharkImg(img.sharkStrike, p1)}
        {sharkImg(img.sharkBonk, p2)}
        {sharkImg(img.sharkDizzy, p3)}
        {sharkImg(img.sharkCheer, p4)}
      </Group>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// POP: a gold bead travels up the pinned limb to the face in 90 ms (the payoff goes up, not under the thumb).

function PopBead({ L, fx, anim, pres, view, t }: Props) {
  const pos = useDerivedValue(() => {
    const k = 1 - since(fx.value, anim.beadAt.value, 140);
    const at = anim.beadAt.value;
    if (at < 0 || fx.value < at || k >= 1) return { op: 0, x: 0, y: 0, x1: 0, y1: 0 };
    const pr = pres.value;
    const lane = anim.beadLane.value;
    const chain = newChain();
    const s = pr.pinSide;
    poseChain(L, 3, s, L.laneX[lane >= 0 ? lane : 1], 0.5, chain);
    const f0 = fractionAtX(chain, L.laneX[lane >= 0 ? lane : 1]);
    const face = { x: L.bossX, y: L.bossY + L.bossSize * 0.1 };
    const pAt = (q: number) => {
      if (q < 0.7) return chainAt(chain, f0 * (1 - q / 0.7));
      const r = chainAt(chain, 0);
      const u = (q - 0.7) / 0.3;
      return { x: r.x + (face.x - r.x) * u, y: r.y + (face.y - r.y) * u };
    };
    const kk = c01(k / 0.65);
    const a = pAt(kk);
    const b = pAt(Math.max(0, kk - 0.12));
    return { op: view.value.on && t.value >= 0 ? 1 : 0, x: a.x, y: a.y, x1: b.x, y1: b.y };
  });
  const op = useDerivedValue(() => pos.value.op);
  const cx = useDerivedValue(() => pos.value.x);
  const cy = useDerivedValue(() => pos.value.y);
  const tx = useDerivedValue(() => pos.value.x1);
  const ty = useDerivedValue(() => pos.value.y1);
  return (
    <Group opacity={op}>
      <Circle cx={tx} cy={ty} r={6} color={GOLD} opacity={0.6} />
      <Circle cx={cx} cy={cy} r={11} color={NAVY} />
      <Circle cx={cx} cy={cy} r={8} color={GOLD} />
      <Circle cx={useDerivedValue(() => cx.value - 3)} cy={useDerivedValue(() => cy.value - 3)} r={2.5} color={WHITE} />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Part-breaks: the hat flies, bounces twice on the water, settles as a decal; its material flies to the HUD.

export const PART_G = 2200;
export const PART_E = 0.45;

/** Launch state of a part-break (screen space), shared with the orchestrator's timing helper. */
export function partLaunch(L: ArenaLayout, n: number, dir: number): { x: number; y: number; vx: number; vy: number; floor: number } {
  'worklet';
  const S = L.bossSize;
  const H = S / SPR_AR;
  if (n === 1) {
    return {
      x: L.bossX - S / 2 + (HAT.x + HAT.w / 2) * S, y: L.bossY - H / 2 + (HAT.y + HAT.h / 2) * H,
      vx: 120, vy: -840, floor: L.lipY + 34,
    };
  }
  return { x: L.bossX + S * 0.1 * dir, y: L.bossY - S * 0.2, vx: 220 * (dir === 0 ? 1 : dir), vy: -700, floor: L.lipY + 30 };
}

/** Time (ms) from launch until a part comes to rest (2 bounces). */
export function partRestMs(L: ArenaLayout, n: number, dir: number): number {
  const l = partLaunch(L, n, dir);
  for (let ms = 0; ms < 4000; ms += 10) if (bounceAt(ms / 1000, l.x, l.y, l.vx, l.vy, l.floor, PART_G, PART_E, 2).rest) return ms;
  return 4000;
}

function Parts(p: Props) {
  const { L, fx, anim, img, beat, view } = p;
  const S = L.bossSize;
  const H = S / SPR_AR;
  const hat = useDerivedValue(() => {
    const at = anim.partAt.value;
    const f = fx.value;
    if (at < 0 || anim.partN.value < 1 || f < at) return { op: 0, x: 0, y: 0, r: 0 };
    const l = partLaunch(L, 1, anim.partDir.value);
    const e = (f - at) / 1000;
    const b = bounceAt(e, l.x, l.y, l.vx, l.vy, l.floor, PART_G, PART_E, 2);
    const spin = b.rest ? 0.15 : Math.min(e, 1.2) * (Math.PI * 4) / 0.9 * (anim.partDir.value < 0 ? -1 : 1);
    const bob = b.rest ? Math.sin((beat.value / 4) * Math.PI * 2) * 3 : 0;
    // The decal fades while the boss leaves at the end of the round.
    return { op: view.value.on || anim.exitAt.value < 0 ? 1 : 0.9, x: b.x, y: b.y - 10 + bob, r: spin };
  });
  const hatTr = useDerivedValue(() => [{ translateX: hat.value.x }, { translateY: hat.value.y }, { rotate: hat.value.r }]);
  const hatOp = useDerivedValue(() => hat.value.op);
  // Break 3: six shell shards bounce out of the dome.
  const shards = useDerivedValue(() => {
    const pth = Skia.Path.Make();
    const at = anim.partAt.value;
    const f = fx.value;
    if (at < 0 || anim.partN.value !== 3 || f < at || f > at + 2600) return pth;
    const e = (f - at) / 1000;
    for (let k = 0; k < 6; k++) {
      const dir = k % 2 === 0 ? -1 : 1;
      const b = bounceAt(e, L.bossX + (k - 2.5) * 12, L.bossY - S * 0.25, dir * (90 + k * 40), -600 - k * 50, L.lipY + 28 + k * 4, PART_G, PART_E, 2);
      const a = e * 8 + k;
      const s = 9;
      pth.moveTo(b.x + Math.cos(a) * s, b.y + Math.sin(a) * s);
      pth.lineTo(b.x + Math.cos(a + 2.2) * s, b.y + Math.sin(a + 2.2) * s);
      pth.lineTo(b.x + Math.cos(a + 4.1) * s, b.y + Math.sin(a + 4.1) * s);
      pth.close();
    }
    return pth;
  });
  // Material icon flies to the HUD slot on a 420 ms Bezier (Clash Royale crown).
  const mat = useDerivedValue(() => {
    const at = anim.matAt.value;
    const f = fx.value;
    if (at < 0 || f < at || f > at + 520) return { op: 0, x: 0, y: 0, s: 1, n: 0 };
    const n = anim.partN.value;
    const l = partLaunch(L, n, anim.partDir.value);
    const restMs = 0;
    const b0 = n === 1 ? bounceAt(9, l.x, l.y, l.vx, l.vy, l.floor, PART_G, PART_E, 2) : { x: L.bossX, y: L.bossY };
    const k = c01((f - at - restMs) / 420);
    const tx = 34;
    const ty = 58;
    const cx = (b0.x + tx) / 2;
    const cy = Math.min(b0.y, ty) - 120;
    const u = 1 - k;
    return {
      op: k < 1 ? 1 : 0, x: u * u * b0.x + 2 * u * k * cx + k * k * tx, y: u * u * b0.y + 2 * u * k * cy + k * k * ty,
      s: 1.3 - 0.6 * k, n,
    };
  });
  const matTr = useDerivedValue(() => [{ translateX: mat.value.x }, { translateY: mat.value.y }, { scale: mat.value.s }]);
  const matOp = (n: number) => useDerivedValue(() => (mat.value.n === n ? mat.value.op : 0)); // eslint-disable-line react-hooks/rules-of-hooks
  const m1 = matOp(1);
  const m2 = matOp(2);
  const m3 = matOp(3);
  const hw = HAT.w * S;
  const hh = HAT.h * H;
  return (
    <Group>
      {img.hat ? (
        <Group opacity={hatOp} transform={hatTr}>
          <SkImage image={img.hat} x={-hw / 2} y={-hh / 2} width={hw} height={hh} />
        </Group>
      ) : null}
      <Path path={shards} color="#C9B6F2" />
      <Path path={shards} style="stroke" strokeWidth={2.5} strokeJoin="round" color={INK} />
      <Group transform={matTr}>
        {img.matFeather ? <Group opacity={m1}><SkImage image={img.matFeather} x={-22} y={-22} width={44} height={44} /></Group> : null}
        {img.matBarnacle ? <Group opacity={m2}><SkImage image={img.matBarnacle} x={-22} y={-22} width={44} height={44} /></Group> : null}
        {img.matPearl ? <Group opacity={m3}><SkImage image={img.matPearl} x={-22} y={-22} width={44} height={44} /></Group> : null}
      </Group>
    </Group>
  );
}

/** Final Pop / Break: white-on-sky radial speed lines from the impact for 300 ms. */
function SpeedLines({ L, fx, anim }: Props) {
  const lines = useDerivedValue(() => {
    const pth = Skia.Path.Make();
    const fa = anim.finalAt.value;
    const f = fx.value;
    if (fa < 0 || anim.finalGrade.value < 2 || f < fa + 200 || f > fa + 560) return pth;
    const cx = L.bossX;
    const cy = L.bossY;
    const k = (f - fa - 200) / 360;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + i * 0.37;
      const r0 = L.W * (0.35 + 0.15 * ((i * 7) % 5) / 5) + k * 40;
      pth.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      pth.lineTo(cx + Math.cos(a) * (r0 + 70), cy + Math.sin(a) * (r0 + 70));
    }
    return pth;
  });
  const op = useDerivedValue(() => {
    const fa = anim.finalAt.value;
    const f = fx.value;
    return fa >= 0 && f >= fa + 200 && f <= fa + 560 ? 1 - (f - fa - 200) / 360 : 0;
  });
  return (
    <Group opacity={op}>
      <Path path={lines} style="stroke" strokeWidth={7} strokeCap="round" color={NAVY} opacity={0.35} />
      <Path path={lines} style="stroke" strokeWidth={4} strokeCap="round" color={WHITE} />
    </Group>
  );
}

/** SPLASHED: a water sheet wipes 30% of the screen at 30% white when a real tell lands. */
function WaterSheet({ L, t, pres, reduced }: Props) {
  const y = useDerivedValue(() => {
    const pr = pres.value;
    if (pr.sRes !== 2) return -L.H;
    const e = (t.value - pr.sAt) / 420;
    if (e < 0 || e > 1) return -L.H;
    return -L.H * 0.3 + L.H * 1.0 * e;
  });
  if (reduced) return null;
  return (
    <Group opacity={0.3}>
      <Rect x={0} y={y} width={L.W} height={L.H * 0.3} color={WHITE} />
    </Group>
  );
}
