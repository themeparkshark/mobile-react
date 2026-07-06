/**
 * Particles.tsx — pooled Skia particle system for GameKit.
 *
 * Architecture (why it's fast):
 *   - A single fixed-size pool of MAX_PARTICLES structs lives on the UI thread
 *     inside a Reanimated SharedValue. The update loop MUTATES structs in place
 *     — zero allocation per frame (quality bar #1).
 *   - Rendering is ONE draw call: a Skia <Atlas> fed by useRSXformBuffer (per
 *     particle transform) and useColorBuffer (per particle tint). The buffer
 *     modifiers run on the UI thread and read straight from the pool.
 *   - The sprite is a procedurally-generated soft radial dot by default (no
 *     asset needed). Games may pass their own SkImage via the `image` prop; the
 *     `sprites` prop lets a texture atlas expose multiple sub-rects.
 *
 * Public API:
 *   const ref = useRef<ParticleHandle>(null);
 *   <ParticleField ref={ref} width={W} height={H} />
 *   ref.current?.burst({ x, y, preset: 'confetti' });
 *
 * Presets: 'burst' (radial pop), 'trail' (drag emitter), 'confetti' (fall +
 * flutter), 'coins' (arc + gravity).
 */

import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  Canvas,
  Atlas,
  Skia,
  TileMode,
  useRSXformBuffer,
  useColorBuffer,
  type SkImage,
  type SkRect,
} from '@shopify/react-native-skia';
import {
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';
import { MAX_PARTICLES, GAME_COLORS } from './theme';

// =============================================================================
// Pool data model — flat, mutable, worklet-friendly
// =============================================================================

/**
 * One particle. Kept as a plain object so it can be mutated in place inside a
 * worklet without new allocations. `alive` gates rendering (dead particles are
 * scaled to 0).
 */
interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rotation (radians) and angular velocity. */
  rot: number;
  vrot: number;
  /** Base sprite half-size in px (scale = size * lifeCurve). */
  size: number;
  /** Seconds lived and total lifespan. */
  age: number;
  life: number;
  /** Gravity applied per second (px/s^2). */
  gravity: number;
  /** Linear drag factor per second (0 = none). */
  drag: number;
  /** Packed ARGB color for this particle. */
  color: number;
  /** Index into the sprite sub-rect list. */
  sprite: number;
}

function makeParticle(): Particle {
  'worklet';
  return {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    vrot: 0,
    size: 8,
    age: 0,
    life: 1,
    gravity: 0,
    drag: 0,
    color: 0xffffffff,
    sprite: 0,
  };
}

// =============================================================================
// Emit descriptors (JS thread → pool)
// =============================================================================

export type ParticlePreset = 'burst' | 'trail' | 'confetti' | 'coins';

export interface EmitOptions {
  x: number;
  y: number;
  preset?: ParticlePreset;
  /** How many particles to emit (clamped to free pool slots). */
  count?: number;
  /** Override tint(s). Hex strings; one is chosen at random per particle. */
  colors?: string[];
  /** Base speed multiplier. */
  speed?: number;
  /** Base particle size in px. */
  size?: number;
}

export interface ParticleHandle {
  /** Emit a one-shot burst / confetti / coins. */
  burst: (opts: EmitOptions) => void;
  /** Emit a short trail (a few particles) — call repeatedly while dragging. */
  trail: (x: number, y: number, color?: string) => void;
  /** Kill every live particle immediately. */
  clear: () => void;
  /** Live particle count (approximate; read on JS thread). */
  aliveCount: () => number;
}

interface ParticleFieldProps {
  width: number;
  height: number;
  /** Custom sprite sheet. Defaults to a generated soft dot. */
  image?: SkImage | null;
  /** Sub-rects within `image`. Defaults to the whole default sprite. */
  sprites?: SkRect[];
  /** Pause the simulation (e.g. game paused). */
  paused?: boolean;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'none' | 'auto';
}

// =============================================================================
// Default sprite — a soft radial dot generated once at module load
// =============================================================================

const SPRITE_PX = 32;

function makeDefaultSprite(): SkImage | null {
  try {
    const surface = Skia.Surface.MakeOffscreen(SPRITE_PX, SPRITE_PX);
    if (!surface) return null;
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const cx = SPRITE_PX / 2;
    // Radial gradient: opaque white core → transparent edge for a soft glow.
    const shader = Skia.Shader.MakeRadialGradient(
      { x: cx, y: cx },
      cx,
      [Skia.Color('white'), Skia.Color('rgba(255,255,255,0)')],
      [0, 1],
      TileMode.Clamp,
    );
    paint.setShader(shader);
    canvas.drawCircle(cx, cx, cx, paint);
    surface.flush();
    return surface.makeImageSnapshot();
  } catch {
    return null;
  }
}

let DEFAULT_SPRITE: SkImage | null | undefined;
function getDefaultSprite(): SkImage | null {
  if (DEFAULT_SPRITE === undefined) DEFAULT_SPRITE = makeDefaultSprite();
  return DEFAULT_SPRITE;
}

// Convert a hex/css color string to a packed ARGB int usable in a worklet.
function packColor(css: string): number {
  const c = Skia.Color(css); // Float32Array [r,g,b,a] 0..1
  const a = Math.round(c[3] * 255);
  const r = Math.round(c[0] * 255);
  const g = Math.round(c[1] * 255);
  const b = Math.round(c[2] * 255);
  // eslint-disable-next-line no-bitwise
  return ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

const DEFAULT_PALETTE = [
  GAME_COLORS.gold,
  GAME_COLORS.blue,
  GAME_COLORS.coral,
  GAME_COLORS.success,
  '#ffffff',
];

// =============================================================================
// Component
// =============================================================================

export const ParticleField = forwardRef<ParticleHandle, ParticleFieldProps>(
  function ParticleField(
    { width, height, image, sprites, paused = false, style, pointerEvents = 'none' },
    ref,
  ) {
    // The pool lives in a SharedValue so both JS (emit) and UI (update) touch it.
    const pool = useSharedValue<Particle[]>(
      Array.from({ length: MAX_PARTICLES }, makeParticle),
    );
    const pausedSv = useSharedValue(paused);
    pausedSv.value = paused;

    // Round-robin cursor for finding free slots quickly on the JS thread.
    const cursor = useRef(0);

    const sprite = image ?? getDefaultSprite();
    const spriteRects: SkRect[] = useMemo(() => {
      if (sprites && sprites.length > 0) return sprites;
      return [Skia.XYWHRect(0, 0, SPRITE_PX, SPRITE_PX)];
    }, [sprites]);

    // -- Physics: mutate every particle in place on the UI thread. -----------
    useFrameCallback((info: FrameInfo) => {
      'worklet';
      const dtMs = info.timeSincePreviousFrame;
      if (dtMs == null || pausedSv.value) return;
      const dt = Math.min(dtMs, 64) / 1000; // clamp big frame gaps
      const list = pool.value;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.alive) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.alive = false;
          continue;
        }
        // Integrate.
        p.vy += p.gravity * dt;
        if (p.drag > 0) {
          const f = 1 - p.drag * dt;
          p.vx *= f;
          p.vy *= f;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
      }
    });

    // -- Transforms buffer: one RSXform per particle (position/scale/rot). ---
    const transforms = useRSXformBuffer(MAX_PARTICLES, (val, i) => {
      'worklet';
      const p = pool.value[i];
      if (!p.alive) {
        // Collapse dead particles to zero scale, off-screen.
        val.set(0, 0, -SPRITE_PX, -SPRITE_PX);
        return;
      }
      // Life curve: quick fade-in, ease-out to 0 near end of life.
      const t = p.age / p.life;
      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      const scale = ((p.size * 2) / SPRITE_PX) * Math.max(0, fade);
      const cos = Math.cos(p.rot) * scale;
      const sin = Math.sin(p.rot) * scale;
      // Anchor sprite center: offset translation by half the scaled sprite.
      const half = (SPRITE_PX * scale) / 2;
      val.set(cos, sin, p.x - half, p.y - half);
    });

    // -- Colors buffer: per-particle tint with life-based alpha. -------------
    const colors = useColorBuffer(MAX_PARTICLES, (val, i) => {
      'worklet';
      const p = pool.value[i];
      // Unpack ARGB → normalized RGBA for Skia.
      const a = ((p.color >>> 24) & 0xff) / 255;
      const r = ((p.color >>> 16) & 0xff) / 255;
      const g = ((p.color >>> 8) & 0xff) / 255;
      const b = (p.color & 0xff) / 255;
      const t = p.life > 0 ? p.age / p.life : 1;
      const alpha = p.alive ? a * Math.max(0, 1 - t) : 0;
      val[0] = r;
      val[1] = g;
      val[2] = b;
      val[3] = alpha;
    });

    // -- Emit (JS thread → pool). --------------------------------------------
    const spawn = useMemo(() => {
      function findFree(list: Particle[]): number {
        for (let n = 0; n < list.length; n++) {
          const idx = (cursor.current + n) % list.length;
          if (!list[idx].alive) {
            cursor.current = (idx + 1) % list.length;
            return idx;
          }
        }
        return -1; // pool exhausted — drop the request (cap respected)
      }

      function emit(opts: EmitOptions): void {
        const {
          x,
          y,
          preset = 'burst',
          count = preset === 'confetti' ? 24 : preset === 'coins' ? 12 : 16,
          colors: colorList = DEFAULT_PALETTE,
          speed = 1,
          size = preset === 'confetti' ? 7 : preset === 'coins' ? 9 : 6,
        } = opts;
        const packed = colorList.map(packColor);
        const list = pool.value;
        for (let n = 0; n < count; n++) {
          const idx = findFree(list);
          if (idx < 0) break;
          const p = list[idx];
          p.alive = true;
          p.x = x;
          p.y = y;
          p.age = 0;
          p.size = size * (0.8 + Math.random() * 0.5);
          p.color = packed[Math.floor(Math.random() * packed.length)];
          p.sprite = 0;
          p.rot = Math.random() * Math.PI * 2;

          switch (preset) {
            case 'burst': {
              const ang = Math.random() * Math.PI * 2;
              const spd = (120 + Math.random() * 180) * speed;
              p.vx = Math.cos(ang) * spd;
              p.vy = Math.sin(ang) * spd;
              p.vrot = (Math.random() - 0.5) * 8;
              p.gravity = 320;
              p.drag = 1.2;
              p.life = 0.5 + Math.random() * 0.4;
              break;
            }
            case 'trail': {
              const ang = Math.random() * Math.PI * 2;
              const spd = (20 + Math.random() * 40) * speed;
              p.vx = Math.cos(ang) * spd;
              p.vy = Math.sin(ang) * spd;
              p.vrot = (Math.random() - 0.5) * 4;
              p.gravity = 0;
              p.drag = 2.5;
              p.life = 0.35 + Math.random() * 0.25;
              break;
            }
            case 'confetti': {
              const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
              const spd = (200 + Math.random() * 260) * speed;
              p.vx = Math.cos(ang) * spd;
              p.vy = Math.sin(ang) * spd;
              p.vrot = (Math.random() - 0.5) * 12;
              p.gravity = 480;
              p.drag = 0.6;
              p.life = 1.1 + Math.random() * 0.8;
              break;
            }
            case 'coins': {
              const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
              const spd = (260 + Math.random() * 200) * speed;
              p.vx = Math.cos(ang) * spd;
              p.vy = Math.sin(ang) * spd;
              p.vrot = (Math.random() - 0.5) * 10;
              p.gravity = 900;
              p.drag = 0.2;
              p.life = 0.9 + Math.random() * 0.5;
              break;
            }
          }
        }
      }

      return { emit, findFree };
    }, [pool]);

    useImperativeHandle(
      ref,
      (): ParticleHandle => ({
        burst: (opts) => spawn.emit(opts),
        trail: (x, y, color) =>
          spawn.emit({ x, y, preset: 'trail', count: 3, colors: color ? [color] : undefined }),
        clear: () => {
          const list = pool.value;
          for (let i = 0; i < list.length; i++) list[i].alive = false;
        },
        aliveCount: () => {
          const list = pool.value;
          let c = 0;
          for (let i = 0; i < list.length; i++) if (list[i].alive) c++;
          return c;
        },
      }),
      [spawn, pool],
    );

    return (
      <Canvas style={[{ width, height }, style]} pointerEvents={pointerEvents}>
        <Atlas image={sprite} sprites={rectsFor(spriteRects)} transforms={transforms} colors={colors} />
      </Canvas>
    );
  },
);

// Atlas needs one sprite rect per particle; we reference sprite 0 for all.
// Building a per-particle rect array once (stable) avoids per-frame work.
let CACHED_RECTS: SkRect[] | null = null;
let CACHED_FROM: SkRect[] | null = null;
function rectsFor(spriteRects: SkRect[]): SkRect[] {
  if (CACHED_RECTS && CACHED_FROM === spriteRects) return CACHED_RECTS;
  const r0 = spriteRects[0];
  CACHED_RECTS = new Array(MAX_PARTICLES).fill(r0);
  CACHED_FROM = spriteRects;
  return CACHED_RECTS;
}
