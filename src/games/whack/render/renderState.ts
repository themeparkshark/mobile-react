/**
 * renderState.ts: turns the sim + presentation clocks into per-hole draw
 * values, once per frame on the UI thread (design 6.2 pose-to-pose, 6.3 bonk).
 *
 * Everything here is presentation: nothing feeds back into the sim. Motion
 * that belongs to gameplay (tell, emerge, glance, escape) reads game time, so
 * Auto Look-Up and global freezes hold it; bonk / kick / helmet arcs read each
 * hole's local fx clock, so a local hit-stop freezes only the struck hole.
 */

import { K_ANGLER, K_BRUISER, K_FINN, K_GOLDEN, K_HELMET, K_PUFFER, K_SPRINTER, K_TENTACLE, K_TWIN, G_QUICK, G_CRIT, QUICK_FRAC } from '../waves';
import { P_BONKED, P_ESCAPE, P_TELL, P_UP, SPLAT_DOWN, SPLAT_TELL, type WhackSim } from '../sim';
import type { BoardLayout } from './layout';

// Frame codes (which image a hole draws).
export const F_NONE = -1;
export const F_PEEK = 0;
export const F_POP = 1;
export const F_DAZED = 2;
export const F_GOLDEN = 3;
export const F_ANGLER = 4;
export const F_BRUISER = 5;
export const F_BRUISER_DAZED = 6;
export const F_PUFFER = 7;
export const F_PUFFED = 8;

// Rim pulse colours per kind (index = kind).
export const PULSE_COLORS = ['#ffffff', '#ffcf3b', '#ff6b5c', '#dfe8f2', '#ffffff', '#7fd6ff', '#ffe46b', '#1fc8b8', '#ffcf3b'];

/** Content boxes [x0, y0, x1, y1, aspect] per frame code, filled per theme at mount. */
export type BoxTable = number[][];

export interface RenderState {
  frame: number[];
  // Image draw rect (pre-transform).
  ix: number[];
  iy: number[];
  iw: number[];
  ih: number[];
  // Squash pivot (content bottom centre) and scales.
  px: number[];
  py: number[];
  sx: number[];
  sy: number[];
  rot: number[];
  op: number[];
  // Rim: kick offset + tell rumble, pulse.
  kx: number[];
  ky: number[];
  pulse: number[];
  pulseKind: number[];
  // QUICK ring.
  ring: number[];
  ringGold: number[];
  // Overlays.
  helm: number[];
  glasses: number[];
  sweat: number[];
  dizzy: number[];
  // Splats: 0 none, >0 telegraph scale (0.2..0.9) or 1 landed; type.
  splat: number[];
  splatType: number[];
  fade: number[];
  lock: number[];
  // Flying helmet (after a pop).
  hfx: number[];
  hfy: number[];
  hfr: number[];
  hfo: number[];
  // Foam finger.
  fingerX: number;
  fingerY: number;
  fingerRot: number;
  fingerScale: number;
  fingerOp: number;
  // Board-wide.
  veil: number;
  fever: number;
  tick: number;
}

function arr(v: number): number[] {
  'worklet';
  const a: number[] = [];
  for (let i = 0; i < 9; i++) a.push(v);
  return a;
}

export function createRenderState(): RenderState {
  'worklet';
  return {
    frame: arr(F_NONE), ix: arr(0), iy: arr(0), iw: arr(0), ih: arr(0), px: arr(0), py: arr(0), sx: arr(1), sy: arr(1),
    rot: arr(0), op: arr(1), kx: arr(0), ky: arr(0), pulse: arr(0), pulseKind: arr(0), ring: arr(0), ringGold: arr(0),
    helm: arr(0), glasses: arr(0), sweat: arr(0), dizzy: arr(0), splat: arr(0), splatType: arr(0), fade: arr(1), lock: arr(0),
    hfx: arr(0), hfy: arr(0), hfr: arr(0), hfo: arr(0),
    fingerX: 0, fingerY: 0, fingerRot: 0, fingerScale: 1, fingerOp: 0, veil: 0, fever: 0, tick: 0,
  };
}

/** Presentation clocks the runtime keeps per hole (fx ms, local-stop aware). */
export interface HoleAnim {
  /** Local fx clock per hole. */
  local: number[];
  /** Local clock value when the current phase began (bonk / escape). */
  phaseAt: number[];
  lastPh: number[];
  lastEv: number[];
  lastHitT: number[];
  hitAt: number[];
  helmPopAt: number[];
  helmDir: number[];
  kickX: number[];
  kickY: number[];
  kickAt: number[];
  fingerAt: number;
  fingerX: number;
  fingerY: number;
  fingerSpin: number;
  fxNow: number;
  veil: number;
  fever: number;
}

export function createHoleAnim(): HoleAnim {
  'worklet';
  return {
    local: arr(0), phaseAt: arr(0), lastPh: arr(0), lastEv: arr(-1), lastHitT: arr(-99999), hitAt: arr(-99999),
    helmPopAt: arr(-99999), helmDir: arr(1), kickX: arr(0), kickY: arr(0), kickAt: arr(-99999),
    fingerAt: -99999, fingerX: 0, fingerY: 0, fingerSpin: 0, fxNow: 0, veil: 0, fever: 0,
  };
}

function clamp01(v: number): number {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function outQuad(t: number): number {
  'worklet';
  return 1 - (1 - t) * (1 - t);
}
function inQuad(t: number): number {
  'worklet';
  return t * t;
}
function outBack(t: number, s: number): number {
  'worklet';
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}
function inBack(t: number, s: number): number {
  'worklet';
  return (s + 1) * t * t * t - s * t * t;
}
function outCubic(t: number): number {
  'worklet';
  const u = 1 - t;
  return 1 - u * u * u;
}

/** Place an image so its content box bottom-centre sits at (bx, by) with content height ch. */
function placeImage(rs: RenderState, i: number, box: number[], bx: number, by: number, ch: number): void {
  'worklet';
  const x0 = box[0];
  const y0 = box[1];
  const x1 = box[2];
  const y1 = box[3];
  const aspect = box[4];
  const H = ch / (y1 - y0);
  const W = H * aspect;
  rs.iw[i] = W;
  rs.ih[i] = H;
  rs.ix[i] = bx - W * (x0 + x1) * 0.5;
  rs.iy[i] = by - H * y1;
  rs.px[i] = bx;
  rs.py[i] = by;
}

/**
 * Advance per-hole local clocks (dtLocal already honours local stops) and
 * compute every draw value. `boxes` indexes by frame code.
 */
export function computeRender(rs: RenderState, an: HoleAnim, s: WhackSim, L: BoardLayout, boxes: BoxTable,
  dtFx: number, localDt: number[], reducedMotion: boolean): void {
  'worklet';
  an.fxNow += dtFx;
  const now = an.fxNow;
  const gt = s.t;
  const wob = reducedMotion ? 0 : 1;
  // Veil (Auto Look-Up) and fever ease on fx time (never while frozen by a hit-stop).
  const veilTarget = s.frozen ? 1 : 0;
  an.veil += (veilTarget - an.veil) * clamp01((dtFx > 0 ? dtFx : 16) / (s.frozen ? 150 : 150));
  an.fever += ((s.fever ? 1 : 0) - an.fever) * clamp01((dtFx > 0 ? dtFx : 16) / 300);
  rs.veil = an.veil;
  rs.fever = an.fever;

  for (let i = 0; i < 9; i++) {
    an.local[i] += localDt[i];
    const ph = s.hPh[i];
    const ev = s.hEv[i];
    if (ph !== an.lastPh[i] || ev !== an.lastEv[i]) {
      an.lastPh[i] = ph;
      an.lastEv[i] = ev;
      an.phaseAt[i] = an.local[i];
    }
    if (s.hHitT[i] !== an.lastHitT[i]) {
      an.lastHitT[i] = s.hHitT[i];
      an.hitAt[i] = an.local[i];
    }
    const a = an.local[i] - an.phaseAt[i];
    const sinceHit = an.local[i] - an.hitAt[i];
    const H = L.spriteH[i];
    const my = L.my[i];
    const mry = L.mry[i];
    const cx = L.cx[i];
    rs.frame[i] = F_NONE;
    rs.sx[i] = 1;
    rs.sy[i] = 1;
    rs.rot[i] = 0;
    rs.op[i] = 1;
    rs.pulse[i] = 0;
    rs.ring[i] = 0;
    rs.helm[i] = 0;
    rs.glasses[i] = 0;
    rs.sweat[i] = 0;
    rs.dizzy[i] = 0;
    rs.lock[i] = gt < s.hLock[i] ? 1 : 0;
    rs.fade[i] = gt < s.hFade[i] ? 0.45 : 1;
    // Splats.
    const sp = s.hSplat[i];
    rs.splatType[i] = s.hSplatType[i];
    rs.splat[i] = sp === SPLAT_DOWN ? 1 : sp === SPLAT_TELL ? 0.5 : 0;
    // Kick (directional nudge on the struck hole group), springs back ~90 ms.
    const ka = an.local[i] - an.kickAt[i];
    const kd = ka < 160 ? Math.exp(-ka / 35) * Math.cos(ka / 18) : 0;
    let rumble = 0;

    if (ev >= 0 && ph !== 0) {
      const k = s.lap && s.evKind[ev] === K_TENTACLE ? K_FINN : s.evKind[ev];
      const tell = s.evEmerge[ev] - s.evTell[ev];
      const U = s.evDuck[ev] - s.evEmerge[ev] + s.hExt[i];
      const into = gt - s.evEmerge[ev];
      const finnish = k === K_FINN || k === K_TWIN || k === K_HELMET || k === K_TENTACLE || k === K_SPRINTER;
      const bigH = k === K_BRUISER ? H * 1.12 : k === K_ANGLER || k === K_PUFFER ? H * 0.7 : H;
      rs.pulseKind[i] = k;
      if (ph === P_TELL) {
        const p = clamp01((gt - s.evTell[ev]) / tell);
        rs.pulse[i] = p < 0.5 ? p * 1.6 : (1 - p) * 1.6;
        rumble = wob * (k === K_BRUISER ? 4 : 2.5) * Math.sin(gt * 0.1257);
        if (k === K_ANGLER) {
          // Only the lure bulb rises and pulses (4 Hz).
          const r = 0.16 * outQuad(p);
          rs.frame[i] = F_ANGLER;
          placeImage(rs, i, boxes[F_ANGLER], cx, my + mry + (1 - r) * bigH, bigH);
          rs.sy[i] = 1 + 0.04 * Math.sin(gt * 0.0251);
        } else if (k === K_GOLDEN || k === K_BRUISER || k === K_PUFFER) {
          const r = 0.3 * outQuad(p);
          rs.frame[i] = k === K_GOLDEN ? F_GOLDEN : k === K_BRUISER ? F_BRUISER : F_PUFFER;
          placeImage(rs, i, boxes[rs.frame[i]], cx, my + mry * 0.3 + (1 - r) * bigH * 0.92, bigH);
        } else {
          // Peek: head rises to its tell height.
          const hp = H * 0.42;
          rs.frame[i] = F_PEEK;
          placeImage(rs, i, boxes[F_PEEK], cx, my + mry + 1 + (1 - outQuad(p)) * hp * 0.95, hp);
          if (k === K_HELMET) rs.helm[i] = 1;
        }
      } else if (ph === P_UP) {
        const e = into < 0 ? 0 : into;
        let rise = e < 120 ? 0.3 + 0.7 * outBack(e / 120, 1.6) : 1;
        // Squash-stretch settle on emerge: 1.12/0.90 springing to 1.
        const sq = e < 260 ? Math.exp(-e / 55) * Math.cos(e / 28) : 0;
        rs.sx[i] = 1 + 0.12 * sq * wob;
        rs.sy[i] = 1 - 0.1 * sq * wob;
        // Idle bob.
        const bob = e >= 120 ? Math.sin(gt * 0.01005) * 2 * wob : 0;
        let hx = 0;
        if (finnish && e > U * 0.8) {
          hx = 2.5 * Math.sin(gt * 0.044) * wob; // nervous glance
          rs.sweat[i] = 1;
        }
        if (k === K_BRUISER && sinceHit < 140) {
          const q = sinceHit / 140;
          rs.sy[i] = 0.82 + 0.18 * q;
          rs.sx[i] = 1.12 - 0.12 * q;
          rise = 1;
        }
        let frame = F_POP;
        let ch = bigH;
        if (k === K_GOLDEN) frame = F_GOLDEN;
        else if (k === K_ANGLER) frame = F_ANGLER;
        else if (k === K_BRUISER) frame = F_BRUISER;
        else if (k === K_PUFFER) {
          frame = s.hPuffed[i] ? F_PUFFED : F_PUFFER;
          if (s.hPuffed[i]) {
            const pa = e - Math.floor(U * 0.5);
            const g = pa < 300 ? outBack(clamp01(pa / 300), 2.2) : 1;
            ch = bigH * (1 + 0.5 * g);
            rs.rot[i] = 4 * Math.sin(gt * 0.0754) * wob;
          }
        }
        rs.frame[i] = frame;
        placeImage(rs, i, boxes[frame], cx + hx, my + mry * 0.3 + (1 - rise) * ch * 0.9 + bob, ch);
        if (k === K_HELMET && s.hHelm[i]) rs.helm[i] = 1;
        if (s.fever && finnish) rs.glasses[i] = 1;
        // QUICK ring: closes from 1.25 to 0.55 cell radius by 0.35U (never on decoys).
        if (k !== K_ANGLER && k !== K_PUFFER && k !== K_BRUISER && !s.lap) {
          const q = e / (U * QUICK_FRAC);
          if (q < 1) rs.ring[i] = L.rimW[i] * 0.5 * (1.25 - 0.7 * q);
        }
      } else if (ph === P_BONKED) {
        const grade = s.hGrade[i];
        const isAngler = k === K_ANGLER || k === K_PUFFER;
        let frame = k === K_GOLDEN ? F_GOLDEN : k === K_BRUISER ? F_BRUISER_DAZED : isAngler ? (k === K_PUFFER ? F_PUFFED : F_ANGLER) : F_DAZED;
        // Coin bubble (angler in fever): pops upward and fades.
        let sink = 0;
        if (a < 160) {
          // Bonked: squish then rebound (2 x 50 ms), while the local freeze holds the transform.
          if (isAngler) {
            const c = Math.sin((a / 180) * Math.PI * 2);
            rs.sy[i] = 1 + 0.2 * c * wob;
            rs.sx[i] = 1 - 0.1 * c * wob;
          } else if (a < 50) {
            rs.sy[i] = 0.7;
            rs.sx[i] = 1.18;
          } else if (a < 100) {
            rs.sy[i] = 1.06;
            rs.sx[i] = 0.95;
          }
        } else if (a < 320) {
          rs.dizzy[i] = isAngler ? 0 : 1;
        } else {
          const t = clamp01((a - 320) / 220);
          sink = inBack(t, 1.4);
          rs.dizzy[i] = isAngler ? 0 : 1 - t;
          if (t >= 1) frame = F_NONE;
        }
        if (grade >= G_QUICK && a < 33) rs.op[i] = 1; // flash handled by the ring gold snap
        rs.frame[i] = frame;
        if (frame !== F_NONE) {
          const ch = frame === F_DAZED ? H * 0.98 : bigH;
          placeImage(rs, i, boxes[frame], cx, my + mry * 0.3 + sink * ch * 0.95, ch);
        }
        if (grade === G_QUICK || grade === G_CRIT) {
          if (a < 140) {
            rs.ring[i] = L.rimW[i] * 0.5 * (0.55 + 0.25 * (a / 140));
            rs.ringGold[i] = 1 - a / 140;
          }
        }
      } else if (ph === P_ESCAPE) {
        const t = clamp01(a / 140);
        if (t < 1) {
          const frame = k === K_GOLDEN ? F_GOLDEN : k === K_ANGLER ? F_ANGLER : k === K_BRUISER ? F_BRUISER : k === K_PUFFER ? (s.hPuffed[i] ? F_PUFFED : F_PUFFER) : F_POP;
          rs.frame[i] = frame;
          rs.sy[i] = 1.1;
          rs.sx[i] = 0.94;
          placeImage(rs, i, boxes[frame], cx, my + mry * 0.3 + inQuad(t) * bigH * 0.95, bigH);
        }
      }
    }
    // Helmet flying off after a pop (arc, spin, gravity), on the hole's local clock.
    const ha = an.local[i] - an.helmPopAt[i];
    if (ha >= 0 && ha < 700) {
      const tt = ha / 1000;
      rs.hfx[i] = cx + an.helmDir[i] * 180 * tt;
      rs.hfy[i] = my - H * 0.95 - 520 * tt + 0.5 * 1400 * tt * tt;
      rs.hfr[i] = an.helmDir[i] * 720 * tt;
      rs.hfo[i] = 1 - clamp01((ha - 500) / 200);
    } else {
      rs.hfo[i] = 0;
    }
    rs.kx[i] = an.kickX[i] * kd * wob + rumble;
    rs.ky[i] = an.kickY[i] * kd * wob;
  }

  // Foam finger: -12deg/1.15 -> +4deg/0.95 over 60 ms, hold 90, fade 120.
  const fa = now - an.fingerAt;
  if (fa >= 0 && fa < 270) {
    const t = clamp01(fa / 60);
    const e = outCubic(t);
    rs.fingerX = an.fingerX;
    rs.fingerY = an.fingerY;
    rs.fingerRot = -12 + 16 * e + an.fingerSpin * clamp01(fa / 300) * 360;
    rs.fingerScale = 1.15 - 0.2 * e;
    rs.fingerOp = fa < 150 ? 1 : 1 - (fa - 150) / 120;
  } else {
    rs.fingerOp = 0;
  }
  rs.tick += 1;
}
