/**
 * BossArena: the whole fight in one Skia canvas, driven on the UI thread.
 *
 * Every tell, counter target, crit ring and pose is derived from the sim's
 * published BossView plus the bout clock `t` (integer sim ms) and the fx clock
 * (freezes on hit-stop). Nothing here decides an outcome; it only shows the
 * schedule the sim already fixed, so what you see is exactly what is graded.
 *
 * Readability rules (design 9.3): gold = hit now, orange dashed + navy outline
 * = danger coming, white contracting ring = timing, cyan ripple = where
 * something surfaces. Max 2 interactive tells on screen.
 */
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  BlendColor, Canvas, Circle, DashPathEffect, Group, Image as SkImage, LinearGradient, Oval, Path, Rect, Skia,
  vec, type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { ease } from '../../gamekit/core/ease';
import { viewLane, type ArenaLayout, type BossView } from './view';
import { aspectOf } from './useArenaImages';

export interface ArenaImages {
  bg: SkImageType | null;
  boss: SkImageType | null;
  buoy: SkImageType | null;
  lantern: SkImageType | null;
  plate: SkImageType | null;
  float: SkImageType | null;
  shark: SkImageType | null;
  sharkStrike: SkImageType | null;
  sharkBonk: SkImageType | null;
  sharkDizzy: SkImageType | null;
  sharkCheer: SkImageType | null;
  anchor: SkImageType | null;
  splash: SkImageType | null;
  impact: SkImageType | null;
  star: SkImageType | null;
  starburst: SkImageType | null;
  cloud: SkImageType | null;
}

/** Shared values the orchestrator animates from sim events (JS side). */
export interface ArenaAnim {
  flash: SharedValue<number>;
  squash: SharedValue<number>;
  knockX: SharedValue<number>;
  knockY: SharedValue<number>;
  lunge: SharedValue<number>;
  pose: SharedValue<number>;
  buoy0: SharedValue<number>;
  buoy1: SharedValue<number>;
  buoy2: SharedValue<number>;
  splashLane: SharedValue<number>;
  splashP: SharedValue<number>;
  impactP: SharedValue<number>;
  impactX: SharedValue<number>;
  impactY: SharedValue<number>;
  frame: SharedValue<number>;
  exit: SharedValue<number>;
  exitKind: SharedValue<number>;
  entrance: SharedValue<number>;
  anchorDrop: SharedValue<number>;
  padHeld: SharedValue<number>;
  intermission: SharedValue<number>;
}

// Palette (bright world; gold only means "hit now")
const GOLD = '#FFCF3B';
const ORANGE = '#FF8A1F';
const NAVY = '#1B2A4A';
const CYAN = '#7FE9FF';
const WHITE = '#FFFFFF';
const CORAL = '#FF6B5C';

const POSE_IDLE = 0;
const POSE_BONK = 2;
const POSE_DIZZY = 3;
const POSE_CHEER = 4;

function clamp01(x: number): number {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

interface Props {
  L: ArenaLayout;
  view: SharedValue<BossView>;
  t: SharedValue<number>;
  fx: SharedValue<number>;
  anim: ArenaAnim;
  img: ArenaImages;
  bossKind: number;
  reduced: boolean;
  bossArtScale: number;
}

export const BossArena = React.memo(function BossArena({ L, view, t, fx, anim, img, bossKind, reduced, bossArtScale }: Props) {
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Backdrop L={L} fx={fx} img={img} />
      <Starburst L={L} view={view} fx={fx} img={img} />
      <BossBody L={L} view={view} t={t} fx={fx} anim={anim} img={img} bossKind={bossKind} reduced={reduced} scaleArt={bossArtScale} />
      <WaterLip L={L} fx={fx} />
      <GaugeArc L={L} view={view} fx={fx} />
      <Telegraphs L={L} view={view} t={t} fx={fx} bossKind={bossKind} />
      <Targets L={L} view={view} t={t} fx={fx} anim={anim} img={img} bossKind={bossKind} />
      <Splash L={L} anim={anim} img={img} />
      <FloatAndShark L={L} view={view} t={t} fx={fx} anim={anim} img={img} />
      <Impact anim={anim} img={img} />
      <ImpactFrame L={L} anim={anim} />
    </Canvas>
  );
});

// ---------------------------------------------------------------------------

function Backdrop({ L, fx, img }: { L: ArenaLayout; fx: SharedValue<number>; img: ArenaImages }) {
  const cloudA = useDerivedValue(() => [{ translateX: ((fx.value * 0.008) % (L.W + 240)) - 200 }]);
  const cloudB = useDerivedValue(() => [{ translateX: ((fx.value * 0.005 + L.W * 0.6) % (L.W + 240)) - 200 }]);
  // Cover-fit the 9:16 lagoon so the waterline sits behind the boss.
  const ar = aspectOf(img.bg, 752 / 1344);
  const s = Math.max(L.W / ar, L.H);
  const w = ar * s;
  const h = s;
  return (
    <Group>
      <Rect x={0} y={0} width={L.W} height={L.H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, L.H)} colors={['#58C8FF', '#9FF0F5', '#3FD0E8']} />
      </Rect>
      {img.bg ? <SkImage image={img.bg} x={(L.W - w) / 2} y={L.H - h} width={w} height={h} fit="fill" /> : null}
      {img.cloud ? (
        <Group opacity={0.9}>
          <Group transform={cloudA}><SkImage image={img.cloud} x={0} y={L.H * 0.05} width={116} height={78} /></Group>
          <Group transform={cloudB}><SkImage image={img.cloud} x={0} y={L.H * 0.12} width={84} height={56} /></Group>
        </Group>
      ) : null}
    </Group>
  );
}

/** Alex's starburst behind the boss: gold during a Break (the reward moment). */
function Starburst({ L, view, fx, img }: { L: ArenaLayout; view: SharedValue<BossView>; fx: SharedValue<number>; img: ArenaImages }) {
  const size = L.bossSize * 1.9;
  const op = useDerivedValue(() => (view.value.oOn && view.value.oKind === 1 ? 0.42 : 0));
  const tr = useDerivedValue(() => [{ rotate: (fx.value / 1000) * (Math.PI / 6) }]);
  if (!img.starburst) return null;
  return (
    <Group opacity={op} origin={vec(L.bossX, L.bossY)} transform={tr}>
      <SkImage image={img.starburst} x={L.bossX - size / 2} y={L.bossY - size / 2} width={size} height={size}>
        <BlendColor color={GOLD} mode="srcIn" />
      </SkImage>
    </Group>
  );
}

function BossBody({ L, view, t, fx, anim, img, bossKind, reduced, scaleArt }: {
  L: ArenaLayout; view: SharedValue<BossView>; t: SharedValue<number>; fx: SharedValue<number>; anim: ArenaAnim;
  img: ArenaImages; bossKind: number; reduced: boolean; scaleArt: number;
}) {
  const S = L.bossSize * scaleArt;
  const transform = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    const f = fx.value;
    let dx = 0;
    let dy = reduced ? 0 : Math.sin(f / 650) * 6;
    let rot = 0;
    let sx = 1 + (reduced ? 0 : Math.sin(f / 200) * 0.01);
    let sy = 1 + (reduced ? 0 : Math.sin(f / 200 + 1) * 0.012);
    const lane = viewLane(v, now);
    if (v.aOn && lane >= 0) {
      const I = v.steps[v.step * 3 + 1];
      const T = Math.max(v.aT, I - v.aW);
      const dir = lane === 0 ? -1 : lane === 2 ? 1 : 0;
      if (now >= T && now < I - 60) {
        // Anticipation: lean away, swell, hold (tells start in the body).
        const p = clamp01((now - T) / Math.max(1, I - 60 - T));
        const a = ease('outQuad', p / 0.4);
        rot = -dir * 0.14 * a;
        sx *= 1 + 0.06 * a;
        sy *= 1 + 0.06 * a - 0.03 * a;
        dx = -dir * 10 * a;
      } else if (now >= I - 70 && now < I + 260) {
        // Strike toward the lane: the limb and impact land on the target (hold, then recover).
        const p = now < I ? (now - (I - 70)) / 70 : now < I + 90 ? 1 : 1 - (now - I - 90) / 170;
        const a = clamp01(p);
        dx = (L.laneX[lane] - L.bossX) * 0.42 * a;
        dy += L.bossSize * 0.24 * a;
        rot = dir * 0.1 * a;
        sx *= 1 + 0.12 * a;
        sy *= 1 - 0.06 * a;
      }
      if (v.feintLane >= 0 && now >= v.feintT0 && now < v.feintT1) {
        // Fake: a 9 Hz tremble, never orange, never pitched.
        dx += Math.sin((now - v.feintT0) * 0.0565) * 5;
      }
    }
    if (v.oOn) {
      if (v.oKind === 1) {
        // Break: dizzy, dropped, wobbling on the beat.
        dy += 24;
        rot = reduced ? 0 : Math.sin(now / 180) * 0.1;
        sx *= 1.04;
        sy *= 0.96;
      } else {
        // Exposed: head dips toward camera.
        const p = clamp01((now - v.oStart) / 180);
        const a = ease('outBack', p, 1.6);
        sx *= 1 + 0.1 * a;
        sy *= 1 + 0.1 * a;
        dy += 18 * a;
      }
    }
    // Entrance (bursts through the water lip) and KO / Retreat.
    const e = anim.entrance.value;
    dy += (1 - e) * L.bossSize * 0.9;
    const x = anim.exit.value;
    if (x > 0) {
      if (anim.exitKind.value === 1) {
        dy += L.bossSize * 1.1 * ease('inBack', x, 1.4);
        rot += x * 0.6;
      } else {
        dy += L.bossSize * 0.9 * ease('inQuad', x);
        rot += Math.sin(x * 20) * 0.08 * (1 - x);
      }
    }
    const sq = anim.squash.value;
    return [
      { translateX: L.bossX + dx + anim.knockX.value },
      { translateY: L.bossY + dy + anim.knockY.value },
      { rotate: rot },
      { scaleX: sx * (2 - sq) },
      { scaleY: sy * sq },
    ];
  });
  const flashOp = useDerivedValue(() => anim.flash.value);
  const ghostOp = useDerivedValue(() => {
    if (bossKind !== 2) return 1;
    const v = view.value;
    return v.oOn ? 1 : 0.62;
  });
  const decoys = useDerivedValue(() => {
    const v = view.value;
    if (bossKind !== 2 || !v.aOn) return [0, 0, 0];
    const now = t.value;
    const real = viewLane(v, now);
    const out = [0, 0, 0];
    if (v.aKind === 8) {
      for (let i = 0; i < 3; i++) if (i !== real) out[i] = 1;
    } else for (const d of v.decoys) out[d] = 1;
    return out;
  });
  if (!img.boss) return null;
  return (
    <Group>
      <Group transform={transform}>
        <Group opacity={ghostOp}>
          <SkImage image={img.boss} x={-S / 2} y={-S / 2} width={S} height={S} />
        </Group>
        <Group opacity={flashOp}>
          <SkImage image={img.boss} x={-S / 2} y={-S / 2} width={S} height={S}>
            <BlendColor color={WHITE} mode="srcIn" />
          </SkImage>
        </Group>
      </Group>
      {bossKind === 2 ? [0, 1, 2].map((i) => (
        <GhostDecoy key={i} i={i} L={L} img={img.boss!} on={decoys} t={t} />
      )) : null}
    </Group>
  );
}

/** Ghost decoy afterimage: pale, no rim, trembling at 9 Hz, never sings. */
function GhostDecoy({ i, L, img, on, t }: { i: number; L: ArenaLayout; img: SkImageType; on: SharedValue<number[]>; t: SharedValue<number> }) {
  const S = L.bossSize * 0.5;
  const op = useDerivedValue(() => on.value[i] * 0.45);
  const tr = useDerivedValue(() => [
    { translateX: L.laneX[i] + Math.sin(t.value * 0.0565) * 4 },
    { translateY: L.targetY - L.bossSize * 0.62 },
  ]);
  return (
    <Group opacity={op} transform={tr}>
      <SkImage image={img} x={-S / 2} y={-S / 2} width={S} height={S}>
        <BlendColor color="#BFF6FF" mode="modulate" />
      </SkImage>
    </Group>
  );
}

/** Foreground water lip the Kraken is half-submerged behind (cyan, white foam, navy line). */
function WaterLip({ L, fx }: { L: ArenaLayout; fx: SharedValue<number> }) {
  const y0 = L.bossY + L.bossSize * 0.34;
  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const ph = fx.value / 520;
    p.moveTo(0, y0);
    for (let x = 0; x <= L.W; x += 12) p.lineTo(x, y0 + Math.sin(x / 38 + ph) * 5 + Math.sin(x / 17 - ph * 1.3) * 2);
    p.lineTo(L.W, y0 + 60);
    p.lineTo(0, y0 + 60);
    p.close();
    return p;
  });
  const foam = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const ph = fx.value / 520;
    p.moveTo(0, y0);
    for (let x = 0; x <= L.W; x += 12) p.lineTo(x, y0 + Math.sin(x / 38 + ph) * 5 + Math.sin(x / 17 - ph * 1.3) * 2);
    return p;
  });
  return (
    <Group>
      <Path path={path} opacity={0.92}>
        <LinearGradient start={vec(0, y0)} end={vec(0, y0 + 60)} colors={['#4FD8EC', 'rgba(79,216,236,0)']} />
      </Path>
      <Path path={foam} style="stroke" strokeWidth={7} color={NAVY} opacity={0.35} />
      <Path path={foam} style="stroke" strokeWidth={4} color={WHITE} />
    </Group>
  );
}

/** Break gauge on the boss: a slim gold arc that glows and pulses at 80%+. */
function GaugeArc({ L, view, fx }: { L: ArenaLayout; view: SharedValue<BossView>; fx: SharedValue<number> }) {
  const r = L.bossSize * 0.46;
  const cx = L.bossX;
  const cy = L.bossY + L.bossSize * 0.05;
  const track = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, 20, 140);
    return p;
  }, [cx, cy, r]);
  const fill = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const g = view.value.gauge / 1000;
    if (g > 0) p.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, 160, -140 * g);
    return p;
  });
  const glow = useDerivedValue(() => (view.value.gauge >= 800 ? 0.55 + 0.45 * Math.sin(fx.value / 80) : 0));
  const on = useDerivedValue(() => (view.value.on && !(view.value.oOn && view.value.oKind === 1) ? 1 : 0));
  return (
    <Group opacity={on}>
      <Path path={track} style="stroke" strokeWidth={9} strokeCap="round" color={NAVY} opacity={0.35} />
      <Path path={fill} style="stroke" strokeWidth={14} strokeCap="round" color={GOLD} opacity={glow} />
      <Path path={fill} style="stroke" strokeWidth={9} strokeCap="round" color={NAVY} />
      <Path path={fill} style="stroke" strokeWidth={5} strokeCap="round" color={GOLD} />
    </Group>
  );
}

// ---------------------------------------------------------------------------

function Telegraphs({ L, view, t, fx, bossKind }: {
  L: ArenaLayout; view: SharedValue<BossView>; t: SharedValue<number>; fx: SharedValue<number>; bossKind: number;
}) {
  // Orange dashed danger arc from the boss to the telegraphed target.
  const arc = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const v = view.value;
    const now = t.value;
    const lane = viewLane(v, now);
    if (!v.aOn || lane < 0 || bossKind === 1) return p;
    const I = v.steps[v.step * 3 + 1];
    if (now < Math.max(v.aT, I - Math.max(400, v.aW * 0.6)) || now > I + 90) return p;
    const x0 = L.bossX + (L.laneX[lane] - L.bossX) * 0.25;
    const y0 = L.bossY + L.bossSize * 0.3;
    const x1 = L.laneX[lane];
    const y1 = L.targetY - 36;
    // 12 fps line boil: jitter re-seeded every 83 ms.
    const seed = Math.floor(fx.value / 83);
    const j = ((seed * 9301 + 49297) % 233280) / 233280 - 0.5;
    p.moveTo(x0, y0);
    p.quadTo((x0 + x1) / 2 + (x1 - L.bossX) * 0.3 + j * 2.4, (y0 + y1) / 2 - 30 + j * 2.4, x1, y1);
    return p;
  });
  const dash = useDerivedValue(() => -(fx.value * 0.12) % 18);
  // Cyan ripple where the tentacle tip breaks the water above the lane.
  const ripple = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    const lane = viewLane(v, now);
    if (!v.aOn || lane < 0 || bossKind !== 0) return { x: 0, y: 0, r1: 0, r2: 0, o: 0 };
    const I = v.steps[v.step * 3 + 1];
    const T = Math.max(v.aT, I - v.aW);
    const p = (now - T) / 420;
    if (p < 0 || p > 1.4) return { x: 0, y: 0, r1: 0, r2: 0, o: 0 };
    return { x: L.laneX[lane], y: L.targetY - 64, r1: 18 + 46 * clamp01(p), r2: 18 + 46 * clamp01(p - 0.35), o: 1 - clamp01(p - 0.4) };
  });
  const rX = useDerivedValue(() => ripple.value.x);
  const rY = useDerivedValue(() => ripple.value.y);
  const rR1 = useDerivedValue(() => ripple.value.r1);
  const rR2 = useDerivedValue(() => ripple.value.r2);
  const rO = useDerivedValue(() => ripple.value.o);
  // Feint: a white trembling arc, no orange, no pitch.
  const feint = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const v = view.value;
    const now = t.value;
    if (!v.aOn || v.feintLane < 0 || now < v.feintT0 || now >= v.feintT1) return p;
    const x1 = L.laneX[v.feintLane] + Math.sin(now * 0.0565) * 4;
    const y1 = L.targetY - 44;
    p.moveTo(L.bossX, L.bossY + L.bossSize * 0.3);
    p.quadTo((L.bossX + x1) / 2, (L.bossY + y1) / 2 - 20, x1, y1);
    return p;
  });
  return (
    <Group>
      <Circle cx={rX} cy={rY} r={rR1} style="stroke" strokeWidth={4} color={CYAN} opacity={rO} />
      <Circle cx={rX} cy={rY} r={rR2} style="stroke" strokeWidth={3} color={WHITE} opacity={rO} />
      <Path path={arc} style="stroke" strokeWidth={10} strokeCap="round" color={NAVY} opacity={0.8} />
      <Path path={arc} style="stroke" strokeWidth={6} strokeCap="round" color={ORANGE}>
        <DashPathEffect intervals={[10, 8]} phase={dash} />
      </Path>
      <Path path={feint} style="stroke" strokeWidth={8} strokeCap="round" color={NAVY} opacity={0.4} />
      <Path path={feint} style="stroke" strokeWidth={5} strokeCap="round" color={WHITE}>
        <DashPathEffect intervals={[6, 10]} />
      </Path>
    </Group>
  );
}

function Targets({ L, view, t, fx, anim, img, bossKind }: {
  L: ArenaLayout; view: SharedValue<BossView>; t: SharedValue<number>; fx: SharedValue<number>; anim: ArenaAnim;
  img: ArenaImages; bossKind: number;
}) {
  return (
    <Group>
      {[0, 1, 2].map((i) => (
        <Target key={i} i={i} L={L} view={view} t={t} fx={fx} squash={i === 0 ? anim.buoy0 : i === 1 ? anim.buoy1 : anim.buoy2}
          img={bossKind === 0 ? img.buoy : bossKind === 2 ? img.lantern : img.plate} bossKind={bossKind} />
      ))}
    </Group>
  );
}

function Target({ i, L, view, t, fx, squash, img, bossKind }: {
  i: number; L: ArenaLayout; view: SharedValue<BossView>; t: SharedValue<number>; fx: SharedValue<number>;
  squash: SharedValue<number>; img: SkImageType | null; bossKind: number;
}) {
  const x = L.laneX[i];
  const y = L.targetY;
  const h = bossKind === 1 ? 26 : 84;
  const w = aspectOf(img, 1) * h;
  const tr = useDerivedValue(() => {
    const bob = bossKind === 0 ? Math.sin(fx.value / 540 + i * 1.7) * 3 : bossKind === 2 ? Math.sin(fx.value / 700 + i) * 0.04 : 0;
    const s = squash.value;
    return bossKind === 2
      ? [{ translateX: x }, { translateY: y - h / 2 }, { rotate: bob }, { scaleX: 2 - s }, { scaleY: s }]
      : [{ translateX: x }, { translateY: y + bob }, { scaleX: 2 - s }, { scaleY: s }];
  });
  const state = useDerivedValue(() => {
    // 0 idle, 1 telegraphed, 2 perfect window (gold), 3 greyed, 4 hazard bubble, 5 dimmed lane (Kraken bout 1 centre)
    const v = view.value;
    const now = t.value;
    if (now < v.greyUntil[i]) return 3;
    if (v.aOn && v.hazardLane === i && !v.hazardPopped && now >= v.hazardT0 && now < v.hazardT1) return 4;
    const lane = viewLane(v, now);
    if (v.aOn && lane === i) {
      const I = v.steps[v.step * 3 + 1];
      const graded = v.steps[v.step * 3 + 2] === 1;
      if (graded && now >= I - 160 && now <= I + 40) return 2;
      if (now >= Math.max(v.aT, I - v.aW)) return 1;
    }
    if (bossKind === 0 && v.bout === 0 && i === 1) return 5;
    return 0;
  });
  const op = useDerivedValue(() => (state.value === 3 ? 0.4 : state.value === 5 ? 0.55 : 1));
  const goldOp = useDerivedValue(() => (state.value === 2 ? 0.55 : 0));
  // White contracting timing ring that closes on the impact frame.
  const ring = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    const lane = viewLane(v, now);
    if (!v.aOn || lane !== i) return 0;
    const I = v.steps[v.step * 3 + 1];
    const T = Math.max(v.aT, I - v.aW);
    if (now < T || now > I + 90) return 0;
    const p = clamp01((I - now) / Math.max(1, I - T));
    return 40 + 70 * p;
  });
  const ringOp = useDerivedValue(() => (ring.value > 0 ? 1 : 0));
  const ringColor = useDerivedValue(() => (state.value === 2 ? GOLD : WHITE));
  // Shadow of the incoming tentacle grows on the buoy (Kraken).
  const shadow = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    if (bossKind !== 0 || !v.aOn || viewLane(v, now) !== i) return 0;
    const I = v.steps[v.step * 3 + 1];
    const T = Math.max(v.aT, I - v.aW);
    return 0.3 + 0.7 * ease('inQuad', (now - T) / Math.max(1, I - T));
  });
  const shadowRx = useDerivedValue(() => 46 * shadow.value);
  const shadowRy = useDerivedValue(() => 16 * shadow.value);
  const shadowOp = useDerivedValue(() => (shadow.value > 0 ? 0.28 : 0));
  const bubbleOp = useDerivedValue(() => (state.value === 4 ? 0.85 : 0));
  const showOp = useDerivedValue(() => {
    // Robo: this socket's icon flashes during the show phase (white decoy flash = no pitch).
    const v = view.value;
    if (bossKind !== 1 || !v.aOn || v.showStart < 0) return 0;
    const now = t.value;
    const k = Math.floor((now - v.showStart) / (v.q * 4));
    if (k < 0 || k >= v.show.length) return 0;
    const icon = v.show[k] % 3;
    const phase = ((now - v.showStart) % (v.q * 4)) / (v.q * 4);
    return icon === i && phase < 0.7 ? 1 : 0;
  });
  const showColor = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    const k = Math.floor((now - v.showStart) / (v.q * 4));
    return k >= 0 && k < v.show.length && v.show[k] >= 3 ? WHITE : ORANGE;
  });
  return (
    <Group>
      <Oval x={x - 46} y={y + 18} width={92} height={24} color={NAVY} opacity={0.12} />
      <Oval x={useDerivedValue(() => x - shadowRx.value)} y={useDerivedValue(() => y + 24 - shadowRy.value)}
        width={useDerivedValue(() => shadowRx.value * 2)} height={useDerivedValue(() => shadowRy.value * 2)} color={NAVY} opacity={shadowOp} />
      <Circle cx={x} cy={y} r={56} color={GOLD} opacity={goldOp} />
      <Circle cx={x} cy={y} r={Math.min(70, L.W / 6)} color={ORANGE} opacity={useDerivedValue(() => showOp.value * 0.55)} />
      <Circle cx={x} cy={y} r={Math.min(70, L.W / 6)} color={showColor} opacity={useDerivedValue(() => showOp.value * 0.35)} />
      <Group opacity={op} transform={tr}>
        {img ? <SkImage image={img} x={-w / 2} y={-h / 2} width={w} height={h} /> : null}
      </Group>
      <Circle cx={x} cy={y} r={ring} style="stroke" strokeWidth={8} color={NAVY} opacity={useDerivedValue(() => ringOp.value * 0.5)} />
      <Circle cx={x} cy={y} r={ring} style="stroke" strokeWidth={5} color={ringColor} opacity={ringOp} />
      <Circle cx={x} cy={y - 6} r={38} color="#E8FBFF" opacity={bubbleOp} />
      <Circle cx={x} cy={y - 6} r={38} style="stroke" strokeWidth={3} color={NAVY} opacity={bubbleOp} />
      <Circle cx={x - 12} cy={y - 20} r={8} color={WHITE} opacity={bubbleOp} />
    </Group>
  );
}

function Splash({ L, anim, img }: { L: ArenaLayout; anim: ArenaAnim; img: ArenaImages }) {
  const S = 120;
  const tr = useDerivedValue(() => {
    const lane = anim.splashLane.value;
    const p = anim.splashP.value;
    const x = lane >= 0 ? L.laneX[lane] : -500;
    const s = 0.5 + 0.7 * ease('outBack', p * 1.6, 1.4);
    return [{ translateX: x }, { translateY: L.targetY + 10 }, { scale: s }];
  });
  const op = useDerivedValue(() => (anim.splashP.value > 0 ? 1 - clamp01((anim.splashP.value - 0.55) / 0.45) : 0));
  if (!img.splash) return null;
  return (
    <Group transform={tr} opacity={op}>
      <SkImage image={img.splash} x={-S / 2} y={-S} width={S} height={S} />
    </Group>
  );
}

function FloatAndShark({ L, view, t, fx, anim, img }: {
  L: ArenaLayout; view: SharedValue<BossView>; t: SharedValue<number>; fx: SharedValue<number>; anim: ArenaAnim; img: ArenaImages;
}) {
  const R = L.floatR;
  const fw = R * 2.1;
  const floatTr = useDerivedValue(() => [{ translateX: L.floatX }, { translateY: L.floatY + Math.sin(fx.value / 600) * 2.5 }]);
  // Crit rings: gold ring contracts onto the float rim and closes on the beat.
  const ringInfo = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    if (!v.oOn || v.heavyDone) return { r: 0, o: 0, hot: 0, r2: 0, o2: 0 };
    const beat = v.q * 4;
    let r = 0;
    let o = 0;
    let hot = 0;
    let r2 = 0;
    let o2 = 0;
    let n = 0;
    for (let j = 0; j < v.rings.length; j++) {
      if (v.used[j] !== 0) continue;
      const dt = v.rings[j] - now;
      if (dt < -80) continue;
      if (dt > beat * 1.1) break;
      const rr = R + 4 + Math.max(0, dt) / beat * R * 1.1;
      if (n === 0) {
        r = rr;
        o = 1;
        hot = Math.abs(dt) <= 80 ? 1 : 0;
      } else {
        r2 = rr;
        o2 = 0.55;
      }
      n += 1;
      if (n > 1) break;
    }
    return { r, o, hot, r2, o2 };
  });
  const rr = useDerivedValue(() => ringInfo.value.r);
  const ro = useDerivedValue(() => ringInfo.value.o);
  const rr2 = useDerivedValue(() => ringInfo.value.r2);
  const ro2 = useDerivedValue(() => ringInfo.value.o2);
  const hotOp = useDerivedValue(() => ringInfo.value.hot * 0.6);
  // Opening close telegraph: the rim blinks gold-white-grey in the last 250 ms.
  const closeOp = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    if (!v.oOn || v.oKind === 1) return 0;
    const left = v.oEnd - now;
    return left <= 250 && left > 0 ? (Math.floor(left / 60) % 2 === 0 ? 0.9 : 0.25) : 0;
  });
  // Finisher / Heavy: white timing ring closing on the finisher ring time.
  const finR = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    if (!v.finOn || v.finDone) return 0;
    const p = clamp01((v.finRing - now) / Math.max(1, v.finRing - v.finStart));
    return R + 6 + p * R * 1.6;
  });
  const finOp = useDerivedValue(() => (finR.value > 0 ? 1 : 0));
  const finColor = useDerivedValue(() => (Math.abs(view.value.finRing - t.value) <= 110 ? GOLD : WHITE));
  // Anchor rises over the float while the pad is held in the finisher; falls on release.
  const anchorTr = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    const held = anim.padHeld.value > 0 && v.finOn && !v.finDone ? clamp01((now - v.padDownAt) / 400) : 0;
    const drop = anim.anchorDrop.value;
    const y = drop > 0
      ? L.floatY - R * 2.4 - (L.floatY - L.bossY - R * 2.4) * ease('inQuad', drop)
      : L.floatY - R * 1.4 - R * 1.1 * ease('outBack', held, 1.5);
    const s = drop > 0 ? 1 + drop * 0.6 : 0.4 + 0.6 * held;
    return [{ translateX: L.floatX }, { translateY: y }, { scale: s }];
  });
  const anchorOp = useDerivedValue(() => {
    const v = view.value;
    if (anim.anchorDrop.value > 0 && anim.anchorDrop.value < 1) return 1;
    return v.finOn && !v.finDone && anim.padHeld.value > 0 ? 1 : 0;
  });
  // Heavy charge: holding through an opening glows the shark gold after a beat.
  const heavyOp = useDerivedValue(() => {
    const v = view.value;
    const now = t.value;
    if (!v.oOn || v.oKind === 1 || anim.padHeld.value <= 0 || v.padDownAt < v.oStart) return 0;
    return now - v.padDownAt >= v.q * 4 ? 0.5 + 0.3 * Math.sin(fx.value / 60) : 0;
  });
  // Player shark: crouch as the ring closes, lunge on hits, bonk / dizzy / cheer poses.
  const SH = R * 1.9;
  const sharkTr = useDerivedValue(() => {
    const info = ringInfo.value;
    const crouch = info.o > 0 && info.r < R * 1.5 ? 0.9 + 0.1 * clamp01((info.r - R) / (R * 0.5)) : 1;
    const held = anim.padHeld.value > 0 ? 0.93 : 1;
    const l = anim.lunge.value;
    return [
      { translateX: L.floatX + (L.bossX - L.floatX) * 0.1 * l },
      { translateY: L.floatY - R * 0.35 - 22 * l },
      { scaleX: 1 / Math.sqrt(crouch * held) },
      { scaleY: crouch * held },
    ];
  });
  const poseIdle = useDerivedValue<number>(() => (anim.pose.value === POSE_IDLE && anim.lunge.value < 0.25 ? 1 : 0));
  const poseStrike = useDerivedValue<number>(() => (anim.pose.value === POSE_IDLE && anim.lunge.value >= 0.25 ? 1 : 0));
  const poseBonk = useDerivedValue<number>(() => (anim.pose.value === POSE_BONK ? 1 : 0));
  const poseDizzy = useDerivedValue<number>(() => (anim.pose.value === POSE_DIZZY ? 1 : 0));
  const poseCheer = useDerivedValue<number>(() => (anim.pose.value === POSE_CHEER ? 1 : 0));
  const smear = useDerivedValue(() => (anim.lunge.value > 0.3 ? 0.25 : 0));
  const sharkImg = (im: SkImageType | null, op: SharedValue<number>) => {
    if (!im) return null;
    const w = aspectOf(im, 0.75) * SH;
    return (
      <Group opacity={op}>
        <SkImage image={im} x={-w / 2} y={-SH * 0.82} width={w} height={SH} />
      </Group>
    );
  };
  return (
    <Group>
      <Circle cx={L.floatX} cy={L.floatY} r={rr2} style="stroke" strokeWidth={4} color={GOLD} opacity={ro2} />
      <Circle cx={L.floatX} cy={L.floatY} r={rr} style="stroke" strokeWidth={10} color={NAVY} opacity={useDerivedValue(() => ro.value * 0.55)} />
      <Circle cx={L.floatX} cy={L.floatY} r={rr} style="stroke" strokeWidth={6} color={GOLD} opacity={ro} />
      <Circle cx={L.floatX} cy={L.floatY} r={R * 1.05} color={GOLD} opacity={hotOp} />
      <Circle cx={L.floatX} cy={L.floatY} r={finR} style="stroke" strokeWidth={9} color={NAVY} opacity={useDerivedValue(() => finOp.value * 0.5)} />
      <Circle cx={L.floatX} cy={L.floatY} r={finR} style="stroke" strokeWidth={5} color={finColor} opacity={finOp} />
      <Group transform={floatTr}>
        {img.float ? <SkImage image={img.float} x={-fw / 2} y={-fw / 2 * 0.62} width={fw} height={fw * 0.62} fit="fill" /> : null}
      </Group>
      <Circle cx={L.floatX} cy={L.floatY} r={R * 1.02} style="stroke" strokeWidth={5} color={CORAL} opacity={closeOp} />
      <Circle cx={L.floatX} cy={L.floatY - R * 0.6} r={R * 0.9} color={GOLD} opacity={heavyOp} />
      <Group transform={sharkTr}>
        <Group opacity={smear} transform={[{ translateY: 16 }]}>
          {img.sharkStrike ? <SkImage image={img.sharkStrike} x={-SH * 0.37} y={-SH * 0.82} width={SH * 0.73} height={SH} /> : null}
        </Group>
        {sharkImg(img.shark, poseIdle)}
        {sharkImg(img.sharkStrike, poseStrike)}
        {sharkImg(img.sharkBonk, poseBonk)}
        {sharkImg(img.sharkDizzy, poseDizzy)}
        {sharkImg(img.sharkCheer, poseCheer)}
      </Group>
      <Group transform={anchorTr} opacity={anchorOp}>
        {img.anchor ? <SkImage image={img.anchor} x={-30} y={-45} width={60} height={90} /> : null}
      </Group>
    </Group>
  );
}

function Impact({ anim, img }: { anim: ArenaAnim; img: ArenaImages }) {
  const tr = useDerivedValue(() => {
    const p = anim.impactP.value;
    return [{ translateX: anim.impactX.value }, { translateY: anim.impactY.value }, { scale: 0.4 + 0.9 * ease('outBack', p * 2, 2) }];
  });
  const op = useDerivedValue(() => (anim.impactP.value > 0 ? 1 - clamp01((anim.impactP.value - 0.4) / 0.6) : 0));
  if (!img.impact) return null;
  return (
    <Group transform={tr} opacity={op}>
      <SkImage image={img.impact} x={-48} y={-52} width={96} height={104} />
    </Group>
  );
}

/** 2-frame white-and-gold impact frame on Break and Finisher (kept bright). */
function ImpactFrame({ L, anim }: { L: ArenaLayout; anim: ArenaAnim }) {
  const white = useDerivedValue(() => (anim.frame.value === 2 ? 0.85 : 0));
  const gold = useDerivedValue(() => (anim.frame.value === 1 ? 0.45 : 0));
  return (
    <Group>
      <Rect x={0} y={0} width={L.W} height={L.H} color={WHITE} opacity={white} />
      <Rect x={0} y={0} width={L.W} height={L.H} color={GOLD} opacity={gold} />
    </Group>
  );
}
