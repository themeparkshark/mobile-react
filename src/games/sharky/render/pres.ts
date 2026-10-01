/**
 * Presentation director (UI thread). The sim is integer and deterministic; this
 * is everything that only looks and feels: smoothed anchor and camera, the tail
 * beat with a continuous phase, input anticipation, local freezes, the on-shark
 * chain badge state, stamps, the Frenzy ribbon, the proximity rim warmth and
 * the zoom-outs (design v7.1 sections 7.0-7.11).
 *
 * presStep runs after every sim step (it reads that step's events), presFrame
 * once per display frame. All times are the fx clock (ms), so a hit-stop
 * freezes the presentation and a slow-mo slows it, while the sim keeps time.
 */

import {
  EV_CHAIN_BREAK, EV_CHAIN_TIER, EV_CHOMP, EV_END, EV_FRENZY_END, EV_FRENZY_START, EV_GATE, EV_GATE_BONUS, EV_GIFT_POP,
  EV_HIT, EV_OD_ARMED, EV_OD_END, EV_OD_START, EV_POCKET_END, EV_REGRAB, EV_RING, EV_SCATTER, EV_SKIM, EV_SPRINT,
  EV_STRIDE, EV_WIPEOUT, END_GATE, END_FINISH, END_TIME, E_JELLY, E_PYLON, G_SPLIT, G_TIDE, MODE_RALLY, NOSE_OFF,
  PH_POCKET, anchorX, chainTier, jellyY, type SimState,
} from '../sim/core';

export const ST_NONE = 0;
export const ST_CLOSE = 1;
export const ST_PERFECT = 2;
export const ST_CHOMP = 3;
export const ST_OVERDRIVE = 4;
export const ST_FRENZY = 5;
export const ST_SPRINT2 = 6;
export const ST_SPRINT3 = 7;
export const ST_FINAL = 8;
export const ST_TIME = 9;
export const ST_WIPEOUT = 10;
export const ST_GIFT = 11;
/** Banners are big and sit above the shark band; the rest are stamps near the shark. */
export function isBanner(id: number): boolean {
  'worklet';
  return id === ST_FRENZY || id === ST_SPRINT2 || id === ST_SPRINT3 || id === ST_FINAL || id === ST_TIME || id === ST_WIPEOUT;
}

export const RIBBON_N = 24;

export interface Pres {
  fx: number;
  /** Smoothed shark anchor x in the view (u), lerp 0.05 per frame toward the sim's speed pan. */
  anc: number;
  /** Camera y follow (u): 12% of the shark's offset from y 500, lerp 0.08. */
  camY: number;
  /** Zoom (1 normal, 0.94 in Gate Rush and Overdrive). */
  zoom: number;
  // tail beat (continuous phase, hz/amp eased over 150ms)
  tailPh: number;
  tailHz: number;
  tailAmp: number;
  // input acting
  pressT: number;
  releaseT: number;
  wasHolding: number;
  // local freeze of the shark (Close Skim 33ms, Perfect / Chomp 50ms)
  freezeUntil: number;
  frozenY: number;
  lastY: number;
  hitT: number;
  /** Proximity rim warmth 0 (white) .. 1 (gold), 3-step lerp in the Close band. */
  warm: number;
  grazeBand: number;
  // stamps (one at a time)
  stamp: number;
  stampT: number;
  stampX: number;
  stampY: number;
  // moments
  closeT: number;
  closeEnt: number;
  /** Close Skim contact point (world x, y in u). */
  closeX: number;
  closeY: number;
  perfT: number;
  perfX: number;
  perfY: number;
  chompT: number;
  tierT: number;
  tier: number;
  breakT: number;
  breakTier: number;
  odArmT: number;
  odStartT: number;
  odEndT: number;
  frenzyT: number;
  frenzyEndT: number;
  gateT: number;
  gateKind: number;
  bonusPts: number;
  bonusMult: number;
  scatterT: number;
  regrabT: number;
  giftT: number;
  endT: number;
  endReason: number;
  // Frenzy ribbon: last 24 tail-tip positions in world u
  rx: number[];
  ry: number[];
  rHead: number;
  rN: number;
  rAcc: number;
  /** Shark y history every 30ms (Overdrive afterimages). */
  yh: number[];
  yhHead: number;
  yhAcc: number;
  /** Chain badge position (view u): 36pt above, 24pt behind the shark, 60ms lag. */
  bx: number;
  by: number;
}

function zeros(n: number): number[] {
  'worklet';
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(0);
  return a;
}

export function createPres(): Pres {
  'worklet';
  return {
    fx: 0, anc: 158, camY: 0, zoom: 1,
    tailPh: 0, tailHz: 1.1, tailAmp: 8,
    pressT: -9999, releaseT: -9999, wasHolding: 0,
    freezeUntil: -1, frozenY: 500, lastY: 500, hitT: -9999,
    warm: 0, grazeBand: 0,
    stamp: ST_NONE, stampT: -9999, stampX: 0, stampY: 0,
    closeT: -9999, closeEnt: -1, closeX: 0, closeY: 0, perfT: -9999, perfX: 0, perfY: 0, chompT: -9999,
    tierT: -9999, tier: 0, breakT: -9999, breakTier: 0,
    odArmT: -9999, odStartT: -9999, odEndT: -9999, frenzyT: -9999, frenzyEndT: -9999,
    gateT: -9999, gateKind: 0, bonusPts: 0, bonusMult: 1,
    scatterT: -9999, regrabT: -9999, giftT: -9999, endT: -9999, endReason: 0,
    rx: zeros(RIBBON_N), ry: zeros(RIBBON_N), rHead: 0, rN: 0, rAcc: 0,
    yh: [500, 500, 500, 500, 500, 500, 500, 500], yhHead: 0, yhAcc: 0,
    bx: 114, by: 434,
  };
}

function setStamp(p: Pres, id: number, s: SimState): void {
  'worklet';
  // Newer replaces older (60ms cross-cut in the renderer). Banners never get
  // replaced by a small stamp inside their first 700ms.
  if (p.stamp !== ST_NONE && isBanner(p.stamp) && !isBanner(id) && p.fx - p.stampT < 700) return;
  p.stamp = id;
  p.stampT = p.fx;
  // Anchor: 40pt (~74u) above and ahead of the shark's nose, fixed in view space.
  p.stampX = p.anc + NOSE_OFF - 10;
  p.stampY = (s.y >> 8) - 92;
}

/** Read one sim step's events (UI thread, right after step()). */
export function presStep(p: Pres, s: SimState, fxMs: number): void {
  'worklet';
  p.fx = fxMs;
  if (s.holding && !p.wasHolding) p.pressT = fxMs;
  if (!s.holding && p.wasHolding) p.releaseT = fxMs;
  p.wasHolding = s.holding;
  p.grazeBand = s.grazeBand;
  for (let e = 0; e < s.evN; e++) {
    const o = e * EV_STRIDE;
    const k = s.ev[o];
    if (k === EV_SKIM) {
      if (s.ev[o + 3] === 1) {
        const i = s.ev[o + 4];
        p.closeT = fxMs;
        p.closeEnt = i;
        const sy = s.y >> 8;
        p.closeX = (s.dist >> 8) + 30;
        if (s.et[i] === E_PYLON) {
          const half = s.ep1[i] >> 1;
          p.closeY = sy < s.ey[i] ? s.ey[i] - half : s.ey[i] + half;
        } else {
          const hy = s.et[i] === E_JELLY ? jellyY(s, i) : s.ey[i];
          p.closeY = sy < hy ? sy + 40 : sy - 40;
        }
        p.freezeUntil = fxMs + 33;
        p.frozenY = p.lastY;
        setStamp(p, ST_CLOSE, s);
      }
    } else if (k === EV_RING) {
      if (s.ev[o + 3] === 1) {
        p.perfT = fxMs;
        p.perfX = s.ev[o + 1];
        p.perfY = s.ev[o + 2];
        p.freezeUntil = fxMs + 50;
        p.frozenY = p.lastY;
        setStamp(p, ST_PERFECT, s);
      }
    } else if (k === EV_CHOMP) {
      p.chompT = fxMs;
      p.freezeUntil = fxMs + 50;
      p.frozenY = p.lastY;
      setStamp(p, ST_CHOMP, s);
    } else if (k === EV_CHAIN_TIER) {
      p.tierT = fxMs;
      p.tier = s.ev[o + 1];
    } else if (k === EV_CHAIN_BREAK) {
      if (s.ev[o + 2] >= 1) {
        p.breakT = fxMs;
        p.breakTier = s.ev[o + 1];
      }
    } else if (k === EV_OD_ARMED) {
      p.odArmT = fxMs;
    } else if (k === EV_OD_START) {
      p.odStartT = fxMs;
      setStamp(p, ST_OVERDRIVE, s);
    } else if (k === EV_OD_END) {
      p.odEndT = fxMs;
    } else if (k === EV_FRENZY_START) {
      p.frenzyT = fxMs;
      p.rN = 0;
      setStamp(p, ST_FRENZY, s);
    } else if (k === EV_FRENZY_END) {
      p.frenzyEndT = fxMs;
    } else if (k === EV_HIT) {
      p.hitT = fxMs;
    } else if (k === EV_SCATTER) {
      p.scatterT = fxMs;
    } else if (k === EV_REGRAB) {
      p.regrabT = fxMs;
    } else if (k === EV_GATE_BONUS) {
      p.bonusPts = s.ev[o + 1];
      p.bonusMult = s.ev[o + 2];
    } else if (k === EV_GATE) {
      p.gateT = fxMs;
      p.gateKind = s.ev[o + 2];
    } else if (k === EV_SPRINT) {
      // A sprint starts streaming at the gate; its stamp plays in the pocket.
      const idx = s.ev[o + 1];
      if (idx > 0 && s.mode !== MODE_RALLY) setStamp(p, idx === 1 ? ST_SPRINT2 : idx === 2 ? ST_SPRINT3 : ST_FINAL, s);
    } else if (k === EV_POCKET_END) {
      // nothing: the stamp has played
    } else if (k === EV_GIFT_POP) {
      p.giftT = fxMs;
    } else if (k === EV_WIPEOUT) {
      setStamp(p, ST_WIPEOUT, s);
    } else if (k === EV_END) {
      p.endT = fxMs;
      p.endReason = s.ev[o + 1];
      if (p.endReason === END_TIME) setStamp(p, ST_TIME, s);
    }
  }
  void G_TIDE; void G_SPLIT; void END_GATE; void END_FINISH; void PH_POCKET; void chainTier;
}

/** Shark render y this frame (holds during a local freeze). */
export function presSharkY(p: Pres, y: number): number {
  'worklet';
  return p.fx < p.freezeUntil ? p.frozenY : y;
}

/** Per display frame: smoothing, tail phase, warmth, zoom, ribbon. */
export function presFrame(p: Pres, s: SimState, fxDtMs: number, fxMs: number, y: number, reduced: boolean): void {
  'worklet';
  p.fx = fxMs;
  const dt = fxDtMs / 1000;
  // Anchor pan (design 3.2): lerp 0.05 per frame.
  p.anc += (anchorX(s) - p.anc) * 0.05;
  // Camera y follow: 12% of the offset from y 500, lerp 0.08 (surface and floor stay in view).
  const target = reduced ? 0 : (500 - y) * 0.12;
  p.camY += (target - p.camY) * 0.08;
  // Zoom-out in Gate Rush (hazard-free) and Overdrive (invincible), 300ms ease.
  const zt = !reduced && (s.rushK > 0 || s.od > 0) ? 0.94 : 1;
  p.zoom += (zt - p.zoom) * (fxDtMs > 0 ? 1 - Math.exp(-fxDtMs / 110) : 0);
  // Tail beat: holding 3.2Hz/14u, sinking 1.8/9, settling or cruising 1.1/8,
  // Overdrive and Frenzy 4/16; frequency and amplitude ease over 150ms.
  let hz = 1.8;
  let amp = 9;
  if (s.od > 0 || s.frenzy > 0) {
    hz = 4;
    amp = 16;
  } else if (s.phase === PH_POCKET || s.float > 0 || s.settle) {
    hz = 1.1;
    amp = 8;
  } else if (s.holding) {
    hz = 3.2;
    amp = 14;
  }
  const k = fxDtMs > 0 ? 1 - Math.exp(-fxDtMs / 50) : 0;
  p.tailHz += (hz - p.tailHz) * k;
  p.tailAmp += (amp - p.tailAmp) * k;
  if (fxMs >= p.freezeUntil) p.tailPh += 2 * Math.PI * p.tailHz * dt;
  if (p.tailPh > 1000) p.tailPh -= 2 * Math.PI * 100;
  // Proximity rim: warms white to gold over 3 steps inside the Close band.
  const wt = s.grazeBand === 2 ? 1 : s.grazeBand === 1 ? 0.35 : 0;
  p.warm += (wt - p.warm) * (fxDtMs > 0 ? Math.min(1, fxDtMs / 50) : 0);
  if (fxMs >= p.freezeUntil) p.lastY = y;
  const ry = presSharkY(p, y);
  p.yhAcc += fxDtMs;
  if (p.yhAcc >= 30) {
    p.yhAcc = 0;
    p.yhHead = (p.yhHead + 1) % 8;
    p.yh[p.yhHead] = ry;
  }
  const kb = fxDtMs > 0 ? 1 - Math.exp(-fxDtMs / 60) : 0;
  p.bx += (p.anc - 44 - p.bx) * kb;
  p.by += (ry - 66 - p.by) * kb;
  // Frenzy ribbon: sample the tail tip every ~16ms (world u).
  if (s.frenzy > 0) {
    p.rAcc += fxDtMs;
    if (p.rAcc >= 16) {
      p.rAcc = 0;
      p.rHead = (p.rHead + 1) % RIBBON_N;
      p.rx[p.rHead] = (s.dist >> 8) - 92;
      p.ry[p.rHead] = y + 6;
      if (p.rN < RIBBON_N) p.rN++;
    }
  } else if (p.rN > 0 && fxMs - p.frenzyEndT > 400) {
    p.rN = 0;
  }
}

