/**
 * camera.ts: trauma shake, punch zoom, directional kicks and lean.
 *
 * Trauma model (Squirrel Eiserloh): events add trauma (0..1), it decays
 * linearly, and the offset is trauma^2 * maxOffset * smooth noise, so small
 * hits barely move the camera and big moments really land. A per-event cap
 * (MAX_SHAKE_MS by default) ends any shake quickly: queue players are walking,
 * so long shakes are never allowed.
 *
 * All state is one plain struct mutated by worklets. Output fields x, y, rot
 * (radians) and zoom are read by the renderer as a transform.
 */

import { ease, springStep, type SpringConfig } from './ease';

export interface CameraConfig {
  maxOffset: number;
  maxRollRad: number;
  /** Trauma lost per second. */
  decay: number;
  /** Noise frequency (Hz) of the shake. */
  frequency: number;
  /** Hard cap for any single shake (ms). 0 = no cap (Whack v5, Boss). */
  maxShakeMs: number;
  /**
   * > 0: trauma falls linearly to zero over this many ms from the latest add
   * (Whack v5: 250 ms), instead of the fixed `decay` rate.
   */
  decayMs: number;
  /** Shake = trauma^exponent (2 = Eiserloh squared, 1 = linear). */
  exponent: number;
  /** 0..1 global multiplier (0 in reduced motion, ~0.3 while walking). */
  intensity: number;
  kickSpring: SpringConfig;
  zoomSpring: SpringConfig;
}

export const DEFAULT_CAMERA: CameraConfig = {
  maxOffset: 10,
  maxRollRad: (1.5 * Math.PI) / 180,
  decay: 1.6,
  frequency: 22,
  maxShakeMs: 120,
  decayMs: 0,
  exponent: 2,
  intensity: 1,
  kickSpring: { damping: 12, stiffness: 500, mass: 1 },
  zoomSpring: { damping: 14, stiffness: 180, mass: 0.9 },
};

export interface CameraState {
  cfg: CameraConfig;
  t: number;
  seed: number;
  trauma: number;
  shakeUntil: number;
  /** Per-shake linear decay rate (trauma/s) when cfg.decayMs > 0. */
  decayRate: number;
  dirX: number;
  dirY: number;
  /** Kick spring (directional nudge). */
  kx: number;
  kvx: number;
  ky: number;
  kvy: number;
  /** Punch zoom: keyframed in, spring out. */
  punchAmount: number;
  punchStart: number;
  punchInMs: number;
  punchRising: boolean;
  zoomSpringX: number;
  zoomSpringV: number;
  /** Persistent framing zoom (push-ins that hold, e.g. Showtime 1.03). */
  baseZoom: number;
  baseZoomTarget: number;
  /** Lean toward a point of interest (px), eased. */
  leanX: number;
  leanY: number;
  leanTargetX: number;
  leanTargetY: number;
  /** Outputs. */
  x: number;
  y: number;
  rot: number;
  zoom: number;
}

export function createCamera(cfg: Partial<CameraConfig> = {}, seed = 1): CameraState {
  'worklet';
  return {
    cfg: {
      maxOffset: cfg.maxOffset ?? DEFAULT_CAMERA.maxOffset,
      maxRollRad: cfg.maxRollRad ?? DEFAULT_CAMERA.maxRollRad,
      decay: cfg.decay ?? DEFAULT_CAMERA.decay,
      frequency: cfg.frequency ?? DEFAULT_CAMERA.frequency,
      maxShakeMs: cfg.maxShakeMs ?? DEFAULT_CAMERA.maxShakeMs,
      decayMs: cfg.decayMs ?? DEFAULT_CAMERA.decayMs,
      exponent: cfg.exponent ?? DEFAULT_CAMERA.exponent,
      intensity: cfg.intensity ?? DEFAULT_CAMERA.intensity,
      kickSpring: cfg.kickSpring ?? DEFAULT_CAMERA.kickSpring,
      zoomSpring: cfg.zoomSpring ?? DEFAULT_CAMERA.zoomSpring,
    },
    t: 0,
    seed,
    trauma: 0,
    shakeUntil: 0,
    decayRate: 0,
    dirX: 0,
    dirY: 0,
    kx: 0,
    kvx: 0,
    ky: 0,
    kvy: 0,
    punchAmount: 0,
    punchStart: -1e9,
    punchInMs: 90,
    punchRising: false,
    zoomSpringX: 0,
    zoomSpringV: 0,
    baseZoom: 1,
    baseZoomTarget: 1,
    leanX: 0,
    leanY: 0,
    leanTargetX: 0,
    leanTargetY: 0,
    x: 0,
    y: 0,
    rot: 0,
    zoom: 1,
  };
}

/** Smooth 1D value noise in [-1, 1]. */
export function hash01(seed: number, n: number): number {
  'worklet';
  let v = Math.imul((n + Math.imul(seed, 374761393)) | 0, 668265263) ^ 0x5bd1e995;
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
}

export function noise1(seed: number, x: number): number {
  'worklet';
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(seed, i) * 2 - 1;
  const b = hash01(seed, i + 1) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

/**
 * Add trauma (0..1). Optional direction biases the shake along a vector
 * (knockback), and capMs overrides the per-shake cap.
 */
export function addTrauma(cam: CameraState, amount: number, dirX = 0, dirY = 0, capMs = -1): void {
  'worklet';
  if (cam.cfg.intensity <= 0) return;
  cam.trauma = Math.min(1, cam.trauma + amount);
  const maxMs = cam.cfg.maxShakeMs > 0 ? cam.cfg.maxShakeMs : 1e9;
  const cap = capMs > 0 ? Math.min(capMs, maxMs) : maxMs;
  cam.shakeUntil = cam.t + cap;
  if (cam.cfg.decayMs > 0) cam.decayRate = cam.trauma / (cam.cfg.decayMs / 1000);
  const len = Math.sqrt(dirX * dirX + dirY * dirY);
  cam.dirX = len > 0 ? dirX / len : 0;
  cam.dirY = len > 0 ? dirY / len : 0;
}

/** Directional kick: a spring-loaded nudge (px) that snaps back. */
export function kick(cam: CameraState, dx: number, dy: number): void {
  'worklet';
  if (cam.cfg.intensity <= 0) return;
  // Impulse sized so the spring peaks near (dx, dy).
  const w = Math.sqrt(cam.cfg.kickSpring.stiffness / cam.cfg.kickSpring.mass);
  cam.kvx += dx * w * 1.2;
  cam.kvy += dy * w * 1.2;
}

/** Punch zoom: quick push to 1+amount, spring back. */
export function punchZoom(cam: CameraState, amount: number, inMs = 90): void {
  'worklet';
  if (cam.cfg.intensity <= 0) return;
  cam.punchAmount = amount;
  cam.punchStart = cam.t;
  cam.punchInMs = inMs;
  cam.punchRising = true;
}

/** Hold a framing zoom (eased), e.g. 1.03 during fever. */
export function setBaseZoom(cam: CameraState, zoom: number): void {
  'worklet';
  cam.baseZoomTarget = cam.cfg.intensity <= 0 ? 1 : zoom;
}

/** Lean toward a point (px offset), eased; 0,0 to recenter. */
export function lean(cam: CameraState, x: number, y: number): void {
  'worklet';
  cam.leanTargetX = cam.cfg.intensity <= 0 ? 0 : x;
  cam.leanTargetY = cam.cfg.intensity <= 0 ? 0 : y;
}

export function setCameraIntensity(cam: CameraState, intensity: number): void {
  'worklet';
  cam.cfg.intensity = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
  if (cam.cfg.intensity <= 0) {
    cam.trauma = 0;
    cam.baseZoomTarget = 1;
    cam.leanTargetX = 0;
    cam.leanTargetY = 0;
    cam.punchAmount = 0;
  }
}

/** Advance the camera by dt (ms, usually fx dt). Writes x, y, rot, zoom. */
export function stepCamera(cam: CameraState, dtMs: number): void {
  'worklet';
  const dt = dtMs / 1000;
  cam.t += dtMs;
  const cfg = cam.cfg;
  // Trauma decays; after the cap it collapses fast so shakes stay short.
  const rate = cfg.decayMs > 0 ? cam.decayRate : cfg.decay;
  const decay = cam.t > cam.shakeUntil ? Math.max(rate, cfg.decay) * 6 : rate;
  cam.trauma = Math.max(0, cam.trauma - decay * dt);
  const shake = (cfg.exponent === 2 ? cam.trauma * cam.trauma : Math.pow(cam.trauma, cfg.exponent)) * cfg.intensity;
  const nt = (cam.t / 1000) * cfg.frequency;
  let sx = cfg.maxOffset * shake * noise1(cam.seed, nt);
  let sy = cfg.maxOffset * shake * noise1(cam.seed + 17, nt);
  if (cam.dirX !== 0 || cam.dirY !== 0) {
    // Bias along the knockback direction: 70% along, 30% free.
    const along = cfg.maxOffset * shake * noise1(cam.seed + 31, nt);
    sx = sx * 0.3 + cam.dirX * along * 0.7;
    sy = sy * 0.3 + cam.dirY * along * 0.7;
  }
  const roll = cfg.maxRollRad * shake * noise1(cam.seed + 53, nt);

  // Kick springs.
  const ks = { x: cam.kx, v: cam.kvx };
  springStep(ks, 0, cfg.kickSpring, dt);
  cam.kx = ks.x;
  cam.kvx = ks.v;
  const ky = { x: cam.ky, v: cam.kvy };
  springStep(ky, 0, cfg.kickSpring, dt);
  cam.ky = ky.x;
  cam.kvy = ky.v;

  // Punch zoom: keyframed rise, then spring home.
  let punch = 0;
  let dtSpring = dt;
  const since = cam.t - cam.punchStart;
  if (cam.punchAmount > 0) {
    if (since < cam.punchInMs) {
      punch = cam.punchAmount * ease('outQuad', since / cam.punchInMs);
      cam.zoomSpringX = punch;
      cam.zoomSpringV = 0;
    } else {
      if (cam.punchRising) {
        // Land exactly on the peak before the spring takes it home.
        cam.punchRising = false;
        cam.zoomSpringX = cam.punchAmount;
        cam.zoomSpringV = 0;
        dtSpring = 0;
      }
      const z = { x: cam.zoomSpringX, v: cam.zoomSpringV };
      springStep(z, 0, cfg.zoomSpring, dtSpring);
      cam.zoomSpringX = z.x;
      cam.zoomSpringV = z.v;
      punch = z.x;
      if (Math.abs(z.x) < 0.0005 && Math.abs(z.v) < 0.005) cam.punchAmount = 0;
    }
  }

  // Eased framing and lean (time constant ~120ms).
  const k = 1 - Math.exp(-dt * 8);
  cam.baseZoom += (cam.baseZoomTarget - cam.baseZoom) * k;
  cam.leanX += (cam.leanTargetX - cam.leanX) * k;
  cam.leanY += (cam.leanTargetY - cam.leanY) * k;

  const i = cfg.intensity;
  cam.x = sx + cam.kx * i + cam.leanX;
  cam.y = sy + cam.ky * i + cam.leanY;
  cam.rot = roll;
  cam.zoom = cam.baseZoom + punch;
}

/**
 * Per-game camera rules from the designs. Spread into useCamera's config:
 *   useCamera({ width, height, ...CAMERA_PRESETS.whack, walking })
 */
export const CAMERA_PRESETS = {
  /** Board-only shake: maxOffset 16, 250 ms linear decay, no cap (trauma 0.45 angler / 0.55 boss hit / 0.8 defeat). */
  whack: { maxOffset: 16, decayMs: 250, maxShakeMs: 0 },
  /** Trauma squared on the arena group, 1.6/s decay, no cap; x0.3 while walking comes from `walking`. */
  boss: { maxOffset: 14, decay: 1.6, maxShakeMs: 0 },
  /** Sharky: hit trauma +0.55, short shakes. */
  sharky: { maxOffset: 12, decay: 2.2, maxShakeMs: 180 },
  /** Banana: trauma only on 3 global events; vertical kicks 2-4 fu. */
  banana: { maxOffset: 10, decay: 2.0, maxShakeMs: 200 },
  /** Line Party: 6 px / 100 ms shakes on golden and VERIFIED. */
  lineParty: { maxOffset: 6, decayMs: 100, maxShakeMs: 100, exponent: 1 },
  /** Trivia: shake only at VS, your buzz and the crown. */
  trivia: { maxOffset: 8, decay: 2.4, maxShakeMs: 160 },
  /** Rhythm Finale BIG: 5 px / 140 ms on the world group only. */
  rhythm: { maxOffset: 5, decayMs: 140, maxShakeMs: 140, exponent: 1 },
} satisfies Record<string, Partial<CameraConfig>>;
