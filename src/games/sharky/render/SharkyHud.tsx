/**
 * SharkyHud (design v7.1 5.1): three elements in the sky band, drawn in Skia
 * on the UI thread straight from the sim (no React renders during play), never
 * inside the camera:
 *
 *   score (top-left)   one number in the display font, rolls up on events and
 *                      visibly down (in white, never coral) on a Coin Scatter
 *   tide bar (centre)  time left, the +4s refill as a gold ghost while a gate is
 *                      ahead, 3 token pips inside; FINAL STRETCH in sprint 4;
 *                      a Ride Gate progress bar in ride mode, the rally rail in
 *                      a rally
 *   hearts (top-right) 3 hearts; a lost heart pops to 1.3 and splits in 4
 *
 * The chain, Boost and Overdrive live on the shark (render/SharkSprite).
 * In a pocket, the sky band also shows the hero-size split chip and the
 * next-sprint postcard (5.7).
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas, Circle, Group, Image as SkImage, Path, RoundedRect, Skia, Text as SkText, useFont, useImage,
  type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  CLOCK_BASE, GATE_CLOCK, MODE_RALLY, MODE_RIDE, PH_POCKET, POCKET_SHORT, timedMode, type SimState,
} from '../sim/core';
import type { RivalSlot } from '../useSharkyEngine';
import type { SharkyLayout } from './view';
import type { Pres } from './pres';
import { SHARKY_ART } from '../assets';
import { BOOST, DANGER, HEART, INK, NEUTRAL, REWARD } from './palette';

export interface SharkyHudProps {
  layout: SharkyLayout;
  sim: SharedValue<SimState>;
  pres: SharedValue<Pres>;
  rivals: SharedValue<RivalSlot[]>;
  tick: SharedValue<number>;
  /** Displayed score (rolls toward the sim score; JS sets the target for fly-to-score). */
  shownScore: SharedValue<number>;
  /** Split chip: delta vs ghost/best at the last gate, and when it popped (fx ms). */
  split: SharedValue<{ delta: number; at: number; label: string }>;
  /** Next-sprint postcard (full pockets only): sprint name and its hazard. */
  postcard: SharedValue<{ title: string; at: number; until: number }>;
  rivalColors: string[];
}

function heartPath(cx: number, cy: number, r: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx, cy + r * 0.9);
  p.cubicTo(cx - r * 1.6, cy - r * 0.1, cx - r * 0.7, cy - r * 1.3, cx, cy - r * 0.45);
  p.cubicTo(cx + r * 0.7, cy - r * 1.3, cx + r * 1.6, cy - r * 0.1, cx, cy + r * 0.9);
  p.close();
  return p;
}

/** Four-pass number treatment (design 7.2): shadow, 7pt ink, 2pt white inner, fill. */
function Num({ text, x, y, font, color, size }: { text: SharedValue<string>; x: SharedValue<number> | number; y: number; font: ReturnType<typeof useFont>; color: string | SharedValue<string> | SharedValue<'#ffc233' | '#ffffff'>; size: number }) {
  if (!font) return null;
  const sh = Math.max(1.5, size * 0.07);
  return (
    <Group>
      <SkText x={x} y={y + sh} text={text} font={font} color={INK} opacity={0.35} />
      <SkText x={x} y={y} text={text} font={font} color={INK} style="stroke" strokeWidth={Math.max(5, size * 0.24)} strokeJoin="round" />
      <SkText x={x} y={y} text={text} font={font} color={NEUTRAL} style="stroke" strokeWidth={Math.max(2, size * 0.07)} strokeJoin="round" />
      <SkText x={x} y={y} text={text} font={font} color={color} />
    </Group>
  );
}

export const SharkyHud = React.memo(function SharkyHud({ layout: L, sim, pres, rivals, tick, shownScore, split, postcard, rivalColors }: SharkyHudProps) {
  const fontScore = useFont(SHARKY_ART.displayFont, 30);
  const fontS = useFont(SHARKY_ART.font, 15);
  const fontChip = useFont(SHARKY_ART.displayFont, 40);
  const fontPost = useFont(SHARKY_ART.displayFont, 22);
  const tokenImg = useImage(SHARKY_ART.tokenGold);
  const postImg = useImage(SHARKY_ART.postcard);
  const farReef = useImage(SHARKY_ART.farReef);
  const W = L.w;
  const top = Math.max(6, Math.min(12, L.skyH * 0.05));
  const barW = Math.min(170, W * 0.42);
  const barX = W / 2 - barW / 2;
  const barY = top + 8;
  const barH = 22;

  // --- score (top-left) ---------------------------------------------------------
  const scoreText = useDerivedValue(() => (tick.value, `${Math.round(shownScore.value)}`));
  const scoreColor = useDerivedValue((): string => {
    tick.value;
    // Ticks down in white on a scatter, never coral.
    return shownScore.value > sim.value.score + 0.5 ? NEUTRAL : REWARD;
  });

  // --- tide bar / ride progress -----------------------------------------------------
  const bar = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const p = pres.value;
    let frac = 0;
    let ghost = 0;
    let low = false;
    let label = '';
    if (timedMode(s.mode)) {
      const full = CLOCK_BASE + 3 * GATE_CLOCK;
      frac = Math.max(0, Math.min(1, s.clockSteps / full));
      if (s.gateX > 0 && s.phase !== PH_POCKET) ghost = Math.min(1 - frac, GATE_CLOCK / full);
      low = s.clockSteps < 480 && s.phase !== PH_POCKET;
      label = `${Math.ceil(s.clockSteps / 60)}`;
    } else {
      const within = Math.max(0, Math.min(1, ((s.dist >> 8) - s.sprintStart) / Math.max(1, s.gateX - s.sprintStart)));
      if (s.mode === MODE_RALLY) frac = within;
      else frac = Math.max(0, Math.min(1, (s.phase === PH_POCKET ? s.sprint : s.sprint + within) / 3));
      label = `${Math.round(frac * 100)}%`;
    }
    // Refill sweep at a gate: 400ms outBack.
    const tg = p.fx - p.gateT;
    const sweep = tg >= 0 && tg < 400 ? 1 + 0.18 * Math.sin((tg / 400) * Math.PI) : 1;
    const pulse = low ? 1 + 0.18 * Math.max(0, Math.sin((p.fx / 1000) * Math.PI * 4)) : 1;
    return { frac, ghost, low, label, sweep: sweep * pulse, final: timedMode(s.mode) && s.sprint >= 3 && s.gateX === 0 ? 1 : 0 };
  });
  const fill = useDerivedValue(() => Skia.RRectXY(Skia.XYWHRect(barX + 3, barY + 3, Math.max(0, (barW - 6) * bar.value.frac), barH - 6), 8, 8));
  const ghostR = useDerivedValue(() => {
    const b = bar.value;
    return Skia.RRectXY(Skia.XYWHRect(barX + 3 + (barW - 6) * b.frac, barY + 3, Math.max(0, (barW - 6) * b.ghost), barH - 6), 8, 8);
  });
  const fillColor = useDerivedValue(() => (bar.value.low ? DANGER : BOOST));
  const barT = useDerivedValue(() => [{ scaleY: bar.value.sweep }]);
  const barLabel = useDerivedValue(() => bar.value.label);
  const finalOp = useDerivedValue(() => bar.value.final);
  const tokOps = [0, 1, 2].map((i) => useDerivedValue(() => (tick.value, sim.value.tokenMask & (1 << i) ? 1 : 0.0)));
  const tokShow = useDerivedValue(() => (tick.value, sim.value.etier >= 1 && sim.value.mode !== MODE_RALLY ? 1 : 0));

  // --- hearts (top-right) -------------------------------------------------------------
  const heartOps = [0, 1, 2].map((i) => useDerivedValue(() => (tick.value, sim.value.hearts > i ? 1 : 0)));
  const shieldOp = useDerivedValue(() => (tick.value, sim.value.shield ? 1 : 0));
  const heartPop = useDerivedValue(() => {
    tick.value;
    const p = pres.value;
    const t = p.fx - p.hitT;
    if (t < 0 || t > 400) return { i: -1, k: 0 };
    return { i: sim.value.hearts, k: t / 400 };
  });
  const hx = (i: number) => W - 30 - (2 - i) * 32;
  const heartShards = useDerivedValue(() => {
    const h = heartPop.value;
    const p = Skia.Path.Make();
    if (h.i < 0 || h.i > 2) return p;
    const cx = hx(h.i);
    const cy = top + 19;
    const k = h.k;
    for (let s = 0; s < 4; s++) {
      const ang = (s / 4) * Math.PI * 2 + 0.6;
      const r = 6 + 26 * k;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r + 30 * k * k;
      p.moveTo(x, y - 6);
      p.lineTo(x + 6, y + 4);
      p.lineTo(x - 6, y + 4);
      p.close();
    }
    return p;
  });
  const shardOp = useDerivedValue(() => (heartPop.value.i < 0 ? 0 : 1 - heartPop.value.k));

  // --- rally rail + placement -------------------------------------------------------
  const rally = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.mode !== MODE_RALLY) return { on: 0, dots: [] as number[], place: '' };
    const len = Math.max(1, s.gateX - s.sprintStart);
    const dots: number[] = [Math.max(0, Math.min(1, ((s.dist >> 8) - s.sprintStart) / len))];
    let place = 1;
    for (const g of rivals.value) {
      if (!g || g.kind === 0) {
        dots.push(-1);
        continue;
      }
      const d = g.kind === 1 && g.sim ? g.sim.dist >> 8 : g.rDist;
      const sc = g.kind === 1 && g.sim ? g.sim.score : g.rScore;
      dots.push(Math.max(0, Math.min(1, (d - s.sprintStart) / len)));
      if (sc > s.score) place++;
    }
    return { on: 1, dots, place: place === 1 ? '1ST' : place === 2 ? '2ND' : place === 3 ? '3RD' : `${place}TH` };
  });
  const railY = barY + barH + 18;
  const railOp = useDerivedValue(() => rally.value.on);
  const dotX = [0, 1, 2, 3].map((j) => useDerivedValue(() => {
    const d = rally.value.dots[j];
    return d === undefined || d < 0 ? -999 : 20 + (W - 40) * d;
  }));
  const placeText = useDerivedValue(() => rally.value.place);

  // --- split chip (hero size, 1200ms) and next-sprint postcard ------------------------
  const chip = useDerivedValue(() => {
    tick.value;
    const p = pres.value;
    const sp = split.value;
    const t = p.fx - sp.at;
    if (sp.label === '' || t < 0 || t > 1200) return { op: 0, sc: 0, text: '', color: REWARD };
    const sc = t < 160 ? 0.7 + 0.4 * (t / 160) : t < 260 ? 1.1 - 0.1 * ((t - 160) / 100) : 1;
    return { op: t > 1000 ? 1 - (t - 1000) / 200 : 1, sc, text: sp.label, color: sp.delta >= 0 ? '#3ccf6b' : DANGER };
  });
  const chipText = useDerivedValue(() => chip.value.text);
  const chipX = useDerivedValue(() => (fontChip ? W / 2 - fontChip.measureText(chip.value.text).width / 2 : 0));
  const chipColor = useDerivedValue(() => chip.value.color);
  const chipT = useDerivedValue(() => [{ scale: chip.value.sc }]);
  const chipOp = useDerivedValue(() => chip.value.op);
  const chipY = Math.max(barY + barH + 54, L.skyH * 0.62);

  const post = useDerivedValue(() => {
    tick.value;
    const p = pres.value;
    const pc = postcard.value;
    const s = sim.value;
    if (!pc.title || s.phase !== PH_POCKET || s.pocketLen === POCKET_SHORT) return { op: 0, x: W + 200, rot: 0 };
    const t = p.fx - pc.at;
    const left = pc.until - p.fx;
    const inK = Math.max(0, Math.min(1, t / 280));
    const e = 1 + 2.4 * Math.pow(inK - 1, 3) + 1.4 * Math.pow(inK - 1, 2);
    const x = W + 160 - (W / 2 + 160) * e;
    const flip = left < 220 ? Math.max(0, left / 220) : 1;
    return { op: flip, x, rot: (6 * Math.PI) / 180 };
  });
  const postT = useDerivedValue(() => [{ translateX: post.value.x }, { translateY: L.offY + 160 * L.k }, { rotate: post.value.rot }, { scaleX: post.value.op }]);
  const postOp = useDerivedValue(() => post.value.op > 0 ? 1 : 0);
  const postTitle = useDerivedValue(() => postcard.value.title);
  const postTitleX = useDerivedValue(() => (fontPost ? -fontPost.measureText(postcard.value.title).width / 2 : 0));
  const PW = 190;
  const PH = (PW * 255) / 384;

  const heartGeo = useMemo(() => [0, 1, 2].map((i) => heartPath(hx(i), top + 19, 12)), [W, top]);
  void REWARD;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Score */}
      <Num text={scoreText} x={14} y={top + 30} font={fontScore} color={scoreColor} size={30} />

      {/* Tide bar */}
      <RoundedRect x={barX} y={barY} width={barW} height={barH} r={11} color={NEUTRAL} opacity={0.94} />
      <Group transform={barT} origin={{ x: W / 2, y: barY + barH / 2 }}>
        <RoundedRect rect={fill} color={fillColor} />
        <RoundedRect rect={ghostR} color={REWARD} opacity={0.55} />
      </Group>
      <RoundedRect x={barX + 8} y={barY + 4} width={barW - 16} height={4} r={2} color={NEUTRAL} opacity={0.5} />
      <Group opacity={tokShow}>
        {[0, 1, 2].map((i) => (
          <Group key={i}>
            <Circle cx={barX + barW - 18 - i * 22} cy={barY + barH / 2} r={8} color={NEUTRAL} opacity={0.8} />
            <Circle cx={barX + barW - 18 - i * 22} cy={barY + barH / 2} r={8} style="stroke" strokeWidth={2} color={INK} opacity={0.5} />
            {tokenImg ? <SkImage image={tokenImg} x={barX + barW - 28 - i * 22} y={barY + barH / 2 - 10} width={20} height={20} opacity={tokOps[i]} /> : null}
          </Group>
        ))}
      </Group>
      <RoundedRect x={barX} y={barY} width={barW} height={barH} r={11} style="stroke" strokeWidth={3} color={INK} />
      {fontS ? <SkText x={barX + 10} y={barY + 16} text={barLabel} font={fontS} color={INK} /> : null}
      {fontS ? <SkText x={barX + barW / 2 - 46} y={barY + barH + 16} text="FINAL STRETCH" font={fontS} color={INK} opacity={finalOp} /> : null}

      {/* Hearts */}
      {[0, 1, 2].map((i) => (
        <Group key={i}>
          <Path path={heartGeo[i]} color={NEUTRAL} opacity={0.85} />
          <Group opacity={heartOps[i]}>
            <Path path={heartGeo[i]} color={HEART} />
            <Circle cx={hx(i) - 5} cy={top + 14} r={3.2} color={NEUTRAL} opacity={0.85} />
          </Group>
          <Path path={heartGeo[i]} style="stroke" strokeWidth={3} color={INK} />
        </Group>
      ))}
      <Path path={heartShards} color={HEART} opacity={shardOp} />
      <Path path={heartShards} style="stroke" strokeWidth={2} color={INK} opacity={shardOp} />
      <Group opacity={shieldOp}>
        <RoundedRect x={W - 104} y={top} width={96} height={38} r={19} style="stroke" strokeWidth={3} color={NEUTRAL} />
      </Group>

      {/* Rally rail and placement tag */}
      <Group opacity={railOp}>
        <RoundedRect x={20} y={railY - 3} width={W - 40} height={6} r={3} color={NEUTRAL} opacity={0.8} />
        {[0, 1, 2, 3].map((j) => (
          <Circle key={j} cx={dotX[j]} cy={railY} r={j === 0 ? 8 : 6} color={j === 0 ? REWARD : rivalColors[j - 1] ?? NEUTRAL} />
        ))}
        {[0, 1, 2, 3].map((j) => (
          <Circle key={`o${j}`} cx={dotX[j]} cy={railY} r={j === 0 ? 8 : 6} style="stroke" strokeWidth={2} color={INK} />
        ))}
        <Num text={placeText} x={14} y={railY + 42} font={fontScore} color={REWARD} size={30} />
      </Group>

      {/* Split chip (hero size) */}
      <Group opacity={chipOp} transform={chipT} origin={{ x: W / 2, y: chipY - 14 }}>
        <Num text={chipText} x={chipX} y={chipY} font={fontChip} color={chipColor} size={40} />
      </Group>

      {/* Next-sprint postcard */}
      <Group transform={postT} opacity={postOp}>
        {farReef ? (
          <Group clip={Skia.XYWHRect(-PW / 2 + 14, -PH / 2 + 14, PW - 28, PH - 28)}>
            <SkImage image={farReef} x={-PW / 2} y={-PH / 2 - 20} width={PW * 1.4} height={PH * 1.4} fit="cover" />
          </Group>
        ) : null}
        {postImg ? <SkImage image={postImg} x={-PW / 2} y={-PH / 2} width={PW} height={PH} /> : null}
        <Num text={postTitle} x={postTitleX} y={PH / 2 - 22} font={fontPost} color={NEUTRAL} size={22} />
      </Group>
    </Canvas>
  );
});

export type { SkImageType };
void MODE_RIDE;
