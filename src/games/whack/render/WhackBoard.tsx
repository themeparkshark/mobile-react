/**
 * WhackBoard: the whole Bonk Rush scene in ONE Skia canvas (design v4 8).
 *
 * Bands, top to bottom (8.1): the cream HUD plate (timer ring, combo
 * medallion, meter); the stage band (the lifted, desaturated backdrop as
 * distant haze, theme props, the boss); the themed deck with 9 splash wells.
 *
 * Static layers are plain Skia nodes rendered once per layout/theme; the
 * wells and everything that moves with them are recorded into one SkPicture
 * per frame by `drawWells` (render/drawBoard.ts), so a frame costs one
 * derived value instead of hundreds of animated props. React renders this
 * tree once per layout (memoized), never per spawn or hit.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas, Circle, ColorMatrix, Group, Image, LinearGradient, Path, Picture, Rect, RoundedRect, Skia, Text, createPicture, rect,
  useFont, useImage, vec, type SkFont, type SkImage,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { ART, RIMS, THEMED_SHARK_FRAMES, type WhackTheme } from '../assets';
import { DECKS, HATS, KEY_POSES, PROPS, RIM_WARNING } from '../art.generated';
import type { WhackSim } from '../sim';
import type { BoardLayout } from './layout';
import { buildWellKit, drawWells, type BoardArt } from './drawBoard';
import {
  FRAME_COUNT, F_ANGLER, F_ANGLER_ANGRY, F_ANGLER_PEEK, F_BRUISER, F_BRUISER_DAZED, F_CONTACT, F_DAZED, F_DUCK, F_GLANCE, F_GOLDEN,
  F_GOLDEN_DAZED, F_HATOFF, F_PEEK, F_POP, F_PUFFED, F_PUFFER, F_SPIRAL, F_TONGUE, type RenderState,
} from './renderState';
import { TIER_COLORS, TIER_MULT, MULT_CAP } from '../waves';

const NAVY = '#0b3a66';
const GOLD = '#ffcf3b';
const CORAL = '#ff6b5c';
const CREAM = '#fff8e4';
const FONT = require('../../../../assets/fonts/shark-random-funnyness-2.ttf');
const CAUSTICS = require('../../../assets/games/whack/fx/caustics.png');
const SHADOW = require('../../../assets/games/whack/fx/contact_shadow.png');

/** Backdrop lift (7.1): -30% saturation, then +35% toward white, so it reads as distant haze. */
const LIFT = (() => {
  const s = 0.7;
  const k = 0.65;
  const o = 0.35;
  const r = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s];
  const g = [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s];
  const b = [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
  return [
    r[0] * k, r[1] * k, r[2] * k, 0, o,
    g[0] * k, g[1] * k, g[2] * k, 0, o,
    b[0] * k, b[1] * k, b[2] * k, 0, o,
    0, 0, 0, 1, 0,
  ];
})();

export interface BoardImages {
  peek: SkImage | null; pop: SkImage | null; dazed: SkImage | null; golden: SkImage | null; angler: SkImage | null;
  bruiser: SkImage | null; bruiserDazed: SkImage | null; puffer: SkImage | null; puffed: SkImage | null;
  helmet: SkImage | null; glasses: SkImage | null; star: SkImage | null; rim: SkImage | null;
  finger: SkImage | null; boss: SkImage | null; bg: SkImage | null;
  anglerPeek: SkImage | null; anglerAngry: SkImage | null; goldenDazed: SkImage | null; splatInk: SkImage | null; splatCandy: SkImage | null;
  glance: SkImage | null; contact: SkImage | null; spiral: SkImage | null; tongue: SkImage | null; hatoff: SkImage | null; duck: SkImage | null;
  hat: SkImage | null; deck: SkImage | null; teeth: SkImage | null; tab: SkImage | null; caustics: SkImage | null; shadow: SkImage | null;
  starburst: SkImage | null; propA: SkImage | null; propB: SkImage | null; propC: SkImage | null;
}

/** Stage props per theme (8.2 backdrop policy): [left, right, centre]. */
const THEME_PROPS: Record<WhackTheme, [number | null, number | null, number | null]> = {
  park: [null, null, null],
  pirates: [null, PROPS.pirates_bow, null],
  mansion: [null, null, PROPS.mansion_gate],
  space: [PROPS.space_gantry, null, null],
  jungle: [null, null, PROPS.jungle_steps],
  backlot: [PROPS.backlot_light_a, PROPS.backlot_light_b, PROPS.backlot_chair],
};

export function useBoardImages(theme: WhackTheme, bossSrc: number | null): BoardImages {
  const frames = THEMED_SHARK_FRAMES[theme];
  const poses = KEY_POSES[theme];
  const props = THEME_PROPS[theme];
  const set: BoardImages = {
    peek: useImage(frames[0]), pop: useImage(frames[1]), dazed: useImage(frames[2]),
    golden: useImage(ART.golden), angler: useImage(ART.angler), bruiser: useImage(ART.bruiser),
    bruiserDazed: useImage(ART.bruiserDazed), puffer: useImage(ART.puffer), puffed: useImage(ART.pufferPuffed),
    helmet: useImage(ART.helmet), glasses: useImage(ART.sunglasses), star: useImage(ART.dizzyStar),
    rim: useImage(RIMS[theme]), finger: useImage(ART.foamFinger), boss: useImage(bossSrc ?? ART.kraken), bg: useImage(ART.playfield),
    anglerPeek: useImage(ART.anglerPeek), anglerAngry: useImage(ART.anglerAngry), goldenDazed: useImage(ART.goldenDazed),
    splatInk: useImage(ART.splatInk), splatCandy: useImage(ART.splatCandy),
    glance: useImage(poses.glance), contact: useImage(poses.contact), spiral: useImage(poses.bonked_spiral), tongue: useImage(poses.bonked_tongue),
    hatoff: useImage(poses.bonked_hatoff), duck: useImage(poses.duck), hat: useImage(HATS[theme]), deck: useImage(DECKS[theme]),
    teeth: useImage(RIM_WARNING.teeth), tab: useImage(RIM_WARNING.tab), caustics: useImage(CAUSTICS), shadow: useImage(SHADOW),
    starburst: useImage(ART.impactL), propA: useImage(props[0] ?? ART.impactS), propB: useImage(props[1] ?? ART.impactS), propC: useImage(props[2] ?? ART.impactS),
  };
  // One stable object per loaded set, so the memoized board never re-renders on a parent render.
  const values = Object.values(set);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => set, values);
}

function artFrom(im: BoardImages): BoardArt {
  const frames: (SkImage | null)[] = [];
  for (let f = 0; f < FRAME_COUNT; f++) frames.push(null);
  frames[F_PEEK] = im.peek;
  frames[F_POP] = im.pop;
  frames[F_DAZED] = im.dazed;
  frames[F_GOLDEN] = im.golden;
  frames[F_ANGLER] = im.angler;
  frames[F_BRUISER] = im.bruiser;
  frames[F_BRUISER_DAZED] = im.bruiserDazed;
  frames[F_PUFFER] = im.puffer;
  frames[F_PUFFED] = im.puffed;
  frames[F_ANGLER_PEEK] = im.anglerPeek;
  frames[F_ANGLER_ANGRY] = im.anglerAngry;
  frames[F_GOLDEN_DAZED] = im.goldenDazed;
  // Missing key poses fall back to the shipped frames (documented fallback, 9.2).
  frames[F_GLANCE] = im.glance ?? im.pop;
  frames[F_CONTACT] = im.contact ?? im.dazed;
  frames[F_SPIRAL] = im.spiral ?? im.dazed;
  frames[F_TONGUE] = im.tongue ?? im.dazed;
  frames[F_HATOFF] = im.hatoff ?? im.dazed;
  frames[F_DUCK] = im.duck ?? im.peek;
  return {
    frames, rim: im.rim, teeth: im.teeth, tab: im.tab, caustics: im.caustics, shadow: im.shadow, starburst: im.starburst,
    helmet: im.helmet, glasses: im.glasses, star: im.star, splatInk: im.splatInk, splatCandy: im.splatCandy, hat: im.hat, finger: im.finger,
  };
}

export interface HudProps {
  burstLabel: string;
  ride: boolean;
  feverOn: boolean;
  boss: boolean;
  notches: number;
  /** Live party round: the room HUD shows the clock, so the board skips its timer ring. */
  compact?: boolean;
}

export interface WhackBoardProps {
  L: BoardLayout;
  sim: SharedValue<WhackSim>;
  rs: SharedValue<RenderState>;
  tick: SharedValue<number>;
  images: BoardImages;
  hud: HudProps;
  theme?: WhackTheme;
  /** Boss presentation values (UI thread): y offset, flinch, hp ghost, sink. */
  bossFx: SharedValue<{ rise: number; flinch: number; flash: number; ghost: number; sink: number }>;
  /** Pace delta vs the ghost for the stage band. */
  pace: SharedValue<number>;
  showPace: boolean;
  paceLabel?: string;
}

export const WhackBoard = React.memo(function WhackBoard({ L, sim, rs, tick, images, hud, theme = 'park', bossFx, pace, showPace, paceLabel }: WhackBoardProps) {
  const fontS = useFont(FONT, 13);
  const fontM = useFont(FONT, 20);
  const fontL = useFont(FONT, 24);
  const art = useMemo(() => artFrom(images), [images]);
  const kit = useMemo(() => buildWellKit(L, 1), [L]);
  const bounds = useMemo(() => rect(0, 0, L.w, L.h), [L]);
  const wells = useDerivedValue(() => {
    tick.value;
    const r = rs.value;
    return createPicture((canvas) => drawWells(canvas, r, L, art, kit, r.fever), bounds);
  });
  const sky = useDerivedValue(() => (tick.value, rs.value.fever * 0.14));
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Stage L={L} images={images} theme={theme} sky={sky} />
      <Boss L={L} rs={rs} sim={sim} tick={tick} boss={images.boss} bossFx={bossFx} on={hud.boss} />
      <Picture picture={wells} />
      <HudPlate L={L} sim={sim} rs={rs} tick={tick} hud={hud} fontS={fontS} fontM={fontM} fontL={fontL} />
      <StagePrompts L={L} rs={rs} tick={tick} fontS={fontS} fontM={fontM} pace={pace} showPace={showPace} paceLabel={paceLabel ?? 'VS BEST'} />
    </Canvas>
  );
});

// ---------------------------------------------------------------------------
// Static stage: lifted backdrop, props, deck floor and the horizon fade.

const Stage = React.memo(function Stage({ L, images, theme, sky }: { L: BoardLayout; images: BoardImages; theme: WhackTheme; sky: SharedValue<number> }) {
  const stageH = L.deckTop + 30;
  const props = THEME_PROPS[theme];
  const propH = Math.max(40, (L.deckTop - L.hudH) * 0.78);
  const prop = (im: SkImage | null, cxFrac: number, hMul: number, key: string) => {
    if (!im) return null;
    const h = propH * hMul;
    const w = h * (im.width() / Math.max(1, im.height()));
    return <Image key={key} image={im} x={L.w * cxFrac - w / 2} y={L.deckTop + 12 - h} width={w} height={h} fit="contain" />;
  };
  const deckH = L.h - L.deckTop + 16;
  return (
    <Group>
      <Rect x={0} y={0} width={L.w} height={L.h} color="#bfe3f5" />
      {images.bg ? (
        <Image image={images.bg} x={0} y={0} width={L.w} height={stageH} fit="cover">
          <ColorMatrix matrix={LIFT} />
        </Image>
      ) : null}
      {/* Fever: a warm sky shift on the backdrop only (characters stay true colour). */}
      <Rect x={0} y={0} width={L.w} height={stageH} color="#ffcf6e" opacity={sky} />
      {props[0] ? prop(images.propA, 0.14, 1, 'a') : null}
      {props[1] ? prop(images.propB, 0.86, theme === 'backlot' ? 1 : 0.95, 'b') : null}
      {props[2] ? prop(images.propC, theme === 'backlot' ? 0.68 : 0.5, theme === 'backlot' ? 0.55 : 0.8, 'c') : null}
      {images.deck ? <Image image={images.deck} x={0} y={L.deckTop - 8} width={L.w} height={deckH} fit="cover" /> : (
        <Rect x={0} y={L.deckTop} width={L.w} height={deckH} color="#9fd2ea" />
      )}
      {/* Horizon fade: the deck melts into the haze over 24pt. */}
      <Rect x={0} y={L.deckTop - 26} width={L.w} height={42}>
        <LinearGradient start={vec(0, L.deckTop - 26)} end={vec(0, L.deckTop + 16)} colors={['rgba(214,238,250,0)', 'rgba(214,238,250,0.92)', 'rgba(214,238,250,0)']} positions={[0, 0.55, 1]} />
      </Rect>
    </Group>
  );
});

// ---------------------------------------------------------------------------
// Boss set piece: lives in the stage band, never over the wells.

function Boss({ L, rs, sim, tick, boss, bossFx, on }: {
  L: BoardLayout; rs: SharedValue<RenderState>; sim: SharedValue<WhackSim>; tick: SharedValue<number>; boss: SkImage | null;
  bossFx: WhackBoardProps['bossFx']; on: boolean;
}) {
  const stage = L.deckTop - L.hudH;
  const bossW = Math.min(L.w * 0.38, stage * 1.05);
  const t = useDerivedValue(() => {
    tick.value;
    const b = bossFx.value;
    const bob = Math.sin(rs.value.tick * 0.083) * 5;
    return [{ translateX: L.w * 0.74 - bossW / 2 + b.flinch }, { translateY: L.deckTop + 6 - bossW + (1 - b.rise) * bossW * 0.6 + b.sink * bossW + bob }];
  });
  const op = useDerivedValue(() => (tick.value, on ? Math.min(1, bossFx.value.rise * 1.5) * (1 - bossFx.value.sink) : 0));
  const hpW = Math.min(L.w * 0.42, 200);
  const hpX = L.w * 0.74 - hpW / 2;
  const hpY = L.hudH + 6;
  const hpFill = useDerivedValue(() => (tick.value, sim.value.bossMax > 0 ? hpW * (sim.value.bossHp / sim.value.bossMax) : 0));
  const hpGhost = useDerivedValue(() => (tick.value, hpW * bossFx.value.ghost));
  if (!on || !boss) return null;
  return (
    <Group>
      <Group transform={t} opacity={op}>
        <Image image={boss} x={0} y={0} width={bossW} height={bossW} fit="contain" />
      </Group>
      <Group opacity={op}>
        <RoundedRect x={hpX - 3} y={hpY - 3} width={hpW + 6} height={18} r={9} color={NAVY} />
        <RoundedRect x={hpX} y={hpY} width={hpW} height={12} r={6} color="#ffe2dc" />
        <RoundedRect x={hpX} y={hpY} width={hpGhost} height={12} r={6} color="#ffffff" />
        <RoundedRect x={hpX} y={hpY} width={hpFill} height={12} r={6} color={CORAL} />
      </Group>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// HUD plate (8.3): one cream plate, never moves with the camera.

function HudPlate({ L, sim, rs, tick, hud, fontS, fontM, fontL }: {
  L: BoardLayout; sim: SharedValue<WhackSim>; rs: SharedValue<RenderState>; tick: SharedValue<number>; hud: HudProps;
  fontS: SkFont | null; fontM: SkFont | null; fontL: SkFont | null;
}) {
  const W = L.w;
  const px = 8;
  const py = 4;
  const ph = 60;
  const pw = W - 16;
  // Timer ring (44pt).
  const tr = 20;
  const tcx = px + 10 + tr;
  const tcy = py + ph / 2;
  const timerPath = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const left = Math.max(0, 1 - s.t / s.len);
    const p = Skia.Path.Make();
    p.addArc(rect(tcx - tr, tcy - tr, tr * 2, tr * 2), -90, 360 * left);
    return p;
  });
  const timerColor = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const left = s.len - s.t;
    return left < 3000 && Math.floor(left / 500) % 2 === 0 ? CORAL : GOLD;
  });
  const timerText = useDerivedValue(() => (tick.value, `${Math.ceil(Math.max(0, sim.value.len - sim.value.t) / 1000)}`));
  const timerTextX = useDerivedValue(() => tcx - (fontM ? fontM.measureText(timerText.value).width / 2 : 8));
  // Combo medallion (52pt): streak, multiplier, tier colour; slams on tier-up, shakes on a tier drop.
  const mr = 26;
  const mcx = W / 2;
  const mcy = py + ph / 2;
  const medT = useDerivedValue(() => {
    tick.value;
    const r = rs.value;
    return [{ translateX: mcx + r.medShake }, { translateY: mcy }, { scale: r.medSlam }];
  });
  const tierColor = useDerivedValue(() => (tick.value, TIER_COLORS[sim.value.tier] ?? '#ffffff'));
  const streakText = useDerivedValue(() => (tick.value, `${sim.value.streak}`));
  const streakX = useDerivedValue(() => -(fontL ? fontL.measureText(streakText.value).width / 2 : 10));
  const multText = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const m = Math.min(MULT_CAP, TIER_MULT[s.tier] * (s.fever ? 2 : 1));
    return `x${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}`;
  });
  const multX = useDerivedValue(() => -(fontS ? fontS.measureText(multText.value).width / 2 : 8));
  const medText = useDerivedValue(() => (tick.value, sim.value.tier === 0 ? NAVY : '#ffffff'));
  const readyGlow = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return s.feverReady ? 0.55 + 0.45 * Math.sin(rs.value.tick * 0.12) : s.fever ? 0.8 : 0;
  });
  // Meter bar (Bonk Meter / Coin Meter).
  const mX = mcx + mr + 16;
  const mW = px + pw - 12 - mX;
  const mY = py + ph / 2 + 2;
  const meterFill = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.ride) return mW * Math.min(1, s.coin / 100);
    if (s.fever) return mW * (s.feverLeft / 7000);
    return mW * Math.min(1, s.meter / 100);
  });
  const meterColor = useDerivedValue(() => (tick.value, sim.value.fever ? CORAL : GOLD));
  const meterLabel = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.ride) {
      const left = Math.max(0, Math.ceil((100 - s.coin) / 8));
      return s.win ? 'COIN CAUGHT!' : `${left} BONKS TO WIN`;
    }
    return s.fever ? 'FEVER!' : s.feverReady ? 'FEVER READY' : 'BONK METER';
  });
  const notches = useMemo(() => {
    const out: number[] = [];
    if (!hud.ride) return out;
    for (let k = 1; k < hud.notches; k++) out.push(mX + (mW * k) / hud.notches);
    return out;
  }, [hud.ride, hud.notches, mX, mW]);
  const labelX = 54 + px + 6;
  const showMeter = hud.feverOn || hud.ride;
  return (
    <Group>
      <RoundedRect x={px} y={py} width={pw} height={ph} r={14} color={CREAM} />
      <RoundedRect x={px} y={py} width={pw} height={ph} r={14} color={NAVY} style="stroke" strokeWidth={2.5} />
      {hud.compact ? null : (
        <Group>
          <Circle cx={tcx} cy={tcy} r={tr + 3} color={NAVY} />
          <Circle cx={tcx} cy={tcy} r={tr} color="#0a6fc2" />
          <Path path={timerPath} style="stroke" strokeWidth={5} strokeCap="round" color={timerColor} />
          {fontM ? <Text x={timerTextX} y={tcy + 7} text={timerText} font={fontM} color="#ffffff" /> : null}
          {fontS ? <Text x={labelX} y={tcy + 5} text={hud.burstLabel} font={fontS} color={NAVY} /> : null}
        </Group>
      )}
      <Group transform={medT}>
        <Circle cx={0} cy={0} r={mr + 7} color={GOLD} opacity={readyGlow} />
        <Circle cx={0} cy={0} r={mr + 3} color={NAVY} />
        <Circle cx={0} cy={0} r={mr} color={tierColor} />
        {fontL ? <Text x={streakX} y={5} text={streakText} font={fontL} color={medText} /> : null}
        {fontS ? <Text x={multX} y={19} text={multText} font={fontS} color={medText} /> : null}
      </Group>
      {showMeter ? (
        <Group>
          {fontS ? <Text x={mX} y={mY - 6} text={meterLabel} font={fontS} color={NAVY} /> : null}
          <RoundedRect x={mX - 2.5} y={mY - 1} width={mW + 5} height={17} r={8.5} color={NAVY} />
          <RoundedRect x={mX} y={mY + 1.5} width={mW} height={12} r={6} color="#d6ecfb" />
          <RoundedRect x={mX} y={mY + 1.5} width={meterFill} height={12} r={6} color={meterColor} />
          {notches.map((nx) => <Rect key={nx} x={nx - 0.75} y={mY + 3} width={1.5} height={9} color={NAVY} opacity={0.5} />)}
        </Group>
      ) : null}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Stage-band prompts: Auto Look-Up and the ghost pace line.

function StagePrompts({ L, rs, tick, fontS, fontM, pace, showPace, paceLabel }: {
  L: BoardLayout; rs: SharedValue<RenderState>; tick: SharedValue<number>; fontS: SkFont | null; fontM: SkFont | null;
  pace: SharedValue<number>; showPace: boolean; paceLabel: string;
}) {
  const W = L.w;
  const midY = L.hudH + (L.deckTop - L.hudH) * 0.55;
  const promptOp = useDerivedValue(() => (tick.value, rs.value.veil));
  const promptT = useDerivedValue(() => {
    tick.value;
    const sc = 1 + 0.04 * Math.sin(rs.value.tick * 0.087);
    return [{ translateX: W / 2 }, { translateY: midY }, { scale: sc }];
  });
  const promptW = fontM ? fontM.measureText('TAP TO KEEP BONKING').width : 200;
  const paceText = useDerivedValue(() => {
    const d = Math.round(pace.value);
    return d >= 0 ? `+${d} ${paceLabel}` : `${d} ${paceLabel}`;
  });
  const paceColor = useDerivedValue(() => (pace.value >= 0 ? '#11823b' : '#c2412f'));
  const paceW = useDerivedValue(() => (fontS ? fontS.measureText(paceText.value).width + 18 : 120));
  const py = L.hudH + 8;
  return (
    <Group>
      {showPace && fontS ? (
        <Group>
          <RoundedRect x={10} y={py} width={paceW} height={22} r={11} color={CREAM} />
          <RoundedRect x={10} y={py} width={paceW} height={22} r={11} color={NAVY} style="stroke" strokeWidth={2} />
          <Text x={19} y={py + 16} text={paceText} font={fontS} color={paceColor} />
        </Group>
      ) : null}
      {fontM ? (
        <Group transform={promptT} opacity={promptOp}>
          <RoundedRect x={-promptW / 2 - 16} y={-24} width={promptW + 32} height={38} r={19} color={NAVY} />
          <Text x={-promptW / 2} y={3} text="TAP TO KEEP BONKING" font={fontM} color="#ffffff" />
        </Group>
      ) : null}
    </Group>
  );
}
