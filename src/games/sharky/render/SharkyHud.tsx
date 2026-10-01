/**
 * SharkyHud: the Tide Run HUD, drawn in Skia on the UI thread straight from
 * the sim (no React renders during play). Lives in the sky and sand bands so
 * it never covers the 960 x 1000u play view, and it never shakes.
 *
 *   sky band:  tide clock bar (queue) or Ride Gate progress (ride/race),
 *              hearts, chain pill with its draining window, token slots,
 *              race position tag
 *   sand band: Boost meter (3 segments, sky blue and white) with the
 *              "slide right" hint the first time it unlocks
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  Path,
  RoundedRect,
  Skia,
  Text as SkText,
  useFont,
  useImage,
  Image as SkImage,
  type SkFont,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  BOOST_MAX, CHAIN_WINDOW, CLOCK_BASE, FRENZY_STEPS, MODE_QUEUE, MODE_GHOST, MODE_PRACTICE, MODE_RACE, MODE_RIDE,
  PH_POCKET, chainTier, multiplier, type SimState,
} from '../sim/core';
import type { RivalSlot } from '../useSharkyEngine';
import type { SharkyLayout } from './view';
import { SHARKY_ART } from '../assets';
import { CORAL, GOLD, INK } from './SharkyCanvas';

const TIER_COLORS = ['#3aa7f0', '#5fd0ff', GOLD, '#fff1b8'];

export interface SharkyHudProps {
  layout: SharkyLayout;
  sim: SharedValue<SimState>;
  rivals: SharedValue<RivalSlot[]>;
  tick: SharedValue<number>;
  showBoost: boolean;
  boostHint: boolean;
}

function heartPath(cx: number, cy: number, r: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx, cy + r * 0.9);
  p.cubicTo(cx - r * 1.6, cy - r * 0.1, cx - r * 0.7, cy - r * 1.3, cx, cy - r * 0.45);
  p.cubicTo(cx + r * 0.7, cy - r * 1.3, cx + r * 1.6, cy - r * 0.1, cx, cy + r * 0.9);
  p.close();
  return p;
}

export const SharkyHud = React.memo(function SharkyHud({ layout: L, sim, rivals, tick, showBoost, boostHint }: SharkyHudProps) {
  const fontL = useFont(SHARKY_ART.font, 30);
  const fontS = useFont(SHARKY_ART.font, 17);
  const fontXL = useFont(SHARKY_ART.font, 46);
  const tokenImg = useImage(SHARKY_ART.tokenGold);
  const W = L.w;
  const barX = 14;
  const barW = W - 28;
  const barY = Math.max(8, Math.min(14, L.skyH * 0.06));
  const barH = 20;
  const rowY = barY + barH + 10;
  const sandY = L.sandTop + Math.max(8, L.sandH * 0.18);

  // --- tide clock / progress bar ------------------------------------------
  const frac = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.mode === MODE_QUEUE || s.mode === MODE_GHOST || s.mode === MODE_PRACTICE) {
      return Math.max(0, Math.min(1, s.clockSteps / Math.max(CLOCK_BASE, CLOCK_BASE + s.bonusSteps)));
    }
    // Ride: 3 sprints to the Ride Gate; race: one course to the finish.
    const within = Math.max(0, Math.min(1, ((s.dist >> 8) - s.sprintStart) / Math.max(1, s.gateX - s.sprintStart)));
    if (s.mode === MODE_RACE) return within;
    const done = s.phase === PH_POCKET ? s.sprint : s.sprint + within;
    return Math.max(0, Math.min(1, done / 3));
  });
  const barFill = useDerivedValue(() => (tick.value, Skia.RRectXY(Skia.XYWHRect(barX + 3, barY + 3, Math.max(0, (barW - 6) * frac.value), barH - 6), 7, 7)));
  const low = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const timed = s.mode === MODE_QUEUE || s.mode === MODE_GHOST || s.mode === MODE_PRACTICE;
    return timed && s.clockSteps < 480 && s.phase !== PH_POCKET;
  });
  const barColor = useDerivedValue(() => (tick.value, (low.value ? CORAL : '#5fd0ff')));
  const barPulse = useDerivedValue(() => {
    tick.value;
    if (!low.value) return [{ scaleY: 1 }];
    const k = 1 + 0.2 * Math.max(0, Math.sin((tick.value / 60) * Math.PI * 4));
    return [{ scaleY: k }];
  });
  const clockText = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.mode === MODE_QUEUE || s.mode === MODE_GHOST || s.mode === MODE_PRACTICE) return `${Math.ceil(s.clockSteps / 60)}s`;
    return `${Math.round(frac.value * 100)}%`;
  });

  // --- hearts ---------------------------------------------------------------
  const heartOps = [0, 1, 2].map((i) => useDerivedValue(() => (tick.value, (sim.value.hearts > i ? 1 : 0))));
  const shieldOp = useDerivedValue(() => (tick.value, (sim.value.shield ? 1 : 0)));

  // --- chain pill -------------------------------------------------------------
  const chainText = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.frenzy > 0) return `FRENZY x${multiplier(s)}`;
    if (s.chain <= 0) return 'CHAIN x1';
    const toNext = s.chain >= 9 ? s.frenzyAt - s.chain : 3 - (s.chain % 3);
    return s.chain >= 9 ? `x${multiplier(s)}  FRENZY IN ${Math.max(1, toNext)}` : `CHAIN x${multiplier(s)}`;
  });
  const pillColor = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.frenzy > 0) return Math.floor(tick.value / 8) % 2 ? GOLD : '#fff1b8';
    return TIER_COLORS[chainTier(s)];
  });
  const pillW = 190;
  const pillX = W / 2 - pillW / 2;
  const drain = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    const k = s.frenzy > 0 ? s.frenzy / FRENZY_STEPS : s.chain > 0 ? s.chainTimer / CHAIN_WINDOW : 0;
    return Skia.RRectXY(Skia.XYWHRect(pillX + 12, rowY + 30, Math.max(0, (pillW - 24) * k), 5), 2, 2);
  });
  const pillScale = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    // Spring pop on tier ups (reads the chain window freshly refilled).
    const fresh = s.chainTimer > CHAIN_WINDOW - 8 && s.chain > 0 ? (s.chainTimer - (CHAIN_WINDOW - 8)) / 8 : 0;
    return [{ scale: 1 + 0.18 * fresh }];
  });
  const chainTextX = useDerivedValue(() => {
    tick.value;
    const w = fontS ? fontS.measureText(chainText.value).width : 0;
    return W / 2 - w / 2;
  });

  // --- tokens -------------------------------------------------------------------
  const tokOps = [0, 1, 2].map((i) => useDerivedValue(() => (tick.value, (sim.value.tokenMask & (1 << i) ? 1 : 0))));
  const showTokens = useDerivedValue(() => (tick.value, (sim.value.etier >= 1 ? 1 : 0)));

  // --- position tag (race / ghost) ----------------------------------------------
  const place = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.mode !== MODE_RACE && s.mode !== MODE_GHOST) return '';
    let p = 1;
    let any = false;
    for (const g of rivals.value) {
      if (!g || g.kind === 0) continue;
      any = true;
      const d = g.kind === 1 && g.sim ? g.sim.dist >> 8 : g.rDist;
      const done = g.kind === 1 && g.sim && g.sim.finishStep > 0 && (s.finishStep === 0 || g.sim.finishStep < s.finishStep);
      if (done || d > (s.dist >> 8)) p++;
    }
    if (!any) return '';
    return p === 1 ? '1ST' : p === 2 ? '2ND' : p === 3 ? '3RD' : `${p}TH`;
  });

  // --- boost meter ----------------------------------------------------------------
  const segW = Math.min(76, (W - 120) / 3);
  const boostX = W / 2 - (segW * 3 + 16) / 2;
  const segFill = [0, 1, 2].map((i) => useDerivedValue(() => {
    tick.value;
    const b = sim.value.boost;
    const f = Math.max(0, Math.min(1, (b - i * 100) / 100));
    return Skia.RRectXY(Skia.XYWHRect(boostX + i * (segW + 8) + 3, sandY + 3, (segW - 6) * f, 18), 7, 7);
  }));
  const segColor = [0, 1, 2].map((i) => useDerivedValue(() => (tick.value, (sim.value.boost >= (i + 1) * 100 ? '#ffffff' : '#7fd8ff'))));
  const boostLabel = useDerivedValue(() => {
    tick.value;
    const s = sim.value;
    if (s.dash > 0) return 'DASH!';
    return s.boost >= 100 ? 'SLIDE RIGHT TO DASH' : 'BOOST';
  });
  const boostLabelX = useDerivedValue(() => {
    tick.value;
    const w = fontS ? fontS.measureText(boostLabel.value).width : 0;
    return W / 2 - w / 2;
  });
  void BOOST_MAX;
  void boostHint;

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Tide bar */}
      <RoundedRect x={barX} y={barY} width={barW} height={barH} r={10} color="#ffffff" opacity={0.92} />
      <Group transform={barPulse} origin={{ x: W / 2, y: barY + barH / 2 }}>
        <RoundedRect rect={barFill} color={barColor} />
      </Group>
      {/* Cartoon gloss on the fill */}
      <RoundedRect x={barX + 8} y={barY + 4} width={barW - 16} height={Math.max(2, barH * 0.22)} r={3} color="#ffffff" opacity={0.45} />
      <RoundedRect x={barX} y={barY} width={barW} height={barH} r={10} style="stroke" strokeWidth={3} color={INK} />
      {fontS ? <SkText x={barX + barW - 44} y={barY + 16} text={clockText} font={fontS} color={INK} /> : null}

      {/* Hearts */}
      {[0, 1, 2].map((i) => (
        <Group key={i}>
          {/* Empty socket: white heart, so a lost heart reads as a gap, never a tint. */}
          <Path path={heartPath(28 + i * 34, rowY + 16, 12)} color="#ffffff" opacity={0.85} />
          <Group opacity={heartOps[i]}>
            <Path path={heartPath(28 + i * 34, rowY + 16, 12)} color="#ff5aa5" />
            <Circle cx={23 + i * 34} cy={rowY + 11} r={3.2} color="#ffffff" opacity={0.85} />
          </Group>
          <Path path={heartPath(28 + i * 34, rowY + 16, 12)} style="stroke" strokeWidth={3} color={INK} />
        </Group>
      ))}
      <Group opacity={shieldOp}>
        <RoundedRect x={10} y={rowY - 2} width={112} height={36} r={18} style="stroke" strokeWidth={3} color="#ffffff" />
      </Group>

      {/* Chain pill */}
      <Group transform={pillScale} origin={{ x: W / 2, y: rowY + 18 }}>
        <RoundedRect x={pillX} y={rowY} width={pillW} height={38} r={19} color={pillColor} />
        <RoundedRect x={pillX} y={rowY} width={pillW} height={38} r={19} style="stroke" strokeWidth={3} color={INK} />
        <RoundedRect x={pillX + 14} y={rowY + 4} width={pillW - 28} height={9} r={4.5} color="#ffffff" opacity={0.35} />
        <RoundedRect rect={drain} color={INK} opacity={0.55} />
        {fontS ? <SkText x={chainTextX} y={rowY + 24} text={chainText} font={fontS} color={INK} /> : null}
      </Group>

      {/* Tokens */}
      <Group opacity={showTokens}>
        {[0, 1, 2].map((i) => (
          <Group key={i}>
            <Circle cx={W - 102 + i * 34} cy={rowY + 17} r={14} color="#ffffff" opacity={0.75} />
            <Circle cx={W - 102 + i * 34} cy={rowY + 17} r={14} style="stroke" strokeWidth={2.5} color={INK} opacity={0.6} />
            {tokenImg ? <SkImage image={tokenImg} x={W - 118 + i * 34} y={rowY + 1} width={32} height={32} opacity={tokOps[i]} /> : null}
          </Group>
        ))}
      </Group>

      {/* Race position */}
      {fontXL ? <SkText x={14} y={rowY + 86} text={place} font={fontXL} color={INK} style="stroke" strokeWidth={8} /> : null}
      {fontXL ? <SkText x={14} y={rowY + 86} text={place} font={fontXL} color={GOLD} /> : null}

      {/* Boost meter */}
      {showBoost ? (
        <Group>
          {[0, 1, 2].map((i) => (
            <Group key={i}>
              <RoundedRect x={boostX + i * (segW + 8)} y={sandY} width={segW} height={24} r={10} color="#1f6fa8" opacity={0.35} />
              <RoundedRect rect={segFill[i]} color={segColor[i]} />
              <RoundedRect x={boostX + i * (segW + 8)} y={sandY} width={segW} height={24} r={10} style="stroke" strokeWidth={3} color={INK} />
            </Group>
          ))}
          {fontS ? <SkText x={boostLabelX} y={sandY + 46} text={boostLabel} font={fontS} color={INK} /> : null}
        </Group>
      ) : null}
      {fontL ? null : null}
    </Canvas>
  );
});

export type { SkFont };
void MODE_RIDE;
