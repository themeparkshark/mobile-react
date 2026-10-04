/**
 * Map-anchored fright sprites: reef critters (and their still glyph), haunt
 * facades, spot props and the encounter. Each is one small Skia canvas in a
 * map marker, animated from the living map's single ambient clock on the UI
 * thread. Art is server-hosted (assets), drawn at half pixel size (@2x
 * sheets); the Skia placeholders only draw while art loads or if it fails.
 * `animated: false` draws a still frame.
 */
import { BlurMask, Canvas, Circle, Group, Image as SkImage, Mask, Oval, Path, RadialGradient, Rect, Skia, vec, type SkImage as SkImageType } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { FrightAmbientAsset, FrightHauntLayers, FrightSheetAsset } from '../../../api/endpoints/fright/types';
import { hash01 } from '../alive/ambientBudget';
import { CritterBody } from './CritterBody';
import { critterPose, sheetPose } from './critters';
import { BAT_FRAME, BAT_FRAMES, critterLook, EYES_FRAMES, EYES_H, EYES_W, FRIGHT_ART, MIST_H, MIST_W, NIGHT } from './frightArt';
import { critterRows, encounterPose, rowIndex, sheetTiming, SPARK_RUN_S, sparkPass, timelineLit, windowTimelines } from './frightAssets';
import { flickerPlan, flickerProfile, silhouetteAt, silhouettePlan, windowLevel } from './flicker';
import { hashString } from './random';
import { useFrightImage, useRemoteImage } from './useFrightImage';
import { frightIntro } from './useFrightState';
import { chipShiftClear, type FrightProp, type HudRect } from './frightBudget';

/* ── Sheet frames ─────────────────────────────────────────────────────── */

/**
 * One frame of an @2x sheet drawn at half size with its top-left at (x, y):
 * the image is clipped to the frame and slid by the frame and row.
 */
function SheetFrame({ image, fw, fh, frame, row, x, y, opacity }: {
  image: SkImageType | null; fw: number; fh: number; frame: SharedValue<number>; row: SharedValue<number>;
  x: number; y: number; opacity?: SharedValue<number> | number;
}) {
  const w = fw / 2;
  const h = fh / 2;
  const clip = useMemo(() => Skia.XYWHRect(x, y, w, h), [x, y, w, h]);
  const slide = useDerivedValue(() => [{ translateX: x - frame.value * w }, { translateY: y - row.value * h }]);
  return (
    <Group clip={clip} opacity={opacity}>
      <Group transform={slide}>
        {/* A null image (still loading) draws nothing; the node stays mounted either way. */}
        <SkImage image={image} x={0} y={0} width={(image?.width() ?? 0) / 2} height={(image?.height() ?? 0) / 2} fit="fill" />
      </Group>
    </Group>
  );
}

/* ── Soft edges ───────────────────────────────────────────────────────── */

/**
 * Masks its children to a soft ellipse inscribed in the box: fully opaque in
 * the middle, fading to zero alpha before every edge. No fog sprite or
 * critter cloud base ever shows a straight edge, at any zoom.
 */
export function SoftEllipse({ x, y, w, h, inner = 0.55, children }: {
  x: number; y: number; w: number; h: number; inner?: number; children: ReactNode;
}) {
  const c = vec(x + w / 2, y + h / 2);
  return (
    <Mask mode="alpha" mask={
      <Rect x={x} y={y} width={w} height={h}>
        <RadialGradient c={c} r={w / 2} origin={c} transform={[{ scaleY: h / w }]}
          colors={['rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0)']} positions={[0, inner, 1]} />
      </Rect>
    }>{children}</Mask>
  );
}

/** Ground mist feathered to zero alpha on all four edges (never a hard band). */
function FeatheredMist({ image, x, y, w, h, opacity }: { image: SkImageType | null; x: number; y: number; w: number; h: number; opacity: number }) {
  return (
    <SoftEllipse x={x} y={y} w={w} h={h} inner={0.35}>
      <SkImage image={image} x={x} y={y} width={w} height={h} fit="fill" opacity={opacity} />
    </SoftEllipse>
  );
}

/* ── Reef critters ────────────────────────────────────────────────────── */

const NO_ROWS = [0, -1, -1];

function Critter({ seed, clock, wander, watch, jumpStart, jumper, slug, asset, index, cx, cy, animated, lite, on = true }: {
  seed: number; clock: SharedValue<number>; wander: number; watch: number; jumpStart: SharedValue<number>;
  jumper: boolean; slug: string | null; asset: FrightSheetAsset | null; index: number; cx: number; cy: number;
  animated: boolean; lite: boolean;
  /** Drawn or not (opacity): the slot stays mounted (see ReefCritters). */
  on?: boolean;
}) {
  const look = useMemo(() => critterLook(slug, index), [slug, index]);
  const sheet = useRemoteImage(asset?.sheet);
  const still = useMemo(() => critterPose(seed, 0, wander, watch, -1), [seed, wander, watch]);
  const timing = asset ? sheetTiming(asset) : { frames: 10, fps: 10 };
  const rows = useMemo(() => (asset ? critterRows(asset) : NO_ROWS), [asset]);
  const useSheet = !!sheet && !!asset;
  const pose = useDerivedValue(() => {
    if (!animated) return still;
    // With real art the jump is in the sheet: the sprite itself only wanders.
    const popAge = jumper && !useSheet ? clock.value - jumpStart.value : -1;
    return critterPose(seed, clock.value, wander, watch, popAge);
  });
  const frameState = useDerivedValue(() => (animated
    ? sheetPose(seed, clock.value, timing.frames, timing.fps, rows, !lite, jumper ? clock.value - jumpStart.value : -1)
    : { row: rows[0] >= 0 ? rows[0] : 0, frame: 0 }));
  const frame = useDerivedValue(() => frameState.value.frame);
  const row = useDerivedValue(() => frameState.value.row);
  const body = useDerivedValue(() => {
    const p = pose.value;
    if (useSheet) return [{ translateX: cx + p.x }, { translateY: cy + p.y }, { scaleX: p.face }];
    return [{ translateX: cx + p.x }, { translateY: cy + p.y + p.hop },
      { scaleX: p.face * (1 + (1 - p.squash) * 0.5) }, { scaleY: p.squash }];
  });
  const shadow = useDerivedValue(() => {
    const p = pose.value;
    const s = useSheet ? 1 : Math.max(0.5, 1 + p.hop / 60);
    return [{ translateX: cx + p.x }, { translateY: cy + p.y }, { scale: s }];
  });
  const fw = asset?.frame[0] ?? 128;
  const fh = asset?.frame[1] ?? 128;
  return (
    <Group opacity={on ? 1 : 0}>
      <Group transform={shadow}><Oval x={-10} y={-3} width={20} height={6} color="rgba(10,6,30,0.35)" /></Group>
      <Group transform={body}>
        {/* Sheet and placeholder both mounted: the art cross-fades in when it loads. */}
        <Group opacity={useSheet && sheet ? 1 : 0}>
          <SoftEllipse x={-fw / 4} y={-fh / 2} w={fw / 2} h={fh / 2 + 2} inner={0.7}>
              <SheetFrame image={sheet} fw={fw} fh={fh} frame={frame} row={row} x={-fw / 4} y={-fh / 2} />
            </SoftEllipse>
        </Group>
        <Group opacity={useSheet && sheet ? 0 : 1}><CritterBody look={look} /></Group>
      </Group>
    </Group>
  );
}

/** Critters wandering a reef, over a still ground mist (fog is thicker at reefs). */
export const ReefCritters = memo(function ReefCritters({ reefKey, slugs, assets, count, slots, wanderPts, clock, animated, lite, watch, jumpToken, jumpIndex, intensity, mistUrl }: {
  readonly reefKey: string;
  readonly slugs: readonly string[];
  /** Each slug's sheet (null: placeholder). */
  readonly assets: readonly (FrightSheetAsset | null)[];
  /** Critters drawn now. */
  readonly count: number;
  /**
   * Critter slots always mounted (the reef's most). Budget and motion changes
   * only show or hide slots: mounting and unmounting Skia nodes that a moving
   * clock still animates crashed RN Skia (JsiDomDeclarationNode::invalidateContext).
   */
  readonly slots: number;
  readonly wanderPts: number;
  readonly clock: SharedValue<number>;
  readonly animated: boolean;
  /** Lite: idle and jump only, no lurk. */
  readonly lite: boolean;
  /** 0, or the side (+1 / -1) the player is on when within 60 m. */
  readonly watch: number;
  /** Bumps on each jump (reef entry or the ambient jump); `jumpIndex` picks the critter. */
  readonly jumpToken: number;
  readonly jumpIndex: number;
  readonly intensity: number;
  readonly mistUrl: string | null;
}) {
  const mist = useFrightImage(mistUrl, FRIGHT_ART.groundMist);
  const W = Math.round(wanderPts * 2 + 90);
  const H = Math.round(wanderPts * 1.4 + 120);
  const cx = W / 2;
  const cy = H / 2 + 24;
  const jumpStart = useSharedValue(-1000);
  useEffect(() => { if (jumpToken > 0) jumpStart.value = clock.value; }, [jumpToken, clock, jumpStart]);
  const seed = hashString(reefKey) % 10_000;
  // Inside the canvas (a canvas edge would cut it into a hard band) and feathered on every side.
  const mistW = W * 0.96;
  const mistH = Math.min(H * 0.6, MIST_H * (mistW / MIST_W) * 1.6);
  return (
    <Canvas style={{ width: W, height: H }} pointerEvents="none">
      {<FeatheredMist image={mist} x={cx - mistW / 2} y={Math.max(0, cy - mistH * 0.6)} w={mistW} h={mistH} opacity={0.7 * intensity} />}
      {/* Fixed at `slots` (the reef's most): the budget only shows or hides slots, never mounts them. */}
      {Array.from({ length: slots }, (_, i) => {
        const k = slugs.length ? i % slugs.length : 0;
        return (
          <Critter key={i} seed={seed + i * 37} clock={clock} wander={wanderPts} watch={watch} jumpStart={jumpStart}
            jumper={i === jumpIndex % Math.max(1, Math.min(count, slots))} slug={slugs[k] ?? null} asset={assets[k] ?? null} index={i}
            cx={cx} cy={cy} animated={animated && i < Math.min(count, slots)} lite={lite} on={i < Math.min(count, slots)} />
        );
      })}
    </Canvas>
  );
});

/** Zoomed out or calm: the first critter's still frame marks the reef. */
export const ReefGlyph = memo(function ReefGlyph({ slug, staticUrl, intensity }: {
  readonly slug: string | null; readonly staticUrl: string | null; readonly intensity: number;
}) {
  const look = useMemo(() => critterLook(slug, 0), [slug]);
  const still = useRemoteImage(staticUrl);
  return (
    <Canvas style={{ width: 52, height: 52 }} pointerEvents="none">
      <Oval x={4} y={36} width={44} height={12} color={NIGHT.fog} opacity={0.45 * Math.max(0.4, intensity)} />
      <Group opacity={still ? 1 : 0}>
        <SoftEllipse x={6} y={2} w={40} h={41} inner={0.7}><SkImage image={still} x={6} y={2} width={40} height={40} fit="contain" /></SoftEllipse>
      </Group>
      <Group opacity={still ? 0 : 1}><Group transform={[{ translateX: 26 }, { translateY: 42 }, { scale: 0.9 }]}><CritterBody look={look} /></Group></Group>
    </Canvas>
  );
});

/* ── Haunt facades ────────────────────────────────────────────────────── */

const LW = 96;
const LH = 100;
/** Room under the facade for the bead and the name chip (always reserved, so the anchor never shifts). */
const LANTERN_FOOT = 36;
/** The marker is wider than the facade so the name chip is never squeezed to the facade's width. */
const LANTERN_W = 168;
/** The facade's ground point (glow pool center) as a marker anchor. */
export const HAUNT_ANCHOR = { x: 0.5, y: (LH - 18) / (LH + LANTERN_FOOT) };
const HOUSE = Skia.Path.MakeFromSVGString('M14 36 L38 12 L62 36 L62 74 L14 74 Z')!;
const ROOF = Skia.Path.MakeFromSVGString('M9 38 L38 9 L67 38 L62 38 L38 15 L14 38 Z')!;
const DOOR = Skia.Path.MakeFromSVGString('M32 74 L32 64 Q38 57 44 64 L44 74 Z')!;
const GHOST = Skia.Path.MakeFromSVGString('M-3 4 L-3 -1 Q0 -5 3 -1 L3 4 L1.5 2.6 L0 4 L-1.5 2.6 Z')!;
const SLOTS: readonly [number, number][] = [[19, 42], [47, 42], [19, 55], [47, 55], [33, 25], [33, 43]];
const WIN_W = 10;
const WIN_H = 9;

function PlaceholderWindow({ i, plan, sil, windows, clock, animated, dim }: {
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

/** The Skia facade drawn while the haunt's art loads (or without art). */
function PlaceholderFacade({ seed, flicker, windows, animatedWindows, clock, animated, dim, done }: {
  seed: number; flicker: string | null | undefined; windows: number; animatedWindows: number; clock: SharedValue<number>;
  animated: boolean; dim: boolean; done: boolean;
}) {
  const plan = useMemo(() => flickerPlan(flickerProfile(flicker), seed, windows), [flicker, seed, windows]);
  const sil = useMemo(() => silhouettePlan(seed, windows), [seed, windows]);
  const n = Math.min(windows, SLOTS.length);
  return (
    <Group transform={[{ translateX: 10 }, { translateY: 6 }]}>
      <Path path={HOUSE} color={NIGHT.haunt} />
      <Path path={HOUSE} color={NIGHT.ink} style="stroke" strokeWidth={2} strokeJoin="round" />
      <Path path={ROOF} color={NIGHT.midnight} />
      <Path path={ROOF} color={NIGHT.ink} style="stroke" strokeWidth={1.6} strokeJoin="round" />
      <Path path={DOOR} color={NIGHT.ink} />
      {Array.from({ length: n }, (_, i) => (
        <PlaceholderWindow key={i} i={i} plan={plan} sil={sil} windows={n} clock={clock} animated={animated && i < animatedWindows} dim={dim} />
      ))}
      <Circle cx={47} cy={68} r={2.6} color={dim ? NIGHT.dusk : NIGHT.lantern} />
      <Path path={HOUSE} color={NIGHT.candy} style="stroke" strokeWidth={1.4} strokeJoin="round" opacity={done ? 1 : 0} />
    </Group>
  );
}

/** Seconds of the door creak: open 0.6, hold, close 0.6. */
export const DOOR_OPEN_S = 0.6;
export const DOOR_HOLD_S = 1.8;
const GHOST_FPS = 8;

function LayerWindow({ i, image, fw, fh, x, y, toggles, clock, rate, dim }: {
  i: number; image: SkImageType | null; fw: number; fh: number; x: number; y: number; toggles: number[];
  clock: SharedValue<number>; rate: number; dim: boolean;
}) {
  const frame = useSharedValue(i);
  const row = useSharedValue(0);
  const opacity = useDerivedValue<number>(() => (dim ? 0 : rate <= 0 ? 1 : timelineLit(toggles, clock.value * rate) ? 1 : 0));
  return <SheetFrame image={image} fw={fw} fh={fh} frame={frame} row={row} x={x} y={y} opacity={opacity} />;
}

/** The facade from the art layers: base, flickering windows, the ghost pass and the door creak. */
function LayeredFacade({ layers, base, seed, clock, rate, ghosts, doors, ghostToken, doorToken, dim }: {
  layers: FrightHauntLayers; base: SkImageType | null; seed: number; clock: SharedValue<number>;
  /** Window flicker speed: 1 full, 0.5 lite, 0 static (all lit). */
  rate: number; ghosts: boolean; doors: boolean; ghostToken: number; doorToken: number; dim: boolean;
}) {
  const [fw, fh] = layers.frame;
  const w = fw / 2;
  const x = (LW - w) / 2;
  const y = 2;
  const windowsImg = useRemoteImage(layers.windows);
  const ghostImg = useRemoteImage(layers.ghost);
  const doorImg = useRemoteImage(layers.door);
  // From the manifest, never from the loaded image: the window nodes are mounted before the art arrives.
  const count = Math.max(0, Math.min(8, Math.floor(Number(layers.window_count) || 0)));
  const timelines = useMemo(() => windowTimelines(seed, count), [seed, count]);
  const ghostAt = useSharedValue(-1000);
  const doorAt = useSharedValue(-1000);
  useEffect(() => { if (ghostToken > 0) ghostAt.value = clock.value; }, [ghostToken, clock, ghostAt]);
  useEffect(() => { if (doorToken > 0) doorAt.value = clock.value; }, [doorToken, clock, doorAt]);
  const ghostFrames = ghostImg ? Math.max(1, Math.round(ghostImg.width() / fw)) : 8;
  const ghostFrame = useDerivedValue(() => {
    if (!ghosts) return -1; // paused: no clock read
    const age = clock.value - ghostAt.value;
    return age >= 0 && age < ghostFrames / GHOST_FPS ? Math.floor(age * GHOST_FPS) : -1;
  });
  const ghostShown = useDerivedValue<number>(() => (ghostFrame.value >= 0 ? 1 : 0));
  const ghostIdx = useDerivedValue(() => Math.max(0, ghostFrame.value));
  const doorFrames = doorImg ? Math.max(1, Math.round(doorImg.width() / fw)) : 6;
  const doorFrame = useDerivedValue(() => {
    if (!doors) return 0; // paused: no clock read
    const age = clock.value - doorAt.value;
    const last = doorFrames - 1;
    if (age < 0) return 0;
    if (age < DOOR_OPEN_S) return Math.floor((age / DOOR_OPEN_S) * last);
    if (age < DOOR_OPEN_S + DOOR_HOLD_S) return last;
    if (age < DOOR_OPEN_S * 2 + DOOR_HOLD_S) return last - Math.floor(((age - DOOR_OPEN_S - DOOR_HOLD_S) / DOOR_OPEN_S) * last);
    return 0;
  });
  // The warm line under the door breathes 0.8 to 1.0 over 3 s.
  const doorGlow = useDerivedValue(() => (rate > 0 ? 0.9 + 0.1 * Math.sin(clock.value * (Math.PI * 2 / 3)) : 1));
  const zero = useSharedValue(0);
  return (
    <Group opacity={dim ? 0.55 : 1}>
      <SkImage image={base} x={x} y={y} width={w} height={fh / 2} fit="fill" />
      {timelines.map((toggles, i) => (
        <LayerWindow key={i} i={i} image={windowsImg} fw={fw} fh={fh} x={x} y={y} toggles={toggles} clock={clock} rate={rate} dim={dim} />
      ))}
      {/* Always mounted once the art is in: ghosts on or off only changes opacity (RN Skia unmount race). */}
      <Group opacity={ghosts && !dim ? 1 : 0}>
        <SheetFrame image={ghostImg} fw={fw} fh={fh} frame={ghostIdx} row={zero} x={x} y={y} opacity={ghostShown} />
      </Group>
      <SheetFrame image={doorImg} fw={fw} fh={fh} frame={doorFrame} row={zero} x={x} y={y} opacity={doorGlow} />
    </Group>
  );
}

/**
 * A haunt at its entrance: the facade from the server's layers (or its icon,
 * or the Skia placeholder), a warm glow pool, gold glow and a check badge
 * (the survived pin) once survived, dim when closed. During the intro cinematic the haunts light
 * one by one (120 ms apart).
 */
export const HauntLantern = memo(function HauntLantern({ spotKey, flicker, windows, animatedWindows, clock, animated, rate, ghosts, doors, ghostToken, doorToken, done, beads, dim, index, layers, iconUrl, intensity, reducedMotion, label, chipDetail = null, chipX = null, chipY = null, screenW = 0, huds = NO_HUDS, survivedPin = null }: {
  readonly spotKey: string;
  readonly flicker: string | null | undefined;
  readonly windows: number;
  readonly animatedWindows: number;
  readonly clock: SharedValue<number>;
  readonly animated: boolean;
  /** Window flicker speed for layered facades: 1 full, 0.5 lite, 0 static. */
  readonly rate: number;
  readonly ghosts: boolean;
  readonly doors: boolean;
  readonly ghostToken: number;
  readonly doorToken: number;
  readonly done: boolean;
  readonly beads: number;
  readonly dim: boolean;
  readonly index: number;
  readonly layers: FrightHauntLayers | null;
  readonly iconUrl: string | null;
  readonly intensity: number;
  readonly reducedMotion: boolean;
  /** Name and posted wait chip ("The Robot City · 25m"); null hides it (zoomed out). */
  readonly label: string | null;
  /** The facade's projected screen x (points), to keep the chip 12 pt inside the screen edges. */
  readonly chipX?: number | null;
  /** The chip's projected top (points), to keep it clear of HUD rects beside it. */
  readonly chipY?: number | null;
  readonly screenW?: number;
  /** Small second chip line: "25 min", "Closed" (null: name only). */
  readonly chipDetail?: string | null;
  /** HUD rects the chip keeps clear of (the right rail). */
  readonly huds?: readonly HudRect[];
  /** The survived pin art (assets.event_pins['ev-survived']); a gold check when missing. */
  readonly survivedPin?: string | null;
}) {
  const seed = hashString(spotKey);
  const base = useRemoteImage(layers?.base);
  const glowColor = done ? NIGHT.candy : NIGHT.lantern;
  const glowPlan = useMemo(() => flickerPlan('candle', seed, 1), [seed]);
  const glow = useDerivedValue(() => {
    if (dim) return 0.12;
    const b = done ? 0.75 : 0.55;
    return animated ? b + 0.12 * (windowLevel(glowPlan, 0, clock.value * 0.7) - 0.75) : b;
  });
  // Lit stagger: haunt i lights at 2.0 s + i * 120 ms into the 4 s intro.
  const lit = useDerivedValue(() => {
    const t = frightIntro.value * 4;
    if (frightIntro.value >= 1) return 1;
    const on = reducedMotion ? frightIntro.value : Math.max(0, Math.min(1, (t - 2 - index * 0.12) / 0.3));
    return 0.25 + 0.75 * on;
  });
  const showIcon = !base && !!iconUrl;
  // The chip's real width (measured), so the edge clamp never guesses from the label length.
  const [chipSize, setChipSize] = useState({ w: 0, h: 0 });
  const shift = chipX !== null && chipSize.w > 0
    ? chipShiftClear(chipX, chipY ?? Number.NaN, chipSize.w, chipSize.h, screenW, huds) : 0;
  return (
    <View style={styles.lantern}>
      <Canvas style={{ width: LW, height: LH }} pointerEvents="none">
        <Group opacity={lit}>
          <Circle cx={LW / 2} cy={LH - 18} r={36} opacity={glow}>
            <RadialGradient c={vec(LW / 2, LH - 18)} r={36} colors={[glowColor, `${glowColor}00`]} />
          </Circle>
          <Circle cx={LW / 2} cy={LH / 2} r={36} color={NIGHT.candy} opacity={done ? 0.35 * Math.max(0.5, intensity) : 0}><BlurMask blur={8} style="normal" /></Circle>
          {/* Both facades stay mounted (layers come with the payload); the art cross-fades in when it loads. */}
            <Group opacity={layers && base ? 1 : 0}>
              <LayeredFacade layers={layers ?? NO_LAYERS} base={base} seed={seed} clock={clock} rate={animated && base ? rate : 0} ghosts={ghosts && animated && !!base}
                doors={doors && animated && !!base} ghostToken={ghostToken} doorToken={doorToken} dim={dim} />
            </Group>
          <Group opacity={!base && !showIcon ? 1 : 0}>
            <PlaceholderFacade seed={seed} flicker={flicker} windows={windows} animatedWindows={animatedWindows}
              clock={clock} animated={animated && !base && !showIcon} dim={dim} done={done} />
          </Group>
        </Group>
      </Canvas>
      {/* Opacity-only inside the Marker: icon, survived badge and chip are always mounted. */}
      <Image source={iconUrl ? { uri: iconUrl } : null} style={[styles.icon, dim && styles.iconDim, !showIcon && styles.gone]}
        contentFit="contain" cachePolicy="memory-disk" transition={0} />
      <View style={[styles.survived, !done && styles.gone]} pointerEvents="none"
        accessibilityElementsHidden={!done} accessibilityLabel={beads > 1 ? `Survived ${beads} times tonight` : 'Survived'}>
        <Image source={survivedPin ? { uri: survivedPin } : null} style={[styles.survivedPin, !survivedPin && styles.gone]}
          contentFit="contain" cachePolicy="memory-disk" transition={0} />
        <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>
      </View>
      <View style={[styles.chip, dim && styles.chipDim, done && styles.chipDone, !label && styles.gone, shift ? { transform: [{ translateX: shift }] } : null]}
        onLayout={event => {
          const w = Math.round(event.nativeEvent.layout.width);
          const h = Math.round(event.nativeEvent.layout.height);
          if (Math.abs(w - chipSize.w) > 1 || Math.abs(h - chipSize.h) > 1) setChipSize({ w, h });
        }}>
        {/* The full name (up to 2 lines, never cut at normal widths), then a small detail line. */}
        <Text style={styles.chipText} numberOfLines={2}>{label ?? ''}</Text>
        <Text style={[styles.chipDetail, !chipDetail && styles.collapsed]} numberOfLines={1}>{chipDetail ?? ''}</Text>
      </View>
    </View>
  );
});

const NO_HUDS: readonly HudRect[] = [];
/** Stand-in layers for a haunt without facade art: the layered facade stays mounted, drawing nothing. */
const NO_LAYERS: FrightHauntLayers = { frame: [160, 160], base: null, windows: null, window_count: 0, ghost: null, door: null };

/* ── Spot props ───────────────────────────────────────────────────────── */

/** Bats a prop spot can show (FrightMapSources allocates at most 2). */
const MAX_BATS = 2;
const PW = 200;
const PH = 150;

function Bat({ k, seed, clock, sheet, fw, fh, frames, animated, on = true }: {
  k: number; seed: number; clock: SharedValue<number>; sheet: SkImageType | null; fw: number; fh: number; frames: number; animated: boolean;
  on?: boolean;
}) {
  const speed = 0.35 + hash01(seed + k * 7) * 0.25;
  const phase = hash01(seed + k * 7 + 1) * 6.283;
  const state = useDerivedValue(() => {
    const t = animated ? clock.value : 0;
    const a = t * speed + phase;
    return { x: PW / 2 + Math.cos(a) * 62, y: 44 + Math.sin(a * 1.3) * 18, frame: animated ? Math.floor(t * 10 + k) % frames : 0, dir: -Math.sin(a) >= 0 ? 1 : -1 };
  });
  // Bat art is drawn at its pixel size scaled to 24 pt wide.
  const s = 24 / fw;
  const transform = useDerivedValue(() => [{ translateX: state.value.x }, { translateY: state.value.y }, { scaleX: s * state.value.dir }, { scaleY: s }]);
  const offset = useDerivedValue(() => [{ translateX: -fw / 2 - state.value.frame * fw }, { translateY: -fh / 2 }]);
  const clip = useMemo(() => Skia.XYWHRect(-fw / 2, -fh / 2, fw, fh), [fw, fh]);
  return (
    <Group transform={transform} opacity={on && sheet ? 1 : 0}>
      <Group clip={clip}>
        <Group transform={offset}><SkImage image={sheet} x={0} y={0} width={sheet?.width() ?? 0} height={sheet?.height() ?? 0} fit="fill" /></Group>
      </Group>
    </Group>
  );
}

const EYES_SEQ = [0, 1, 2, 3, 4, 5, 0];

function Eyes({ seed, clock, sheet, bush, animated }: { seed: number; clock: SharedValue<number>; sheet: SkImageType | null; bush: SkImageType | null; animated: boolean }) {
  // Hold open 3 to 8 s, then blink frames 0 to 5 at 14 fps.
  const every = 3 + hash01(seed + 3) * 5;
  const offset = useDerivedValue(() => {
    let frame = 0;
    if (animated) {
      const c = (clock.value + hash01(seed) * every) % every;
      const i = Math.floor(c * 14);
      if (i < EYES_SEQ.length) frame = EYES_SEQ[i];
    }
    return [{ translateX: -frame * EYES_W / 2 }];
  });
  const clip = useMemo(() => Skia.XYWHRect(0, 0, EYES_W / 2, EYES_H / 2), []);
  return (
    <Group transform={[{ translateX: 30 }, { translateY: 112 }]} opacity={sheet ? 1 : 0}>
      <Oval x={-10} y={-6} width={40} height={22} color="#20323A" opacity={bush ? 0 : 1} />
      <SkImage image={bush} x={-14} y={-8} width={48} height={26.5} fit="fill" />
      <Group clip={clip}><Group transform={offset}><SkImage image={sheet} x={0} y={0} width={EYES_W * EYES_FRAMES / 2} height={EYES_H / 2} fit="fill" /></Group></Group>
    </Group>
  );
}

function SparksSlot({ seed, clock, on }: { seed: number; clock: SharedValue<number>; on: boolean }) {
  return <Group opacity={on ? 1 : 0}><SkidSparks seed={seed} clock={clock} animated={on} /></Group>;
}

const NO_AMBIENT: FrightAmbientAsset = { file: null, frame: [96, 96], rows: [1] };

const PUMPKIN = Skia.Path.MakeFromSVGString('M-11 0 C-15 -10 -9 -20 0 -18 C9 -20 15 -10 11 0 C7 4 -7 4 -11 0 Z')!;
const FACE = Skia.Path.MakeFromSVGString('M-6 -10 L-3 -13 L0 -10 Z M0 -10 L3 -13 L6 -10 Z M-6 -5 Q0 -1 6 -5')!;

/** A sheet prop looping one row at `fps` (still on frame 0 when not animated). */
function LoopProp({ image, asset, row, fps, x, y, clock, animated }: {
  image: SkImageType | null; asset: FrightAmbientAsset; row: number; fps: number; x: number; y: number; clock: SharedValue<number>; animated: boolean;
}) {
  const [fw, fh] = asset.frame ?? [96, 96];
  const frames = asset.rows?.[row] ?? 1;
  const frame = useDerivedValue(() => (animated ? Math.floor(clock.value * fps) % frames : 0));
  const r = useSharedValue(row);
  return <SheetFrame image={image} fw={fw} fh={fh} frame={frame} row={r} x={x} y={y} />;
}

function Pumpkin({ clock, animated, art, asset }: { clock: SharedValue<number>; animated: boolean; art: SkImageType | null; asset: FrightAmbientAsset | null }) {
  const turn = useDerivedValue(() => (animated ? Math.cos(clock.value * 0.7) : 1));
  const body = useDerivedValue(() => [{ translateX: 160 }, { translateY: 130 }, { scaleX: 0.55 + 0.45 * Math.abs(turn.value) }]);
  const face = useDerivedValue(() => Math.max(0, turn.value));
  // Art and placeholder both mounted; the art cross-fades in when it loads.
  // Row 2 is the candle-flicker loop at 8 fps (row 1, the head turn, is left for a later pass).
  const hasArt = !!art && !!asset?.frame;
  const frame = asset?.frame ?? [96, 96];
  return (
    <Group>
      <Group opacity={hasArt ? 1 : 0}>
        <LoopProp image={art} asset={asset ?? NO_AMBIENT} row={1} fps={8} x={160 - frame[0] / 4} y={130 - frame[1] / 2} clock={clock} animated={animated && hasArt} />
      </Group>
      <Group transform={body} opacity={hasArt ? 0 : 1}>
        <Path path={PUMPKIN} color={NIGHT.pumpkin} />
        <Path path={PUMPKIN} color={NIGHT.ink} style="stroke" strokeWidth={1.6} />
        <Rect x={-1.5} y={-22} width={3} height={5} color="#4F8A3A" />
        <Path path={FACE} color={NIGHT.candy} style="stroke" strokeWidth={1.6} strokeCap="round" opacity={face} />
      </Group>
    </Group>
  );
}

function SkidSparks({ seed, clock, animated }: { seed: number; clock: SharedValue<number>; animated: boolean }) {
  // Ambient sparks every 3 to 6 minutes (MAP_FX_SPEC), 1.5 s across.
  const every = 180 + hash01(seed + 9) * 180;
  const run = 1.5;
  const p = useDerivedValue(() => {
    if (!animated) return -1; // paused: no clock read
    const c = (clock.value + hash01(seed + 11) * every) % every;
    return c < run ? c / run : -1;
  });
  return <Group>{Array.from({ length: 4 }, (_, j) => <SparkDot key={j} j={j} p={p} />)}</Group>;
}

function SparkDot({ j, p }: { j: number; p: SharedValue<number> }) {
  const c = useDerivedValue(() => {
    const q = p.value - j * 0.03;
    return vec(10 + q * 180, 140 - q * 40 + Math.sin(q * 40) * 2);
  });
  const o = useDerivedValue(() => (p.value < 0 ? 0 : (1 - j / 4) * Math.sin(Math.min(1, p.value) * Math.PI)));
  return <Circle c={c} r={2.4 - j * 0.4} color={NIGHT.candy} opacity={o} />;
}

function HangingLantern({ seed, clock, animated, art, asset }: { seed: number; clock: SharedValue<number>; animated: boolean; art: SkImageType | null; asset: FrightAmbientAsset | null }) {
  const glow = useDerivedValue(() => {
    if (!animated) return 0.6;
    const t = clock.value;
    const stutter = ((t + hash01(seed) * 9) % 9) < 0.25 ? 0.25 : 1;
    return (0.5 + 0.1 * Math.sin(t * 5.3)) * stutter;
  });
  const hasArt = !!art && !!asset?.frame;
  const frame = asset?.frame ?? [96, 96];
  return (
    <Group>
      <Group opacity={hasArt ? 1 : 0}>
        <LoopProp image={art} asset={asset ?? NO_AMBIENT} row={0} fps={6} x={100 - frame[0] / 4} y={4} clock={clock} animated={animated && hasArt} />
      </Group>
      <Group opacity={hasArt ? 0 : 1}>
      <Circle cx={100} cy={26} r={16} opacity={glow}><RadialGradient c={vec(100, 26)} r={16} colors={[NIGHT.lantern, `${NIGHT.lantern}00`]} /></Circle>
      <Rect x={96} y={20} width={8} height={11} color={NIGHT.candy} />
      <Rect x={96} y={20} width={8} height={11} color={NIGHT.ink} style="stroke" strokeWidth={1.3} />
      </Group>
    </Group>
  );
}

/** Ambient props near a spot (fx.props). Moving props past the budget draw still. */
export const SpotProps = memo(function SpotProps({ spotKey, props, bats, movingAllowed, clock, animated, lite, intensity, ambient, mistUrl }: {
  readonly spotKey: string;
  readonly props: readonly FrightProp[];
  readonly bats: number;
  /** How many of the moving props may animate. */
  readonly movingAllowed: number;
  readonly clock: SharedValue<number>;
  readonly animated: boolean;
  /** Lite animates eyes and candles only (MAP_FX_SPEC). */
  readonly lite: boolean;
  readonly intensity: number;
  readonly ambient: Readonly<Record<string, FrightAmbientAsset>> | null;
  readonly mistUrl: string | null;
}) {
  const batAsset = ambient?.bat ?? null;
  const batSheet = useFrightImage(props.includes('bats') ? batAsset?.file : null, props.includes('bats') ? FRIGHT_ART.bats : null);
  const eyesSheet = useFrightImage(props.includes('eyes') ? ambient?.eyes?.file : null, props.includes('eyes') ? FRIGHT_ART.eyes : null);
  const bush = useRemoteImage(props.includes('eyes') ? ambient?.bush?.file : null);
  const jack = useRemoteImage(props.includes('pumpkin') ? ambient?.['jack-o-lantern']?.file : null);
  const lantern = useRemoteImage(props.includes('lantern') ? ambient?.lantern?.file : null);
  const mist = useFrightImage(props.includes('fog-thick') ? mistUrl : null, props.includes('fog-thick') ? FRIGHT_ART.groundMist : null);
  const seed = hashString(spotKey) % 10_000;
  let budget = movingAllowed;
  const take = (inLite: boolean) => animated && (!lite || inLite) && budget-- > 0;
  const batFrame = batAsset?.frame ?? [BAT_FRAME, BAT_FRAME];
  const batFrames = batAsset?.rows?.[0] ?? BAT_FRAMES;
  return (
    <Canvas style={{ width: PW, height: PH }} pointerEvents="none">
      {/* Fixed Skia trees: every prop node is mounted; the spot's props, budget, tier and motion only
          show or hide them (RN Skia unmount race under a moving map). */}
      <Group opacity={props.includes('fog-thick') ? 1 : 0}>
        <FeatheredMist image={mist} x={4} y={PH - 74} w={PW - 8} h={70} opacity={0.65 * intensity} />
      </Group>
      <Group opacity={props.includes('eyes') ? 1 : 0}>
        <Eyes seed={seed} clock={clock} sheet={eyesSheet} bush={bush} animated={props.includes('eyes') && take(true)} />
      </Group>
      <Group opacity={props.includes('pumpkin') ? 1 : 0}>
        <Pumpkin clock={clock} animated={props.includes('pumpkin') && take(false)} art={jack} asset={ambient?.['jack-o-lantern'] ?? null} />
      </Group>
      <Group opacity={props.includes('lantern') ? 1 : 0}>
        <HangingLantern seed={seed} clock={clock} animated={props.includes('lantern') && take(true)} art={lantern} asset={ambient?.lantern ?? null} />
      </Group>
      <SparksSlot seed={seed} clock={clock} on={props.includes('skid-fins') && take(false)} />
      {Array.from({ length: MAX_BATS }, (_, k) => (
        <Bat key={k} k={k} seed={seed} clock={clock} sheet={batSheet} fw={batFrame[0]} fh={batFrame[1]} frames={batFrames}
          animated={props.includes('bats') && animated && !lite && k < bats} on={props.includes('bats') && animated && !lite && k < bats} />
      ))}
    </Canvas>
  );
});

const ENCOUNTER_LOOKS = ['chuckles', 'riptide'] as const;

/* ── Encounter ────────────────────────────────────────────────────────── */

/** The tappable critter's box: 88 pt, above the 44 pt minimum. */
export const ENCOUNTER_CRITTER_PT = 88;

/**
 * The Lantern Star encounter's ring: a pulsing radius ring and the skid-fin
 * spark passes (sheet `skid-fin-sparks`, 8 frames at 16 fps, sliding 80 pt/s
 * for 1.5 s on a new heading each pass). Takes no touches; the critter on top
 * is its own (tappable) marker. Calm: a still "here" ring.
 */
export const EncounterRing = memo(function EncounterRing({ ringPts, clock, animated, sparkToken, sparks }: {
  readonly ringPts: number;
  readonly clock: SharedValue<number>;
  readonly animated: boolean;
  /** Bumps when a spark pass starts (through the 2-event gate). */
  readonly sparkToken: number;
  readonly sparks: FrightAmbientAsset | null;
}) {
  const S = Math.round(Math.max(ringPts * 2 + 40, 140));
  const c = S / 2;
  const sheet = useRemoteImage(animated ? sparks?.file : null);
  const sparkAt = useSharedValue(-1000);
  const heading = useSharedValue(0);
  useEffect(() => {
    if (sparkToken <= 0) return;
    heading.value = hash01(sparkToken * 13.7) * Math.PI * 2;
    sparkAt.value = clock.value;
  }, [sparkToken, clock, sparkAt, heading]);
  const ringR = useDerivedValue(() => ringPts * (animated ? 0.94 + 0.06 * Math.sin(clock.value * 2.4) : 1));
  const ringO = useDerivedValue(() => (animated ? 0.55 + 0.25 * Math.sin(clock.value * 2.4) : 0.75));
  const [fw, fh] = sparks?.frame ?? [192, 64];
  const frames = sparks?.rows?.[0] ?? 8;
  const fps = Math.min(16, Number(sparks?.fps) || 16);
  const pass = useDerivedValue(() => (animated ? sparkPass(clock.value - sparkAt.value, frames, fps) : { d: 0, frame: 0, opacity: 0 }));
  // The pass crosses the ring through its middle: start 60 pt before center along the heading.
  const sparkTransform = useDerivedValue(() => {
    const d = pass.value.d - SPARK_RUN_S * 40;
    return [{ translateX: c + Math.cos(heading.value) * d }, { translateY: c + Math.sin(heading.value) * d },
      { rotate: heading.value }];
  });
  const sparkFrame = useDerivedValue(() => pass.value.frame);
  const sparkOpacity = useDerivedValue(() => pass.value.opacity);
  const row = useSharedValue(0);
  return (
    <Canvas style={{ width: S, height: S }} pointerEvents="none">
      <Circle cx={c} cy={c} r={ringR} color={NIGHT.candy} opacity={0.08} />
      <Circle cx={c} cy={c} r={ringR} color={NIGHT.candy} style="stroke" strokeWidth={3} opacity={ringO} />
      {/* Always mounted: no sheet or paused = opacity 0. */}
      <Group transform={sparkTransform} opacity={animated && sheet ? 1 : 0}>
        <SheetFrame image={sheet} fw={fw} fh={fh} frame={sparkFrame} row={row} x={-fw / 2} y={-fh / 4} opacity={sparkOpacity} />
      </Group>
    </Canvas>
  );
});

/**
 * The encounter critter from its icon sheet (rows idle, appear, chaos-hour;
 * 160 px frames @2x): appear once on spawn, then the chaos loop during Chaos
 * Hour and the first 20 s (full tier), else idle. Lite: appear and idle.
 * Calm or not animated: the still frame. Placeholder while the art loads.
 */
export const EncounterCritter = memo(function EncounterCritter({ critter, asset, chaos, clock, animated, full, spawnKey }: {
  readonly critter: 'chuckles' | 'riptide';
  readonly asset: FrightSheetAsset | null;
  readonly chaos: boolean;
  readonly clock: SharedValue<number>;
  readonly animated: boolean;
  readonly full: boolean;
  /** The encounter now on screen (null when none). The sprite is always mounted, so the
   * appear row plays when a new key first shows, not when the map mounts. */
  readonly spawnKey: string | null;
}) {
  const B = ENCOUNTER_CRITTER_PT;
  const sheet = useRemoteImage(asset?.sheet);
  const still = useRemoteImage(asset?.static);
  const spawn = useSharedValue(-1e6); // no spawn yet: idle, never the appear row
  const spawned = useRef<string | null>(null);
  useEffect(() => {
    if (!spawnKey || spawned.current === spawnKey) return;
    spawned.current = spawnKey;
    spawn.value = clock.value;
  }, [spawnKey, clock, spawn]);
  const rows = useMemo(() => (asset ? [rowIndex(asset, 'idle'), rowIndex(asset, 'appear'), rowIndex(asset, 'chaos-hour')] : [0, -1, -1]), [asset]);
  const fw = asset?.frame[0] ?? 160;
  const fh = asset?.frame[1] ?? 160;
  const timing = asset ? sheetTiming(asset) : { frames: 10, fps: 10 };
  const frames = sheet ? Math.max(1, Math.round(sheet.width() / fw)) : timing.frames;
  const fps = timing.fps;
  const pose = useDerivedValue(() => (animated
    ? encounterPose(clock.value, clock.value - spawn.value, rows, frames, fps, chaos, full)
    : { row: rows[0] >= 0 ? rows[0] : 0, frame: 0 })); // paused: no clock read
  const frame = useDerivedValue(() => pose.value.frame);
  const row = useDerivedValue(() => pose.value.row);
  const scale = B / (fw / 2);
  return (
    <Canvas style={{ width: B, height: B }} pointerEvents="none">
      <Group transform={[{ scale }]}>
        {/* Every look stays mounted; only one is opaque (sheet while animated, else still, else placeholder). */}
        <SheetFrame image={sheet} fw={fw} fh={fh} frame={frame} row={row} x={0} y={0} opacity={sheet && animated ? 1 : 0} />
        <SkImage image={still} x={0} y={0} width={fw / 2} height={fh / 2} fit="contain" opacity={!(sheet && animated) && still ? 1 : 0} />
        {ENCOUNTER_LOOKS.map(name => (
          <Group key={name} transform={[{ translateX: fw / 4 }, { translateY: fh / 2 - 12 }, { scale: 1.6 }]}
            opacity={!(sheet && animated) && !still && critter === name ? 1 : 0}>
            <CritterBody look={critterLook(name)} />
          </Group>
        ))}
      </Group>
    </Canvas>
  );
});

/* ── Lagoon Glow-Down ─────────────────────────────────────────────────── */

/**
 * The show spot's glow (sheet `lagoon-glow`, 10 frames) while a performance
 * runs: 10 fps in full, 6 fps in lite, the still first frame in calm.
 */
export const LagoonGlow = memo(function LagoonGlow({ asset, widthPts, clock, fps, intensity }: {
  readonly asset: FrightAmbientAsset;
  readonly widthPts: number;
  readonly clock: SharedValue<number>;
  /** 0 holds frame 0. */
  readonly fps: number;
  readonly intensity: number;
}) {
  const image = useRemoteImage(asset.file);
  const [fw, fh] = asset.frame ?? [256, 128];
  const frames = asset.rows?.[0] ?? 10;
  const W = Math.round(widthPts);
  const scale = W / (fw / 2);
  const H = Math.round((fh / 2) * scale);
  const frame = useDerivedValue(() => (fps > 0 ? Math.floor(clock.value * fps) % frames : 0));
  const row = useSharedValue(0);
  return (
    <Canvas style={{ width: W, height: H }} pointerEvents="none">
      {/* Fixed tree: the frame is mounted before the sheet loads (opacity 0 until then). */}
      <Group transform={[{ scale }]} opacity={image ? Math.max(0.4, intensity) : 0}>
        <SheetFrame image={image} fw={fw} fh={fh} frame={frame} row={row} x={0} y={0} />
      </Group>
    </Canvas>
  );
});

const styles = StyleSheet.create({
  // At least 44 pt wide and tall: the whole facade is the tap target.
  lantern: { width: LANTERN_W, height: LH + LANTERN_FOOT, alignItems: 'center' },
  chip: { maxWidth: LANTERN_W, marginTop: 2, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9,
    backgroundColor: 'rgba(30,24,56,0.92)', borderWidth: 1.5, borderColor: NIGHT.lantern },
  gone: { opacity: 0 },
  // Stays mounted, takes no space.
  collapsed: { display: 'none' },
  chipDim: { borderColor: NIGHT.dusk, opacity: 0.85 },
  chipText: { fontFamily: 'Knockout', fontSize: 10.5, lineHeight: 12, color: NIGHT.moon, textAlign: 'center' },
  chipDetail: { fontFamily: 'Knockout', fontSize: 9, lineHeight: 10.5, color: NIGHT.lantern, textAlign: 'center' },
  icon: { position: 'absolute', top: 10, width: 64, height: 64 },
  iconDim: { opacity: 0.5 },
  // Survived: the pin at the facade's top right with a check badge (replaces the old "1" bead).
  survived: { position: 'absolute', top: 2, left: LANTERN_W / 2 + 14, width: 34, height: 34 },
  survivedPin: { width: 34, height: 34 },
  check: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center',
    justifyContent: 'center', backgroundColor: NIGHT.candy, borderWidth: 2, borderColor: NIGHT.ink },
  checkText: { fontSize: 11, lineHeight: 13, fontWeight: '900', color: NIGHT.ink },
  chipDone: { borderColor: NIGHT.candy },
});
