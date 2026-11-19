/**
 * Text roles, as pure data (tested). Each role is one row of the DIRECTION.md type table, with
 * its stroke, drop and spacing fixed, so screens never pass 6 to 8 text props and calls cannot
 * drift. Colour comes from the place: on paper everything is plain navy (no stroke, no drop); on
 * colour 17 pt and up is white with the round navy stroke and a hard drop; under 17 pt on colour
 * it is plain white with a 1.5 pt drop.
 */
import { STROKE, TYPE } from './tokens';

export type TextRoleSpec = {
  readonly font: 'shark' | 'knockout';
  readonly size: number;
  /** Letter spacing in em. */
  readonly spacing: number;
  /** Stroke on colour, pt (0 under 17 pt). */
  readonly stroke: number;
  readonly drop: number;
  /** Line height as a share of the size. */
  readonly leading: number;
  /** Largest Dynamic Type multiplier. Chrome pills and bars cap lower. */
  readonly maxScale: number;
  readonly caps?: boolean;
};

export const TEXT = {
  /** Big numbers and the biggest title (Shark 35). */
  hero: { font: 'shark', size: TYPE.hero, spacing: TYPE.titleSpacing, stroke: STROKE.titleMax, drop: STROKE.dropTitle, leading: 1.15, maxScale: 1.3 },
  /** Titles (Shark 30, 0.09 em). */
  title: { font: 'shark', size: TYPE.title, spacing: TYPE.titleSpacing, stroke: STROKE.title, drop: STROKE.dropTitle, leading: 1.25, maxScale: 1.3 },
  /** Big titles: ribbons and the header (Shark 32, 0.10 em). */
  titleLarge: { font: 'shark', size: TYPE.titleLarge, spacing: TYPE.titleSpacingWide, stroke: STROKE.titleMax, drop: STROKE.dropTitle, leading: 1.2, maxScale: 1.3 },
  /** Headings (Shark 24). */
  heading: { font: 'shark', size: TYPE.heading, spacing: 0.06, stroke: STROKE.titleMin, drop: STROKE.dropTitle, leading: 1.25, maxScale: 1.3 },
  /** Sub headings (Shark 21). */
  sub: { font: 'shark', size: TYPE.sub, spacing: 0.05, stroke: STROKE.button, drop: STROKE.drop, leading: 1.2, maxScale: 1.3 },
  /** Names and row titles (Shark 18). */
  name: { font: 'shark', size: TYPE.name, spacing: 0.03, stroke: STROKE.button, drop: STROKE.drop, leading: 1.2, maxScale: 1.3 },
  /** Small names, ghost words in a foot (Shark 17). */
  nameSmall: { font: 'shark', size: TYPE.nameSmall, spacing: 0.04, stroke: STROKE.button, drop: STROKE.drop, leading: 1.2, maxScale: 1.2 },
  /** Chip numbers (Shark 19, tabular). */
  count: { font: 'shark', size: TYPE.chip, spacing: 0.04, stroke: STROKE.button, drop: STROKE.drop, leading: 1.15, maxScale: 1 },
  /** Tags, chips, small labels (Shark 14, never stroked). */
  tag: { font: 'shark', size: TYPE.tag, spacing: 0.03, stroke: 0, drop: 0, leading: 1.2, maxScale: 1.15 },
  /** Sentences (Knockout 16, 15, 14). */
  body: { font: 'knockout', size: TYPE.body, spacing: 0.015, stroke: 0, drop: 0, leading: 1.25, maxScale: 1.3 },
  bodyMid: { font: 'knockout', size: TYPE.bodyMid, spacing: 0.015, stroke: 0, drop: 0, leading: 1.2, maxScale: 1.3 },
  bodySmall: { font: 'knockout', size: TYPE.bodySmall, spacing: 0.015, stroke: 0, drop: 0, leading: 1.18, maxScale: 1.3 },
  /** Small caps labels (Knockout 12 at 0.11 em). */
  caps: { font: 'knockout', size: TYPE.caps, spacing: 0.11, stroke: 0, drop: 0, leading: 1.2, maxScale: 1.2, caps: true },
} as const satisfies Record<string, TextRoleSpec>;

export type TextRole = keyof typeof TEXT;

/** Button labels per size (kit.css .btn.lg / .md / .sm and the row and key sizes). */
export const BUTTON_TEXT = {
  large: { font: 'shark', size: 30, spacing: 0.06, stroke: STROKE.buttonLarge, drop: STROKE.dropTitle, leading: 1.15, maxScale: 1.15 },
  medium: { font: 'shark', size: 19, spacing: 0.06, stroke: STROKE.button, drop: STROKE.drop, leading: 1.15, maxScale: 1.15 },
  small: { font: 'shark', size: 17, spacing: 0.06, stroke: STROKE.button, drop: STROKE.drop, leading: 1.15, maxScale: 1.15 },
  row: { font: 'shark', size: 18, spacing: 0.06, stroke: STROKE.button, drop: STROKE.drop, leading: 1.15, maxScale: 1.15 },
  key: { font: 'shark', size: 24, spacing: 0.06, stroke: STROKE.button, drop: STROKE.drop, leading: 1.15, maxScale: 1.15 },
} as const satisfies Record<string, TextRoleSpec>;

export type InkDecision = {
  readonly ink: 'white' | 'gold' | 'navy' | 'navySoft' | 'goldInk' | 'onBlueSoft';
  readonly stroke: number;
  readonly drop: number;
  /** Plain small white on colour: the one 1.5 pt hard drop. */
  readonly smallDrop: boolean;
};

/**
 * How a role is inked at a place. Paper: plain navy (soft: navy soft; caps: gold ink), never a
 * stroke. Colour: white (or gold when asked), stroked at 17 pt and up, else plain with the 1.5 pt
 * drop (soft: the pale blue line).
 */
export function inkFor(spec: TextRoleSpec, onPaper: boolean, tone: 'auto' | 'gold' | 'soft' = 'auto'): InkDecision {
  if (onPaper) {
    const ink = spec.caps ? 'goldInk' : tone === 'soft' ? 'navySoft' : 'navy';
    return { ink, stroke: 0, drop: 0, smallDrop: false };
  }
  const stroked = spec.stroke > 0 && spec.size >= STROKE.minSize && tone !== 'soft';
  if (stroked) return { ink: tone === 'gold' ? 'gold' : 'white', stroke: Math.min(STROKE.max, spec.stroke), drop: spec.drop, smallDrop: false };
  return { ink: tone === 'soft' ? 'onBlueSoft' : 'white', stroke: 0, drop: 0, smallDrop: tone !== 'soft' };
}
