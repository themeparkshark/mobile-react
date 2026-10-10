/**
 * BoardFx.tsx: the two Skia layers around the cards (design v8 6.12).
 *
 *   BoardFxUnder (below the cards)
 *     felt       #0a7fd6 with a linen grain and a 3px wooden inner bezel
 *     wells      3px white outline on #0768b9 with a 35% inner shade (never
 *                navy); matched wells turn gold 18% with a 2px dashed gold rim
 *     rim rope   a 5px gold rope inside the felt, draining clockwise from top
 *                centre. It stops while a reveal is pending (a gold network
 *                glint travels it; orange once the try's allowance is used),
 *                turns #FF8A00 with a spark in Overtime, dims to 70% during
 *                Time Attack's line bleed, carries the gold 3-star notch.
 *                Signal Mode swaps it for a 24-bead turn rope.
 *     shadows    hard 2-tone cel drop shadows for every card, read from the
 *                cards' flip and lift mutables (no RN shadow props anywhere):
 *                offset 2 -> 8 -> 3px with lift, width x |cos(rotateY)|
 *     ripple     the felt under a match ripples (strength by tier)
 *
 *   BoardFxOver (above the cards, pointerEvents none)
 *     link arc   gold arc from the card you saw earlier to the one you just
 *                flipped (chain 2+): 3px core, 1px ink edge, trims in 140ms
 *     slip arc   coral dashed arc from the forgotten card to the wrong card,
 *                1px ink edge, draws in 200ms and holds 440ms
 *     flash      Photo Flash light confined to the chosen cards
 *     trail      the seagull's dotted gold carry trail (stays 1000ms)
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Image as SkImage,
  Path,
  RoundedRect,
  Skia,
  useImage,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { BoothGeo, Rect } from './layout';
import { slotXY } from './layout';
import type { CardValues } from './MemoryCard';
import { MM } from './theme';

const GRAIN = require('../../assets/games/memory/v8/grain.png');

export interface ArcState {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0..1 trim progress */
  p: number;
  /** 0..1 alpha */
  a: number;
}

export const NO_ARC: ArcState = { x1: 0, y1: 0, x2: 0, y2: 0, p: 0, a: 0 };

export interface RopeState {
  /** Remaining fraction 0..1. */
  frac: SharedValue<number>;
  /** 1 in Overtime. */
  urgent: SharedValue<number>;
  /** Line bleed dim (0..1). */
  dim: SharedValue<number>;
  /** A reveal is pending: the network glint travels the rope (0..1 phase, -1 off). */
  glint: SharedValue<number>;
  /** The try's allowance is used up: the glint turns orange. */
  capHit: SharedValue<number>;
}

export interface RippleState {
  x: number;
  y: number;
  /** 0..1 progress */
  p: number;
  strength: number;
}

function perimeterPoint(x: number, y: number, w: number, h: number, t: number): { px: number; py: number } {
  'worklet';
  const per = 2 * (w + h);
  let d = (((t % 1) + 1) % 1) * per;
  const segs = [w / 2, h, w, h, w / 2];
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ];
  let px = x + w / 2;
  let py = y;
  for (let i = 0; i < segs.length; i++) {
    const s = Math.min(d, segs[i]);
    px += dirs[i][0] * s;
    py += dirs[i][1] * s;
    d -= s;
    if (d <= 0) break;
  }
  return { px, py };
}

function ropePath(r: Rect, radius: number) {
  const p = Skia.Path.Make();
  const { x, y, w, h } = r;
  p.moveTo(x + w / 2, y);
  p.lineTo(x + w - radius, y);
  p.quadTo(x + w, y, x + w, y + radius);
  p.lineTo(x + w, y + h - radius);
  p.quadTo(x + w, y + h, x + w - radius, y + h);
  p.lineTo(x + radius, y + h);
  p.quadTo(x, y + h, x, y + h - radius);
  p.lineTo(x, y + radius);
  p.quadTo(x, y, x + radius, y);
  p.lineTo(x + w / 2, y);
  return p;
}

// -----------------------------------------------------------------------------
// Under layer
// -----------------------------------------------------------------------------

export const BoardFxUnder = memo(function BoardFxUnder({ geo, wells, cards, ids, rope, showRope, notchFrac, beads, ripple }: {
  geo: BoothGeo;
  /** Matched slots (gold wells). */
  wells: number[];
  /** Card mutables by card id. */
  cards: CardValues[];
  /** Which card id sits at each slot (board order). */
  ids: number[];
  rope: RopeState;
  showRope: boolean;
  /** Remaining fraction where the gold 3-star notch sits (-1 none). */
  notchFrac: number;
  /** Signal Mode: total beads and beads left (SharedValue), or null. */
  beads: { total: number; left: SharedValue<number> } | null;
  ripple: SharedValue<RippleState>;
}) {
  const g = geo;
  const grain = useImage(GRAIN);
  const radius = Math.min(g.cw, g.ch) * 0.12;
  const n = g.cols * g.rows;
  const slots = useMemo(() => Array.from({ length: n }, (_, s) => slotXY(g, s)), [g, n]);
  const wellSet = useMemo(() => new Set(wells), [wells]);
  const feltR = 14;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Felt with linen grain and the wooden inner bezel. */}
      <RoundedRect x={g.felt.x} y={g.felt.y} width={g.felt.w} height={g.felt.h} r={feltR} color={MM.felt} />
      <RoundedRect x={g.felt.x + 6} y={g.felt.y + 6} width={g.felt.w - 12} height={g.felt.h * 0.35} r={feltR} color="rgba(255,255,255,0.05)" />
      {grain ? (
        <Group clip={Skia.RRectXY(Skia.XYWHRect(g.felt.x, g.felt.y, g.felt.w, g.felt.h), feltR, feltR)} opacity={0.18}>
          {Array.from({ length: Math.ceil(g.felt.w / 128) * Math.ceil(g.felt.h / 128) }, (_, i) => {
            const cols = Math.ceil(g.felt.w / 128);
            return <SkImage key={i} image={grain} x={g.felt.x + (i % cols) * 128} y={g.felt.y + Math.floor(i / cols) * 128} width={128} height={128} />;
          })}
        </Group>
      ) : null}
      <RoundedRect x={g.felt.x + 1.5} y={g.felt.y + 1.5} width={g.felt.w - 3} height={g.felt.h - 3} r={feltR} color={MM.woodDark} style="stroke" strokeWidth={3} />
      <RoundedRect x={g.felt.x + 4} y={g.felt.y + 4} width={g.felt.w - 8} height={g.felt.h - 8} r={feltR - 2} color="rgba(255,255,255,0.18)" style="stroke" strokeWidth={1} />

      <Ripple ripple={ripple} />

      {/* Wells */}
      {slots.map((p, s) => (wellSet.has(s) ? (
        <Group key={s}>
          <RoundedRect x={p.x} y={p.y} width={g.cw} height={g.ch} r={radius} color="rgba(254,201,14,0.18)" />
          <RoundedRect x={p.x + 1} y={p.y + 1} width={g.cw - 2} height={g.ch - 2} r={radius} color={MM.gold} style="stroke" strokeWidth={2}>
            <DashPathEffect intervals={[6, 4]} />
          </RoundedRect>
        </Group>
      ) : (
        <Group key={s}>
          <RoundedRect x={p.x} y={p.y} width={g.cw} height={g.ch} r={radius} color={MM.well} />
          <RoundedRect x={p.x + 3} y={p.y + 3} width={g.cw - 6} height={g.ch * 0.3} r={radius} color="rgba(6,67,117,0.35)" />
          <RoundedRect x={p.x + 1.5} y={p.y + 1.5} width={g.cw - 3} height={g.ch - 3} r={radius} color="#ffffff" style="stroke" strokeWidth={3} />
        </Group>
      )))}

      {showRope ? <Rope geo={g} rope={rope} notchFrac={notchFrac} /> : null}
      {beads ? <Beads geo={g} total={beads.total} left={beads.left} /> : null}

      {/* Cel drop shadows (read from each card's flip and lift). */}
      {ids.map((id, s) => (cards[id] ? <CardShadow key={`${id}`} v={cards[id]} w={g.cw} h={g.ch} r={radius} home={slots[s]} /> : null))}
    </Canvas>
  );
});

function CardShadow({ v, w, h, r }: { v: CardValues; w: number; h: number; r: number; home: { x: number; y: number } }) {
  const transform = useDerivedValue(() => {
    const deg = v.flip.value * Math.PI;
    const edge = Math.max(0.12, Math.abs(Math.cos(deg)));
    const lift = Math.max(0, v.lift.value - 1);
    const off = lift > 0.06 ? 8 : 2 + lift * 100;
    const sc = v.scale.value;
    const cx = v.x.value + w / 2;
    const cy = v.y.value + h / 2 + v.arcY.value;
    return [
      { translateX: cx + off * 0.6 },
      { translateY: cy + off },
      { scaleX: edge * sc * (1 + lift * 0.3) },
      { scaleY: sc * (1 + lift * 0.3) },
    ];
  });
  const opacity = useDerivedValue(() => v.opacity.value);
  return (
    <Group transform={transform} opacity={opacity}>
      <RoundedRect x={-w / 2 - 1} y={-h / 2 - 1} width={w + 2} height={h + 2} r={r + 1} color="rgba(6,67,117,0.18)" />
      <RoundedRect x={-w / 2 + 1} y={-h / 2 + 1} width={w - 2} height={h - 2} r={r} color="rgba(6,67,117,0.30)" />
    </Group>
  );
}

function Ripple({ ripple }: { ripple: SharedValue<RippleState> }) {
  const r = useDerivedValue(() => 6 + ripple.value.p * 90);
  const cx = useDerivedValue(() => ripple.value.x);
  const cy = useDerivedValue(() => ripple.value.y);
  const op = useDerivedValue(() => (ripple.value.p > 0 && ripple.value.p < 1 ? (1 - ripple.value.p) * 0.35 * ripple.value.strength : 0));
  const sw = useDerivedValue(() => 2 + 10 * (1 - ripple.value.p));
  return (
    <Group opacity={op}>
      <Circle cx={cx} cy={cy} r={r} color="rgba(255,255,255,0.9)" style="stroke" strokeWidth={sw} />
    </Group>
  );
}

function Rope({ geo, rope, notchFrac }: { geo: BoothGeo; rope: RopeState; notchFrac: number }) {
  const R = geo.rope;
  const path = useMemo(() => ropePath(R, 12), [R]);
  const end = useDerivedValue(() => Math.max(0, Math.min(1, rope.frac.value)));
  const core = useDerivedValue(() => (rope.urgent.value > 0.5 ? MM.urgent : MM.gold));
  const edge = useDerivedValue(() => (rope.urgent.value > 0.5 ? '#ffffff' : MM.ink));
  const opacity = useDerivedValue(() => 1 - rope.dim.value * 0.3);
  const spark = useDerivedValue(() => perimeterPoint(R.x, R.y, R.w, R.h, end.value));
  const sx = useDerivedValue(() => spark.value.px);
  const sy = useDerivedValue(() => spark.value.py);
  const sr = useDerivedValue(() => (rope.urgent.value > 0.5 ? 5 : 0));
  const glint = useDerivedValue(() => perimeterPoint(R.x, R.y, R.w, R.h, Math.max(0, rope.glint.value) * end.value));
  const gx = useDerivedValue(() => glint.value.px);
  const gy = useDerivedValue(() => glint.value.py);
  const gr = useDerivedValue(() => (rope.glint.value >= 0 ? 4.5 : 0));
  const gc = useDerivedValue(() => (rope.capHit.value > 0.5 ? MM.urgent : '#fff3b0'));
  const notch = useMemo(() => (notchFrac > 0 ? perimeterPoint(R.x, R.y, R.w, R.h, notchFrac) : null), [notchFrac, R]);
  return (
    <Group opacity={opacity}>
      <Path path={path} style="stroke" strokeWidth={7} strokeCap="round" color="rgba(5,52,110,0.25)" start={0} end={1} />
      <Path path={path} style="stroke" strokeWidth={8} strokeCap="round" color={edge} start={0} end={end} />
      <Path path={path} style="stroke" strokeWidth={5} strokeCap="round" color={core} start={0} end={end} />
      {notch ? <Circle cx={notch.px} cy={notch.py} r={5} color={MM.gold} /> : null}
      {notch ? <Circle cx={notch.px} cy={notch.py} r={5} color={MM.ink} style="stroke" strokeWidth={1.5} /> : null}
      <Circle cx={sx} cy={sy} r={sr} color="#fff3b0" />
      <Circle cx={gx} cy={gy} r={gr} color={gc} />
      <Circle cx={gx} cy={gy} r={gr} color={MM.ink} style="stroke" strokeWidth={1} />
    </Group>
  );
}

function Beads({ geo, total, left }: { geo: BoothGeo; total: number; left: SharedValue<number> }) {
  const R = geo.rope;
  const pts = useMemo(() => Array.from({ length: total }, (_, i) => perimeterPoint(R.x, R.y, R.w, R.h, (i + 0.5) / total)), [R, total]);
  return (
    <>
      {pts.map((p, i) => <Bead key={i} x={p.px} y={p.py} i={i} left={left} />)}
    </>
  );
}

function Bead({ x, y, i, left }: { x: number; y: number; i: number; left: SharedValue<number> }) {
  const c = useDerivedValue(() => (i < left.value ? MM.gold : 'rgba(255,255,255,0.35)'));
  return (
    <Group>
      <Circle cx={x} cy={y} r={5} color={c} />
      <Circle cx={x} cy={y} r={5} color={MM.ink} style="stroke" strokeWidth={1.4} />
    </Group>
  );
}

// -----------------------------------------------------------------------------
// Over layer
// -----------------------------------------------------------------------------

export interface FlashRects {
  rects: Rect[];
  /** 0..1 */
  p: number;
}

export const BoardFxOver = memo(function BoardFxOver({ arc, slipArc, flash, flashP, trail }: {
  arc: SharedValue<ArcState>;
  slipArc: SharedValue<ArcState>;
  /** The chosen cards (rects) and the light's progress 0..1. */
  flash: SharedValue<FlashRects>;
  flashP: SharedValue<number>;
  trail: SharedValue<ArcState>;
}) {
  const arcPath = useArcPath(arc);
  const arcEnd = useDerivedValue(() => arc.value.p);
  const arcAlpha = useDerivedValue(() => arc.value.a);
  const slipPath = useArcPath(slipArc);
  const slipEnd = useDerivedValue(() => slipArc.value.p);
  const slipAlpha = useDerivedValue(() => slipArc.value.a);
  const trailPath = useArcPath(trail);
  const trailEnd = useDerivedValue(() => trail.value.p);
  const trailAlpha = useDerivedValue(() => trail.value.a);
  const flashPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const f = flash.value;
    if (flashP.value <= 0 || flashP.value >= 1) return p;
    f.rects.forEach((r) => p.addRRect(Skia.RRectXY(Skia.XYWHRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6), 10, 10)));
    return p;
  });
  const flashAlpha = useDerivedValue(() => {
    const p = flashP.value;
    // 60ms up, 240ms down at 0.5 peak.
    return p <= 0 || p >= 1 ? 0 : p < 0.2 ? (p / 0.2) * 0.5 : Math.max(0, (1 - (p - 0.2) / 0.8) * 0.5);
  });
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group opacity={flashAlpha}>
        <Path path={flashPath} color="#FFF4D6" />
      </Group>
      <Group opacity={trailAlpha}>
        <Path path={trailPath} style="stroke" strokeWidth={4} strokeCap="round" color={MM.gold} start={0} end={trailEnd}>
          <DashPathEffect intervals={[1, 9]} />
        </Path>
      </Group>
      <Group opacity={arcAlpha}>
        {/* A bold gold link (6px core, 2px ink edge, soft glow) so the memory link reads as a reward, not a debug line. */}
        <Path path={arcPath} style="stroke" strokeWidth={14} strokeCap="round" color="rgba(255,213,74,0.28)" start={0} end={arcEnd} />
        <Path path={arcPath} style="stroke" strokeWidth={10} strokeCap="round" color={MM.ink} start={0} end={arcEnd} />
        <Path path={arcPath} style="stroke" strokeWidth={6} strokeCap="round" color={MM.gold} start={0} end={arcEnd} />
        <Path path={arcPath} style="stroke" strokeWidth={2} strokeCap="round" color="rgba(255,255,255,0.7)" start={0} end={arcEnd} />
      </Group>
      <Group opacity={slipAlpha}>
        <Path path={slipPath} style="stroke" strokeWidth={4} strokeCap="round" color={MM.ink} start={0} end={slipEnd}>
          <DashPathEffect intervals={[9, 6]} />
        </Path>
        <Path path={slipPath} style="stroke" strokeWidth={2} strokeCap="round" color={MM.coral} start={0} end={slipEnd}>
          <DashPathEffect intervals={[9, 6]} />
        </Path>
      </Group>
    </Canvas>
  );
});

function useArcPath(arc: SharedValue<ArcState>) {
  return useDerivedValue(() => {
    const a = arc.value;
    const p = Skia.Path.Make();
    if (a.a <= 0) return p;
    const mx = (a.x1 + a.x2) / 2;
    const my = (a.y1 + a.y2) / 2 - Math.max(30, Math.abs(a.x2 - a.x1) * 0.25 + Math.abs(a.y2 - a.y1) * 0.15);
    p.moveTo(a.x1, a.y1);
    p.quadTo(mx, my, a.x2, a.y2);
    return p;
  });
}
