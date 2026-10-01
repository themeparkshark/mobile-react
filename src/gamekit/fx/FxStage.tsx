/**
 * FxStage.tsx: the studio FX layer. One Skia canvas that draws:
 *   - every particle in ONE <Atlas> call (sprites from the shared FX atlas)
 *   - score fly-ups in the Shark font (outlined, pooled, popped and risen)
 *   - a capped full-screen flash, a localized bloom, and an edge-glow vignette
 *
 * Simulation runs on the UI thread in useFrameCallback, scaled by an optional
 * fx time-scale SharedValue (so a hit-stop really freezes the FX) and paused
 * by `paused`. Zero React renders per frame.
 *
 *   const fx = useRef<FxStageHandle>(null);
 *   <FxStage ref={fx} width={W} height={H} timeScale={clock.fxScale} />
 *   fx.current?.burst('stars', x, y);
 *   fx.current?.flyUp('+100', x, y, { size: 'md' });
 *   fx.current?.flash({ peak: 0.3 });
 *
 * Worklet access (emit from your own UI-thread game loop):
 *   const s = fx.current.state; // SharedValue<FxState>
 *   emit(s.value.pool, EMITTERS.stars, x, y);   // from core/particles
 *   fxFlyUpUI(s.value, '+100', x, y, 1, 0xffffffff);
 */

import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  Atlas,
  Canvas,
  Circle,
  Group,
  RadialGradient,
  Rect,
  Shader,
  Text as SkText,
  useColorBuffer,
  useFont,
  useRSXformBuffer,
  useRectBuffer,
  vec,
  type SkFont,
  type SkImage,
} from '@shopify/react-native-skia';
import {
  runOnJS,
  runOnUI,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  clearParticles,
  createParticlePool,
  emit,
  EMITTERS,
  packHex,
  particleAlpha,
  particleSize,
  particleSprite,
  particleTwosRot,
  particleTwosScale,
  stepParticles,
  takeArrivals,
  type EmitParams,
  type EmitterDef,
  type EmitterName,
  type ParticlePool,
} from '../core/particles';
import { FX_CELL, FX_COLS, useFxAtlas } from './FxAtlas';
import { Shaders, rgba } from './shaders';
import { flyToPose } from '../core/scoreFx';

const TEXT_SLOTS = 8;
const FLY_FONT_PX = 32;

export interface FxState {
  pool: ParticlePool;
  t: number;
  // Flash (full-screen, capped).
  flashT: number;
  flashDur: number;
  flashPeak: number;
  flashColor: number[];
  // Bloom (localized radial light).
  bloomT: number;
  bloomDur: number;
  bloomPeak: number;
  bloomX: number;
  bloomY: number;
  bloomR: number;
  bloomColor: string;
  // Edge-glow vignette.
  vigT: number;
  vigIn: number;
  vigHold: number;
  vigOut: number;
  vigPeak: number;
  vigColor: number[];
  // Fly-up text slots.
  txtAlive: number[];
  txtStr: string[];
  txtX: number[];
  txtY: number[];
  txtW: number[];
  txtT: number[];
  txtDur: number[];
  txtScale: number[];
  txtRise: number[];
  txtColor: string[];
  /** Optional key: a new fly-up with the same key replaces the live one. */
  txtKey: string[];
  /** Fly-to-score (Whack v5): target (txtTo 1), hold and travel ms, tilt (rad), overshoot. */
  txtTo: number[];
  txtTx: number[];
  txtTy: number[];
  txtHold: number[];
  txtTravel: number[];
  txtTilt: number[];
  txtOver: number[];
  /** Fly-ups that reached their target since the last read (the score digit-roll trigger). */
  flyArrivals: number;
  txtNext: number;
  /** Reduced motion: fewer particles, softer flashes. */
  reduced: boolean;
  /** Global cap for flash alpha (reading surfaces stay legible). */
  flashCap: number;
  /** Stage width: fly-ups are clamped to stay fully on screen. */
  viewW: number;
}

export function createFxState(cap: number, layerBudget?: number[]): FxState {
  'worklet';
  const n = TEXT_SLOTS;
  const a0: number[] = [];
  const s0: string[] = [];
  for (let i = 0; i < n; i++) {
    a0.push(0);
    s0.push('');
  }
  return {
    pool: createParticlePool(cap, 97, layerBudget),
    t: 0,
    flashT: -1e9, flashDur: 0, flashPeak: 0, flashColor: [1, 1, 1, 1],
    bloomT: -1e9, bloomDur: 0, bloomPeak: 0, bloomX: 0, bloomY: 0, bloomR: 100, bloomColor: '#ffffff',
    vigT: -1e9, vigIn: 0, vigHold: 0, vigOut: 0, vigPeak: 0, vigColor: [1, 0.81, 0.23, 1],
    txtAlive: a0.slice(), txtStr: s0.slice(), txtX: a0.slice(), txtY: a0.slice(), txtW: a0.slice(),
    txtT: a0.slice(), txtDur: a0.slice(), txtScale: a0.slice(), txtRise: a0.slice(), txtColor: s0.slice(), txtKey: s0.slice(),
    txtTo: a0.slice(), txtTx: a0.slice(), txtTy: a0.slice(), txtHold: a0.slice(), txtTravel: a0.slice(),
    txtTilt: a0.slice(), txtOver: a0.slice(), flyArrivals: 0,
    txtNext: 0,
    reduced: false,
    flashCap: 0.6,
    viewW: 0,
  };
}

// ---------------------------------------------------------------------------
// Worklet-side API (usable from a game's own UI-thread loop)
// ---------------------------------------------------------------------------

export function fxEmitUI(s: FxState, def: EmitterDef, x: number, y: number, p: EmitParams = {}): number {
  'worklet';
  if (s.reduced) {
    const base = p.count !== undefined ? p.count : Math.round((def.count[0] + def.count[1]) / 2);
    const count = Math.max(1, Math.min(6, Math.round(base * 0.3)));
    return emit(s.pool, def, x, y, { ...p, count });
  }
  return emit(s.pool, def, x, y, p);
}

export function fxFlyUpUI(
  s: FxState, text: string, x: number, y: number, scale: number, color: string,
  width = -1, rise = 48, durMs = 520, key = '',
): number {
  'worklet';
  let i = -1;
  if (key !== '') {
    for (let k = 0; k < TEXT_SLOTS; k++) if (s.txtAlive[k] === 1 && s.txtKey[k] === key) i = k;
  }
  if (i < 0) {
    i = s.txtNext;
    s.txtNext = (i + 1) % TEXT_SLOTS;
  }
  s.txtKey[i] = key;
  s.txtAlive[i] = 1;
  s.txtStr[i] = text;
  s.txtW[i] = width > 0 ? width : text.length * FLY_FONT_PX * 0.52;
  // Keep the whole label on screen (edge holes, wide tallies).
  const half = (s.txtW[i] * scale * 1.15) / 2 + 8;
  s.txtX[i] = s.viewW > 0 ? Math.max(half, Math.min(s.viewW - half, x)) : x;
  s.txtY[i] = y;
  s.txtT[i] = s.t;
  s.txtDur[i] = durMs;
  s.txtScale[i] = scale;
  s.txtRise[i] = s.reduced ? rise * 0.5 : rise;
  s.txtColor[i] = color;
  s.txtTo[i] = 0;
  return i;
}

/**
 * Fly-to-score (Whack v5): pop to `overshoot` (1.3) with a tilt (+/-6 deg),
 * hold `holdMs` (250), then curve to (tx, ty) over `travelMs` (350) while
 * shrinking. Arrival bumps `flyArrivals` (FxStage calls onFlyUpArrive), which
 * is the cue for the header score's digit roll.
 */
export function fxFlyToUI(
  s: FxState, text: string, x: number, y: number, scale: number, color: string, width: number,
  tx: number, ty: number, holdMs = 250, travelMs = 350, tiltDeg = 6, overshoot = 1.3, key = '',
): void {
  'worklet';
  const i = fxFlyUpUI(s, text, x, y, scale, color, width, 0, 140 + holdMs + travelMs, key);
  s.txtTo[i] = 1;
  s.txtTx[i] = tx;
  s.txtTy[i] = ty;
  s.txtHold[i] = holdMs;
  s.txtTravel[i] = s.reduced ? Math.min(travelMs, 200) : travelMs;
  // Alternate the tilt sign so consecutive fly-ups lean apart.
  const sign = (s.txtNext & 1) === 0 ? 1 : -1;
  s.txtTilt[i] = s.reduced ? 0 : (sign * tiltDeg * Math.PI) / 180;
  s.txtOver[i] = s.reduced ? 1 : overshoot;
}



export function fxFlashUI(s: FxState, color: number[], peak: number, durMs: number): void {
  'worklet';
  s.flashT = s.t;
  s.flashDur = durMs;
  s.flashPeak = Math.min(peak, s.reduced ? 0.15 : s.flashCap);
  s.flashColor = color;
}

export function fxBloomUI(s: FxState, x: number, y: number, radius: number, color: string, peak: number, durMs: number): void {
  'worklet';
  s.bloomT = s.t;
  s.bloomDur = durMs;
  s.bloomPeak = s.reduced ? peak * 0.4 : peak;
  s.bloomX = x;
  s.bloomY = y;
  s.bloomR = radius;
  s.bloomColor = color;
}

export function fxVignetteUI(s: FxState, color: number[], peak: number, inMs: number, holdMs: number, outMs: number): void {
  'worklet';
  s.vigT = s.t;
  s.vigIn = inMs;
  s.vigHold = holdMs;
  s.vigOut = outMs;
  s.vigPeak = peak;
  s.vigColor = color;
}

function envelope(t: number, inMs: number, holdMs: number, outMs: number): number {
  'worklet';
  if (t < 0) return 0;
  if (t < inMs) return inMs > 0 ? t / inMs : 1;
  if (t < inMs + holdMs) return 1;
  const r = t - inMs - holdMs;
  if (r < outMs) return 1 - r / outMs;
  return 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FlyUpOptions {
  color?: string;
  /** sm 20pt, md 26pt, lg 30pt, xl 40pt (the design docs' tiers). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  rise?: number;
  ms?: number;
  /** Replace the live fly-up with the same key (running tallies, one per hole). */
  key?: string;
  /** Fly to the score (Whack v5): overshoot, tilt, hold, then curve here. */
  to?: { x: number; y: number };
  holdMs?: number;
  travelMs?: number;
  tiltDeg?: number;
  overshoot?: number;
}

export interface FxStageHandle {
  burst: (name: EmitterName, x: number, y: number, params?: EmitParams) => void;
  emitDef: (def: EmitterDef, x: number, y: number, params?: EmitParams) => void;
  /** Expanding outlined ring (shockwave read), `to` = end radius px. */
  ring: (x: number, y: number, opts?: { color?: string; from?: number; to?: number; ms?: number }) => void;
  flash: (opts?: { color?: string; peak?: number; ms?: number }) => void;
  bloom: (x: number, y: number, opts?: { color?: string; radius?: number; peak?: number; ms?: number }) => void;
  vignette: (opts: { color?: string; peak?: number; inMs?: number; holdMs?: number; outMs?: number }) => void;
  flyUp: (text: string, x: number, y: number, opts?: FlyUpOptions) => void;
  clear: () => void;
  state: SharedValue<FxState>;
}

export interface FxStageProps {
  width: number;
  height: number;
  /** Particle capacity (theme MAX_PARTICLES by default: 200). */
  capacity?: number;
  /** Per-layer budgets [game, party, celebration]. */
  layerBudget?: number[];
  /** FX time scale (hit-stop = 0, slow-mo < 1). */
  timeScale?: SharedValue<number>;
  paused?: SharedValue<boolean>;
  /** Custom Alex-style FX sheet on the same 128 px grid. */
  atlasImage?: SkImage | null;
  reducedMotion?: boolean;
  /** Max full-screen flash alpha (0.12 over reading surfaces, see rhythm). */
  flashCap?: number;
  /** Called with the number of magnetized coins that just arrived. */
  onArrive?: (count: number) => void;
  /** Called when fly-to-score labels land (digit-roll the header score, tick). */
  onFlyUpArrive?: (count: number) => void;
  style?: StyleProp<ViewStyle>;
}

const SIZE_SCALE = { sm: 20 / FLY_FONT_PX, md: 26 / FLY_FONT_PX, lg: 30 / FLY_FONT_PX, xl: 40 / FLY_FONT_PX };

export const FxStage = React.memo(forwardRef<FxStageHandle, FxStageProps>(function FxStage(
  { width, height, capacity = 200, layerBudget, timeScale, paused, atlasImage, reducedMotion = false, flashCap = 0.6, onArrive, onFlyUpArrive, style },
  ref,
) {
  const state = useSharedValue<FxState>(createFxState(capacity, layerBudget));
  const tick = useSharedValue(0);
  const atlas = useFxAtlas(atlasImage ?? null);
  const font = useFont(require('../../../assets/fonts/shark-random-funnyness-2.ttf'), FLY_FONT_PX);
  const vignette = useMemo(() => Shaders.vignette(), []);

  useEffect(() => {
    runOnUI((reduced: boolean, cap: number, w: number) => {
      'worklet';
      state.value.reduced = reduced;
      state.value.pool.twosOn = !reduced;
      state.value.flashCap = cap;
      state.value.viewW = w;
    })(reducedMotion, flashCap, width);
  }, [reducedMotion, flashCap, width, state]);

  const notifyArrive = useMemo(() => (n: number) => onArrive?.(n), [onArrive]);
  const notifyFly = useMemo(() => (n: number) => onFlyUpArrive?.(n), [onFlyUpArrive]);

  useFrameCallback((info) => {
    'worklet';
    const raw = info.timeSincePreviousFrame;
    if (raw == null) return;
    if (paused && paused.value) return;
    const scale = timeScale ? timeScale.value : 1;
    const dtMs = (raw > 50 ? 50 : raw) * scale;
    const s = state.value;
    s.t += dtMs;
    const hadLive = s.pool.live > 0;
    stepParticles(s.pool, dtMs / 1000);
    let busy = hadLive || s.pool.live > 0;
    for (let i = 0; i < TEXT_SLOTS; i++) {
      if (s.txtAlive[i] === 1) {
        if (s.t - s.txtT[i] > s.txtDur[i]) {
          s.txtAlive[i] = 0;
          if (s.txtTo[i] === 1) s.flyArrivals += 1;
        }
        busy = true;
      }
    }
    if (s.t - s.flashT < s.flashDur + 32 || s.t - s.bloomT < s.bloomDur + 32) busy = true;
    if (s.t - s.vigT < s.vigIn + s.vigHold + s.vigOut + 32) busy = true;
    if (s.pool.arrivals > 0) runOnJS(notifyArrive)(takeArrivals(s.pool));
    if (s.flyArrivals > 0) {
      const n = s.flyArrivals;
      s.flyArrivals = 0;
      runOnJS(notifyFly)(n);
    }
    if (busy) tick.value = tick.value + 1;
  });

  // -- Particles: one Atlas draw --------------------------------------------
  const cap = capacity;
  const sprites = useRectBuffer(cap, (rect, i) => {
    'worklet';
    tick.value;
    const s = state.value;
    const idx = s.pool.alive[i] === 1 ? particleSprite(s.pool, i, s.t) : 0;
    rect.setXYWH((idx % FX_COLS) * FX_CELL, Math.floor(idx / FX_COLS) * FX_CELL, FX_CELL, FX_CELL);
  });
  const transforms = useRSXformBuffer(cap, (xf, i) => {
    'worklet';
    tick.value;
    const st = state.value;
    const p = st.pool;
    if (p.alive[i] !== 1) {
      xf.set(0, 0, -4000, -4000);
      return;
    }
    // On twos: the drawing re-picks rotation and scale every 83 ms; the position stays smooth.
    const scale = ((particleSize(p, i) * 2) / FX_CELL) * particleTwosScale(p, i, st.t);
    const rot = p.rot[i] + particleTwosRot(p, i, st.t);
    const c = Math.cos(rot) * scale;
    const sn = Math.sin(rot) * scale;
    const h = FX_CELL / 2;
    xf.set(c, sn, p.x[i] - (c * h - sn * h), p.y[i] - (sn * h + c * h));
  });
  const colors = useColorBuffer(cap, (col, i) => {
    'worklet';
    tick.value;
    const p = state.value.pool;
    const argb = p.color[i];
    const a = particleAlpha(p, i) * (((argb >>> 24) & 255) / 255);
    col[0] = ((argb >>> 16) & 255) / 255;
    col[1] = ((argb >>> 8) & 255) / 255;
    col[2] = (argb & 255) / 255;
    col[3] = a;
  });

  // -- Flash / bloom / vignette ---------------------------------------------
  const flashOpacity = useDerivedValue(() => {
    tick.value;
    const s = state.value;
    const t = s.t - s.flashT;
    if (t < 0 || t > s.flashDur) return 0;
    // 1 frame up, then ease out.
    const u = t / s.flashDur;
    return s.flashPeak * (1 - u) * (1 - u);
  });
  const flashColor = useDerivedValue(() => {
    tick.value;
    const c = state.value.flashColor;
    return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},1)`;
  });
  const bloomOpacity = useDerivedValue(() => {
    tick.value;
    const s = state.value;
    const t = s.t - s.bloomT;
    if (t < 0 || t > s.bloomDur) return 0;
    return s.bloomPeak * envelope(t, s.bloomDur * 0.15, 0, s.bloomDur * 0.85);
  });
  const bloomCenter = useDerivedValue(() => {
    tick.value;
    return vec(state.value.bloomX, state.value.bloomY);
  });
  const bloomR = useDerivedValue(() => {
    tick.value;
    return state.value.bloomR;
  });
  const bloomColors = useDerivedValue(() => {
    tick.value;
    const c = state.value.bloomColor;
    return [c, 'rgba(255,255,255,0)'];
  });
  const vigUniforms = useDerivedValue(() => {
    tick.value;
    const s = state.value;
    const k = envelope(s.t - s.vigT, s.vigIn, s.vigHold, s.vigOut);
    return { size: [width, height], color: s.vigColor, intensity: k * s.vigPeak, softness: 0.38 };
  });

  // -- Handle -------------------------------------------------------------------
  useImperativeHandle(ref, (): FxStageHandle => {
    const emitUI = (def: EmitterDef, x: number, y: number, params: EmitParams) => {
      'worklet';
      fxEmitUI(state.value, def, x, y, params);
    };
    return {
      state,
      burst: (name, x, y, params = {}) => runOnUI(emitUI)(EMITTERS[name], x, y, params),
      emitDef: (def, x, y, params = {}) => runOnUI(emitUI)(def, x, y, params),
      ring: (x, y, opts = {}) => {
        const from = opts.from ?? 12;
        const to = opts.to ?? 90;
        const def: EmitterDef = {
          ...RING_DEF,
          size: [from, from],
          sizeEnd: to / from,
          life: [(opts.ms ?? 260) / 1000, (opts.ms ?? 260) / 1000],
          colors: [packHex(opts.color ?? '#ffffff')],
        };
        runOnUI(emitUI)(def, x, y, {});
      },
      flash: (opts = {}) => {
        const c = rgba(opts.color ?? '#ffffff');
        runOnUI((col: number[], peak: number, ms: number) => {
          'worklet';
          fxFlashUI(state.value, col, peak, ms);
        })(c, opts.peak ?? 0.35, opts.ms ?? 140);
      },
      bloom: (x, y, opts = {}) => {
        runOnUI((bx: number, by: number, r: number, color: string, peak: number, ms: number) => {
          'worklet';
          fxBloomUI(state.value, bx, by, r, color, peak, ms);
        })(x, y, opts.radius ?? 120, opts.color ?? '#fff6d0', opts.peak ?? 0.8, opts.ms ?? 220);
      },
      vignette: (opts) => {
        const c = rgba(opts.color ?? '#ffcf3b');
        runOnUI((col: number[], peak: number, i: number, h: number, o: number) => {
          'worklet';
          fxVignetteUI(state.value, col, peak, i, h, o);
        })(c, opts.peak ?? 0.35, opts.inMs ?? 40, opts.holdMs ?? 0, opts.outMs ?? 260);
      },
      flyUp: (text, x, y, opts = {}) => {
        const scale = SIZE_SCALE[opts.size ?? 'md'];
        const w = measure(font, text);
        if (opts.to) {
          runOnUI((t: string, fx: number, fy: number, sc: number, color: string, width: number, tx: number, ty: number,
            hold: number, travel: number, tilt: number, over: number, key: string) => {
            'worklet';
            fxFlyToUI(state.value, t, fx, fy, sc, color, width, tx, ty, hold, travel, tilt, over, key);
          })(text, x, y, scale, opts.color ?? '#ffffff', w, opts.to.x, opts.to.y, opts.holdMs ?? 250, opts.travelMs ?? 350,
            opts.tiltDeg ?? 6, opts.overshoot ?? 1.3, opts.key ?? '');
          return;
        }
        runOnUI((t: string, fx: number, fy: number, sc: number, color: string, width: number, rise: number, ms: number, key: string) => {
          'worklet';
          fxFlyUpUI(state.value, t, fx, fy, sc, color, width, rise, ms, key);
        })(text, x, y, scale, opts.color ?? '#ffffff', w, opts.rise ?? 48, opts.ms ?? 520, opts.key ?? '');
      },
      clear: () => runOnUI(() => {
        'worklet';
        clearParticles(state.value.pool);
      })(),
    };
  }, [state, font]);

  const slots = [];
  for (let i = 0; i < TEXT_SLOTS; i++) slots.push(<FlyUpSlot key={i} index={i} state={state} tick={tick} font={font} />);

  return (
    <Canvas style={[{ width, height, position: 'absolute', left: 0, top: 0 }, style]} pointerEvents="none">
      {vignette ? (
        <Rect x={0} y={0} width={width} height={height}>
          <Shader source={vignette} uniforms={vigUniforms} />
        </Rect>
      ) : null}
      <Circle c={bloomCenter} r={bloomR} opacity={bloomOpacity}>
        <RadialGradient c={bloomCenter} r={bloomR} colors={bloomColors} />
      </Circle>
      {atlas ? (
        <Atlas image={atlas.image} sprites={sprites} transforms={transforms} colors={colors} blendMode="modulate" />
      ) : null}
      {font ? slots : null}
      <Rect x={0} y={0} width={width} height={height} color={flashColor} opacity={flashOpacity} />
    </Canvas>
  );
}));


const RING_DEF: EmitterDef = {
  sprite: 2, count: [1, 1], speed: [0, 0], angle: 0, spread: 0, life: [0.26, 0.26],
  size: [12, 12], sizeEnd: 7, gravity: 0, drag: 0, spin: [0, 0], fadeIn: 0, fadeOut: 0.7,
  prio: 3, colors: [0xffffffff], jitter: 0,
};

function measure(font: SkFont | null, text: string): number {
  if (!font) return text.length * FLY_FONT_PX * 0.52;
  try {
    return font.measureText(text).width;
  } catch {
    return text.length * FLY_FONT_PX * 0.52;
  }
}

function FlyUpSlot({ index, state, tick, font }: {
  index: number;
  state: SharedValue<FxState>;
  tick: SharedValue<number>;
  font: SkFont | null;
}) {
  const text = useDerivedValue(() => {
    tick.value;
    return state.value.txtAlive[index] === 1 ? state.value.txtStr[index] : '';
  });
  const color = useDerivedValue(() => {
    tick.value;
    return state.value.txtColor[index] || '#ffffff';
  });
  const opacity = useDerivedValue(() => {
    tick.value;
    const s = state.value;
    if (s.txtAlive[index] !== 1) return 0;
    const t = s.t - s.txtT[index];
    const d = s.txtDur[index];
    if (s.txtTo[index] === 1) return 1;
    const fadeFrom = d - 180;
    return t < fadeFrom ? 1 : Math.max(0, 1 - (t - fadeFrom) / 180);
  });
  const transform = useDerivedValue(() => {
    tick.value;
    const s = state.value;
    const t = s.t - s.txtT[index];
    if (s.txtTo[index] === 1) {
      const p = flyToPose(t, s.txtX[index], s.txtY[index], s.txtTx[index], s.txtTy[index], s.txtHold[index],
        s.txtTravel[index], s.txtTilt[index], s.txtOver[index]);
      const sc0 = s.txtScale[index] * p[2];
      const w0 = s.txtW[index];
      // Rotate and scale about the label centre.
      return [
        { translateX: p[0] },
        { translateY: p[1] },
        { rotate: p[3] },
        { scale: sc0 },
        { translateX: -w0 / 2 },
      ];
    }
    // Pop 0.6 -> 1.15 over 80ms, spring-ish settle, rise with outCubic.
    let k = 1;
    if (t < 80) k = 0.6 + 0.55 * (t / 80);
    else if (t < 260) {
      const u = (t - 80) / 180;
      k = 1 + 0.15 * Math.cos(u * Math.PI * 1.5) * (1 - u) * (1 - u);
    }
    const d = s.txtDur[index] > 0 ? s.txtDur[index] : 1;
    const u = Math.min(1, t / d);
    const rise = s.txtRise[index] * (1 - Math.pow(1 - u, 3));
    const sc = s.txtScale[index] * k;
    const w = s.txtW[index] * sc;
    return [
      { translateX: s.txtX[index] - w / 2 },
      { translateY: s.txtY[index] - rise },
      { scale: sc },
    ];
  });
  if (!font) return null;
  return (
    <Group transform={transform} opacity={opacity}>
      <SkText x={0} y={0} text={text} font={font} color="#05346e" style="stroke" strokeWidth={6} strokeJoin="round" />
      <SkText x={0} y={0} text={text} font={font} color={color} />
    </Group>
  );
}
