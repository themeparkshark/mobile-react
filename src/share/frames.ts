/**
 * One Alex-style frame family per category. Same bones on every card (water
 * pattern, slow rays, gold ribbon, glossy panel with a dark lip and one gloss
 * band, navy outline), only the palette changes so a feed of cards reads as
 * one system and each category is still recognizable at a glance.
 */
import { BRAND } from '../ui/tokens';
import type { FlexRarity, FrameKey } from './types';

export interface FlexFrame {
  /** Background gradient, top to bottom. */
  readonly bg: readonly [string, string];
  /** Shark-pattern texture opacity over the background. */
  readonly pattern: number;
  /** Ray wedge color and opacity. */
  readonly rays: string;
  readonly rayOpacity: number;
  /** Hero panel: body (two tones) and the darker lip under it. */
  readonly panel: readonly [string, string];
  readonly panelLip: string;
  /** Rim around the hero panel. */
  readonly rim: string;
  /** Kicker text and big-number color. */
  readonly accent: string;
  /** Plate under the stat. */
  readonly plate: string;
  readonly plateInk: string;
  /** Outline around every shape. */
  readonly outline: string;
}

const NAVY = BRAND.navy;

export const FRAMES: Readonly<Record<FrameKey, FlexFrame>> = {
  royal: {
    bg: ['#0b3d91', '#05224f'], pattern: 0.12, rays: '#ffcf3b', rayOpacity: 0.22,
    panel: ['#1f5fbf', '#0b3d91'], panelLip: '#062a66', rim: '#ffcf3b',
    accent: '#ffcf3b', plate: BRAND.cream, plateInk: NAVY, outline: '#041b40',
  },
  collection: {
    bg: ['#1aa3f0', '#0768b9'], pattern: 0.2, rays: '#ffffff', rayOpacity: 0.16,
    panel: ['#ffffff', '#e6f4ff'], panelLip: '#9ccdf0', rim: '#ffcf3b',
    accent: '#ffcf3b', plate: BRAND.cream, plateInk: NAVY, outline: NAVY,
  },
  photo: {
    bg: ['#1aa3f0', '#0768b9'], pattern: 0.2, rays: '#ffffff', rayOpacity: 0.14,
    panel: ['#ffe07a', '#ffcf3b'], panelLip: '#d99a00', rim: '#ffcf3b',
    accent: '#ffcf3b', plate: BRAND.cream, plateInk: NAVY, outline: NAVY,
  },
  boss: {
    bg: ['#d63a2f', '#7a1610'], pattern: 0.12, rays: '#ffcf3b', rayOpacity: 0.2,
    panel: ['#fff8e4', '#f6e8bf'], panelLip: '#c99a52', rim: '#ffcf3b',
    accent: '#ffcf3b', plate: BRAND.cream, plateInk: '#5a0f0a', outline: '#3d0805',
  },
  passport: {
    bg: ['#2a7fd0', '#0b4f97'], pattern: 0.16, rays: '#fff8e4', rayOpacity: 0.16,
    panel: ['#fff8e4', '#f6e8bf'], panelLip: '#c9a76a', rim: '#ef4a3c',
    accent: '#ffcf3b', plate: BRAND.cream, plateInk: NAVY, outline: NAVY,
  },
  coins: {
    bg: ['#0879ca', '#05346e'], pattern: 0.16, rays: '#ffcf3b', rayOpacity: 0.18,
    panel: ['#1f8fe0', '#0768b9'], panelLip: '#05468f', rim: '#ffcf3b',
    accent: '#ffcf3b', plate: BRAND.cream, plateInk: NAVY, outline: NAVY,
  },
  standings: {
    bg: ['#1f8fe0', '#05346e'], pattern: 0.16, rays: '#ffcf3b', rayOpacity: 0.2,
    panel: ['#1f8fe0', '#0768b9'], panelLip: '#05468f', rim: '#ffcf3b',
    accent: '#ffcf3b', plate: BRAND.cream, plateInk: NAVY, outline: NAVY,
  },
  fright: {
    bg: ['#24164a', '#0a0b24'], pattern: 0.08, rays: '#ff8a1f', rayOpacity: 0.16,
    panel: ['#3a2470', '#24164a'], panelLip: '#140c2e', rim: '#ff8a1f',
    accent: '#ffb23d', plate: '#fff1d6', plateInk: '#24164a', outline: '#0a0718',
  },
  streak: {
    bg: ['#ff8a1f', '#c2410c'], pattern: 0.14, rays: '#ffe07a', rayOpacity: 0.24,
    panel: ['#fff8e4', '#ffe9c2'], panelLip: '#d9893a', rim: '#ffcf3b',
    accent: '#fff4c2', plate: BRAND.cream, plateInk: '#6b2a07', outline: '#5a2306',
  },
  progress: {
    bg: ['#3cb85c', '#1d6b34'], pattern: 0.14, rays: '#ffffff', rayOpacity: 0.16,
    panel: ['#ffffff', '#e8f8ec'], panelLip: '#8fd3a1', rim: '#ffcf3b',
    accent: '#ffcf3b', plate: BRAND.cream, plateInk: '#0f3d1d', outline: '#0f3d1d',
  },
};

/** The dex rarity ramp (menu-dex dexLook): one ramp on every card. */
export const RARITY_RAMP: Readonly<Record<FlexRarity, { readonly frame: string; readonly chip: string; readonly label: string }>> = {
  1: { frame: '#8a9bb0', chip: '#e8edf3', label: 'Common' },
  2: { frame: '#2fb35d', chip: '#dcf6e5', label: 'Uncommon' },
  3: { frame: '#9b4dff', chip: '#eee2ff', label: 'Rare' },
  4: { frame: '#ff5a2b', chip: '#ffe3d8', label: 'Epic' },
  5: { frame: '#f5b400', chip: '#fff1c2', label: 'Legendary' },
};
