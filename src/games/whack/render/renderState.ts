/**
 * renderState.ts: turns the sim + presentation clocks into per-hole draw
 * values, once per frame on the UI thread (design v4 8.2-8.7).
 *
 * Everything here is presentation: nothing feeds back into the sim. Motion
 * that belongs to gameplay (tell, emerge, glance, escape) reads game time, so
 * Auto Look-Up and global freezes hold it; bonk reactions, hats, kicks and
 * flashes read each hole's local fx clock, so a local hit-stop freezes only
 * the struck well.
 *
 * Acting is drawn key poses (Alex-style, pipeline art): peek -> pop (with a
 * 33 ms stretch smear) -> idle bob -> glance near the end -> duck on escape;
 * a bonk plays contact (squished, eyes shut) then one of three reactions
 * (spiral, tongue, hat knocked off). QUICK and better always knock the hat
 * off, and the hat flies as a rigid body that bounces once on the deck.
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
export const F_ANGLER_PEEK = 9;
export const F_ANGLER_ANGRY = 10;
export const F_GOLDEN_DAZED = 11;
// v4 costume key poses.
export const F_GLANCE = 12;
export const F_CONTACT = 13;
export const F_SPIRAL = 14;
export const F_TONGUE = 15;
export const F_HATOFF = 16;
export const F_DUCK = 17;
export const FRAME_COUNT = 18;

/** Frames placed by canvas width relative to the theme's pop (the key poses share its framing). */
export function isPoseFrame(f: number): boolean {
  'worklet';
  return f >= F_GLANCE && f <= F_DUCK;
}

// Rim states (7.2): the rim never lies.
export const RIM_NONE = 0;
export const RIM_SAFE = 1;
export const RIM_GOLDEN = 2;
export const RIM_HARMFUL = 3;
export const RIM_HEAVY = 4;

// Rim pulse colours per kind (index = kind).
export const PULSE_COLORS = ['#ffffff', '#ffcf3b', '#ff6b5c', '#ffffff', '#ffffff', '#7fd6ff', '#ffe46b', '#1fc8b8', '#ffcf3b'];

/** Content boxes [x0, y0, x1, y1, aspect] per frame code, filled per theme at mount. */
export type BoxTable = number[][];

export const HAT_SLOTS = 2;
export const GHOST_SLOTS = 4;

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
  /** Rim language state (RIM_*) and the "!" tab scale. */
  rim: number[];
  tab: number[];
  // QUICK ring: radius and gold tint.
  ring: number[];
  ringGold: number[];
  // Overlays.
  helm: number[];
  glasses: number[];
  dizzy: number[];
  /** White hit flash on the sprite (QUICK 2 frames, impact frames full). */
  flash: number[];
  /** Impact-frame starburst behind the sprite (0..1 scale-in, 0 = hidden). */
  impact: number[];
  /** Fever gold rim light behind the occupant. */
  rimLight: number[];
  /** Contact shadow width (px) and alpha on the water disc. */
  shadowW: number[];
  shadowOp: number[];
  /** Ripple ring radius (x, px) and alpha. */
  ripple: number[];
  rippleOp: number[];
  /** Caustics frame 0..15 (12 fps, per-well phase). */
  caustic: number[];
  // Splats: 0 none, 0.5 telegraph, 1 landed; type.
  splat: number[];
  splatType: number[];
  fade: number[];
  lock: number[];
  // Flying helmets (bucket) after a pop.
  hfx: number[];
  hfy: number[];
  hfr: number[];
  hfo: number[];
  // Flying costume hats (2 slots).
  hatX: number[];
  hatY: number[];
  hatR: number[];
  hatO: number[];
  // Foam finger.
  fingerX: number;
  fingerY: number;
  fingerRot: number;
  fingerScale: number;
  fingerOp: number;
  // HUD: combo medallion shake (tier drop) and slam (tier up).
  medShake: number;
  medSlam: number;
  // Board-wide.
  veil: number;
  fever: number;
  occupied: number;
  /** Count of hat deck bounces (the runtime turns increments into a sound + haptic). */
  hatBounces: number;
  tick: number;
  // v5 additions.
  /** Ripe Golden: studs lit (0, 2, 4, 6) and the stage-3 gold rim pulse (0..1). */
  studs: number[];
  studPulse: number[];
  /** Screen y above which the occupant is clipped (the hat-off pose's baked hat once the physics hat takes over); 0 = none. */
  clipTop: number[];
  /** Waterline foam: thickness multiplier (0 = none), half width, y, and the 12 fps step. */
  foam: number[];
  foamW: number[];
  foamY: number[];
  foamStep: number;
  /** Sunglasses rect per hole (fever, per-theme eye-line anchor). */
  glX: number[];
  glY: number[];
  glW: number[];
  /** QUICK white outline flash (2 frames). */
  outline: number[];
  /** Swing smear behind the finger on the touch-down frame (0..1 fade). */
  smear: number;
  /** Resume release ring (look-up resume touch): 0..1 progress, -1 none. */
  release: number;
  releaseX: number;
  releaseY: number;
  /** Ghost fingers (PB / Line of the Day rivals): opacity, position and colour index per slot. */
  ghostOp: number[];
  ghostX: number[];
  ghostY: number[];
  ghostC: number[];
}

/**
 * Per-theme presentation constants (v5 8.5, 8.10), measured from the
 * gate-passed art: [hatClipFrac, hatX, hatY, glassesOn, glX, glY, glW].
 *   hatClipFrac, hatX, hatY: in the hat-off pose's content box, the row
 *     above which the baked flying hat sits, and that hat's centroid.
 *   glassesOn, glX, glY, glW: sunglasses on the pop frame (eye line, centre
 *     and width as content-box fractions). Pirates (eyepatch) and space
 *     (helmet bubble) have none: their hat gets a gold sparkle instead.
 */
export const THEME_FX: Record<string, number[]> = {
  park: [0.24, 0.743, 0.123, 1, 0.47, 0.28, 0.44],
  pirates: [0.23, 0.608, 0.111, 0, 0.5, 0.3, 0.4],
  mansion: [0.26, 0.682, 0.122, 1, 0.53, 0.34, 0.34],
  space: [0.37, 0.463, 0.18, 0, 0.5, 0.3, 0.4],
  jungle: [0.19, 0.531, 0.09, 1, 0.5, 0.28, 0.4],
  backlot: [0.22, 0.731, 0.116, 1, 0.53, 0.27, 0.38],
};

function arr(v: number, n = 9): number[] {
  'worklet';
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(v);
  return a;
}

export function createRenderState(): RenderState {
  'worklet';
  return {
    frame: arr(F_NONE), ix: arr(0), iy: arr(0), iw: arr(0), ih: arr(0), px: arr(0), py: arr(0), sx: arr(1), sy: arr(1),
    rot: arr(0), op: arr(1), kx: arr(0), ky: arr(0), pulse: arr(0), pulseKind: arr(0), rim: arr(0), tab: arr(1), ring: arr(0), ringGold: arr(0),
    helm: arr(0), glasses: arr(0), dizzy: arr(0), flash: arr(0), impact: arr(0), rimLight: arr(0), shadowW: arr(0), shadowOp: arr(0),
    ripple: arr(0), rippleOp: arr(0), caustic: arr(0), splat: arr(0), splatType: arr(0), fade: arr(1), lock: arr(0),
    hfx: arr(0), hfy: arr(0), hfr: arr(0), hfo: arr(0),
    hatX: arr(0, HAT_SLOTS), hatY: arr(0, HAT_SLOTS), hatR: arr(0, HAT_SLOTS), hatO: arr(0, HAT_SLOTS),
    fingerX: 0, fingerY: 0, fingerRot: 0, fingerScale: 1, fingerOp: 0, medShake: 0, medSlam: 1, veil: 0, fever: 0, occupied: 0, hatBounces: 0, tick: 0,
    studs: arr(0), studPulse: arr(0), clipTop: arr(0), foam: arr(0), foamW: arr(0), foamY: arr(0), foamStep: 0,
    glX: arr(0), glY: arr(0), glW: arr(0), outline: arr(0), smear: 0, release: -1, releaseX: 0, releaseY: 0,
    ghostOp: arr(0, GHOST_SLOTS), ghostX: arr(0, GHOST_SLOTS), ghostY: arr(0, GHOST_SLOTS), ghostC: arr(0, GHOST_SLOTS),
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
  /** Last touch x per hole (hat launch direction). */
  tapX: number[];
  /** Reaction pose for the current bonk, and the last one per hole (no repeats). */
  react: number[];
  lastReact: number[];
  /** Flash kind for the current bonk: 0 none, 1 QUICK flash, 2 impact frame. */
  flashKind: number[];
  emergeSeen: number[];
  rippleAt: number[];
  rippleBig: number[];
  // Hat bodies (2 slots).
  hatOn: number[];
  hatHole: number[];
  hatX: number[];
  hatY: number[];
  hatVx: number[];
  hatVy: number[];
  hatR: number[];
  hatVr: number[];
  hatAge: number[];
  hatFloor: number[];
  hatBounced: number[];
  hatSlid: number[];
  hatNext: number;
  lastTier: number;
  medShakeAt: number;
  medSlamAt: number;
  fingerAt: number;
  fingerX: number;
  fingerY: number;
  fingerSpin: number;
  fxNow: number;
  veil: number;
  fever: number;
  /** v5: the physics hat launches when the hat-off pose hands over (local ms), -1 none; crit launches harder. */
  hatAt: number[];
  hatCrit: number[];
  /** Resume release ring start (fx ms). */
  releaseAt: number;
  releaseX: number;
  releaseY: number;
  ghostAt: number[];
  ghostHole: number[];
  ghostC: number[];
  ghostNext: number;
}

export function createHoleAnim(): HoleAnim {
  'worklet';
  return {
    local: arr(0), phaseAt: arr(0), lastPh: arr(0), lastEv: arr(-1), lastHitT: arr(-99999), hitAt: arr(-99999),
    helmPopAt: arr(-99999), helmDir: arr(1), kickX: arr(0), kickY: arr(0), kickAt: arr(-99999), tapX: arr(0),
    react: arr(F_SPIRAL), lastReact: arr(-1), flashKind: arr(0), emergeSeen: arr(-1), rippleAt: arr(-99999), rippleBig: arr(1),
    hatOn: arr(0, HAT_SLOTS), hatHole: arr(-1, HAT_SLOTS), hatX: arr(0, HAT_SLOTS), hatY: arr(0, HAT_SLOTS), hatVx: arr(0, HAT_SLOTS),
    hatVy: arr(0, HAT_SLOTS), hatR: arr(0, HAT_SLOTS), hatVr: arr(0, HAT_SLOTS), hatAge: arr(0, HAT_SLOTS), hatFloor: arr(0, HAT_SLOTS),
    hatBounced: arr(0, HAT_SLOTS), hatSlid: arr(0, HAT_SLOTS), hatNext: 0,
    lastTier: 0, medShakeAt: -99999, medSlamAt: -99999,
    fingerAt: -99999, fingerX: 0, fingerY: 0, fingerSpin: 0, fxNow: 0, veil: 0, fever: 0,
    hatAt: arr(-1), hatCrit: arr(0), releaseAt: -99999, releaseX: 0, releaseY: 0,
    ghostAt: arr(-99999, GHOST_SLOTS), ghostHole: arr(0, GHOST_SLOTS), ghostC: arr(0, GHOST_SLOTS), ghostNext: 0,
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
/** Small integer hash (reaction picks, hat spin). */
function hash2(a: number, b: number): number {
  'worklet';
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  return (h ^ (h >>> 12)) >>> 0;
}

/** Place an image so its content box bottom-centre sits at (bx, by) with content height ch. */
function placeImage(rs: RenderState, i: number, box: number[], bx: number, by: number, ch: number): void {
  'worklet';
  const H = ch / (box[3] - box[1]);
  const W = H * box[4];
  rs.iw[i] = W;
  rs.ih[i] = H;
  rs.ix[i] = bx - W * (box[0] + box[2]) * 0.5;
  rs.iy[i] = by - H * box[3];
  rs.px[i] = bx;
  rs.py[i] = by;
}

/**
 * Place a key pose: same canvas width as the theme's pop image (the poses
 * share its framing), content bottom on the baseline, canvas centred.
 * Returns the pose's content height.
 */
function placePose(rs: RenderState, i: number, box: number[], pop: number[], bx: number, by: number, popH: number, scale: number): number {
  'worklet';
  const popW = (popH / (pop[3] - pop[1])) * pop[4];
  const W = popW * scale;
  const H = W / box[4];
  rs.iw[i] = W;
  rs.ih[i] = H;
  rs.ix[i] = bx - W * 0.5;
  rs.iy[i] = by - H * box[3];
  rs.px[i] = bx;
  rs.py[i] = by;
  return H * (box[3] - box[1]);
}

function launchHat(an: HoleAnim, L: BoardLayout, i: number, seed: number, ox?: number, oy?: number, crit = false): void {
  'worklet';
  // At most 2 hats live: reuse the oldest slot.
  let slot = -1;
  for (let k = 0; k < HAT_SLOTS; k++) if (an.hatOn[k] === 0) { slot = k; break; }
  if (slot < 0) {
    slot = an.hatNext % HAT_SLOTS;
  }
  an.hatNext += 1;
  const H = L.spriteH[i];
  // Away from the thumb, unless the drawn pose already sent the hat one way (continuity wins).
  let dir = an.tapX[i] <= L.cx[i] ? 1 : -1;
  if (ox !== undefined && Math.abs(ox - L.cx[i]) > H * 0.06) dir = ox > L.cx[i] ? 1 : -1;
  const r = hash2(seed, i + an.hatNext * 31);
  const boost = crit ? 1.4 : 1;
  an.hatOn[slot] = 1;
  an.hatHole[slot] = i;
  an.hatX[slot] = ox ?? L.cx[i] + dir * H * 0.08;
  an.hatY[slot] = oy ?? L.my[i] - H * 0.86;
  an.hatVx[slot] = dir * (120 + (r % 100)) * boost;
  an.hatVy[slot] = -480 * boost;
  an.hatR[slot] = 0;
  // A crit adds a full extra spin.
  an.hatVr[slot] = (r & 1 ? 1 : -1) * (540 + (crit ? 360 : 0));
  an.hatAge[slot] = 0;
  an.hatFloor[slot] = L.rimY[i] + L.rimH[i] * 0.98;
  an.hatBounced[slot] = 0;
  an.hatSlid[slot] = 0;
}

/**
 * Advance per-hole local clocks (dtLocal already honours local stops) and
 * compute every draw value. `boxes` indexes by frame code; `poseScale` is a
 * per-frame size multiplier for the key poses (art framing differences).
 */
export function computeRender(rs: RenderState, an: HoleAnim, s: WhackSim, L: BoardLayout, boxes: BoxTable,
  dtFx: number, localDt: number[], reducedMotion: boolean, poseScale?: number[], tfx?: number[]): void {
  'worklet';
  an.fxNow += dtFx;
  const now = an.fxNow;
  const gt = s.t;
  const wob = reducedMotion ? 0 : 1;
  const dt = dtFx > 0 ? dtFx : 0;
  // Veil (Auto Look-Up) and fever ease on fx time.
  an.veil += ((s.frozen ? 1 : 0) - an.veil) * clamp01((dt > 0 ? dt : 16) / 150);
  an.fever += ((s.fever ? 1 : 0) - an.fever) * clamp01((dt > 0 ? dt : 16) / 300);
  rs.veil = an.veil;
  rs.fever = an.fever;
  // Medallion: slam on tier-up, shake on a tier drop (engaged escape at x2+).
  if (s.tier > an.lastTier) an.medSlamAt = now;
  else if (s.tier < an.lastTier && s.streak > 0) an.medShakeAt = now;
  an.lastTier = s.tier;
  const ms = now - an.medShakeAt;
  rs.medShake = ms < 120 ? 5 * Math.sin(ms * 0.21) * (1 - ms / 120) * wob : 0;
  const sl = now - an.medSlamAt;
  rs.medSlam = sl < 120 ? 0.3 + outBack(sl / 120, 2.2) * 0.7 : 1;
  const popBox = boxes[F_POP];
  let occupied = 0;
  // Hand-drawn FX step on twos (12 fps): the foam line re-picks its wiggle every 83 ms.
  rs.foamStep = Math.floor(now / 83.3);

  for (let i = 0; i < 9; i++) {
    an.local[i] += localDt[i];
    const ph = s.hPh[i];
    const ev = s.hEv[i];
    const newPhase = ph !== an.lastPh[i] || ev !== an.lastEv[i];
    if (newPhase) {
      an.lastPh[i] = ph;
      an.lastEv[i] = ev;
      an.phaseAt[i] = an.local[i];
      if (ph === P_BONKED && ev >= 0) {
        const k0 = s.evKind[ev];
        const g = s.hGrade[i];
        const finnish0 = k0 === K_FINN || k0 === K_TWIN || k0 === K_HELMET || k0 === K_TENTACLE || k0 === K_SPRINTER;
        an.flashKind[i] = k0 === K_GOLDEN || g === G_CRIT ? 2 : g === G_QUICK ? 1 : 0;
        if (finnish0) {
          if (g >= G_QUICK) {
            // The hat-off pose draws the hat flying; the physics hat takes over from that drawn
            // hat when the pose sinks (never two hats on screen at once).
            an.react[i] = F_HATOFF;
            an.hatAt[i] = an.local[i] + 210;
            an.hatCrit[i] = g === G_CRIT ? 1 : 0;
          } else {
            let pickR = hash2(s.seed, ev) % 2 === 0 ? F_SPIRAL : F_TONGUE;
            if (pickR === an.lastReact[i]) pickR = pickR === F_SPIRAL ? F_TONGUE : F_SPIRAL;
            an.react[i] = pickR;
          }
          an.lastReact[i] = an.react[i];
        }
      }
      if (ph === P_ESCAPE) {
        an.rippleAt[i] = an.local[i];
        an.rippleBig[i] = 0;
      }
    }
    if (ph === P_UP && an.emergeSeen[i] !== ev) {
      an.emergeSeen[i] = ev;
      an.rippleAt[i] = an.local[i];
      an.rippleBig[i] = 1;
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
    const base = my + mry * 0.3;
    rs.frame[i] = F_NONE;
    rs.sx[i] = 1;
    rs.sy[i] = 1;
    rs.rot[i] = 0;
    rs.op[i] = 1;
    rs.pulse[i] = 0;
    rs.ring[i] = 0;
    rs.ringGold[i] = 0;
    rs.helm[i] = 0;
    rs.glasses[i] = 0;
    rs.dizzy[i] = 0;
    rs.flash[i] = 0;
    rs.impact[i] = 0;
    rs.outline[i] = 0;
    rs.studs[i] = 0;
    rs.studPulse[i] = 0;
    rs.clipTop[i] = 0;
    rs.foam[i] = 0;
    rs.rim[i] = RIM_NONE;
    rs.tab[i] = 1;
    rs.shadowOp[i] = 0;
    rs.lock[i] = gt < s.hLock[i] ? 1 : 0;
    rs.fade[i] = gt < s.hFade[i] ? 0.45 : 1;
    rs.caustic[i] = Math.floor((now / 83.3 + i * 5)) % 16;
    // Splats.
    const sp = s.hSplat[i];
    rs.splatType[i] = s.hSplatType[i];
    rs.splat[i] = sp === SPLAT_DOWN ? 1 : sp === SPLAT_TELL ? 0.5 : 0;
    // Kick (directional nudge on the struck well), springs back over about 90 ms.
    const ka = an.local[i] - an.kickAt[i];
    const kd = ka < 160 ? Math.exp(-ka / 35) * Math.cos(ka / 18) : 0;
    let rumble = 0;
    let rise = 0;

    if (ev >= 0 && ph !== 0) {
      const k = s.lap && s.evKind[ev] === K_TENTACLE ? K_FINN : s.evKind[ev];
      const tell = s.evEmerge[ev] - s.evTell[ev];
      const U = s.evDuck[ev] - s.evEmerge[ev] + s.hExt[i];
      const into = gt - s.evEmerge[ev];
      const finnish = k === K_FINN || k === K_TWIN || k === K_HELMET || k === K_TENTACLE || k === K_SPRINTER;
      const harmful = k === K_ANGLER || k === K_PUFFER;
      const bigH = k === K_BRUISER ? H * 1.12 : harmful ? H * 0.7 : H;
      rs.pulseKind[i] = k;
      // The rim never lies: harmful wells keep their teeth and "!" tab on every frame of the target's life.
      // (Its life ends when it ducks: an escaped target leaves a plain well.)
      const alive = ph === P_TELL || ph === P_UP || (ph === P_BONKED && a < 430) || (ph === P_ESCAPE && a < 140);
      rs.rim[i] = !alive ? RIM_NONE : harmful ? RIM_HARMFUL : k === K_GOLDEN ? RIM_GOLDEN : k === K_BRUISER ? RIM_HEAVY : RIM_SAFE;
      if (harmful) rs.tab[i] = 1 + 0.15 * (0.5 + 0.5 * Math.sin(now * 0.02513)) * wob;
      if (ph === P_TELL || ph === P_UP) occupied += 1;
      if (ph === P_TELL) {
        const p = clamp01((gt - s.evTell[ev]) / tell);
        rs.pulse[i] = p < 0.5 ? p * 1.6 : (1 - p) * 1.6;
        // Rumble by kind: Finn 20 Hz, harmful 8 Hz (a slow wobble), heavy 20 Hz big, golden none (glint).
        if (harmful) rumble = wob * 2 * Math.sin(gt * 0.05027);
        else if (k === K_BRUISER) rumble = wob * 4 * Math.sin(gt * 0.1257);
        else if (k !== K_GOLDEN) rumble = wob * 2.5 * Math.sin(gt * 0.1257);
        if (k === K_ANGLER) {
          // Only the lure bulb and stalk rise (the lure-only frame).
          const lh = bigH * 0.62;
          const r = 0.7 * outQuad(p);
          rs.frame[i] = F_ANGLER_PEEK;
          placeImage(rs, i, boxes[F_ANGLER_PEEK], cx, my + mry + (1 - r) * lh, lh);
          rs.sy[i] = 1 + 0.05 * Math.sin(gt * 0.0251);
        } else if (k === K_GOLDEN || k === K_BRUISER || k === K_PUFFER) {
          const r = 0.3 * outQuad(p);
          rise = r;
          rs.frame[i] = k === K_GOLDEN ? F_GOLDEN : k === K_BRUISER ? F_BRUISER : F_PUFFER;
          placeImage(rs, i, boxes[rs.frame[i]], cx, base + (1 - r) * bigH * 0.92, bigH);
        } else {
          // Peek: the head rises to its tell height.
          const hp = H * 0.42;
          rise = 0.3 * outQuad(p);
          rs.frame[i] = F_PEEK;
          placeImage(rs, i, boxes[F_PEEK], cx, my + mry + 1 + (1 - outQuad(p)) * hp * 0.95, hp);
          if (k === K_HELMET) rs.helm[i] = 1;
        }
      } else if (ph === P_UP) {
        const e = into < 0 ? 0 : into;
        rise = e < 120 ? 0.3 + 0.7 * outBack(e / 120, 1.6) : 1;
        // Squash-stretch settle after the pop: 1.12/0.90 springing to 1.
        const sq = e < 260 ? Math.exp(-e / 55) * Math.cos(e / 28) : 0;
        rs.sx[i] = 1 + 0.12 * sq * wob;
        rs.sy[i] = 1 - 0.1 * sq * wob;
        // Motion language (v5 6.4): friendly targets bob (vertical, 1.6 Hz); decoys sway (lateral, 1.2 Hz).
        const bob = e >= 120 && !harmful ? Math.sin(gt * 0.01005) * 2 * wob : 0;
        if (harmful && k === K_ANGLER) rs.rot[i] = 3 * Math.sin(gt * 0.00754) * wob;
        const ugR = s.evUg[ev];
        if (k === K_GOLDEN && ugR > 0) {
          // Ripe Golden: studs light 2, 4, 6 as it ripens; stage 3 pulses the rim gold and glances around.
          const st3 = s.hStage[i];
          rs.studs[i] = 2 + 2 * st3;
          if (st3 >= 2) {
            rs.studPulse[i] = 0.5 + 0.5 * Math.sin(now * 0.0262);
            if (wob && Math.floor(gt / 380) % 2 === 1) rs.sx[i] = -rs.sx[i];
          }
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
        } else if (finnish) {
          if (e < 33 && wob) {
            // Smear: the peek stretched 1.12 tall for two frames, then the pop snaps in.
            frame = F_PEEK;
            ch = H * 0.5;
            rs.sy[i] = 1.12;
          } else if (e > U * 0.8) {
            frame = F_GLANCE;
          }
        }
        rs.frame[i] = frame;
        const y = base + (1 - rise) * ch * 0.9 + bob;
        if (isPoseFrame(frame)) placePose(rs, i, boxes[frame], popBox, cx, y, ch, poseScale ? poseScale[frame] : 1);
        else placeImage(rs, i, boxes[frame], cx, y, ch);
        if (k === K_HELMET && s.hHelm[i]) rs.helm[i] = 1;
        // Sunglasses sit on the eye line of each costume (per-theme anchor); never on an eyepatch or visor.
        if (s.fever && finnish && frame === F_POP && tfx && tfx[3] > 0) {
          const bx = boxes[F_POP];
          const cw = rs.iw[i] * (bx[2] - bx[0]);
          const chh = rs.ih[i] * (bx[3] - bx[1]);
          rs.glasses[i] = 1;
          rs.glW[i] = cw * tfx[6];
          rs.glX[i] = rs.ix[i] + rs.iw[i] * bx[0] + cw * tfx[4];
          rs.glY[i] = rs.iy[i] + rs.ih[i] * bx[1] + chh * tfx[5];
        }
        // Waterline foam where the occupant meets the water (thicker for 120 ms on the pop).
        rs.foam[i] = e < 120 ? 1.5 : 1;
        // QUICK ring: closes from 1.25 to 0.55 cell between the pop and 0.35U, gold for its last 40% (never on decoys or a Ripe Golden).
        if (!harmful && k !== K_BRUISER && !s.lap && !(k === K_GOLDEN && s.evUg[ev] > 0)) {
          const q = e / (U * QUICK_FRAC);
          if (q < 1) {
            rs.ring[i] = L.rimW[i] * 0.5 * (1.25 - 0.7 * q);
            rs.ringGold[i] = q > 0.6 ? 1 : 0;
          }
        }
      } else if (ph === P_BONKED) {
        const grade = s.hGrade[i];
        const isAngler = harmful;
        const fk = an.flashKind[i];
        // White flash for 2 displayed frames (QUICK) / 33 ms impact frame (crit, golden).
        if (fk === 2 && a < 33) {
          rs.flash[i] = 1;
          rs.impact[i] = 0.6 + 0.4 * (a / 33);
        } else if (fk >= 1 && a < 33) {
          rs.flash[i] = 0.55;
          rs.outline[i] = 1;
        }
        if (a < 120) rs.foam[i] = 1.5;
        if (finnish) {
          // contact (50 ms, held by the local freeze) -> reaction hold 160 ms -> 220 ms sink.
          let frame = F_CONTACT;
          let sink = 0;
          if (a >= 50) frame = an.react[i];
          if (a >= 210) sink = inBack(clamp01((a - 210) / 220), 1.4);
          if (a >= 430) frame = F_NONE;
          rs.frame[i] = frame;
          rise = 1 - sink;
          if (frame === F_HATOFF && an.hatAt[i] >= 0 && an.local[i] >= an.hatAt[i]) {
            // Hand the drawn hat to the physics hat: launch from the baked hat, clip it off the sinking pose.
            const hb = boxes[F_HATOFF];
            const ph0 = placePose(rs, i, hb, popBox, cx, base, H, poseScale ? poseScale[F_HATOFF] : 1);
            const top = rs.iy[i] + rs.ih[i] * hb[1];
            const left = rs.ix[i] + rs.iw[i] * hb[0];
            const cw = rs.iw[i] * (hb[2] - hb[0]);
            const clipF = tfx ? tfx[0] : 0.24;
            an.hatAt[i] = -2 - (top + ph0 * clipF); // remember the clip line (encoded, < -1)
            launchHat(an, L, i, s.seed + ev, left + cw * (tfx ? tfx[1] : 0.6), top + ph0 * (tfx ? tfx[2] : 0.12), an.hatCrit[i] === 1);
          }
          if (frame === F_HATOFF && an.hatAt[i] < -1) rs.clipTop[i] = -2 - an.hatAt[i];
          if (frame !== F_NONE) {
            if (frame === F_CONTACT) {
              rs.sx[i] = 1 + 0.06 * wob;
              rs.sy[i] = 1 - 0.05 * wob;
            } else if (a < 110) {
              const q = (a - 50) / 60;
              rs.sy[i] = 1 + 0.08 * Math.sin(q * Math.PI) * wob;
            }
            const ph2 = placePose(rs, i, boxes[frame], popBox, cx, base, H, poseScale ? poseScale[frame] : 1);
            rs.iy[i] += sink * ph2 * 0.95;
            rs.py[i] += sink * ph2 * 0.95;
          }
        } else {
          let frame = k === K_GOLDEN ? F_GOLDEN_DAZED : k === K_BRUISER ? F_BRUISER_DAZED : isAngler ? (k === K_PUFFER ? F_PUFFED : F_ANGLER_ANGRY) : F_DAZED;
          let sink = 0;
          if (a < 160) {
            if (isAngler) {
              const c = Math.sin((a / 180) * Math.PI * 2);
              rs.sy[i] = 1 + 0.2 * c * wob;
              rs.sx[i] = 1 - 0.1 * c * wob;
            } else if (a < 50) {
              rs.sy[i] = 0.72;
              rs.sx[i] = 1.16;
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
          rise = 1 - sink;
          rs.frame[i] = frame;
          if (frame !== F_NONE) placeImage(rs, i, boxes[frame], cx, base + sink * bigH * 0.95, bigH);
        }
        if (grade === G_QUICK || grade === G_CRIT) {
          if (a < 140) {
            rs.ring[i] = L.rimW[i] * 0.5 * (0.55 + 0.25 * (a / 140));
            rs.ringGold[i] = 1;
          }
        }
      } else if (ph === P_ESCAPE) {
        // A Ripe Golden bolts: a 90 ms duck instead of 140.
        const t = clamp01(a / (k === K_GOLDEN && s.evUg[ev] > 0 ? 90 : 140));
        if (t < 1) rs.foam[i] = 1.5;
        if (t < 1) {
          const frame = finnish ? F_DUCK : k === K_GOLDEN ? F_GOLDEN : k === K_ANGLER ? F_ANGLER : k === K_BRUISER ? F_BRUISER : k === K_PUFFER ? (s.hPuffed[i] ? F_PUFFED : F_PUFFER) : F_POP;
          rs.frame[i] = frame;
          rise = 1 - inQuad(t);
          if (isPoseFrame(frame)) {
            const ph2 = placePose(rs, i, boxes[frame], popBox, cx, base, H, poseScale ? poseScale[frame] : 1);
            rs.iy[i] += inQuad(t) * ph2 * 0.95;
            rs.py[i] += inQuad(t) * ph2 * 0.95;
          } else {
            rs.sy[i] = 1.1;
            rs.sx[i] = 0.94;
            placeImage(rs, i, boxes[frame], cx, base + inQuad(t) * bigH * 0.95, bigH);
          }
        }
      }
      if (rs.frame[i] !== F_NONE && an.fever > 0.01 && !harmful) rs.rimLight[i] = an.fever * 0.7;
      else rs.rimLight[i] = 0;
      // Foam line width follows the occupant's silhouette at the waterline (content box width).
      if (rs.foam[i] > 0 && rs.frame[i] !== F_NONE) {
        const fb = boxes[rs.frame[i]];
        const cwid = rs.iw[i] * (fb[2] - fb[0]) * Math.abs(rs.sx[i]);
        rs.foamW[i] = Math.min(cwid * 0.42, L.mrx[i] * 0.92);
        rs.foamY[i] = my + mry * 0.05;
      } else {
        rs.foam[i] = 0;
      }
    } else {
      rs.rimLight[i] = 0;
    }
    // Contact shadow on the water disc grows with the rise (0.3 -> 0.7 cell).
    if (rs.frame[i] !== F_NONE && rise > 0) {
      rs.shadowW[i] = L.cellW * (0.3 + 0.4 * clamp01(rise));
      rs.shadowOp[i] = 0.22 + 0.1 * clamp01(rise);
    }
    // Ripple: 0.1 -> 0.45 cell over 300 ms on emerge, smaller on a duck.
    const ra = an.local[i] - an.rippleAt[i];
    if (ra >= 0 && ra < 300) {
      const q = ra / 300;
      const big = an.rippleBig[i] ? 1 : 0.6;
      rs.ripple[i] = L.cellW * (0.1 + 0.35 * outQuad(q)) * big;
      rs.rippleOp[i] = (1 - q) * 0.8;
    } else {
      rs.rippleOp[i] = 0;
    }
    // Bucket helmet flying off after a pop (arc, spin, gravity), on the hole's local clock.
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
  rs.occupied = occupied;

  // Costume hats: rigid bodies on the struck well's local clock (a hit-stop freezes them with it).
  for (let k = 0; k < HAT_SLOTS; k++) {
    if (an.hatOn[k] === 0) {
      rs.hatO[k] = 0;
      continue;
    }
    const hole = an.hatHole[k];
    const step = (hole >= 0 ? localDt[hole] : dt) / 1000;
    an.hatAge[k] += step * 1000;
    if (an.hatBounced[k] < 2) {
      an.hatVy[k] += 1400 * step;
      an.hatX[k] += an.hatVx[k] * step;
      an.hatY[k] += an.hatVy[k] * step;
      an.hatR[k] += an.hatVr[k] * step;
      if (an.hatVy[k] > 0 && an.hatY[k] >= an.hatFloor[k]) {
        an.hatY[k] = an.hatFloor[k];
        if (an.hatBounced[k] === 0) {
          an.hatBounced[k] = 1;
          an.hatVy[k] = -an.hatVy[k] * 0.4;
          an.hatVr[k] *= 0.5;
          rs.hatBounces += 1;
        } else {
          an.hatBounced[k] = 2;
          an.hatVy[k] = 0;
        }
      }
    } else if (an.hatSlid[k] < 20) {
      // Slide up to 20pt with friction, spin settling.
      const v = an.hatVx[k] * 0.45;
      const dx = v * step;
      an.hatSlid[k] += Math.abs(dx);
      an.hatX[k] += dx;
      an.hatVx[k] *= 0.9;
      an.hatVr[k] *= 0.85;
      an.hatR[k] += an.hatVr[k] * step;
    }
    rs.hatX[k] = an.hatX[k];
    rs.hatY[k] = an.hatY[k];
    rs.hatR[k] = an.hatR[k];
    const age = an.hatAge[k];
    rs.hatO[k] = age < 900 ? 1 : 1 - clamp01((age - 900) / 200);
    if (age >= 1100) an.hatOn[k] = 0;
  }

  // Foam finger (v5 8.6): front-loaded impact. On the touch-down frame it is already in its
  // contact pose (+4 deg, pressed on the head) with the swing smear behind it; nothing travels in.
  // Recovery only: hold 90 ms, lift -8 deg and 6pt over 120 ms, fade over 120 ms.
  const fa = now - an.fingerAt;
  if (fa >= 0 && fa < 330) {
    rs.fingerX = an.fingerX;
    const lift = fa < 90 ? 0 : outQuad(clamp01((fa - 90) / 120));
    rs.fingerY = an.fingerY - 6 * lift;
    rs.fingerRot = 4 - 12 * lift + an.fingerSpin * clamp01(fa / 300) * 360;
    rs.fingerScale = 1;
    rs.fingerOp = fa < 210 ? 1 : 1 - (fa - 210) / 120;
    rs.smear = fa < 90 ? 1 - fa / 90 : 0;
  } else {
    rs.fingerOp = 0;
    rs.smear = 0;
  }
  // Look-up resume: a soft release ring where the touch landed (it never bonks).
  const ra2 = now - an.releaseAt;
  if (ra2 >= 0 && ra2 < 260) {
    rs.release = ra2 / 260;
    rs.releaseX = an.releaseX;
    rs.releaseY = an.releaseY;
  } else {
    rs.release = -1;
  }
  // Ghost fingers: a translucent tinted foam finger pressed on the well, held 160 ms (on twos), then fading.
  for (let k = 0; k < GHOST_SLOTS; k++) {
    const ga = now - an.ghostAt[k];
    if (ga >= 0 && ga < 280) {
      const h = an.ghostHole[k];
      rs.ghostOp[k] = ga < 160 ? 0.55 : 0.55 * (1 - (ga - 160) / 120);
      rs.ghostX[k] = L.cx[h] + (k % 2 === 0 ? -6 : 6);
      rs.ghostY[k] = L.my[h] - L.spriteH[h] * 0.75 - L.cellW * 0.05 * Math.floor(ga / 83);
      rs.ghostC[k] = an.ghostC[k];
    } else {
      rs.ghostOp[k] = 0;
    }
  }
  rs.tick += 1;
}
