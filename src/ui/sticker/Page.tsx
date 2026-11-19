/**
 * Page: the blue backing sheet, level 1. On the world (navy line 3, white edge 4, drop 5), on the
 * map (white edge 3, drop 5 at 50 percent navy) or floating (adds the one soft shadow). Everything
 * inside a page is level 2: Page tells its children so, so a card, button or tag inside can never
 * wear the white edge.
 *
 * Pieces that rise above the top edge are presets, never raw geometry: a title `label` (with
 * Alex's lock as `art: 'lock'`), Alex's `ribbon` across the page or a section, and `topArt` (art
 * standing on the top edge, the shelf's shark). The page reserves their rise as its own top margin
 * (`pageRise`), so whatever sits above it (a bar, another page) is never covered and a screen
 * never adds an overhang by hand. Stacked pages need only PAGE_GAP between them.
 *
 * `foot` is the wave foot band, laid out in flow under the body: it can never cover the body.
 * `scroll` puts the body in a scroll view that shrinks to the room it gets (sheets, dialogs), with
 * the foot fixed outside it, so a tall sheet scrolls instead of pushing its way out off screen.
 * `fill` lets the page and its body take the height they are given, so one child (a Stage) can
 * grow into what is left. `expand` puts the small white chevron disc on the bottom-right edge.
 *
 * Art off the left end keeps SPACE.artClear from the screen edge (sideArtOver clamps it). The
 * page hands its children its inner width (usePageWidth). A Page inside a page is refused: it
 * warns in development and draws its children as a Card.
 */
import { memo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import type { AnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import Arrive from './Arrive';
import Card from './Card';
import CutEdge from './CutEdge';
import Glyph from './Glyph';
import Lift from './Lift';
import Shell from './Shell';
import StickerText from './StickerText';
import TitleLabel, { type TitleLabelTone } from './TitleLabel';
import WaveFoot from './WaveFoot';
import { ART, ART_RATIO } from './art';
import { PageWidthProvider, PlaceProvider, useCountEdge, useFrameWidth, useInsidePage, useStickerPlace } from './StickerContext';
import { LOCK_ART, edgeRise, labelReach, pageRise, ribbonGeometry, ribbonWidth, sideArtOver, sideArtRoom, type RibbonKind } from './layout';
import { edgeFor, insidePage, warnOnce } from './level';
import type { LayoutStyle } from './style';
import { TEXT } from './textRoles';
import { BUTTON, DROP, FLOAT_SHADOW, INK, LABEL, LINE, RADIUS, RIBBON, SHADE, SPACE, TAG, TYPE } from './tokens';

export type PageLabel = { readonly text: string; readonly tone?: TitleLabelTone; readonly large?: boolean; readonly art?: 'lock' };
export type PageRibbon = { readonly text: string; readonly kind?: RibbonKind; readonly size?: 'title' | 'small' };
export type PageTopArt = { readonly source: ImageSourcePropType; readonly width: number; readonly height: number; readonly rise: number };
export type PageFoot = { readonly children: ReactNode };
/** A piece that straddles the page's top edge, by kind: a Tag (its height and drop are the kit's), or one of Alex's discs at a size. */
export type PageEdgePiece =
  | { readonly node: ReactNode; readonly kind: 'tag' }
  | { readonly node: ReactNode; readonly kind: 'disc'; readonly size: number };
/** Art hanging off the page's left edge (the guide card's coin). The body leaves room for it. */
export type PageSideArt = { readonly source: ImageSourcePropType; readonly width: number; readonly height: number; readonly over?: number; readonly along?: number };

export type PageProps = {
  /** Floating sheet or dialog: the one soft shadow under it. */
  readonly floating?: boolean;
  readonly small?: boolean;
  readonly label?: PageLabel;
  readonly ribbon?: PageRibbon;
  readonly topArt?: PageTopArt;
  /** Pieces on the top edge: `end` (the guide card's park tag, ONE PER PLAYER), `start` (a disc; the label moves past it). */
  readonly onEdge?: { readonly start?: PageEdgePiece; readonly end?: PageEdgePiece };
  readonly sideArt?: PageSideArt;
  readonly foot?: PageFoot;
  /** The body scrolls inside the room the page gets (sheets and dialogs). */
  readonly scroll?: boolean;
  /** Stuck on when it mounts. */
  readonly arrive?: boolean;
  /** Room inside: the page's 16, a snug 12, or a flush 6 (a shelf of planks). */
  readonly padding?: 'page' | 'snug' | 'flush';
  /** Width when the page is narrower than its frame (default: the frame's). */
  readonly width?: number;
  /** The page and its body take the height they are given (one child may grow into it). */
  readonly fill?: boolean;
  /** The small white chevron disc on the bottom-right edge: the page opens (the guide card). */
  readonly expand?: { readonly open: boolean; readonly onPress: () => void; readonly accessibilityLabel: string };
  readonly style?: StyleProp<LayoutStyle>;
  readonly children?: ReactNode;
};

/** A piece's laid-out height on the top edge (a tag's pill and drop are the kit's, a disc is its size). */
export function edgePieceHeight(piece: PageEdgePiece, onMap: boolean): number {
  if (piece.kind === 'disc') return piece.size;
  return TAG.height + (onMap ? DROP.tagOnMap : DROP.tag);
}

/** The expand disc on the bottom-right edge: 22 pt to see, 44 to touch. */
export const EXPAND = { size: 22 } as const;

const FACE = { colors: [INK.blueBright, INK.blue] as const };
const INSET = { width: 2.5, color: SHADE.shine30 };
const PADS = { page: SPACE.pagePad, snug: SPACE.pageSnug, flush: SPACE.pageFlush } as const;
/** Where labels and edge pieces start in from the page's side. */
const EDGE_INSET = 18;

/** The printed dots: a 9 pt grid of soft white dots (kit.css radial-gradient). Fixed tile, no measuring. */
const Dots = memo(function Dots() {
  return (
    <Svg width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <Pattern id="stickerDots" patternUnits="userSpaceOnUse" width={9} height={9}>
          <Circle cx={1.3} cy={1.3} r={1.3} fill={SHADE.dot} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#stickerDots)" />
    </Svg>
  );
});
const DOTS = <Dots />;

function PageImpl(props: PageProps) {
  // A page inside a page would draw a blue sheet in a blue sheet: refused, drawn as a card (dev warning).
  if (useInsidePage()) {
    warnOnce('page-in-page', __DEV__, m => console.warn(m), 'a Page was mounted inside a page. It draws as a Card; a page holds cards, never another page.');
    return <Card style={props.style} padding="snug">{props.children}</Card>;
  }
  return <PageBody {...props} />;
}

function PageBody({ floating = false, small = false, label, ribbon, topArt, onEdge, sideArt, foot, scroll = false, arrive = false, padding = 'page', width: widthProp, fill = false, expand, style, children }: PageProps) {
  const place = useStickerPlace();
  const frame = useFrameWidth();
  const { width: windowWidth } = useWindowDimensions();
  const width = widthProp ?? frame;
  const onMap = place.level === 'map';
  const edge = edgeFor('page', place);
  useCountEdge(edge && !floating ? 'page' : null);
  const radius = small ? RADIUS.pageSmall : RADIUS.page;
  const pad = PADS[padding];
  const edgeHeights = [onEdge?.start, onEdge?.end].filter((p): p is PageEdgePiece => !!p).map(p => edgePieceHeight(p, onMap));
  const rise = pageRise({ ribbon, label, topArt, edge, onEdge: edgeHeights }, width, windowWidth);
  const sideOver = sideArt ? sideArtOver(sideArt.over) : 0;
  const ribbonW = ribbon ? ribbonWidth(ribbon.kind ?? 'page', width, windowWidth) : 0;
  const ribbonG = ribbon ? ribbonGeometry(ribbonW) : null;
  const padTop = ribbonG ? ribbonG.overlap + SPACE.base * 2 : label ? labelReach(!!label.large) + SPACE.cardGapLoose : pad;
  const padLeft = sideArt ? sideArtRoom({ width: sideArt.width, over: sideOver }) : pad;
  const bodyStyle: ViewStyle = { paddingHorizontal: pad, paddingLeft: padLeft, paddingTop: padTop, paddingBottom: foot ? SPACE.base * 2 : expand ? pad + EXPAND.size / 2 : pad, flexGrow: fill ? 1 : undefined };
  const inner = Math.max(0, width - LINE.page * 2 - padLeft - pad);
  // The rise is added to any top margin the caller gives (the gap between stacked pages), never replaced by it.
  const given = StyleSheet.flatten(style) ?? {};
  const below = expand ? EXPAND.size / 2 : 0;
  const outer: StyleProp<ViewStyle> = [style, { marginTop: rise + (typeof given.marginTop === 'number' ? given.marginTop : 0), width: widthProp ?? given.width },
    below ? { marginBottom: below + (typeof given.marginBottom === 'number' ? given.marginBottom : 0) } : null, scroll ? { flexShrink: 1 } : null, fill ? { flexGrow: 1 } : null];
  const body = (dropStyle?: AnimatedStyle<ViewStyle>) => (
    <Shell radius={radius} line={LINE.page} face={FACE} edge={edge} drop={DROP.page} dropColor={onMap ? DROP.map : DROP.color}
      insetTop={INSET} float={floating ? FLOAT_SHADOW : undefined} dropStyle={dropStyle} inside={DOTS}
      style={scroll ? { flexShrink: 1 } : { flexGrow: 1 }}>
      <PlaceProvider value={insidePage()}>
        <PageWidthProvider width={inner}>
          {scroll ? (
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={bodyStyle} bounces={false} showsVerticalScrollIndicator={false}>{children}</ScrollView>
          ) : (
            <View style={bodyStyle}>{children}</View>
          )}
        </PageWidthProvider>
        {foot ? (
          // The foot is laid out under the body, cut by the page's own bottom corners inside the navy line.
          <View style={{ marginHorizontal: LINE.page, marginBottom: LINE.page, overflow: 'hidden',
            borderBottomLeftRadius: radius - LINE.page, borderBottomRightRadius: radius - LINE.page }}>
            <WaveFoot width={width - LINE.page * 2}>{foot.children}</WaveFoot>
          </View>
        ) : null}
      </PlaceProvider>
      {label && !onEdge ? <Label label={label} /> : null}
      {onEdge ? <EdgeRow start={onEdge.start} end={onEdge.end} label={label && label.art !== 'lock' ? label : undefined} onMap={onMap} /> : null}
      {sideArt ? <Lift source={sideArt.source} width={sideArt.width} height={sideArt.height} style={{ position: 'absolute', left: -sideOver, top: sideArt.along ?? 0 }} /> : null}
      {ribbon && ribbonG ? <RibbonTitle text={ribbon.text} width={ribbonW} height={ribbonG.height} overlap={ribbonG.overlap} small={ribbon.size === 'small'} /> : null}
      {topArt ? <Lift source={topArt.source} width={topArt.width} height={topArt.height} style={{ position: 'absolute', right: SPACE.artClear, top: -topArt.rise }} /> : null}
      {expand ? <ExpandDisc {...expand} /> : null}
    </Shell>
  );
  if (arrive) return <Arrive style={outer}>{body}</Arrive>;
  return <View style={outer}>{body()}</View>;
}

/**
 * The pieces on the top edge in one row, each centred on the edge: the start piece, the label, then
 * the end piece pushed to the right. Being one row they can never overlap: at large text the label
 * gives way (it shrinks to fit) instead of running under the tag.
 */
function EdgeRow({ start, end, label, onMap }: { readonly start?: PageEdgePiece; readonly end?: PageEdgePiece; readonly label?: PageLabel; readonly onMap: boolean }) {
  const labelH = label ? (label.large ? LABEL.heightLarge : LABEL.height) + DROP.label : 0;
  const startH = start ? edgePieceHeight(start, onMap) : 0;
  const endH = end ? edgePieceHeight(end, onMap) : 0;
  const h = Math.max(labelH, startH, endH);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: start ? EDGE_INSET - SPACE.base * 3 : EDGE_INSET, right: EDGE_INSET, top: -edgeRise(h), height: h,
      flexDirection: 'row', alignItems: 'center', gap: SPACE.base * 2 }}>
      {start ? <View style={{ height: startH, justifyContent: 'center' }}>{start.node}</View> : null}
      {label ? <View style={{ flexShrink: 1, height: labelH, justifyContent: 'flex-start' }}><TitleLabel tone={label.tone} large={label.large}>{label.text}</TitleLabel></View> : null}
      <View style={{ flex: 1 }} />
      {end ? <View style={{ height: endH, justifyContent: 'center', flexShrink: 0 }}>{end.node}</View> : null}
    </View>
  );
}

/** The small white disc with the code chevron on the page's bottom-right edge, 44 pt to touch. */
function ExpandDisc({ open, onPress, accessibilityLabel }: NonNullable<PageProps['expand']>) {
  const s = EXPAND.size;
  const slop = (BUTTON.minTouch - s) / 2;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ expanded: open }} onPress={onPress} hitSlop={slop}
      style={{ position: 'absolute', right: EDGE_INSET, bottom: -s / 2, width: s, height: s }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: DROP.tag, height: s, borderRadius: s / 2, backgroundColor: DROP.color }} />
      <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: INK.white, borderWidth: LINE.tag, borderColor: INK.navy, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph kind="chevron" point={open ? 'up' : 'down'} size={14} />
      </View>
    </Pressable>
  );
}

const LOCK = { height: LOCK_ART.height, width: Math.round(LOCK_ART.height * ART_RATIO.locked) };

/** The title label on the page's top edge (and Alex's lock hanging off its left end), in the page's own place. */
function Label({ label }: { readonly label: PageLabel }) {
  const lock = label.art === 'lock';
  const top = label.large ? 19 : 17;
  const left = lock ? EDGE_INSET - LOCK_ART.left : EDGE_INSET;
  return (
    <View style={{ position: 'absolute', top: -top, left, right: EDGE_INSET }} pointerEvents="box-none">
      <TitleLabel tone={label.tone} large={label.large} padLeft={lock ? LOCK.width + LOCK_ART.left + 8 : undefined}>{label.text}</TitleLabel>
      {lock ? <CutEdge source={ART.locked} width={LOCK.width} height={LOCK.height} style={{ position: 'absolute', left: LOCK_ART.left, top: LOCK_ART.top }} /> : null}
    </View>
  );
}

const RIBBON_TEXT = { ...TEXT.titleLarge, spacing: TYPE.titleSpacing };

/** The ribbon and its words, centred on the page's top edge. */
function RibbonTitle({ text, width, height, overlap, small }: { text: string; width: number; height: number; overlap: number; small: boolean }) {
  const spec = small ? { ...RIBBON_TEXT, size: 27 } : RIBBON_TEXT;
  const line = Math.round(spec.size * 1.2);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -40, right: -40, top: -(height - overlap), height, alignItems: 'center' }}>
      <CutEdge source={ART.ribbon} width={width} height={height} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: Math.round(height * RIBBON.textAt - line / 2) + 2, paddingHorizontal: 40 + width * 0.16 }}>
        <StickerText spec={spec} lineHeight={line} role="header" fit>{text}</StickerText>
      </View>
    </View>
  );
}

const Page = memo(PageImpl);
export default Page;
