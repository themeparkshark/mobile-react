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
 */
import { memo, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import type { AnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import Arrive from './Arrive';
import CutEdge from './CutEdge';
import Lift from './Lift';
import Shell from './Shell';
import StickerText from './StickerText';
import TitleLabel, { type TitleLabelTone } from './TitleLabel';
import WaveFoot from './WaveFoot';
import { ART, ART_RATIO } from './art';
import { PlaceProvider, useFrameWidth, useStickerPlace } from './StickerContext';
import { LOCK_ART, labelReach, pageRise, ribbonGeometry, ribbonWidth, type RibbonKind } from './layout';
import { edgeFor, insidePage } from './level';
import { TEXT } from './textRoles';
import { DROP, FLOAT_SHADOW, INK, LINE, RADIUS, RIBBON, SHADE, SPACE, TYPE, WAVE } from './tokens';

export type PageLabel = { readonly text: string; readonly tone?: TitleLabelTone; readonly large?: boolean; readonly art?: 'lock' };
export type PageRibbon = { readonly text: string; readonly kind?: RibbonKind; readonly size?: 'title' | 'small' };
export type PageTopArt = { readonly source: ImageSourcePropType; readonly width: number; readonly height: number; readonly rise: number };
export type PageFoot = { readonly height?: number; readonly children: ReactNode };

export type PageProps = {
  /** Floating sheet or dialog: the one soft shadow under it. */
  readonly floating?: boolean;
  readonly small?: boolean;
  readonly label?: PageLabel;
  readonly ribbon?: PageRibbon;
  readonly topArt?: PageTopArt;
  readonly foot?: PageFoot;
  /** The body scrolls inside the room the page gets (sheets and dialogs). */
  readonly scroll?: boolean;
  /** Stuck on when it mounts. */
  readonly arrive?: boolean;
  /** Room inside: the page's 16, a snug 12, or a flush 6 (a shelf of planks). */
  readonly padding?: 'page' | 'snug' | 'flush';
  /** Width when the page is narrower than its frame (default: the frame's). */
  readonly width?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
};

const FACE = { colors: [INK.blueBright, INK.blue] as const };
const INSET = { width: 2.5, color: SHADE.shine30 };
const PADS = { page: SPACE.pagePad, snug: SPACE.pageSnug, flush: SPACE.pageFlush } as const;

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

function PageImpl({ floating = false, small = false, label, ribbon, topArt, foot, scroll = false, arrive = false, padding = 'page', width: widthProp, style, children }: PageProps) {
  const place = useStickerPlace();
  const frame = useFrameWidth();
  const { width: windowWidth } = useWindowDimensions();
  const width = widthProp ?? frame;
  const onMap = place.level === 'map';
  const edge = edgeFor('page', place);
  const radius = small ? RADIUS.pageSmall : RADIUS.page;
  const pad = PADS[padding];
  const rise = pageRise({ ribbon, label, topArt, edge }, width, windowWidth);
  const ribbonW = ribbon ? ribbonWidth(ribbon.kind ?? 'page', width, windowWidth) : 0;
  const ribbonG = ribbon ? ribbonGeometry(ribbonW) : null;
  const padTop = ribbonG ? ribbonG.overlap + 8 : label ? labelReach(!!label.large) + 12 : pad;
  const footH = foot ? foot.height ?? WAVE.height : 0;
  const bodyStyle = { paddingHorizontal: pad, paddingTop: padTop, paddingBottom: foot ? SPACE.base * 2 : pad };
  const outer: StyleProp<ViewStyle> = [{ marginTop: rise, width: widthProp }, scroll ? { flexShrink: 1 } : null, style];
  const body = (dropStyle?: AnimatedStyle<ViewStyle>) => (
    <Shell radius={radius} line={LINE.page} face={FACE} edge={edge} drop={DROP.page} dropColor={onMap ? DROP.map : DROP.color}
      insetTop={INSET} float={floating ? FLOAT_SHADOW : undefined} dropStyle={dropStyle} inside={DOTS}
      style={scroll ? { flexShrink: 1 } : { flexGrow: 1 }}>
      <PlaceProvider value={insidePage()}>
        {scroll ? (
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={bodyStyle} bounces={false} showsVerticalScrollIndicator={false}>{children}</ScrollView>
        ) : (
          <View style={bodyStyle}>{children}</View>
        )}
        {foot ? (
          // The foot is laid out under the body, cut by the page's own bottom corners inside the navy line.
          <View style={{ height: footH, marginHorizontal: LINE.page, marginBottom: LINE.page, overflow: 'hidden',
            borderBottomLeftRadius: radius - LINE.page, borderBottomRightRadius: radius - LINE.page }}>
            <WaveFoot width={width - LINE.page * 2} height={footH}>{foot.children}</WaveFoot>
          </View>
        ) : null}
      </PlaceProvider>
      {label ? <Label label={label} /> : null}
      {ribbon && ribbonG ? <RibbonTitle text={ribbon.text} width={ribbonW} height={ribbonG.height} overlap={ribbonG.overlap} small={ribbon.size === 'small'} /> : null}
      {topArt ? <Lift source={topArt.source} width={topArt.width} height={topArt.height} style={{ position: 'absolute', right: SPACE.artClear, top: -topArt.rise }} /> : null}
    </Shell>
  );
  if (arrive) return <Arrive style={outer}>{body}</Arrive>;
  return <View style={outer}>{body()}</View>;
}

const LOCK = { height: LOCK_ART.height, width: Math.round(LOCK_ART.height * ART_RATIO.locked) };

/** The title label on the page's top edge (and Alex's lock hanging off its left end), in the page's own place. */
function Label({ label }: { readonly label: PageLabel }) {
  const lock = label.art === 'lock';
  const top = label.large ? 19 : 17;
  return (
    <View style={{ position: 'absolute', top: -top, left: lock ? 18 - LOCK_ART.left : 18, right: 18 }} pointerEvents="box-none">
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
