/**
 * Where things sit, as pure functions (no React), so the "chrome covers nothing" rule is tested
 * on numbers, not on screen text (tools/tests/sticker-kit.test.cjs).
 *
 * Dustin, Nov 19: "i dont like how yor new header is covering things". From then on a fixed bar
 * (top or bottom) takes its own space, content starts clear of it, and art that rises above its
 * card adds its rise to the room it takes. Screen lays the Header and the Footer out in flow, and
 * every Page reserves its own rise as top margin, so a screen never adds an overhang by hand.
 */
import { BUTTON, EDGE, FOOTER, HEADER, LABEL, LAYER, LINE, RIBBON, SPACE } from './tokens';

/** Today's top bar (src/components/Topbar.tsx): 70 pt of art under the status bar. The Header is never taller. */
export const TOPBAR_TODAY = 70;

/** Where the water ends (the straight bottom edge) for a safe area top. */
export function headerCrest(insetTop: number): number {
  return insetTop + HEADER.crest;
}

/** The band's full height: water, line, edge and drop, all straight. The Header takes exactly this in flow. */
export function headerHeight(insetTop: number): number {
  return headerCrest(insetTop) + HEADER.line + HEADER.edge + HEADER.drop;
}

/**
 * Where content starts on a screen with a Header, measured from the screen's top: the bar's full
 * height plus the standard gap. Screen pads its body by the gap itself; this is for overlays that
 * are measured from the screen's top (a toast, a floating layer over a title bar).
 */
export function headerContentTop(insetTop: number): number {
  return headerHeight(insetTop) + HEADER.gap;
}

/** The band of the footer, rim to bottom: never taller than today's footer art (window width / 5.3). */
export function footerBand(width: number): number {
  return Math.floor(width / FOOTER.todayRatio);
}

/** The footer's whole box: the band plus the room above it for the hump and the raised Map icon. */
export function footerHeight(width: number): number {
  return footerBand(width) + FOOTER.rise;
}

/** Where the wave of the footer sits inside its box (the flat crest, under the rim). */
export function footerCrest(): number {
  return FOOTER.rise + FOOTER.rim;
}

/** How far up from the screen's bottom content must end on a screen with the Footer (its box plus the gap). */
export function footerContentBottom(width: number): number {
  return footerHeight(width) + HEADER.gap;
}

/** Icon sizes scale with the window, as the board's 390 pt mock (clamped so they never crowd or shrink away). */
export function footerScale(width: number): number {
  return Math.max(0.8, Math.min(1.1, width / FOOTER.mockWidth));
}

/** Alex's ribbon at a width: its height, how far it reaches into the page, and how far it rises above it (cut edge included). */
export function ribbonGeometry(width: number): { readonly height: number; readonly overlap: number; readonly rise: number } {
  const height = Math.round(width / RIBBON.ratio);
  const overlap = Math.round(height * RIBBON.overlap);
  return { height, overlap, rise: height - overlap + RIBBON.edge };
}

export type RibbonKind = 'page' | 'section';

/** A ribbon's width: across the whole page (sheets, a big moment) or a section's (a shelf). */
export function ribbonWidth(kind: RibbonKind, pageWidth: number, windowWidth: number): number {
  return kind === 'page' ? Math.round(pageWidth + RIBBON.padPage) : Math.min(Math.round(pageWidth - 24), Math.round(windowWidth * RIBBON.section));
}

/** The lock that hangs off the gate's title label (upright: nothing tilts but small tags). */
export const LOCK_ART = { height: 52, left: -22, top: -10 } as const;

/** How far a title label rises above its page's top edge (it straddles the edge), cut edge included. */
export function labelRise(large: boolean, art: boolean): number {
  const top = large ? 19 : 17;
  const lock = art ? top - LOCK_ART.top : 0;
  return Math.max(top, lock) + EDGE.label;
}

/** How far the label reaches below the page's top edge (the body starts under it). */
export function labelReach(large: boolean): number {
  return (large ? LABEL.heightLarge : LABEL.height) - (large ? 19 : 17);
}

export type PageRiseSpec = {
  readonly ribbon?: { readonly kind?: RibbonKind } | null;
  readonly label?: { readonly large?: boolean; readonly art?: 'lock' } | null;
  readonly topArt?: { readonly rise: number } | null;
  /** The page's own white edge (4 on the world, 3 on the map, 0 inside a page). */
  readonly edge: number;
};

/** How far a page's own pieces rise above its top edge. Page takes this as its top margin. */
export function pageRise(spec: PageRiseSpec, pageWidth: number, windowWidth: number): number {
  let rise = spec.edge;
  if (spec.ribbon) rise = Math.max(rise, ribbonGeometry(ribbonWidth(spec.ribbon.kind ?? 'page', pageWidth, windowWidth)).rise);
  if (spec.label) rise = Math.max(rise, labelRise(!!spec.label.large, spec.label.art === 'lock'));
  if (spec.topArt) rise = Math.max(rise, spec.topArt.rise);
  return Math.ceil(rise);
}

/** Space between two stacked pages: the loose card gap; each page adds its own rise on top. */
export const PAGE_GAP = SPACE.cardGapLoose;

export type ButtonSize = 'large' | 'medium' | 'small' | 'row' | 'key';

/** Face height of each size (DIRECTION: 58, 44, 36, keys 42; a list row's action is the 36 face). */
export function buttonFace(size: ButtonSize): number {
  switch (size) {
    case 'large': return BUTTON.heightLarge;
    case 'small': return BUTTON.heightSmall;
    case 'row': return BUTTON.heightRow;
    case 'key': return BUTTON.heightKey;
    default: return BUTTON.height;
  }
}

/** Lip of each size: 5, 4 on the small one (kit.css .btn.sm; a row action is a medium button with the 36 face). */
export function buttonLip(size: ButtonSize): number {
  return size === 'small' ? BUTTON.lipSmall : BUTTON.lip;
}

/** A button's laid-out height: face, lip and the navy line above and below (3 on the map). */
export function buttonHeight(size: ButtonSize, onMap: boolean = false): number {
  const line = onMap ? LINE.map : LINE.button;
  return buttonFace(size) + buttonLip(size) + line * 2;
}

/** The width a floating sheet or dialog gets: the board's 24 pt margins, capped on wide screens. */
export function layerWidth(windowWidth: number): number {
  return Math.min(LAYER.maxWidth, windowWidth - LAYER.margin * 2);
}

/** The width pages get on a screen: the 16 pt screen margin. */
export function screenFrameWidth(windowWidth: number): number {
  return windowWidth - SPACE.margin * 2;
}
