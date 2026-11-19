/**
 * Where things sit, as pure functions (no React), so the "chrome covers nothing" rule is tested
 * on numbers, not on screen text (tools/tests/sticker-kit.test.cjs).
 *
 * Dustin, Nov 19: "i dont like how yor new header is covering things". From then on a fixed bar
 * (top or bottom) takes its own space, content starts clear of it, and art that rises above its
 * card adds its rise to the room it takes. Screen lays the Header and the Footer out in flow, and
 * every Page reserves its own rise as top margin, so a screen never adds an overhang by hand.
 */
import { BUTTON, DROP, EDGE, FOOTER, HEADER, LABEL, LAYER, LINE, RIBBON, SPACE, TOAST, WAVE } from './tokens';

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

/**
 * Map screens keep the toast's lane clear: the toast slaps on `HEADER.gap` under the bar (the same
 * gap the body starts at), so the first map piece starts this far down the body and a toast never
 * covers the guide card while it is up (KIT.md, what is still off: the toast hid "Tap PLAY!").
 */
export function toastLane(): number {
  return TOAST.height + DROP.cardOnWorld + SPACE.base;
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

/**
 * Where a map's attribution (the OpenStreetMap credit, a licence requirement) must end above the
 * screen's bottom on a screen with the Footer: the band, the wave's crest above its flat line
 * (half the curve's control height) and a 4 pt gap. Beside the hump the wave is the footer's
 * highest point, so a credit at the screen's left or right edge is fully clear of it.
 */
export function mapAttributionBottom(width: number): number {
  return footerBand(width) + Math.ceil(WAVE.amplitude / 2) + SPACE.base;
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
  /** Pieces that straddle the top edge (a tag, a disc): half of each one's height rises above it. */
  readonly onEdge?: readonly number[] | null;
  /** The page's own white edge (4 on the world, 3 on the map, 0 inside a page). */
  readonly edge: number;
};

/** How far a page's own pieces rise above its top edge. Page takes this as its top margin. */
export function pageRise(spec: PageRiseSpec, pageWidth: number, windowWidth: number): number {
  let rise = spec.edge;
  if (spec.ribbon) rise = Math.max(rise, ribbonGeometry(ribbonWidth(spec.ribbon.kind ?? 'page', pageWidth, windowWidth)).rise);
  if (spec.label) rise = Math.max(rise, labelRise(!!spec.label.large, spec.label.art === 'lock'));
  if (spec.topArt) rise = Math.max(rise, spec.topArt.rise);
  for (const h of spec.onEdge ?? []) rise = Math.max(rise, edgeRise(h));
  return Math.ceil(rise);
}

/** How far a piece straddling a page's top edge rises above it: half its height. */
export function edgeRise(height: number): number {
  return height / 2;
}

/** Room a page's body leaves on the left for art hanging off its left edge: the art's width inside the line, plus a gap. */
export function sideArtRoom(art: { readonly width: number; readonly over: number }): number {
  return Math.max(0, art.width - art.over) + SPACE.base * 2;
}

/** How far a card's title label rises above the card (it straddles the edge like a page's). */
export function cardLabelRise(edge: number): number {
  return Math.max(labelRise(false, false), edge);
}

/**
 * How far a card's own pieces rise above its top edge: a title label, art hanging off the top edge
 * (`topArt`: how far past the edge), a row of pieces standing on it (`topRow`: their height, half
 * rises), never less than the card's white edge when anything rises. Card takes this as its own top
 * margin, as Page does with pageRise. Nothing rises: 0 (a plain card keeps its caller's margins).
 */
export function cardTopRise(spec: { readonly label?: boolean; readonly topArt?: number; readonly topRow?: number; readonly edge: number }): number {
  const label = spec.label ? labelRise(false, false) : 0;
  const art = spec.topArt ?? 0;
  const row = (spec.topRow ?? 0) / 2;
  const rise = Math.max(label, art, row);
  return rise > 0 ? Math.ceil(Math.max(rise, spec.edge)) : 0;
}

/**
 * How far art may hang off a page's left edge so it keeps SPACE.artClear from the screen edge:
 * the page's own left on the screen less the clear room. Asked for more, it is clamped.
 */
export function sideArtOver(asked: number | undefined, pageLeft: number = SPACE.margin): number {
  const want = asked ?? SPACE.artClear;
  return Math.max(0, Math.min(want, pageLeft - SPACE.artClear));
}

/**
 * How far a list row's art hangs off its card's left edge so it keeps SPACE.artClear from the
 * page's line: the page's padding less the clear room (the board's 14 where there is room).
 */
export function rowArtOver(pagePad: number, asked: number = 14): number {
  return Math.max(0, Math.min(asked, pagePad - SPACE.artClear));
}

/** The navy line of a button: 3 on the map (DIRECTION: map pieces get the 3 pt line), else 2.5. */
export function buttonLine(onMap: boolean): number {
  return onMap ? LINE.map : LINE.button;
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

/** A button's laid-out height: face, lip and the navy line above and below (3 on the map). StickerButton draws exactly this. */
export function buttonHeight(size: ButtonSize, onMap: boolean = false): number {
  return buttonFace(size) + buttonLip(size) + buttonLine(onMap) * 2;
}

/** The width a floating sheet or dialog gets: the board's 24 pt margins, capped on wide screens. */
export function layerWidth(windowWidth: number): number {
  return Math.min(LAYER.maxWidth, windowWidth - LAYER.margin * 2);
}

/** The width pages get on a screen: the 16 pt screen margin. */
export function screenFrameWidth(windowWidth: number): number {
  return windowWidth - SPACE.margin * 2;
}
