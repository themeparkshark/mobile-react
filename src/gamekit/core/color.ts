/**
 * color.ts: the bright-world colour guard.
 *
 * World rule: bright blue, white and gold. No dark, neon or purple surfaces.
 * - `brightTeamColor` (Line Party): a player or crew colour that is dark,
 *   navy or purple is remapped to the nearest of gold, coral or sky.
 * - `contrastRatio` (Parade Beat: notes need 3:1 against every sky state;
 *   Whack: back row at 92% contrast) is the WCAG relative-luminance ratio.
 * - `mixHex` / `lerpColor` for palette lerps (Sharky zone palettes over 800 ms,
 *   Memory booth light warming per chain step).
 *
 * Pure and worklet-safe.
 */

export const BRIGHT = {
  sky: '#3db8ff',
  skyLight: '#bfeaff',
  gold: '#ffcf3b',
  coral: '#ff6b5a',
  orange: '#ff8a00',
  teal: '#46c3d1',
  white: '#ffffff',
  /** Outline ink only (never a surface). */
  ink: '#0b3a66',
} as const;

export function hexToRgb(hex: string): [number, number, number] {
  'worklet';
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  'worklet';
  const c = (v: number) => {
    const s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
    return s.length === 1 ? '0' + s : s;
  };
  return '#' + c(r) + c(g) + c(b);
}

/** [h 0..360, s 0..1, l 0..1] */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  'worklet';
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [h * 60, s, l];
}

function channel(v: number): number {
  'worklet';
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  'worklet';
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  'worklet';
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Purple/violet/magenta hue band that the world never uses for surfaces. */
export function isPurple(hex: string): boolean {
  'worklet';
  const [r, g, b] = hexToRgb(hex);
  const [h, s] = rgbToHsl(r, g, b);
  return s > 0.2 && h >= 250 && h <= 330;
}

/** Too dark for a surface (navy, charcoal, near black). */
export function isDark(hex: string): boolean {
  'worklet';
  return relativeLuminance(hex) < 0.12;
}

/**
 * Team/player colour guard. Bright colours pass through; dark, navy or purple
 * ones map to gold, coral or sky by hue so a team keeps a recognizable hue.
 */
export function brightTeamColor(hex: string): string {
  'worklet';
  if (!/^#?[0-9a-fA-F]{3,8}$/.test(hex)) return BRIGHT.gold;
  if (!isPurple(hex) && !isDark(hex)) return hex.startsWith('#') ? hex : '#' + hex;
  const [r, g, b] = hexToRgb(hex);
  const [h, s] = rgbToHsl(r, g, b);
  if (s < 0.15) return BRIGHT.gold;
  // Reds/magentas/pinks -> coral; blues/navies/violets up to 290 -> sky; yellows/greens -> gold.
  if (h >= 290 || h < 20) return BRIGHT.coral;
  if (h >= 170) return BRIGHT.sky;
  return BRIGHT.gold;
}

export function mixHex(a: string, b: string, t: number): string {
  'worklet';
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const u = Math.max(0, Math.min(1, t));
  return rgbToHex(ar + (br - ar) * u, ag + (bg - ag) * u, ab + (bb - ab) * u);
}

/** Lighten toward white (booth light warming, fever glow) without ever darkening. */
export function lighten(hex: string, amount: number): string {
  'worklet';
  return mixHex(hex, '#ffffff', amount);
}

/**
 * Pick the first colour in `candidates` that reaches `minRatio` contrast with
 * every background (note colours over all sky states). Falls back to the best.
 */
export function pickReadable(candidates: string[], backgrounds: string[], minRatio = 3): string {
  'worklet';
  let best = candidates[0];
  let bestMin = -1;
  for (let i = 0; i < candidates.length; i++) {
    let worst = Infinity;
    for (let j = 0; j < backgrounds.length; j++) worst = Math.min(worst, contrastRatio(candidates[i], backgrounds[j]));
    if (worst >= minRatio) return candidates[i];
    if (worst > bestMin) { bestMin = worst; best = candidates[i]; }
  }
  return best;
}
