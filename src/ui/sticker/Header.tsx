/**
 * Header: the water band at the top of a screen, level 1 (DIRECTION.md kit: Header). Alex's
 * original-top-bar water (or the theme's top bar art, or the purple shop bar), then the navy
 * line, the white cut edge and a 3 pt hard drop at the map's 50 percent navy, all with a STRAIGHT
 * bottom edge (Dustin, Nov 19). The night variant (Secret Shop) lays a navy wash and a thin gold
 * line over the water.
 *
 * It sits in flow and takes exactly `headerHeight(insets.top)` (plus a broadcast banner, which
 * takes its own height in flow above the band): Screen lays it out, so nothing sits under it at
 * rest. Never taller than today's top bar. Slots: `left` (default: Alex's back disc when
 * `onBack`), a `title` or `children` (the map's chips) in the middle, `right` (default: his help
 * disc when `onHelp`), and `broadcast` (today's Broadcasts). `slide` (0 to 1) slides it up on the
 * UI thread for a catch moment. Inside a page it refuses to mount.
 *
 * Plain views and React Native images (no SVG): the straight band is rectangles, and the theme's
 * server art goes through RN's image cache, so a seasonal bar never reloads per screen. The band
 * keeps clear of the side safe areas.
 */
import { memo, type ReactNode } from 'react';
import { Image, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RoundButton from './RoundButton';
import { PlaceProvider, useRefuseInPage } from './StickerContext';
import StickerText from './StickerText';
import { ART, ART_RATIO } from './art';
import { headerCrest, headerHeight } from './layout';
import { WORLD } from './level';
import { TEXT } from './textRoles';
import { DROP, GAP, HEADER, INK, SHADE, SPACE } from './tokens';

/** The band's outline: a plain rectangle, straight bottom edge at `bottom`. */
export function headerPath(width: number, bottom: number): string {
  return `M0,0 L${width},0 L${width},${bottom} L0,${bottom} Z`;
}

/** The band's layers, top to bottom, as heights from the top (pure, tested): water to the crest, then the line, the edge, the drop. All straight. */
export function headerLayers(insetTop: number): { readonly water: number; readonly line: number; readonly edge: number; readonly drop: number } {
  const crest = headerCrest(insetTop);
  return { water: crest, line: crest + HEADER.line, edge: crest + HEADER.line + HEADER.edge, drop: crest + HEADER.line + HEADER.edge + HEADER.drop };
}

/**
 * Alex's bar art keeps its rim curve (the wave Dustin turned down, Nov 19) below about 0.66 of
 * its height. The band shows the art only above that: drawn at its natural aspect, anchored at
 * the top, at least crest / ART_SHOWN tall, so the band's straight edge clips it before the rim.
 */
export const ART_SHOWN = 0.6;

/** The art's box in the band (pure, tested): natural aspect, centred, top-anchored, the rim below the crest. */
export function headerArtBox(width: number, crest: number, ratio: number): { readonly left: number; readonly width: number; readonly height: number } {
  let height = crest / ART_SHOWN;
  let w = height * ratio;
  if (w < width) { w = width; height = w / ratio; }
  return { left: (width - w) / 2, width: w, height };
}

export type HeaderVariant = 'water' | 'purple' | 'night';

export type HeaderProps = {
  readonly title?: string;
  readonly onBack?: () => void;
  readonly backLabel?: string;
  readonly onHelp?: () => void;
  readonly helpLabel?: string;
  /** Replaces the default back disc. */
  readonly left?: ReactNode;
  /** Replaces the default help disc. */
  readonly right?: ReactNode;
  /** The map's kind: chips across the band (shown when there is no title). */
  readonly children?: ReactNode;
  readonly variant?: HeaderVariant;
  /** The theme's top bar art (theme.top_bar_url), drawn over the bundled water. */
  readonly art?: ImageSourcePropType;
  /** Today's Broadcasts: in flow above the band, taking its own height (never over the back disc or the title). */
  readonly broadcast?: ReactNode;
  /** 0 at rest, 1 slid away (a catch moment), on the UI thread. */
  readonly slide?: SharedValue<number>;
  /** Not reachable while a layer sits over the screen (Screen sets it). */
  readonly inert?: boolean;
};

const TITLE = { ...TEXT.title, spacing: 0.1, maxScale: 1 };
const SHADE_STOPS = [SHADE.bandShadeTop, SHADE.bandShadeLow] as const;

function HeaderImpl({ title, onBack, backLabel = 'Back', onHelp, helpLabel = 'How it works', left, right, children, variant = 'water', art, broadcast, slide, inert = false }: HeaderProps) {
  const refused = useRefuseInPage('Header');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const height = headerHeight(insets.top);
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -(height + SPACE.base * 2) * (slide ? slide.value : 0) }] }));
  if (refused) return null;
  const lay = headerLayers(insets.top);
  const crest = lay.water;
  const top = insets.top;
  const water = variant === 'purple' ? ART.purpleTopBar : ART.topBar;
  const waterBox = headerArtBox(width, crest, variant === 'purple' ? ART_RATIO.purpleTopBar : ART_RATIO.topBar);
  const artBox = headerArtBox(width, crest, ART_RATIO.topBar);
  const leftNode = left ?? (onBack ? <RoundButton kind="back" accessibilityLabel={backLabel} size={HEADER.round} onPress={onBack} /> : null);
  const rightNode = right ?? (onHelp ? <RoundButton kind="help" accessibilityLabel={helpLabel} size={HEADER.round} onPress={onHelp} /> : null);
  const slot = leftNode || rightNode ? HEADER.slot : 0;
  return (
    <Animated.View style={[{ zIndex: 20 }, slideStyle]} pointerEvents={inert ? 'none' : 'box-none'}
      importantForAccessibility={inert ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={inert}>
      {broadcast ? <View pointerEvents="box-none">{broadcast}</View> : null}
      <View style={{ height }} pointerEvents="box-none">
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: lay.drop, backgroundColor: DROP.map }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: lay.edge, backgroundColor: INK.white }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: lay.line, backgroundColor: INK.navy }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: crest, overflow: 'hidden', backgroundColor: INK.blue }}>
          <Image source={water} resizeMode="stretch" fadeDuration={0} style={{ position: 'absolute', top: 0, ...waterBox }} />
          {art && variant !== 'purple' ? <Image source={art} resizeMode="cover" fadeDuration={0} style={{ position: 'absolute', top: 0, ...artBox }} /> : null}
          <LinearGradient colors={SHADE_STOPS} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
          {variant === 'night' ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: SHADE.nightWash }} /> : null}
          {variant === 'night' ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: HEADER.nightLine, backgroundColor: INK.gold }} /> : null}
        </View>
        <PlaceProvider value={WORLD}>
          <View style={{ position: 'absolute', left: insets.left, right: insets.right, top, height: crest - top, flexDirection: 'row', alignItems: 'center' }} pointerEvents="box-none">
            <View style={{ width: slot, paddingLeft: SPACE.pageSnug, alignItems: 'flex-start' }} pointerEvents="box-none">{leftNode}</View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 }} pointerEvents="box-none">
              {title ? (
                <View style={{ alignSelf: 'stretch' }} pointerEvents="none">
                  {/* The game's sign: caps like today's bar (TopbarText), read by VoiceOver as written. */}
                  <StickerText spec={TITLE} lineHeight={38} role="header" fit label={title}>{title.toUpperCase()}</StickerText>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: GAP.wide }} pointerEvents="box-none">{children}</View>
              )}
            </View>
            <View style={{ width: slot, paddingRight: SPACE.pageSnug, alignItems: 'flex-end' }} pointerEvents="box-none">{rightNode}</View>
          </View>
        </PlaceProvider>
      </View>
    </Animated.View>
  );
}

const Header = memo(HeaderImpl);
export default Header;
