/**
 * Footer: the same water band as the Header at the bottom of a screen, cut along its top with the
 * one soft wave, Map raised on a hump in the middle (DIRECTION.md kit: Footer; kit.css .ftr).
 * The five toolbar icons are Alex's, in today's order (News, Standings, Map, Social, Profile); the
 * picked one's word is a white tag. Level 1.
 *
 * Dustin's lesson (Nov 19): it takes its own space. Screen lays it out in flow and its box
 * (`footerHeight`) holds the band, the hump and the raised Map icon, so nothing a player needs
 * sits under it at rest; content ends `footerContentBottom` above the screen's bottom. The band is
 * never taller than today's footer art (window width / 5.3), and the hump rises only inside the
 * footer's own box. One SVG drawn at the window's width (never measured).
 */
import { memo, useCallback, useRef } from 'react';
import { Pressable, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { haptic } from '../../gamekit/Haptics';
import Badge from './Badge';
import Lift from './Lift';
import { PlaceProvider, useRefuseInPage } from './StickerContext';
import StickerText from './StickerText';
import { waveRun } from './WaveFoot';
import { ART, ART_RATIO } from './art';
import { footerBand, footerCrest, footerHeight, footerScale } from './layout';
import { WORLD } from './level';
import { usePress } from './motion';
import { TEXT } from './textRoles';
import { DROP, FOOTER, INK, LINE, SHADE, WAVE } from './tokens';

/** Alex's five toolbar icons, in today's order. The raised one is the middle (Map). */
export const FOOTER_ART = [
  { art: ART.toolbarNews, ratio: ART_RATIO.toolbarNews, size: 44, bottom: 26, at: 0.141 },
  { art: ART.toolbarStandings, ratio: ART_RATIO.toolbarStandings, size: 46, bottom: 25, at: 0.297 },
  { art: ART.toolbarMap, ratio: ART_RATIO.toolbarMap, size: FOOTER.iconMap, bottom: FOOTER.mapBottom, at: 0.5 },
  { art: ART.toolbarSocial, ratio: ART_RATIO.toolbarSocial, size: 44, bottom: 26, at: 0.71 },
  { art: ART.toolbarProfile, ratio: ART_RATIO.toolbarProfile, size: 44, bottom: 26, at: 0.859 },
] as const;

/** Half the hump's width (the board: 48.75 at 390). */
const HUMP_HALF = 48.75;

/** The band's outline at a width: the wave along the top, the hump in the middle, straight down and across. */
export function footerPath(width: number, height: number): string {
  const c = footerCrest();
  const cx = width / 2;
  const top = c - FOOTER.hump;
  const l = cx - HUMP_HALF;
  const r = cx + HUMP_HALF;
  const hump = ` C${(l + 17.75).toFixed(2)},${c} ${(l + 18.75).toFixed(2)},${top} ${cx.toFixed(2)},${top} C${(r - 18.75).toFixed(2)},${top} ${(r - 17.75).toFixed(2)},${c} ${r.toFixed(2)},${c}`;
  return `M0,${c}${waveRun(0, l, c)}${hump}${waveRun(r, width, c)} L${width},${height + 4} L0,${height + 4} Z`;
}

export type FooterItem = {
  readonly key: string;
  /** The word under the icon ("Map"); shown in caps. */
  readonly label: string;
  /** What VoiceOver says (default: the word). */
  readonly accessibilityLabel?: string;
  /** A red count on the icon (Profile's notifications). */
  readonly badge?: number;
  /** Alex's icon (default: FOOTER_ART in order). */
  readonly art?: ImageSourcePropType;
};

export type FooterProps = {
  /** Five items, in today's order; the middle one sits on the hump. */
  readonly items: readonly FooterItem[];
  readonly picked?: string;
  readonly onPick?: (key: string) => void;
  /** 0 at rest, 1 slid away (a catch moment), on the UI thread. */
  readonly slide?: SharedValue<number>;
  readonly inert?: boolean;
};

const WORD = { ...TEXT.tag, size: FOOTER.label, spacing: 0.04, maxScale: 1 };
/** The word under an icon may be wider than its icon (STANDINGS). */
const LABEL_W = 96;

const Tab = memo(function Tab({ item, index, picked, width, height, onPick }: {
  item: FooterItem; index: number; picked: boolean; width: number; height: number; onPick?: (key: string) => void;
}) {
  const a = FOOTER_ART[Math.min(index, FOOTER_ART.length - 1)];
  const s = footerScale(width);
  const iconW = Math.round(a.size * s);
  const iconH = Math.round(iconW / a.ratio);
  const x = Math.round(width * a.at);
  const hitW = Math.max(56, iconW + 8);
  const top = height - a.bottom - iconH;
  const { p, pressIn, pressOut } = usePress();
  const squish = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.08 * p.value }] }));
  const press = useCallback(() => { haptic('tapLight'); onPick?.(item.key); }, [item.key, onPick]);
  const word = item.label.toUpperCase();
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={item.accessibilityLabel ?? item.label} accessibilityState={{ selected: picked }}
      onPressIn={pressIn} onPressOut={pressOut} onPress={press}
      style={{ position: 'absolute', left: x - hitW / 2, width: hitW, top, bottom: 0, alignItems: 'center' }}>
      <Animated.View style={squish}>
        <Lift source={item.art ?? a.art} width={iconW} height={iconH} />
        {item.badge ? <Badge count={item.badge} label="" hidden style={{ position: 'absolute', right: -8, top: -4 }} /> : null}
      </Animated.View>
      <View style={{ position: 'absolute', bottom: picked ? 4 : FOOTER.labelBottom, left: hitW / 2 - LABEL_W / 2, width: LABEL_W, alignItems: 'center' }}>
        {picked ? (
          <View>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 2, bottom: -2, borderRadius: 999, backgroundColor: DROP.color }} />
            <View style={{ paddingHorizontal: 9, paddingTop: 2, height: 21, borderRadius: 999, backgroundColor: INK.white, borderWidth: LINE.chip, borderColor: INK.navy, justifyContent: 'center' }}>
              <StickerText spec={WORD} tone="navy" lineHeight={16} role="none">{word}</StickerText>
            </View>
          </View>
        ) : (
          <StickerText spec={WORD} lineHeight={16} role="none">{word}</StickerText>
        )}
      </View>
    </Pressable>
  );
});

let nextId = 0;

function FooterImpl({ items, picked, onPick, slide, inert = false }: FooterProps) {
  const refused = useRefuseInPage('Footer');
  const { width } = useWindowDimensions();
  const id = useRef(`ftr${(nextId += 1)}`).current;
  const height = footerHeight(width);
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (height + 8) * (slide ? slide.value : 0) }] }));
  if (refused) return null;
  const d = footerPath(width, height);
  const c = footerCrest();
  return (
    <Animated.View accessibilityRole="tabbar" style={[{ height, zIndex: 20 }, slideStyle]} pointerEvents={inert ? 'none' : 'box-none'}
      importantForAccessibility={inert ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={inert}>
      <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Defs>
          <ClipPath id={`${id}c`}><Path d={d} /></ClipPath>
          <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SHADE.bandTop} stopOpacity={0} />
            <Stop offset="1" stopColor={INK.blueLip} stopOpacity={FOOTER.shadeOpacity} />
          </LinearGradient>
        </Defs>
        <Path d={d} transform={`translate(0,-${FOOTER.rim})`} fill={INK.white} />
        <Path d={d} transform={`translate(0,-${FOOTER.line})`} fill={INK.navy} />
        <G clipPath={`url(#${id}c)`}>
          <Rect x={0} y={0} width={width} height={height} fill={INK.blue} />
          <SvgImage href={ART.topBar} x={-width * 0.513} y={c - 54} width={width * 2.026} height={height - c + 54 + 25} preserveAspectRatio="none" />
          <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}g)`} />
        </G>
      </Svg>
      <PlaceProvider value={WORLD}>
        {items.slice(0, FOOTER_ART.length).map((item, i) => (
          <Tab key={item.key} item={item} index={i} picked={item.key === picked} width={width} height={height} onPick={onPick} />
        ))}
      </PlaceProvider>
    </Animated.View>
  );
}

const Footer = memo(FooterImpl);
export default Footer;

/** For tests: the band height check (never taller than today's art). */
export const FOOTER_BAND = footerBand;
export const FOOTER_WAVE_PERIOD = WAVE.period;
