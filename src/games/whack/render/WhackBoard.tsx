/**
 * WhackBoard: the whole Bonk Rush scene in ONE Skia canvas (design 6, 12).
 *
 * Every moving value comes from the per-frame RenderState the runtime fills
 * on the UI thread; React renders this tree once per layout/theme (memoized),
 * never per spawn or hit.
 *
 * Hole sandwich (back to front): rim art, teal water mouth (no black voids),
 * rim pulse, the occupant clipped to the mouth, the front half of the rim
 * again over the occupant's base, the QUICK ring, dizzy stars, splats.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas, Circle, Group, Image, LinearGradient, Oval, Path, Rect, RoundedRect, Skia, Text, rect, useFont, useImage, vec,
  type SkFont, type SkImage,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { WarmGroup } from '../../../gamekit/fx/ShaderFx';
import { ART, RIMS, THEMED_SHARK_FRAMES, type WhackTheme } from '../assets';
import type { WhackSim } from '../sim';
import type { BoardLayout } from './layout';
import {
  F_ANGLER, F_ANGLER_ANGRY, F_ANGLER_PEEK, F_BRUISER, F_BRUISER_DAZED, F_DAZED, F_GOLDEN, F_GOLDEN_DAZED, F_PEEK, F_POP, F_PUFFED, F_PUFFER,
  PULSE_COLORS, type RenderState,
} from './renderState';
import { TIER_COLORS, TIER_MULT } from '../waves';

const NAVY = '#05346e';
const GOLD = '#ffcf3b';
const CORAL = '#ff6b5c';
const WATER = ['#46c3d1', '#1c8fa6'];
const FONT = require('../../../../assets/fonts/shark-random-funnyness-2.ttf');

export interface BoardImages {
  peek: SkImage | null; pop: SkImage | null; dazed: SkImage | null; golden: SkImage | null; angler: SkImage | null;
  bruiser: SkImage | null; bruiserDazed: SkImage | null; puffer: SkImage | null; puffed: SkImage | null;
  helmet: SkImage | null; glasses: SkImage | null; sweat: SkImage | null; star: SkImage | null; rim: SkImage | null;
  finger: SkImage | null; boss: SkImage | null; bg: SkImage | null;
  anglerPeek: SkImage | null; anglerAngry: SkImage | null; goldenDazed: SkImage | null; splatInk: SkImage | null; splatCandy: SkImage | null;
}

export function useBoardImages(theme: WhackTheme, bossSrc: number | null): BoardImages {
  const frames = THEMED_SHARK_FRAMES[theme];
  return {
    peek: useImage(frames[0]), pop: useImage(frames[1]), dazed: useImage(frames[2]),
    golden: useImage(ART.golden), angler: useImage(ART.angler), bruiser: useImage(ART.bruiser),
    bruiserDazed: useImage(ART.bruiserDazed), puffer: useImage(ART.puffer), puffed: useImage(ART.pufferPuffed),
    helmet: useImage(ART.helmet), glasses: useImage(ART.sunglasses), sweat: useImage(ART.sweat), star: useImage(ART.dizzyStar),
    rim: useImage(RIMS[theme]), finger: useImage(ART.foamFinger), boss: useImage(bossSrc ?? ART.kraken), bg: useImage(ART.playfield),
    anglerPeek: useImage(ART.anglerPeek), anglerAngry: useImage(ART.anglerAngry), goldenDazed: useImage(ART.goldenDazed),
    splatInk: useImage(ART.splatInk), splatCandy: useImage(ART.splatCandy),
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
  /** Boss presentation values (UI thread): y offset, flinch, hp ghost, sink. */
  bossFx: SharedValue<{ rise: number; flinch: number; flash: number; ghost: number; sink: number }>;
  /** Walk Charge 0..1 and pace delta (ghost) for the top zone. */
  pace: SharedValue<number>;
  showPace: boolean;
}

export const WhackBoard = React.memo(function WhackBoard({ L, sim, rs, tick, images, hud, bossFx, pace, showPace }: WhackBoardProps) {
  const fontS = useFont(FONT, 15);
  const fontM = useFont(FONT, 22);
  const fontL = useFont(FONT, 30);
  const warm = useDerivedValue(() => {
    tick.value;
    return rs.value.fever;
  });
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <WarmGroup amount={warm}>
        {images.bg ? <Image image={images.bg} x={0} y={0} width={L.w} height={L.h} fit="cover" /> : <Rect x={0} y={0} width={L.w} height={L.h} color="#1f8fd6" />}
      </WarmGroup>
      <TopZone L={L} sim={sim} rs={rs} tick={tick} hud={hud} fontS={fontS} fontM={fontM} fontL={fontL} boss={images.boss} bossFx={bossFx} pace={pace} showPace={showPace} />
      {order.map((i) => (
        <Hole key={i} i={i} L={L} rs={rs} tick={tick} images={images} />
      ))}
      <FlyingHelmets L={L} rs={rs} tick={tick} helmet={images.helmet} />
      <Veil L={L} rs={rs} tick={tick} />
      <Finger L={L} rs={rs} tick={tick} finger={images.finger} />
    </Canvas>
  );
});

// ---------------------------------------------------------------------------
// One hole

function pickFrame(code: number, im: BoardImages): SkImage | null {
  'worklet';
  switch (code) {
    case F_PEEK: return im.peek;
    case F_POP: return im.pop;
    case F_DAZED: return im.dazed;
    case F_GOLDEN: return im.golden;
    case F_ANGLER: return im.angler;
    case F_BRUISER: return im.bruiser;
    case F_BRUISER_DAZED: return im.bruiserDazed;
    case F_PUFFER: return im.puffer;
    case F_PUFFED: return im.puffed;
    case F_ANGLER_PEEK: return im.anglerPeek;
    case F_ANGLER_ANGRY: return im.anglerAngry;
    case F_GOLDEN_DAZED: return im.goldenDazed;
    default: return null;
  }
}

const Hole = React.memo(function Hole({ i, L, rs, tick, images }: { i: number; L: BoardLayout; rs: SharedValue<RenderState>; tick: SharedValue<number>; images: BoardImages }) {
  const cx = L.cx[i];
  const my = L.my[i];
  const mrx = L.mrx[i];
  const mry = L.mry[i];
  const H = L.spriteH[i];
  // Occupant clip: everything above the water line, plus a water-plane ellipse as wide as the
  // character, so fins wider than the rim sink into the water on a curve instead of a hard cut.
  const clip = useMemo(() => {
    const p = Skia.Path.Make();
    p.addRect(rect(cx - L.w, -2000, L.w * 2, my + 2000));
    p.addOval(rect(cx - mrx, my - mry, mrx * 2, mry * 2));
    const wide = Math.max(mrx, H * 0.48);
    p.addOval(rect(cx - wide, my - mry * 0.55, wide * 2, mry * 1.1));
    return p;
  }, [cx, my, mrx, mry, L.w, H]);
  const frontClip = useMemo(() => rect(L.rimX[i] - 4, my, L.rimW[i] + 8, L.rimH[i] + 8), [L, i, my]);
  const waterStart = useMemo(() => vec(cx, my - mry), [cx, my, mry]);
  const waterEnd = useMemo(() => vec(cx, my + mry), [cx, my, mry]);
  const im = images;

  const frame = useDerivedValue(() => {
    tick.value;
    return pickFrame(rs.value.frame[i], im);
  });
  const x = useDerivedValue(() => (tick.value, rs.value.ix[i]));
  const y = useDerivedValue(() => (tick.value, rs.value.iy[i]));
  const w = useDerivedValue(() => (tick.value, rs.value.iw[i]));
  const h = useDerivedValue(() => (tick.value, rs.value.ih[i]));
  const op = useDerivedValue(() => (tick.value, rs.value.frame[i] < 0 ? 0 : rs.value.op[i] * rs.value.fade[i]));
  const squash = useDerivedValue(() => {
    tick.value;
    const r = rs.value;
    return [
      { translateX: r.px[i] }, { translateY: r.py[i] }, { rotate: (r.rot[i] * Math.PI) / 180 },
      { scaleX: r.sx[i] }, { scaleY: r.sy[i] }, { translateX: -r.px[i] }, { translateY: -r.py[i] },
    ];
  });
  const kick = useDerivedValue(() => {
    tick.value;
    return [{ translateX: rs.value.kx[i] }, { translateY: rs.value.ky[i] }];
  });
  const pulseOp = useDerivedValue(() => (tick.value, rs.value.pulse[i] * 0.8));
  const pulseColor = useDerivedValue(() => (tick.value, PULSE_COLORS[rs.value.pulseKind[i]] ?? '#ffffff'));
  const lockOp = useDerivedValue(() => (tick.value, rs.value.lock[i] * 0.4));
  // Overlays anchored to the character's head.
  const helmOp = useDerivedValue(() => (tick.value, rs.value.helm[i]));
  const helmY = useDerivedValue(() => (tick.value, rs.value.iy[i] + rs.value.ih[i] * 0.02 - H * 0.08));
  const helmX = useDerivedValue(() => (tick.value, rs.value.px[i] - H * 0.26));
  const glassOp = useDerivedValue(() => (tick.value, rs.value.glasses[i]));
  const glassX = useDerivedValue(() => (tick.value, rs.value.px[i] - H * 0.2));
  const glassY = useDerivedValue(() => (tick.value, rs.value.iy[i] + rs.value.ih[i] * 0.2));
  const sweatOp = useDerivedValue(() => (tick.value, rs.value.sweat[i]));
  const sweatX = useDerivedValue(() => (tick.value, rs.value.px[i] + H * 0.22));
  const sweatY = useDerivedValue(() => (tick.value, rs.value.iy[i] + rs.value.ih[i] * 0.12 + Math.sin(rs.value.tick * 0.3) * 2));
  // QUICK ring.
  const ringR = useDerivedValue(() => (tick.value, rs.value.ring[i]));
  const ringOp = useDerivedValue(() => (tick.value, rs.value.ring[i] > 0 ? 1 : 0));
  const ringColor = useDerivedValue(() => (tick.value, rs.value.ringGold[i] > 0 ? GOLD : '#ffffff'));
  const ringCy = my - H * 0.42;
  // Dizzy stars (3, orbiting at 2.5 rev/s).
  const dizzyOp = useDerivedValue(() => (tick.value, rs.value.dizzy[i]));
  const s1 = useDerivedValue(() => {
    tick.value;
    const a = rs.value.tick * 0.26;
    return [{ translateX: cx + Math.cos(a) * H * 0.28 - 8 }, { translateY: my - H * 0.85 + Math.sin(a) * H * 0.08 - 8 }];
  });
  const s2 = useDerivedValue(() => {
    tick.value;
    const a = rs.value.tick * 0.26 + 2.09;
    return [{ translateX: cx + Math.cos(a) * H * 0.28 - 8 }, { translateY: my - H * 0.85 + Math.sin(a) * H * 0.08 - 8 }];
  });
  const s3 = useDerivedValue(() => {
    tick.value;
    const a = rs.value.tick * 0.26 + 4.19;
    return [{ translateX: cx + Math.cos(a) * H * 0.28 - 8 }, { translateY: my - H * 0.85 + Math.sin(a) * H * 0.08 - 8 }];
  });
  // Splat (boss ink / duel cotton candy).
  const splatOp = useDerivedValue(() => (tick.value, rs.value.splat[i] > 0 ? (rs.value.splat[i] >= 1 ? 1 : 0.35) : 0));
  const splatT = useDerivedValue(() => {
    tick.value;
    const sc = rs.value.splat[i] >= 1 ? 1 : 0.2 + 0.7 * ((rs.value.tick % 40) / 40);
    return [{ translateX: cx }, { translateY: my - H * 0.25 }, { scale: sc }];
  });
  // Splat art (pipeline, gate-passed): navy ink for the boss, cotton candy for duel sabotage.
  const splatW = L.rimW[i] * 1.25;
  const inkOp = useDerivedValue(() => (tick.value, rs.value.splatType[i] === 4 ? 0 : 1));
  const candyOp = useDerivedValue(() => (tick.value, rs.value.splatType[i] === 4 ? 1 : 0));

  return (
    <Group transform={kick}>
      {im.rim ? <Image image={im.rim} x={L.rimX[i]} y={L.rimY[i]} width={L.rimW[i]} height={L.rimH[i]} fit="fill" /> : null}
      <Oval x={cx - mrx} y={my - mry} width={mrx * 2} height={mry * 2}>
        <LinearGradient start={waterStart} end={waterEnd} colors={WATER} />
      </Oval>
      <Oval x={cx - mrx * 0.8} y={my - mry * 0.92} width={mrx * 1.6} height={mry * 0.5} color="#ffffff" opacity={0.28} />
      <Oval x={cx - mrx} y={my - mry} width={mrx * 2} height={mry * 2} style="stroke" strokeWidth={6} color={pulseColor} opacity={pulseOp} />
      <Oval x={cx - mrx} y={my - mry} width={mrx * 2} height={mry * 2} color={CORAL} opacity={lockOp} />
      <Group clip={clip}>
        <Group transform={squash}>
          <Image image={frame} x={x} y={y} width={w} height={h} opacity={op} fit="fill" />
          {im.helmet ? <Image image={im.helmet} x={helmX} y={helmY} width={H * 0.52} height={H * 0.46} opacity={helmOp} fit="contain" /> : null}
          {im.glasses ? <Image image={im.glasses} x={glassX} y={glassY} width={H * 0.4} height={H * 0.2} opacity={glassOp} fit="contain" /> : null}
          {im.sweat ? <Image image={im.sweat} x={sweatX} y={sweatY} width={H * 0.12} height={H * 0.14} opacity={sweatOp} fit="contain" /> : null}
        </Group>
      </Group>
      {im.rim ? (
        <Group clip={frontClip}>
          <Image image={im.rim} x={L.rimX[i]} y={L.rimY[i]} width={L.rimW[i]} height={L.rimH[i]} fit="fill" />
        </Group>
      ) : null}
      <Group opacity={ringOp}>
        <Circle cx={cx} cy={ringCy} r={ringR} style="stroke" strokeWidth={7} color={NAVY} />
        <Circle cx={cx} cy={ringCy} r={ringR} style="stroke" strokeWidth={3.5} color={ringColor} />
      </Group>
      {im.star ? (
        <Group opacity={dizzyOp}>
          <Group transform={s1}><Image image={im.star} x={0} y={0} width={16} height={16} /></Group>
          <Group transform={s2}><Image image={im.star} x={0} y={0} width={16} height={16} /></Group>
          <Group transform={s3}><Image image={im.star} x={0} y={0} width={16} height={16} /></Group>
        </Group>
      ) : null}
      <Group transform={splatT} opacity={splatOp}>
        {im.splatInk ? <Image image={im.splatInk} x={-splatW / 2} y={-splatW * 0.45} width={splatW} height={splatW * 0.9} fit="contain" opacity={inkOp} /> : null}
        {im.splatCandy ? <Image image={im.splatCandy} x={-splatW / 2} y={-splatW * 0.45} width={splatW} height={splatW * 0.9} fit="contain" opacity={candyOp} /> : null}
      </Group>
    </Group>
  );
});

// ---------------------------------------------------------------------------

const FlyingHelmets = React.memo(function FlyingHelmets({ L, rs, tick, helmet }: { L: BoardLayout; rs: SharedValue<RenderState>; tick: SharedValue<number>; helmet: SkImage | null }) {
  if (!helmet) return null;
  return (
    <>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <FlyingHelmet key={i} i={i} L={L} rs={rs} tick={tick} helmet={helmet} />)}
    </>
  );
});

function FlyingHelmet({ i, L, rs, tick, helmet }: { i: number; L: BoardLayout; rs: SharedValue<RenderState>; tick: SharedValue<number>; helmet: SkImage }) {
  const size = L.spriteH[i] * 0.5;
  const t = useDerivedValue(() => {
    tick.value;
    const r = rs.value;
    return [{ translateX: r.hfx[i] }, { translateY: r.hfy[i] }, { rotate: (r.hfr[i] * Math.PI) / 180 }, { translateX: -size / 2 }, { translateY: -size / 2 }];
  });
  const op = useDerivedValue(() => (tick.value, rs.value.hfo[i]));
  return (
    <Group transform={t} opacity={op}>
      <Image image={helmet} x={0} y={0} width={size} height={size} fit="contain" />
    </Group>
  );
}

function Veil({ L, rs, tick }: { L: BoardLayout; rs: SharedValue<RenderState>; tick: SharedValue<number> }) {
  const op = useDerivedValue(() => (tick.value, rs.value.veil * 0.3));
  return <Rect x={0} y={L.topH} width={L.w} height={L.h - L.topH} color="#ffffff" opacity={op} />;
}

function Finger({ L, rs, tick, finger }: { L: BoardLayout; rs: SharedValue<RenderState>; tick: SharedValue<number>; finger: SkImage | null }) {
  const fw = L.cellW * 0.5;
  const fh = fw / 0.871;
  const t = useDerivedValue(() => {
    tick.value;
    const r = rs.value;
    return [
      { translateX: r.fingerX }, { translateY: r.fingerY }, { rotate: (r.fingerRot * Math.PI) / 180 },
      { scale: r.fingerScale }, { translateX: -fw * 0.5 }, { translateY: -fh * 0.2 },
    ];
  });
  const op = useDerivedValue(() => (tick.value, rs.value.fingerOp));
  if (!finger) return null;
  return (
    <Group transform={t} opacity={op}>
      <Image image={finger} x={0} y={0} width={fw} height={fh} fit="contain" />
    </Group>
  );
}

// ---------------------------------------------------------------------------
// Top zone HUD: timer ring, combo badge, Bonk Meter or Coin Meter, boss.

function TopZone({ L, sim, rs, tick, hud, fontS, fontM, fontL, boss, bossFx, pace, showPace }: {
  L: BoardLayout; sim: SharedValue<WhackSim>; rs: SharedValue<RenderState>; tick: SharedValue<number>; hud: HudProps;
  fontS: SkFont | null; fontM: SkFont | null; fontL: SkFont | null; boss: SkImage | null;
  bossFx: WhackBoardProps['bossFx']; pace: SharedValue<number>; showPace: boolean;
}) {
  const W = L.w;
  const top = L.topH;
  const timerR = Math.min(30, top * 0.2);
  const tcx = 16 + timerR;
  const tcy = 14 + timerR;
  // Timer arc.
  const timerPath = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const left = Math.max(0, 1 - s.t / s.len);
    const p = Skia.Path.Make();
    p.addArc(rect(tcx - timerR, tcy - timerR, timerR * 2, timerR * 2), -90, 360 * left);
    return p;
  });
  const timerColor = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const left = s.len - s.t;
    return left < 3000 && Math.floor(left / 500) % 2 === 0 ? CORAL : GOLD;
  });
  const timerText = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    return `${Math.ceil(Math.max(0, s.len - s.t) / 1000)}`;
  });
  const timerTextX = useDerivedValue(() => {
    tick.value;
    const t = timerText.value;
    return tcx - (fontM ? fontM.measureText(t).width / 2 : 8);
  });
  // Combo badge.
  const bx = W / 2;
  const by = 14 + 34;
  const badgeR = 34;
  const tierColor = useDerivedValue(() => (tick.value, TIER_COLORS[sim.value.tier] ?? '#ffffff'));
  const badgeOp = useDerivedValue(() => (tick.value, sim.value.streak > 0 ? 1 : 0.55));
  const streakText = useDerivedValue(() => (tick.value, `${sim.value.streak}`));
  const streakX = useDerivedValue(() => (tick.value, bx - (fontL ? fontL.measureText(streakText.value).width / 2 : 10)));
  const multText = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const m = Math.min(6, TIER_MULT[s.tier] * (s.fever ? 2 : 1));
    return `x${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}`;
  });
  const multX = useDerivedValue(() => (tick.value, bx - (fontS ? fontS.measureText(multText.value).width / 2 : 8)));
  const badgeTextColor = useDerivedValue(() => (tick.value, sim.value.tier === 0 ? NAVY : '#ffffff'));
  // Meter (queue: Bonk Meter / ride: Coin Meter).
  const mW = W * 0.3;
  const mX = W - mW - 16;
  const mY = 22;
  const meterFill = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.fever) return mW * (s.feverLeft / 7000);
    return mW * Math.min(1, s.meter / 100);
  });
  const meterColor = useDerivedValue(() => (tick.value, sim.value.fever ? CORAL : GOLD));
  const meterLabel = useDerivedValue(() => (tick.value, sim.value.fever ? 'FEVER!' : 'BONK METER'));
  // Ride coin meter: full width notches under the badge row.
  const cX = 16;
  const cW = W - 32;
  const cY = top - 46;
  const coinFill = useDerivedValue(() => (tick.value, cW * Math.min(1, sim.value.coin / 100)));
  const coinText = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const left = Math.max(0, Math.ceil((100 - s.coin) / 6));
    return s.win ? 'COIN CAUGHT!' : left <= 0 ? 'ALMOST!' : `${left} BONKS TO WIN`;
  });
  const coinTextX = useDerivedValue(() => (tick.value, W / 2 - (fontS ? fontS.measureText(coinText.value).width / 2 : 40)));
  const notches = useMemo(() => {
    const out: number[] = [];
    for (let k = 1; k < hud.notches; k++) out.push(cX + (cW * k) / hud.notches);
    return out;
  }, [hud.notches, cW]);
  // Boss.
  const bossW = Math.min(W * 0.34, top * 0.9);
  const bossT = useDerivedValue(() => {
    tick.value;
    const b = bossFx.value;
    const bob = Math.sin(rs.value.tick * 0.083) * 6;
    return [{ translateX: W * 0.72 - bossW / 2 + b.flinch }, { translateY: top - bossW * 1.08 + (1 - b.rise) * bossW * 0.6 + b.sink * bossW + bob }];
  });
  const bossOp = useDerivedValue(() => (tick.value, hud.boss ? Math.min(1, bossFx.value.rise * 1.5) * (1 - bossFx.value.sink) : 0));
  const hpW = W * 0.42;
  const hpX = W * 0.72 - hpW / 2;
  const hpY = top - 20;
  const hpFill = useDerivedValue(() => (tick.value, sim.value.bossMax > 0 ? hpW * (sim.value.bossHp / sim.value.bossMax) : 0));
  const hpGhost = useDerivedValue(() => (tick.value, hpW * bossFx.value.ghost));
  // Pace vs ghost.
  const paceText = useDerivedValue(() => {
    const d = Math.round(pace.value);
    return d >= 0 ? `+${d} VS BEST` : `${d} VS BEST`;
  });
  const paceColor = useDerivedValue(() => (pace.value >= 0 ? '#7dffb0' : '#ffd0c8'));
  // Look-up prompt.
  const promptOp = useDerivedValue(() => {
    tick.value;
    return rs.value.veil;
  });
  const promptT = useDerivedValue(() => {
    tick.value;
    const sc = 1 + 0.04 * Math.sin(rs.value.tick * 0.087);
    return [{ translateX: W / 2 }, { translateY: top * 0.72 }, { scale: sc }];
  });
  const promptW = fontM ? fontM.measureText('TAP TO KEEP BONKING').width : 200;

  return (
    <Group>
      {/* Timer ring */}
      {hud.compact ? null : (
        <Group>
          <Circle cx={tcx} cy={tcy} r={timerR + 4} color={NAVY} />
          <Circle cx={tcx} cy={tcy} r={timerR} color="#0a6fc2" />
          <Path path={timerPath} style="stroke" strokeWidth={6} strokeCap="round" color={timerColor} />
          {fontM ? <Text x={timerTextX} y={tcy + 8} text={timerText} font={fontM} color="#ffffff" /> : null}
          {fontS ? <Text x={16} y={tcy + timerR + 22} text={hud.burstLabel} font={fontS} color="#ffffff" /> : null}
        </Group>
      )}
      {/* Combo badge */}
      <Group opacity={badgeOp}>
        <Circle cx={bx} cy={by} r={badgeR + 4} color={NAVY} />
        <Circle cx={bx} cy={by} r={badgeR} color={tierColor} />
        <Circle cx={bx} cy={by} r={badgeR} style="stroke" strokeWidth={3} color="#ffffff" />
        {fontL ? <Text x={streakX} y={by + 6} text={streakText} font={fontL} color={badgeTextColor} /> : null}
        {fontS ? <Text x={multX} y={by + 24} text={multText} font={fontS} color={badgeTextColor} /> : null}
      </Group>
      {/* Bonk Meter */}
      {hud.feverOn ? (
        <Group>
          {fontS ? <Text x={mX} y={mY - 4} text={meterLabel} font={fontS} color="#ffffff" /> : null}
          <RoundedRect x={mX - 3} y={mY - 1} width={mW + 6} height={20} r={10} color={NAVY} />
          <RoundedRect x={mX} y={mY + 2} width={mW} height={14} r={7} color="#bfe5ff" />
          <RoundedRect x={mX} y={mY + 2} width={meterFill} height={14} r={7} color={meterColor} />
        </Group>
      ) : null}
      {/* Ride Coin Meter */}
      {hud.ride ? (
        <Group>
          <RoundedRect x={cX - 3} y={cY - 3} width={cW + 6} height={26} r={13} color={NAVY} />
          <RoundedRect x={cX} y={cY} width={cW} height={20} r={10} color="#bfe5ff" />
          <RoundedRect x={cX} y={cY} width={coinFill} height={20} r={10} color={GOLD} />
          {notches.map((nx) => <Rect key={nx} x={nx - 1} y={cY + 3} width={2} height={14} color={NAVY} opacity={0.45} />)}
          {fontS ? <Text x={coinTextX} y={cY - 8} text={coinText} font={fontS} color="#ffffff" /> : null}
        </Group>
      ) : null}
      {/* Boss set piece */}
      {hud.boss && boss ? (
        <Group>
          <Group transform={bossT} opacity={bossOp}>
            <Image image={boss} x={0} y={0} width={bossW} height={bossW} fit="contain" />
          </Group>
          <Group opacity={bossOp}>
            <RoundedRect x={hpX - 3} y={hpY - 3} width={hpW + 6} height={18} r={9} color={NAVY} />
            <RoundedRect x={hpX} y={hpY} width={hpW} height={12} r={6} color="#ffe2dc" />
            <RoundedRect x={hpX} y={hpY} width={hpGhost} height={12} r={6} color="#ffffff" />
            <RoundedRect x={hpX} y={hpY} width={hpFill} height={12} r={6} color={CORAL} />
          </Group>
        </Group>
      ) : null}
      {showPace && fontS ? <Text x={16} y={top - 10} text={paceText} font={fontS} color={paceColor} /> : null}
      {/* Auto Look-Up prompt */}
      {fontM ? (
        <Group transform={promptT} opacity={promptOp}>
          <RoundedRect x={-promptW / 2 - 16} y={-26} width={promptW + 32} height={40} r={20} color={NAVY} />
          <Text x={-promptW / 2} y={2} text="TAP TO KEEP BONKING" font={fontM} color="#ffffff" />
        </Group>
      ) : null}
    </Group>
  );
}
