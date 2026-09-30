/**
 * Hand-authored vector art for <GameIcon> (WS0 UI kit).
 *
 * Every icon is drawn on a 48x48 grid in the house cartoon style: flat brand
 * fills and one thick navy outline around the whole silhouette. The outline is
 * made "sticker style": each silhouette shape is first stroked in navy at twice
 * the outline width, then all fills are painted on top, so overlapping parts
 * merge into one clean outline. Detail shapes (highlights, pips, hands) are
 * painted last, exactly as written.
 *
 * Pure data: no React, no assets. Raster icons that reuse existing repo art
 * (energy, ticket, coin, crown, sword, star) are mapped in GameIcon.tsx.
 */
import { BRAND } from './tokens';

export const ICON_GRID = 48;
/** Visible outline width on the 48 grid (3px at 48pt, 1.5px at 24pt, 1px at 16pt). */
export const ICON_OUTLINE = 3;

type Paint = {
  readonly fill?: string;
  readonly stroke?: string;
  readonly width?: number;
  readonly cap?: 'round' | 'butt' | 'square';
  readonly dash?: readonly number[];
  readonly opacity?: number;
  readonly transform?: string;
};

export type IconShape =
  | (Paint & { readonly kind: 'path'; readonly d: string })
  | (Paint & { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number })
  | (Paint & { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx?: number })
  | (Paint & { readonly kind: 'text'; readonly x: number; readonly y: number; readonly text: string; readonly size: number });

export type VectorIcon = {
  readonly silhouette: readonly IconShape[];
  readonly detail?: readonly IconShape[];
};

const C = {
  navy: BRAND.navy,
  white: BRAND.white,
  gold: BRAND.gold,
  goldLight: BRAND.goldLight,
  goldLip: BRAND.goldLip,
  blue: BRAND.blue,
  blueBright: BRAND.blueBright,
  sky: BRAND.sky,
  skyDeep: BRAND.skyDeep,
  cream: BRAND.cream,
  red: BRAND.red,
  green: BRAND.green,
  orange: '#ff8f3a',
  silver: '#e3ebf5',
  silverDeep: '#9fb2c9',
  bronze: '#eb9a5c',
  bronzeDeep: '#b8662f',
} as const;

const shine = (d: string, width = 2.6): IconShape => ({ kind: 'path', d, stroke: C.white, width, cap: 'round', opacity: 0.9 });
const ink = (d: string, width = 3): IconShape => ({ kind: 'path', d, stroke: C.navy, width, cap: 'round' });

function medal(face: string, ring: string, label: string): VectorIcon {
  return {
    silhouette: [
      { kind: 'path', d: 'M11 3 H21 L27 19 H20 Z', fill: C.blueBright },
      { kind: 'path', d: 'M37 3 H27 L21 19 H28 Z', fill: C.blue },
      { kind: 'circle', cx: 24, cy: 31, r: 13, fill: face },
    ],
    detail: [
      { kind: 'circle', cx: 24, cy: 31, r: 9, stroke: ring, width: 2.4 },
      { kind: 'text', x: 24, y: 36, text: label, size: 14, fill: C.navy },
      shine('M15.5 26.5 Q17 22.5 21 21'),
    ],
  };
}

function badge(fill: string, marks: readonly IconShape[]): VectorIcon {
  return { silhouette: [{ kind: 'circle', cx: 24, cy: 24, r: 19, fill }], detail: marks };
}

export const VECTOR_ICONS = {
  rush: {
    silhouette: [{ kind: 'path', d: 'M29 3 L9 27 H22 L18 45 L39 20 H26 Z', fill: C.gold }],
    detail: [shine('M25.5 9.5 L16.5 21.5')],
  },
  wrench: {
    silhouette: [
      { kind: 'rect', x: 20.5, y: 17, w: 7, h: 27, rx: 3.5, fill: C.sky, transform: 'rotate(45 24 24)' },
      { kind: 'path', d: 'M20.5 3.4 L20.5 11 L27.5 11 L27.5 3.4 A10 10 0 1 1 20.5 3.4 Z', fill: C.sky, transform: 'rotate(45 24 24)' },
    ],
    detail: [
      { kind: 'circle', cx: 24, cy: 38.5, r: 2, fill: C.navy, transform: 'rotate(45 24 24)' },
      { kind: 'path', d: 'M22.6 21 V34', stroke: C.white, width: 2.2, cap: 'round', opacity: 0.9, transform: 'rotate(45 24 24)' },
    ],
  },
  pin: {
    silhouette: [{ kind: 'path', d: 'M24 45 C24 45 9 30 9 19 A15 15 0 0 1 39 19 C39 30 24 45 24 45 Z', fill: C.red }],
    detail: [
      { kind: 'circle', cx: 24, cy: 19, r: 6, fill: C.white, stroke: C.navy, width: 2.6 },
      shine('M14 15 Q15.5 10 20 8'),
    ],
  },
  gift: {
    silhouette: [
      { kind: 'path', d: 'M24 14 C19 4 10 6 13 12 C15 15 20 14 24 14 Z', fill: C.gold },
      { kind: 'path', d: 'M24 14 C29 4 38 6 35 12 C33 15 28 14 24 14 Z', fill: C.gold },
      { kind: 'rect', x: 9, y: 22, w: 30, h: 22, rx: 3, fill: C.blueBright },
      { kind: 'rect', x: 6, y: 14, w: 36, h: 10, rx: 3, fill: C.blue },
    ],
    detail: [
      { kind: 'rect', x: 20.5, y: 14, w: 7, h: 30, fill: C.gold },
      ink('M20.5 14 V44 M27.5 14 V44', 2),
      ink('M6 24 H42', 2.4),
      shine('M12 29 V38'),
    ],
  },
  medal1: medal(C.gold, C.goldLip, '1'),
  medal2: medal(C.silver, C.silverDeep, '2'),
  medal3: medal(C.bronze, C.bronzeDeep, '3'),
  timer: {
    silhouette: [
      { kind: 'rect', x: 19.5, y: 3, w: 9, h: 7, rx: 2.5, fill: C.gold },
      { kind: 'rect', x: 34, y: 9, w: 6, h: 6, rx: 2, fill: C.gold, transform: 'rotate(45 37 12)' },
      { kind: 'circle', cx: 24, cy: 27, r: 17, fill: C.white },
    ],
    detail: [
      { kind: 'circle', cx: 24, cy: 27, r: 12.5, stroke: C.sky, width: 3 },
      ink('M24 27 V17', 3.4),
      ink('M24 27 L31 30', 3.4),
      { kind: 'circle', cx: 24, cy: 27, r: 2.6, fill: C.red },
    ],
  },
  streak: {
    silhouette: [{ kind: 'path', d: 'M24 3 C31 11 39 18 39 29 A15 15 0 0 1 9 29 C9 21 14 16 17 11 C18.5 16 20.5 18.5 23 20 C21.5 14 21.5 8.5 24 3 Z', fill: C.orange }],
    detail: [
      { kind: 'path', d: 'M24 22 C28.5 27 32 30.5 32 35 A8 8 0 0 1 16 35 C16 30.5 20 27 24 22 Z', fill: C.gold },
      shine('M13.5 26 Q13 31 15.5 35'),
    ],
  },
  dice: {
    silhouette: [{ kind: 'rect', x: 7, y: 7, w: 34, h: 34, rx: 8, fill: C.white }],
    detail: [
      { kind: 'path', d: 'M11 36 Q11 38 13.5 38 H34.5 Q37 38 37 36', stroke: C.sky, width: 3, cap: 'round' },
      { kind: 'circle', cx: 16, cy: 16, r: 3.3, fill: C.navy },
      { kind: 'circle', cx: 32, cy: 16, r: 3.3, fill: C.navy },
      { kind: 'circle', cx: 24, cy: 24, r: 3.3, fill: C.red },
      { kind: 'circle', cx: 16, cy: 32, r: 3.3, fill: C.navy },
      { kind: 'circle', cx: 32, cy: 32, r: 3.3, fill: C.navy },
    ],
  },
  bell: {
    silhouette: [
      { kind: 'circle', cx: 24, cy: 6.5, r: 3.2, fill: C.gold },
      { kind: 'circle', cx: 24, cy: 39, r: 4.5, fill: C.goldLip },
      { kind: 'path', d: 'M24 8 C15.5 8 12 14 12 21 V29 L7.5 35.5 H40.5 L36 29 V21 C36 14 32.5 8 24 8 Z', fill: C.gold },
    ],
    detail: [shine('M16.5 26 V20.5 Q16.5 15 20.5 13')],
  },
  check: badge(C.green, [
    { kind: 'path', d: 'M14.5 24.5 L21 31 L33.5 17.5', stroke: C.navy, width: 9, cap: 'round' },
    { kind: 'path', d: 'M14.5 24.5 L21 31 L33.5 17.5', stroke: C.white, width: 4.6, cap: 'round' },
  ]),
  close: badge(C.white, [ink('M17 17 L31 31 M31 17 L17 31', 5)]),
  pause: badge(C.white, [ink('M19.5 16.5 V31.5 M28.5 16.5 V31.5', 5.4)]),
  play: badge(C.gold, [
    { kind: 'path', d: 'M20 15.5 L33 24 L20 32.5 Z', fill: C.white, stroke: C.navy, width: 2.8 },
  ]),
  sparkle: {
    silhouette: [
      { kind: 'path', d: 'M21 6 C23 17 27 21 38 24 C27 27 23 31 21 42 C19 31 15 27 4 24 C15 21 19 17 21 6 Z', fill: C.gold },
      { kind: 'path', d: 'M38 3 C38.8 7.5 40.5 9.2 45 10 C40.5 10.8 38.8 12.5 38 17 C37.2 12.5 35.5 10.8 31 10 C35.5 9.2 37.2 7.5 38 3 Z', fill: C.white },
    ],
    detail: [shine('M19 17 Q17.5 21.5 13 23', 2.2)],
  },
  heart: {
    silhouette: [{ kind: 'path', d: 'M24 43 C24 43 5 32 5 18.5 A9.8 9.8 0 0 1 24 14 A9.8 9.8 0 0 1 43 18.5 C43 32 24 43 24 43 Z', fill: C.red }],
    detail: [shine('M10.5 18 Q11 13 15.5 12')],
  },
  map: {
    silhouette: [{ kind: 'path', d: 'M5 12 L17 7 L31 12 L43 7 V36 L31 41 L17 36 L5 41 Z', fill: C.cream }],
    detail: [
      { kind: 'path', d: 'M17 7 L31 12 V41 L17 36 Z', fill: C.sky },
      ink('M17 7 V36 M31 12 V41', 2.2),
      { kind: 'path', d: 'M9.5 32 C14 28 18 33 23 26 S31 17 36 19', stroke: C.blueBright, width: 2.6, cap: 'round', dash: [3, 3.4] },
      { kind: 'circle', cx: 37.5, cy: 18.5, r: 3.2, fill: C.red, stroke: C.navy, width: 2 },
    ],
  },
  shark: {
    silhouette: [
      { kind: 'path', d: 'M11 33 C18 27 23 16 33 5 C32 16 33 25 38 33 Z', fill: C.blueBright },
      { kind: 'path', d: 'M3 33 Q9 28 15 33 T27 33 T39 33 T45 32 V43 H3 Z', fill: C.sky },
    ],
    detail: [
      shine('M27.5 13 Q23.5 20 20 26'),
      { kind: 'path', d: 'M8 38 Q11 36 14 38 M26 38 Q29 36 32 38', stroke: C.white, width: 2.2, cap: 'round' },
    ],
  },
  ride: {
    silhouette: [
      { kind: 'path', d: 'M3 41 Q24 33 45 41', stroke: C.blueBright, width: 4.5, cap: 'round' },
      { kind: 'path', d: 'M7 32 V20 Q7 15 12 15 H16 V21 H26 V15 H31 Q37 15 40.5 21.5 L42.5 32 Z', fill: C.gold },
      { kind: 'circle', cx: 15, cy: 34, r: 4.5, fill: C.white },
      { kind: 'circle', cx: 34, cy: 34, r: 4.5, fill: C.white },
    ],
    detail: [
      { kind: 'rect', x: 7, y: 25, w: 35.5, h: 3.5, fill: C.red },
      { kind: 'circle', cx: 15, cy: 34, r: 1.8, fill: C.navy },
      { kind: 'circle', cx: 34, cy: 34, r: 1.8, fill: C.navy },
      shine('M10.5 22 V19.5 Q10.5 18 12 18'),
    ],
  },
  trophy: {
    silhouette: [
      { kind: 'path', d: 'M14 12 C6 12 6 23 15.5 24', stroke: C.gold, width: 4, cap: 'round' },
      { kind: 'path', d: 'M34 12 C42 12 42 23 32.5 24', stroke: C.gold, width: 4, cap: 'round' },
      { kind: 'rect', x: 12, y: 36, w: 24, h: 8, rx: 2.5, fill: C.blue },
      { kind: 'rect', x: 20.5, y: 26, w: 7, h: 11, fill: C.goldLip },
      { kind: 'path', d: 'M13 6 H35 V16 A11 11 0 0 1 13 16 Z', fill: C.gold },
    ],
    detail: [
      shine('M18 10 V16.5 Q18 21 21.5 23'),
      { kind: 'rect', x: 17, y: 38.5, w: 14, h: 3, rx: 1.5, fill: C.gold },
    ],
  },
  lock: {
    silhouette: [
      { kind: 'path', d: 'M16 22 V15 A8 8 0 0 1 32 15 V22', stroke: C.silver, width: 5, cap: 'round' },
      { kind: 'rect', x: 10, y: 21, w: 28, h: 22, rx: 5, fill: C.gold },
    ],
    detail: [
      { kind: 'circle', cx: 24, cy: 30, r: 3.4, fill: C.navy },
      ink('M24 31 V36.5', 3.4),
      shine('M14.5 26 V36'),
    ],
  },
  info: badge(C.blueBright, [
    { kind: 'circle', cx: 24, cy: 14.5, r: 3.3, fill: C.white, stroke: C.navy, width: 2 },
    { kind: 'path', d: 'M24 21.5 V34', stroke: C.navy, width: 9, cap: 'round' },
    { kind: 'path', d: 'M24 21.5 V34', stroke: C.white, width: 4.6, cap: 'round' },
  ]),
  retry: {
    silhouette: [
      { kind: 'path', d: 'M36 15.5 A14 14 0 1 0 38 28', stroke: C.gold, width: 6, cap: 'round' },
      { kind: 'path', d: 'M29 16 L40.5 19 L40.5 6.5 Z', fill: C.gold },
    ],
  },
  arrow: {
    silhouette: [{ kind: 'path', d: 'M6 19 H23 V9 L43 24 L23 39 V29 H6 Z', fill: C.gold }],
    detail: [shine('M10 22.5 H25.5 V16')],
  },
} as const satisfies Record<string, VectorIcon>;

export type VectorIconName = keyof typeof VECTOR_ICONS;

/** Outline stroke width for a silhouette shape in the first (navy) pass. */
export function outlineWidth(shape: IconShape): number {
  return shape.fill ? ICON_OUTLINE * 2 : (shape.width ?? 0) + ICON_OUTLINE * 2;
}
