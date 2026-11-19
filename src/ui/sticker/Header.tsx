/**
 * Header: the water band at the top of a screen, level 1 (DIRECTION.md kit: Header). Alex's
 * original-top-bar water (or the theme's top bar art, or the purple shop bar), then the navy
 * line, the white cut edge and a 3 pt hard drop at the map's 50 percent navy, all with a STRAIGHT
 * bottom edge (Dustin, Nov 19). The night variant (Secret Shop) lays a navy wash and a thin gold
 * line over the water.
 *
 * It sits in flow and takes exactly `headerHeight(insets.top)`: Screen lays it out, so nothing
 * sits under it at rest. Never taller than today's top bar. Slots: `left` (default: Alex's back
 * disc when `onBack`), a `title` or `children` (the map's chips) in the middle, `right` (default:
 * his help disc when `onHelp`), and `broadcast` over the status bar (today's Broadcasts). `slide`
 * (0 to 1) slides it up on the UI thread for a catch moment. Inside a page it refuses to mount.
 *
 * One SVG whose size comes from the safe area and the window, never from a layout pass.
 */
import { memo, useRef, type ReactNode } from 'react';
import { View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import RoundButton from './RoundButton';
import { PlaceProvider, useRefuseInPage } from './StickerContext';
import StickerText from './StickerText';
import { ART } from './art';
import { headerCrest, headerHeight } from './layout';
import { WORLD } from './level';
import { TEXT } from './textRoles';
import { DROP, HEADER, INK, SHADE } from './tokens';

/** The band's outline: a plain rectangle, straight bottom edge at `bottom`. */
export function headerPath(width: number, bottom: number): string {
  return `M0,0 L${width},0 L${width},${bottom} L0,${bottom} Z`;
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
  /** Today's Broadcasts, over the status bar. */
  readonly broadcast?: ReactNode;
  /** 0 at rest, 1 slid away (a catch moment), on the UI thread. */
  readonly slide?: SharedValue<number>;
  /** Not reachable while a layer sits over the screen (Screen sets it). */
  readonly inert?: boolean;
};

let nextId = 0;
const TITLE = { ...TEXT.title, spacing: 0.1, maxScale: 1 };

function HeaderImpl({ title, onBack, backLabel = 'Back', onHelp, helpLabel = 'How it works', left, right, children, variant = 'water', art, broadcast, slide, inert = false }: HeaderProps) {
  const refused = useRefuseInPage('Header');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const id = useRef(`band${(nextId += 1)}`).current;
  const crest = headerCrest(insets.top);
  const height = headerHeight(insets.top);
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -(height + 8) * (slide ? slide.value : 0) }] }));
  if (refused) return null;
  const d = headerPath(width, crest);
  const navyAt = HEADER.line;
  const whiteAt = HEADER.line + HEADER.edge;
  const dropAt = whiteAt + HEADER.drop;
  const top = insets.top;
  const water = variant === 'purple' ? ART.purpleTopBar : ART.topBar;
  const leftNode = left ?? (onBack ? <RoundButton kind="back" accessibilityLabel={backLabel} size={HEADER.round} onPress={onBack} /> : null);
  const rightNode = right ?? (onHelp ? <RoundButton kind="help" accessibilityLabel={helpLabel} size={HEADER.round} onPress={onHelp} /> : null);
  return (
    <Animated.View style={[{ height, zIndex: 20 }, slideStyle]} pointerEvents={inert ? 'none' : 'box-none'}
      importantForAccessibility={inert ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={inert}>
      <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Defs>
          <ClipPath id={`${id}c`}><Path d={d} /></ClipPath>
          <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SHADE.bandTop} stopOpacity={0} />
            <Stop offset="1" stopColor={INK.blueLip} stopOpacity={HEADER.shadeOpacity} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={crest + dropAt} fill={DROP.map} />
        <Rect x={0} y={0} width={width} height={crest + whiteAt} fill={INK.white} />
        <Rect x={0} y={0} width={width} height={crest + navyAt} fill={INK.navy} />
        <G clipPath={`url(#${id}c)`}>
          <SvgImage href={water} x={-width * 0.51} y={0} width={width * 2.03} height={crest * 1.38} preserveAspectRatio="none" />
          {art && variant !== 'purple' ? <SvgImage href={art} x={0} y={0} width={width} height={crest} preserveAspectRatio="xMidYMid slice" /> : null}
          <Rect x={0} y={0} width={width} height={crest} fill={`url(#${id}g)`} />
          {variant === 'night' ? <Rect x={0} y={0} width={width} height={crest} fill={SHADE.nightWash} /> : null}
          {variant === 'night' ? <Rect x={0} y={crest - HEADER.nightLine} width={width} height={HEADER.nightLine} fill={INK.gold} /> : null}
        </G>
      </Svg>
      <PlaceProvider value={WORLD}>
        <View style={{ position: 'absolute', left: 0, right: 0, top, height: crest - top, flexDirection: 'row', alignItems: 'center' }} pointerEvents="box-none">
          <View style={{ width: leftNode || rightNode ? HEADER.slot : 0, paddingLeft: 13, alignItems: 'flex-start' }} pointerEvents="box-none">{leftNode}</View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 }} pointerEvents="box-none">
            {title ? (
              <View style={{ alignSelf: 'stretch' }} pointerEvents="none">
                <StickerText spec={TITLE} lineHeight={38} role="header" fit>{title}</StickerText>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24 }} pointerEvents="box-none">{children}</View>
            )}
          </View>
          <View style={{ width: leftNode || rightNode ? HEADER.slot : 0, paddingRight: 13, alignItems: 'flex-end' }} pointerEvents="box-none">{rightNode}</View>
        </View>
        {broadcast ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }} pointerEvents="box-none">{broadcast}</View> : null}
      </PlaceProvider>
    </Animated.View>
  );
}

const Header = memo(HeaderImpl);
export default Header;
