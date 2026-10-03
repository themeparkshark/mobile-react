/**
 * Map-anchored fright sprites: reef critters (and their still glyph), haunt
 * lanterns, spot props and the encounter. Each is one small Skia canvas in a
 * map marker, animated from the living map's single ambient clock on the UI
 * thread. `animated: false` draws a still frame and subscribes to nothing.
 */
import { BlurMask, Canvas, Circle, Group, Image as SkImage, Oval, Path, RadialGradient, Rect, Skia, useImage, vec } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { hash01 } from '../alive/ambientBudget';
import { CritterBody } from './CritterBody';
import { critterPose } from './critters';
import { BAT_FRAME, BAT_FRAMES, critterLook, EYES_FRAMES, EYES_H, EYES_W, FRIGHT_ART, MIST_H, MIST_W, NIGHT } from './frightArt';
import { flickerPlan, flickerProfile, silhouetteAt, silhouettePlan, windowLevel } from './flicker';
import { hashString } from './random';
import { frightIntro } from './useFrightState';
import type { FrightProp } from './frightBudget';

/* ── Reef critters ────────────────────────────────────────────────────── */

function Critter({ seed, clock, wander, watch, popStart, pops, slug, index, cx, cy, animated }: {
  seed: number; clock: SharedValue<number>; wander: number; watch: number; popStart: SharedValue<number>;
  pops: boolean; slug: string | null; index: number; cx: number; cy: number; animated: boolean;
}) {
  const look = useMemo(() => critterLook(slug, index), [slug, index]);
  const still = useMemo(() => critterPose(seed, 0, wander, watch, -1), [seed, wander, watch]);
  const pose = useDerivedValue(() => {
    if (!animated) return still;
    return critterPose(seed, clock.value, wander, watch, pops ? clock.value - popStart.value : -1);
  });
  const body = useDerivedValue(() => {
    const p = pose.value;
    return [{ translateX: cx + p.x }, { translateY: cy + p.y + p.hop },
      { scaleX: p.face * (1 + (1 - p.squash) * 0.5) }, { scaleY: p.squash }];
  });
  const shadow = useDerivedValue(() => {
    const p = pose.value;
    const s = Math.max(0.5, 1 + p.hop / 60);
    return [{ translateX: cx + p.x }, { translateY: cy + p.y }, { scale: s }];
  });
  return (
    <Group>
      <Group transform={shadow}><Oval x={-10} y={-3} width={20} height={6} color="rgba(10,6,30,0.35)" /></Group>
      <Group transform={body}><CritterBody look={look} /></Group>
    </Group>
  );
}

/** Critters wandering a reef, over a still ground mist (fog is thicker at reefs). */
export const ReefCritters = memo(function ReefCritters({ reefKey, slugs, count, wanderPts, clock, animated, watch, popToken, intensity }: {
  readonly reefKey: string;
  readonly slugs: readonly string[];
  readonly count: number;
  readonly wanderPts: number;
  readonly clock: SharedValue<number>;
  readonly animated: boolean;
  /** 0, or the side (+1 / -1) the player is on when within 60 m. */
  readonly watch: number;
  /** Bumps on each reef-entry pop. */
  readonly popToken: number;
  readonly intensity: number;
}) {
  const mist = useImage(FRIGHT_ART.groundMist);
  const W = Math.round(wanderPts * 2 + 70);
  const H = Math.round(wanderPts * 1.4 + 100);
  const cx = W / 2;
  const cy = H / 2 + 14;
  const popStart = useSharedValue(-1000);
  useEffect(() => { if (popToken > 0) popStart.value = clock.value; }, [popToken, clock, popStart]);
  const seed = hashString(reefKey) % 10_000;
  return (
    <Canvas style={{ width: W, height: H }} pointerEvents="none">
      {mist && (
        <SkImage image={mist} x={cx - (W * 0.55)} y={cy - MIST_H * (W * 1.1 / MIST_W) * 0.6} width={W * 1.1}
          height={MIST_H * (W * 1.1 / MIST_W)} opacity={0.6 * intensity} fit="fill" />
      )}
      {Array.from({ length: count }, (_, i) => (
        <Critter key={i} seed={seed + i * 37} clock={clock} wander={wanderPts} watch={watch} popStart={popStart}
          pops={i === 0} slug={slugs.length ? slugs[i % slugs.length] : null} index={i} cx={cx} cy={cy} animated={animated} />
      ))}
    </Canvas>
  );
});

/** Zoomed out or calm: one still critter on a mist puddle marks the reef. */
export const ReefGlyph = memo(function ReefGlyph({ slug, intensity }: { readonly slug: string | null; readonly intensity: number }) {
  const look = useMemo(() => critterLook(slug, 0), [slug]);
  return (
    <Canvas style={{ width: 40, height: 40 }} pointerEvents="none">
      <Oval x={2} y={24} width={36} height={12} color={NIGHT.fog} opacity={0.45 * Math.max(0.4, intensity)} />
      <Group transform={[{ translateX: 20 }, { translateY: 32 }, { scale: 0.85 }]}><CritterBody look={look} /></Group>
    </Canvas>
  );
});

/* ── Haunt lanterns ───────────────────────────────────────────────────── */

const LW = 76;
const LH = 86;
const HOUSE = Skia.Path.MakeFromSVGString('M14 36 L38 12 L62 36 L62 74 L14 74 Z')!;
const ROOF = Skia.Path.MakeFromSVGString('M9 38 L38 9 L67 38 L62 38 L38 15 L14 38 Z')!;
const DOOR = Skia.Path.MakeFromSVGString('M32 74 L32 64 Q38 57 44 64 L44 74 Z')!;
const GHOST = Skia.Path.MakeFromSVGString('M-3 4 L-3 -1 Q0 -5 3 -1 L3 4 L1.5 2.6 L0 4 L-1.5 2.6 Z')!;
const SLOTS: readonly [number, number][] = [[19, 42], [47, 42], [19, 55], [47, 55], [33, 25], [33, 43]];
const WIN_W = 10;
const WIN_H = 9;

function LanternWindow({ i, plan, sil, windows, clock, animated, dim }: {
  i: number; plan: number[]; sil: number[]; windows: number; clock: SharedValue<number>; animated: boolean; dim: boolean;
}) {
  const [x, y] = SLOTS[i];
  const level = useDerivedValue(() => (dim ? 0.12 : animated ? windowLevel(plan, i, clock.value) : 0.85));
  const ghost = useDerivedValue(() => {
    if (!animated || dim) return [{ translateX: -100 }];
    const s = silhouetteAt(sil, windows, clock.value);
    return s.p < 0 || s.w !== i ? [{ translateX: -100 }] : [{ translateX: x - 3 + s.p * (WIN_W + 6) }, { translateY: y + WIN_H / 2 }];
  });
  const clip = useMemo(() => Skia.XYWHRect(x, y, WIN_W, WIN_H), [x, y]);
  return (
    <Group>
      <Rect x={x} y={y} width={WIN_W} height={WIN_H} color={NIGHT.candy} opacity={level} />
      <Group clip={clip}><Group transform={ghost}><Path path={GHOST} color={NIGHT.midnight} opacity={0.85} /></Group></Group>
      <Rect x={x} y={y} width={WIN_W} height={WIN_H} color={NIGHT.ink} style="stroke" strokeWidth={1.4} />
    </Group>
  );
}

/**
 * A haunt's lantern at its entrance: a little haunted facade (or the server's
 * icon), windows flickering by fx.flicker, a ghostly silhouette now and then,
 * a warm glow pool. Gold glow and a bead count once survived; dim when closed.
 * During the intro cinematic lanterns light one by one (120 ms apart).
 */
export const HauntLantern = memo(function HauntLantern({ spotKey, flicker, windows, animatedWindows, clock, animated, done, beads, dim, index, iconUrl, intensity, reducedMotion }: {
  readonly spotKey: string;
  readonly flicker: string | null | undefined;
  readonly windows: number;
  readonly animatedWindows: number;
  readonly clock: SharedValue<number>;
  readonly animated: boolean;
  readonly done: boolean;
  readonly beads: number;
  readonly dim: boolean;
  readonly index: number;
  readonly iconUrl: string | null;
  readonly intensity: number;
  readonly reducedMotion: boolean;
}) {
  const seed = hashString(spotKey);
  const plan = useMemo(() => flickerPlan(flickerProfile(flicker), seed, windows), [flicker, seed, windows]);
  const sil = useMemo(() => silhouettePlan(seed, windows), [seed, windows]);
  const glowColor = done ? NIGHT.candy : NIGHT.lantern;
  const glow = useDerivedValue(() => {
    if (dim) return 0.12;
    const base = done ? 0.75 : 0.55;
    return animated ? base + 0.12 * (windowLevel(plan, 0, clock.value * 0.7) - 0.75) : base;
  });
  // Lit stagger: lantern i lights at 2.0 s + i * 120 ms into the 4 s intro.
  const lit = useDerivedValue(() => {
    const t = frightIntro.value * 4;
    if (frightIntro.value >= 1) return dim ? 0.6 : 1;
    const on = reducedMotion ? frightIntro.value : Math.max(0, Math.min(1, (t - 2 - index * 0.12) / 0.3));
    return (dim ? 0.6 : 1) * (0.25 + 0.75 * on);
  });
  return (
    <View style={styles.lantern} pointerEvents="none">
      <Canvas style={{ width: LW, height: LH }}>
        <Group opacity={lit}>
          <Circle cx={38} cy={72} r={30} opacity={glow}>
            <RadialGradient c={vec(38, 72)} r={30} colors={[glowColor, `${glowColor}00`]} />
          </Circle>
          {done && <Circle cx={38} cy={44} r={32} color={NIGHT.candy} opacity={0.35 * Math.max(0.5, intensity)}><BlurMask blur={8} style="normal" /></Circle>}
          {!iconUrl && (
            <Group>
              <Path path={HOUSE} color={NIGHT.haunt} />
              <Path path={HOUSE} color={NIGHT.ink} style="stroke" strokeWidth={2} strokeJoin="round" />
              <Path path={ROOF} color={NIGHT.midnight} />
              <Path path={ROOF} color={NIGHT.ink} style="stroke" strokeWidth={1.6} strokeJoin="round" />
              <Path path={DOOR} color={NIGHT.ink} />
              {Array.from({ length: Math.min(windows, SLOTS.length) }, (_, i) => (
                <LanternWindow key={i} i={i} plan={plan} sil={sil} windows={Math.min(windows, SLOTS.length)} clock={clock}
                  animated={animated && i < animatedWindows} dim={dim} />
              ))}
              <Circle cx={47} cy={68} r={2.6} color={dim ? NIGHT.dusk : NIGHT.lantern} />
              {done && <Path path={HOUSE} color={NIGHT.candy} style="stroke" strokeWidth={1.4} strokeJoin="round" />}
            </Group>
          )}
        </Group>
      </Canvas>
      {iconUrl && (
        <Image source={{ uri: iconUrl }} style={[styles.icon, dim && styles.iconDim]} contentFit="contain" cachePolicy="memory-disk" transition={0} />
      )}
      {done && (
        <View style={styles.bead}>
          <View style={styles.beadDot} />
          <Text style={styles.beadText}>{beads > 1 ? `x${beads}` : '1'}</Text>
        </View>
      )}
    </View>
  );
});

/* ── Spot props ───────────────────────────────────────────────────────── */

const PW = 200;
const PH = 150;

function Bat({ k, seed, clock, sheet, animated }: { k: number; seed: number; clock: SharedValue<number>; sheet: ReturnType<typeof useImage>; animated: boolean }) {
  const speed = 0.35 + hash01(seed + k * 7) * 0.25;
  const phase = hash01(seed + k * 7 + 1) * 6.283;
  const state = useDerivedValue(() => {
    const t = animated ? clock.value : 0;
    const a = t * speed + phase;
    return { x: PW / 2 + Math.cos(a) * 62, y: 44 + Math.sin(a * 1.3) * 18, frame: animated ? Math.floor(t * 9 + k) % BAT_FRAMES : 0, dir: -Math.sin(a) >= 0 ? 1 : -1 };
  });
  const transform = useDerivedValue(() => [{ translateX: state.value.x }, { translateY: state.value.y }, { scaleX: 0.55 * state.value.dir }, { scaleY: 0.55 }]);
  const offset = useDerivedValue(() => [{ translateX: -BAT_FRAME / 2 - state.value.frame * BAT_FRAME }, { translateY: -BAT_FRAME / 2 }]);
  const clip = useMemo(() => Skia.XYWHRect(-BAT_FRAME / 2, -BAT_FRAME / 2, BAT_FRAME, BAT_FRAME), []);
  if (!sheet) return null;
  return (
    <Group transform={transform}>
      <Group clip={clip}>
        <Group transform={offset}><SkImage image={sheet} x={0} y={0} width={BAT_FRAME * BAT_FRAMES} height={BAT_FRAME} fit="fill" /></Group>
      </Group>
    </Group>
  );
}

const EYES_SEQ = [0, 2, 3, 4, 0];

function Eyes({ seed, clock, sheet, animated }: { seed: number; clock: SharedValue<number>; sheet: ReturnType<typeof useImage>; animated: boolean }) {
  const every = 3.5 + hash01(seed + 3) * 3;
  const offset = useDerivedValue(() => {
    let frame = 0;
    if (animated) {
      const c = (clock.value + hash01(seed) * every) % every;
      if (c < 0.5) frame = EYES_SEQ[Math.min(EYES_SEQ.length - 1, Math.floor(c / 0.1))];
    }
    return [{ translateX: -frame * EYES_W }];
  });
  const clip = useMemo(() => Skia.XYWHRect(0, 0, EYES_W, EYES_H), []);
  if (!sheet) return null;
  return (
    <Group transform={[{ translateX: 22 }, { translateY: 104 }]}>
      <Oval x={-8} y={-6} width={56} height={32} color="#20323A" />
      <Oval x={-8} y={-6} width={56} height={32} color={NIGHT.ink} style="stroke" strokeWidth={1.5} />
      <Group clip={clip}><Group transform={offset}><SkImage image={sheet} x={0} y={0} width={EYES_W * EYES_FRAMES} height={EYES_H} fit="fill" /></Group></Group>
    </Group>
  );
}

const PUMPKIN = Skia.Path.MakeFromSVGString('M-11 0 C-15 -10 -9 -20 0 -18 C9 -20 15 -10 11 0 C7 4 -7 4 -11 0 Z')!;
const FACE = Skia.Path.MakeFromSVGString('M-6 -10 L-3 -13 L0 -10 Z M0 -10 L3 -13 L6 -10 Z M-6 -5 Q0 -1 6 -5')!;

function Pumpkin({ clock, animated }: { clock: SharedValue<number>; animated: boolean }) {
  const turn = useDerivedValue(() => (animated ? Math.cos(clock.value * 0.7) : 1));
  const body = useDerivedValue(() => [{ translateX: 160 }, { translateY: 130 }, { scaleX: 0.55 + 0.45 * Math.abs(turn.value) }]);
  const face = useDerivedValue(() => Math.max(0, turn.value));
  return (
    <Group transform={body}>
      <Path path={PUMPKIN} color={NIGHT.pumpkin} />
      <Path path={PUMPKIN} color={NIGHT.ink} style="stroke" strokeWidth={1.6} />
      <Rect x={-1.5} y={-22} width={3} height={5} color="#4F8A3A" />
      <Path path={FACE} color={NIGHT.candy} style="stroke" strokeWidth={1.6} strokeCap="round" opacity={face} />
    </Group>
  );
}

function SkidSparks({ seed, clock }: { seed: number; clock: SharedValue<number> }) {
  const every = 40 + hash01(seed + 9) * 30;
  const run = 2.5;
  const p = useDerivedValue(() => {
    const c = (clock.value + hash01(seed + 11) * every) % every;
    return c < run ? c / run : -1;
  });
  return (
    <Group>
      {Array.from({ length: 4 }, (_, j) => (
        <SparkDot key={j} j={j} p={p} />
      ))}
    </Group>
  );
}

function SparkDot({ j, p }: { j: number; p: SharedValue<number> }) {
  const c = useDerivedValue(() => {
    const q = p.value - j * 0.03;
    return vec(10 + q * 180, 140 - q * 40 + Math.sin(q * 40) * 2);
  });
  const o = useDerivedValue(() => (p.value < 0 ? 0 : (1 - j / 4) * Math.sin(Math.min(1, p.value) * Math.PI)));
  return <Circle c={c} r={2.4 - j * 0.4} color={NIGHT.candy} opacity={o} />;
}

function HangingLantern({ seed, clock, animated }: { seed: number; clock: SharedValue<number>; animated: boolean }) {
  const glow = useDerivedValue(() => {
    if (!animated) return 0.6;
    const t = clock.value;
    const stutter = ((t + hash01(seed) * 9) % 9) < 0.25 ? 0.25 : 1; // a buzz now and then
    return (0.5 + 0.1 * Math.sin(t * 5.3)) * stutter;
  });
  return (
    <Group>
      <Circle cx={100} cy={26} r={16} opacity={glow}><RadialGradient c={vec(100, 26)} r={16} colors={[NIGHT.lantern, `${NIGHT.lantern}00`]} /></Circle>
      <Rect x={96} y={20} width={8} height={11} color={NIGHT.candy} />
      <Rect x={96} y={20} width={8} height={11} color={NIGHT.ink} style="stroke" strokeWidth={1.3} />
    </Group>
  );
}

/** Ambient props near a spot (fx.props). Moving props past the budget draw still. */
export const SpotProps = memo(function SpotProps({ spotKey, props, bats, movingAllowed, clock, animated, intensity }: {
  readonly spotKey: string;
  readonly props: readonly FrightProp[];
  readonly bats: number;
  /** How many of the moving props may animate. */
  readonly movingAllowed: number;
  readonly clock: SharedValue<number>;
  readonly animated: boolean;
  readonly intensity: number;
}) {
  const batSheet = useImage(FRIGHT_ART.bats);
  const eyesSheet = useImage(FRIGHT_ART.eyes);
  const mist = useImage(FRIGHT_ART.groundMist);
  const seed = hashString(spotKey) % 10_000;
  let budget = movingAllowed;
  const take = () => animated && budget-- > 0;
  return (
    <Canvas style={{ width: PW, height: PH }} pointerEvents="none">
      {props.includes('fog-thick') && mist && (
        <SkImage image={mist} x={-20} y={PH - 70} width={PW + 40} height={70} fit="fill" opacity={0.55 * intensity} />
      )}
      {props.includes('eyes') && <Eyes seed={seed} clock={clock} sheet={eyesSheet} animated={take()} />}
      {props.includes('pumpkin') && <Pumpkin clock={clock} animated={take()} />}
      {props.includes('lantern') && <HangingLantern seed={seed} clock={clock} animated={take()} />}
      {props.includes('skid-fins') && take() && <SkidSparks seed={seed} clock={clock} />}
      {animated && Array.from({ length: bats }, (_, k) => (
        <Bat key={k} k={k} seed={seed} clock={clock} sheet={batSheet} animated />
      ))}
    </Canvas>
  );
});

/* ── Encounter ────────────────────────────────────────────────────────── */

/** The Lantern Star encounter: its critter circling with a spark trail inside a pulsing ring. */
export const EncounterSprite = memo(function EncounterSprite({ critter, ringPts, trail, clock, animated }: {
  readonly critter: 'chuckles' | 'riptide';
  readonly ringPts: number;
  readonly trail: number;
  readonly clock: SharedValue<number>;
  readonly animated: boolean;
}) {
  const S = Math.round(ringPts * 2 + 60);
  const c = S / 2;
  const look = useMemo(() => critterLook(critter), [critter]);
  const ringR = useDerivedValue(() => ringPts * (animated ? 0.94 + 0.06 * Math.sin(clock.value * 2.4) : 1));
  const ringO = useDerivedValue(() => (animated ? 0.55 + 0.25 * Math.sin(clock.value * 2.4) : 0.7));
  const at = (lag: number) => {
    'worklet';
    const a = (animated ? clock.value : 0) * 0.9 - lag;
    return { x: c + Math.cos(a) * ringPts * 0.55, y: c + Math.sin(a) * ringPts * 0.38 };
  };
  const body = useDerivedValue(() => {
    const p = at(0);
    const dir = Math.cos((animated ? clock.value : 0) * 0.9) >= 0 ? -1 : 1;
    return [{ translateX: p.x }, { translateY: p.y + 10 }, { scaleX: dir * 1.1 }, { scaleY: 1.1 }];
  });
  return (
    <Canvas style={{ width: S, height: S }} pointerEvents="none">
      <Circle cx={c} cy={c} r={ringR} color={NIGHT.candy} style="stroke" strokeWidth={3} opacity={ringO} />
      <Circle cx={c} cy={c} r={ringR} color={NIGHT.candy} opacity={0.08} />
      {animated && Array.from({ length: trail }, (_, j) => <TrailDot key={j} j={j} at={at} />)}
      <Group transform={body}><CritterBody look={look} /></Group>
    </Canvas>
  );
});

function TrailDot({ j, at }: { j: number; at: (lag: number) => { x: number; y: number } }) {
  const c = useDerivedValue(() => {
    const p = at(0.12 * (j + 1));
    return vec(p.x, p.y);
  });
  return <Circle c={c} r={3 - j * 0.35} color={NIGHT.candy} opacity={0.7 - j * 0.1} />;
}

const styles = StyleSheet.create({
  lantern: { width: LW, height: LH + 14, alignItems: 'center' },
  icon: { position: 'absolute', top: 8, width: 60, height: 66 },
  iconDim: { opacity: 0.5 },
  bead: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: -6, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 9, backgroundColor: NIGHT.ink, borderWidth: 1.5, borderColor: NIGHT.candy },
  beadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: NIGHT.candy },
  beadText: { fontFamily: 'Knockout', fontSize: 11, color: NIGHT.candy },
});
