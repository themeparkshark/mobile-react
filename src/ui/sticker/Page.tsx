/**
 * Page: the blue backing sheet, level 1. On the world (navy line 3, white edge 4, drop 5), on
 * the map (white edge 3, drop 5 at 50 percent navy) or floating (adds the one soft shadow).
 * Everything inside a page is level 2: Page tells its children so through the context, so a
 * card, button or tag inside can never wear the white edge.
 *
 * A title label sits on the top edge (`label`), the wave foot holds the way out (`foot`).
 */
import { memo, type ReactNode } from 'react';
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import CutEdge from './CutEdge';
import Shell from './Shell';
import StickerText from './StickerText';
import { ART } from './art';
import { PlaceProvider, useStickerPlace } from './StickerContext';
import TitleLabel, { type TitleLabelTone } from './TitleLabel';
import { insidePage } from './level';
import { useStickOn } from './motion';
import { DROP, EDGE, FLOAT_SHADOW, INK, LINE, RADIUS, RIBBON, SHADE, SPACE, STROKE, TYPE } from './tokens';

/** Art that hangs off the left end of the title label (the gate's lock, with its cut edge). */
export type PageLabelArt = { readonly source: ImageSourcePropType; readonly width: number; readonly height: number; readonly left: number; readonly top: number; readonly rotate?: number };

/** Alex's ribbon across the page's top edge, for big moments (Rewards, a shelf's section). */
export type PageRibbon = { readonly text: string; readonly width: number; readonly size?: number };

/** How far a ribbon of this width reaches into the page (its lower part overlaps the top edge). */
export function ribbonOverlap(width: number): number {
  return Math.round((width / RIBBON.ratio) * 0.47);
}

export type PageProps = {
  /** Floating sheet or dialog: the one soft shadow under it. */
  readonly floating?: boolean;
  readonly small?: boolean;
  /** A title label on the page's top edge. */
  readonly label?: { readonly text: string; readonly tone?: TitleLabelTone; readonly large?: boolean; readonly left?: number; readonly width?: number; readonly art?: PageLabelArt };
  /** Alex's ribbon on the top edge (with its white cut edge made from his file). */
  readonly ribbon?: PageRibbon;
  /** The bottom band (a WaveFoot). */
  readonly foot?: ReactNode;
  readonly footHeight?: number;
  /** Stuck on when it mounts. */
  readonly arrive?: boolean;
  readonly padding?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
};

const FACE = { colors: [INK.blueBright, INK.blue] as const };
/** Grow to a given height, but never collapse to nothing when the page hugs its content. */
const PAGE_FILL = { flexGrow: 1 } as const;
const INSET = { width: 2.5, color: SHADE.shine30 };

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

function PageImpl({ floating = false, small = false, label, ribbon, foot, footHeight, arrive = false, padding = SPACE.pagePad, style, children }: PageProps) {
  const place = useStickerPlace();
  const onMap = place.level === 'map';
  const stick = useStickOn(arrive);
  const radius = small ? RADIUS.pageSmall : RADIUS.page;
  const edge = onMap ? EDGE.card : EDGE.page;
  return (
    <Animated.View style={[style, stick.body]}>
      <Shell radius={radius} line={LINE.page} face={FACE} edge={edge} drop={DROP.page} dropColor={onMap ? DROP.map : DROP.color}
        insetTop={INSET} float={floating ? FLOAT_SHADOW : undefined} dropStyle={stick.drop}
        inside={<Dots />}
        style={PAGE_FILL}>
        <PlaceProvider value={insidePage()}>
          <View style={{ padding, paddingTop: ribbon ? ribbonOverlap(ribbon.width) + 8 : label ? padding + 14 : padding, paddingBottom: foot ? (footHeight ?? 0) + padding : padding }}>{children}</View>
          {foot ? (
            // The foot is cut by the page's own bottom corners, inside the navy line.
            <View style={{ position: 'absolute', left: LINE.page, right: LINE.page, bottom: LINE.page, height: footHeight, overflow: 'hidden',
              borderBottomLeftRadius: radius - LINE.page, borderBottomRightRadius: radius - LINE.page }}>{foot}</View>
          ) : null}
        </PlaceProvider>
        {label ? (
          <View style={{ position: 'absolute', top: -(label.large ? 19 : 17), left: label.left ?? 18 }} pointerEvents="box-none">
            <TitleLabel tone={label.tone} large={label.large} width={label.width} padLeft={label.art ? label.art.left + label.art.width + 6 : undefined}>{label.text}</TitleLabel>
            {label.art ? (
              <CutEdge source={label.art.source} width={label.art.width} height={label.art.height}
                style={{ position: 'absolute', left: label.art.left, top: label.art.top, transform: label.art.rotate ? [{ rotate: `${label.art.rotate}deg` }] : undefined }} />
            ) : null}
          </View>
        ) : null}
        {ribbon ? <RibbonTitle ribbon={ribbon} /> : null}
      </Shell>
    </Animated.View>
  );
}

/** The ribbon and its words, centred on the page's top edge. */
function RibbonTitle({ ribbon }: { readonly ribbon: PageRibbon }) {
  const h = Math.round(ribbon.width / RIBBON.ratio);
  const size = ribbon.size ?? TYPE.titleLarge;
  const line = Math.round(size * 1.2);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -40, right: -40, top: -(h - ribbonOverlap(ribbon.width)), height: h, alignItems: 'center' }}>
      <CutEdge source={ART.ribbon} width={ribbon.width} height={h} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: Math.round(h * RIBBON.textAt - line / 2) + 2, paddingHorizontal: 40 + ribbon.width * 0.16 }}>
        <StickerText size={size} stroke={STROKE.titleMax} drop={STROKE.dropTitle} spacing={TYPE.titleSpacing} lineHeight={line} role="header">{ribbon.text}</StickerText>
      </View>
    </View>
  );
}

const Page = memo(PageImpl);
export default Page;
