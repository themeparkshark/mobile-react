/**
 * One frame family per category. Same bones on every card (water pattern,
 * flat rays, gold ribbon, glossy panel with a dark lip and one gloss band,
 * navy outline); the palette changes so a grid of cards reads as distinct
 * families: royal gold, the five rarities, golden hour, photo sky, boss red,
 * passport cream, coin teal, standings blue, fright night, streak orange and
 * progress green.
 */
import { BRAND } from '../ui/tokens';
import type { FlexRarity, FrameKey } from './types';

export interface FlexFrame {
  /** Background gradient, top to bottom. */
  readonly bg: readonly [string, string];
  /** Shark-pattern texture opacity over the background. */
  readonly pattern: number;
  readonly rays: string;
  readonly rayOpacity: number;
  /** Hero panel: body (two tones) and the darker lip under it. */
  readonly panel: readonly [string, string];
  readonly panelLip: string;
  /** Rim around the hero panel. */
  readonly rim: string;
  /** Kicker text on the background. */
  readonly ink: string;
  /** CTA line on the background. */
  readonly cta: string;
  /** Small print on the background (store line, link). */
  readonly small: string;
  /** Plate under the stat. */
  readonly plate: string;
  readonly plateInk: string;
  /** Outline around every shape and title. */
  readonly outline: string;
  /** Fill of the giant brag number. */
  readonly bigFill: string;
}

const NAVY = BRAND.navy;
const base = {
  pattern: 0.14, rays: '#ffffff', rayOpacity: 0.18, ink: '#ffcf3b', cta: '#ffcf3b', small: '#ffffff',
  plate: BRAND.cream, plateInk: NAVY, outline: NAVY, bigFill: '#ffcf3b',
  panel: ['#ffffff', '#e6f4ff'] as const, panelLip: '#9ccdf0', rim: '#ffcf3b',
};

export const FRAMES: Readonly<Record<FrameKey, FlexFrame>> = {
  royal: { ...base, bg: ['#ffd84a', '#e88a00'], rays: '#fff6c8', rayOpacity: 0.35, pattern: 0.1,
    panel: ['#1f5fbf', '#0b3d91'], panelLip: '#062a66', rim: '#ffcf3b', ink: NAVY, cta: '#ffffff', small: NAVY, bigFill: '#ffffff' },
  common: { ...base, bg: ['#1aa3f0', '#0768b9'] },
  uncommon: { ...base, bg: ['#40d27a', '#13753a'], rim: '#ffcf3b', panel: ['#ffffff', '#dcf6e5'], panelLip: '#2fb35d', outline: '#0d3d20' },
  rare: { ...base, bg: ['#b07cff', '#5a1fc0'], panel: ['#ffffff', '#eee2ff'], panelLip: '#9b4dff', outline: '#2a0e63' },
  epic: { ...base, bg: ['#ff8a4c', '#c2271b'], panel: ['#ffffff', '#ffe3d8'], panelLip: '#ff5a2b', outline: '#5a0f0a', ink: '#fff1a8', cta: '#fff1a8' },
  legendary: { ...base, bg: ['#ffcf3b', '#f07800'], rays: '#fff6c8', rayOpacity: 0.4, panel: ['#fffaf0', '#fff1c2'], panelLip: '#d99a00',
    rim: '#ffffff', ink: NAVY, cta: '#ffffff', small: NAVY, outline: '#6b3a00', bigFill: '#ffffff' },
  golden: { ...base, bg: ['#ffc46b', '#ff6a3d'], rays: '#fff1b0', rayOpacity: 0.4, panel: ['#fff4c2', '#ffcf3b'], panelLip: '#d99a00',
    rim: '#ffffff', ink: '#6b1d00', cta: '#ffffff', small: '#6b1d00', outline: '#6b1d00', bigFill: '#ffffff' },
  photo: { ...base, bg: ['#7fd8ff', '#1f8fe0'], rayOpacity: 0.22, ink: NAVY, cta: '#ffffff', small: NAVY },
  boss: { ...base, bg: ['#ef4a3c', '#7a1610'], rays: '#ffcf3b', rayOpacity: 0.2, panel: ['#fff8e4', '#f6e8bf'], panelLip: '#c99a52',
    plateInk: '#5a0f0a', outline: '#3d0805' },
  passport: { ...base, bg: ['#fff3d6', '#efcf8f'], pattern: 0.08, rays: '#e8b860', rayOpacity: 0.3, panel: ['#fffaf0', '#fff1d6'],
    panelLip: '#c9a76a', rim: '#ef4a3c', ink: '#c2271b', cta: '#ffffff', small: NAVY, plate: '#ffffff', bigFill: '#ef4a3c' },
  coins: { ...base, bg: ['#22d1bf', '#0a6466'], rays: '#ffcf3b', rayOpacity: 0.2, panel: ['#e8fffb', '#bff3ec'], panelLip: '#0a8a84',
    outline: '#073c3d' },
  standings: { ...base, bg: ['#1f8fe0', '#05346e'], rays: '#ffcf3b', rayOpacity: 0.2 },
  fright: { ...base, bg: ['#2a1a55', '#0a0b24'], pattern: 0.06, rays: '#ff8a1f', rayOpacity: 0.16, panel: ['#3a2470', '#24164a'],
    panelLip: '#140c2e', rim: '#ff8a1f', ink: '#ffb23d', cta: '#ffb23d', plate: '#fff1d6', plateInk: '#24164a', outline: '#0a0718', bigFill: '#ff8a1f' },
  streak: { ...base, bg: ['#ffa040', '#c2410c'], rays: '#ffe07a', rayOpacity: 0.26, panel: ['#fff8e4', '#ffe9c2'], panelLip: '#d9893a',
    ink: '#fff4c2', cta: '#fff4c2', plateInk: '#6b2a07', outline: '#5a2306', bigFill: '#ffffff' },
  progress: { ...base, bg: ['#8ad64a', '#2f7d2a'], panel: ['#ffffff', '#e8f8ec'], panelLip: '#5fbf5a', plateInk: '#0f3d1d', outline: '#0f3d1d' },
};

/** The dex rarity ramp (menu-dex dexLook): one ramp on every card. */
export const RARITY_RAMP: Readonly<Record<FlexRarity, { readonly frame: string; readonly chip: string; readonly label: string }>> = {
  1: { frame: '#8a9bb0', chip: '#e8edf3', label: 'Common' },
  2: { frame: '#2fb35d', chip: '#dcf6e5', label: 'Uncommon' },
  3: { frame: '#9b4dff', chip: '#eee2ff', label: 'Rare' },
  4: { frame: '#ff5a2b', chip: '#ffe3d8', label: 'Epic' },
  5: { frame: '#f5b400', chip: '#fff1c2', label: 'Legendary' },
};
