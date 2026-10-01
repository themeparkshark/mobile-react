/**
 * shaders.ts: SkSL RuntimeEffects for the studio (compiled once, lazily).
 *
 * All effects are bright-world: they add light (gold, white, sky), never
 * darken to black, and never go neon or purple.
 *
 *   SHOCKWAVE  image filter: ring displacement + rim light (big hits, KO)
 *   DISSOLVE   shader over an image child: noise dissolve with a hot edge
 *   VIGNETTE   edge glow in a colour (gold fever, coral hurt, white look-up)
 *   SUNBURST   rotating rays (golden, fever, results)
 *   SHIMMER    diagonal highlight sweep (meters, foil cards)
 *   RIPPLE     soft water caustic ripple for water games' backgrounds
 */

import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

export const SHOCKWAVE_SKSL = `
uniform shader image;
uniform float2 center;
uniform float radius;
uniform float thickness;
uniform float strength;
uniform float light;

half4 main(float2 xy) {
  float2 d = xy - center;
  float dist = length(d);
  float diff = dist - radius;
  float w = 1.0 - smoothstep(0.0, thickness, abs(diff));
  float2 dir = dist > 0.001 ? d / dist : float2(0.0);
  float2 offs = -dir * w * strength * sign(diff);
  half4 c = image.eval(xy + offs);
  c.rgb = min(c.rgb + half3(w * light) * c.a, half3(1.0));
  return c;
}
`;

export const DISSOLVE_SKSL = `
uniform shader image;
uniform float progress;
uniform float edge;
uniform float4 edgeColor;
uniform float scale;
uniform float seed;

float hash(float2 p) {
  return fract(sin(dot(p + seed, float2(127.1, 311.7))) * 43758.5453);
}
float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + float2(1.0, 0.0)), u.x),
             mix(hash(i + float2(0.0, 1.0)), hash(i + float2(1.0, 1.0)), u.x), u.y);
}
half4 main(float2 xy) {
  half4 c = image.eval(xy);
  float n = noise(xy / scale) * 0.65 + noise(xy / (scale * 0.35)) * 0.35;
  float t = progress * (1.0 + edge);
  if (n < t - edge) { return half4(0.0); }
  if (n < t) {
    float k = (t - n) / edge;
    half4 e = half4(edgeColor.rgb * edgeColor.a, edgeColor.a);
    return mix(c, e * c.a, half(k));
  }
  return c;
}
`;

export const VIGNETTE_SKSL = `
uniform float2 size;
uniform float4 color;
uniform float intensity;
uniform float softness;

half4 main(float2 xy) {
  float2 uv = xy / size;
  float2 q = abs(uv - 0.5) * 2.0;
  float e = max(q.x, q.y);
  float r = length(uv - 0.5) * 1.35;
  float m = max(e, r);
  float a = smoothstep(1.0 - softness, 1.0, m) * intensity * color.a;
  return half4(color.rgb * a, a);
}
`;

export const SUNBURST_SKSL = `
uniform float2 center;
uniform float time;
uniform float rays;
uniform float4 colorA;
uniform float4 colorB;
uniform float intensity;
uniform float radius;

half4 main(float2 xy) {
  float2 d = xy - center;
  float ang = atan(d.y, d.x) + time;
  float band = 0.5 + 0.5 * cos(ang * rays);
  float soft = smoothstep(0.35, 0.65, band);
  float fall = 1.0 - smoothstep(radius * 0.1, radius, length(d));
  float4 col = mix(colorA, colorB, soft);
  float a = col.a * intensity * fall;
  return half4(col.rgb * a, a);
}
`;

export const SHIMMER_SKSL = `
uniform float2 size;
uniform float progress;
uniform float width;
uniform float4 color;

half4 main(float2 xy) {
  float x = (xy.x + xy.y * 0.5) / (size.x + size.y * 0.5);
  float p = progress * (1.0 + width * 2.0) - width;
  float a = 1.0 - smoothstep(0.0, width, abs(x - p));
  a *= color.a;
  return half4(color.rgb * a, a);
}
`;

export const RIPPLE_SKSL = `
uniform float2 size;
uniform float time;
uniform float4 base;
uniform float4 light;

half4 main(float2 xy) {
  float2 uv = xy / size.y;
  float w = sin(uv.x * 11.0 + time * 1.3) * 0.5 + sin(uv.y * 13.0 - time * 1.1) * 0.5;
  w += sin((uv.x + uv.y) * 17.0 + time * 0.7) * 0.35;
  float band = floor((w * 0.5 + 0.5) * 3.0) / 3.0;
  return half4(mix(base.rgb, light.rgb, band * 0.35), 1.0);
}
`;

const cache: Record<string, SkRuntimeEffect | null> = {};

function compile(name: string, src: string): SkRuntimeEffect | null {
  if (name in cache) return cache[name];
  let effect: SkRuntimeEffect | null = null;
  try {
    effect = Skia.RuntimeEffect.Make(src);
  } catch {
    effect = null;
  }
  if (!effect && __DEV__) console.warn(`[gamekit] shader ${name} failed to compile`);
  cache[name] = effect;
  return effect;
}

export const Shaders = {
  shockwave: () => compile('shockwave', SHOCKWAVE_SKSL),
  dissolve: () => compile('dissolve', DISSOLVE_SKSL),
  vignette: () => compile('vignette', VIGNETTE_SKSL),
  sunburst: () => compile('sunburst', SUNBURST_SKSL),
  shimmer: () => compile('shimmer', SHIMMER_SKSL),
  ripple: () => compile('ripple', RIPPLE_SKSL),
};

/** 0..1 RGBA array from a hex colour, for float4 uniforms. */
export function rgba(hex: string, alpha = 1): number[] {
  'worklet';
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

// =============================================================================
// Colour matrices (ColorMatrix colour filter): hit flash, fever warmth
// =============================================================================

/** Brightness lift (1 = identity, 1.6 = hit flash). Keeps alpha. */
export function brightnessMatrix(k: number): number[] {
  'worklet';
  const add = k > 1 ? (k - 1) * 0.5 : 0;
  const m = k > 1 ? 1 : k;
  return [
    m, 0, 0, 0, add,
    0, m, 0, 0, add,
    0, 0, m, 0, add,
    0, 0, 0, 1, 0,
  ];
}

/** Tint toward a colour by amount (0..1), used for gold rims / fever warmth. */
export function tintMatrix(hex: string, amount: number): number[] {
  'worklet';
  const c = rgba(hex);
  const k = 1 - amount;
  return [
    k, 0, 0, 0, c[0] * amount,
    0, k, 0, 0, c[1] * amount,
    0, 0, k, 0, c[2] * amount,
    0, 0, 0, 1, 0,
  ];
}

/** Warm the world (+R, +G, brightness), the Fever look. amount 0..1. */
export function warmMatrix(amount: number): number[] {
  'worklet';
  const r = 1 + 0.08 * amount;
  const g = 1 + 0.04 * amount;
  const b = 1 + 0.02 * amount;
  const lift = 0.06 * amount;
  return [
    r, 0, 0, 0, lift,
    0, g, 0, 0, lift,
    0, 0, b, 0, lift * 0.5,
    0, 0, 0, 1, 0,
  ];
}

/** Desaturate by amount (0..1): wipeouts and "run failed", never darkened. */
export function desaturateMatrix(amount: number): number[] {
  'worklet';
  const s = 1 - amount;
  const lr = 0.2126 * amount;
  const lg = 0.7152 * amount;
  const lb = 0.0722 * amount;
  return [
    lr + s, lg, lb, 0, 0,
    lr, lg + s, lb, 0, 0,
    lr, lg, lb + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}
