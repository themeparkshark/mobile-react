/**
 * Header: the water band at the top of a screen, level 1 (DIRECTION.md kit: Header). Alex's
 * original-top-bar water, then the navy line, the white cut edge and a hard drop, all with a
 * STRAIGHT bottom edge. No wave on the top bar (Dustin, Nov 19: a wavy edge on a fixed bar
 * cuts across what sits or scrolls under it). The wave stays on the sheet foot and the footer.
 * Two kinds: a title (back disc, name, help disc) or the map's chips (`children`).
 *
 * One SVG whose size comes from the safe area and the window, never from a layout pass
 * (kit rule: no measured SVG). It sits over the screen and covers nothing at rest: every
 * screen starts its content at `headerContentTop`, art that hangs off a card included.
 * Its full height is never more than today's top bar (`TOPBAR_TODAY` under the status bar).
 */
import { memo, useRef, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import RoundButton from './RoundButton';
import { PlaceProvider } from './StickerContext';
import StickerText from './StickerText';
import { ART } from './art';
import { WORLD } from './level';
import { DROP, HEADER, INK, SHADE, STROKE, WAVE } from './tokens';

/** Today's top bar (src/components/Topbar.tsx): 70 pt of art under the status bar. The Header is never taller. */
export const TOPBAR_TODAY = 70;

/**
 * A wave outline (flat top, the soft wave along the bottom at `crest`). Not used by the Header:
 * kept for the footer band, which flips it.
 */
export function bandPath(width: number, crest: number, period: number = HEADER.period, amplitude: number = WAVE.amplitude): string {
  const halves = Math.max(2, Math.round((width / period) * 2));
  const step = width / halves;
  let d = `M0,${crest}`;
  for (let i = 0; i < halves; i += 1) {
    const x0 = i * step;
    const cy = i % 2 === 0 ? crest - amplitude : crest + amplitude;
    d += ` Q${(x0 + step / 2).toFixed(2)},${cy.toFixed(2)} ${(x0 + step).toFixed(2)},${crest}`;
  }
  return `${d} L${width},0 L0,0 Z`;
}

/** The band's outline: a plain rectangle, straight bottom edge at `bottom`. */
export function headerPath(width: number, bottom: number): string {
  return `M0,0 L${width},0 L${width},${bottom} L0,${bottom} Z`;
}

/** Where the water ends (the straight bottom edge) for a safe area top. */
export function headerCrest(insetTop: number): number {
  return insetTop + HEADER.crest;
}

/** The band's full height: water, line, edge and drop, all straight. */
export function headerHeight(insetTop: number): number {
  return headerCrest(insetTop) + HEADER.line + HEADER.edge + HEADER.drop;
}

/**
 * Where a screen's content starts: the bar's full height plus the standard gap. `overhang` is how
 * far art rises above its own card (the shelf's shark, a ribbon, a label's lock), so the art
 * starts below the bar too. Every screen under a Header takes its top from here.
 */
export function headerContentTop(insetTop: number, overhang: number = 0): number {
  return headerHeight(insetTop) + HEADER.gap + overhang;
}

export type HeaderProps = {
  readonly title?: string;
  readonly onBack?: () => void;
  readonly backLabel?: string;
  readonly onHelp?: () => void;
  readonly helpLabel?: string;
  /** The map's kind: chips across the band instead of a title. */
  readonly children?: ReactNode;
};

let nextId = 0;

function HeaderImpl({ title, onBack, backLabel = 'Back', onHelp, helpLabel = 'How it works', children }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const id = useRef(`band${(nextId += 1)}`).current;
  const crest = headerCrest(insets.top);
  const height = headerHeight(insets.top);
  const d = headerPath(width, crest);
  const navyAt = HEADER.line;
  const whiteAt = HEADER.line + HEADER.edge;
  const dropAt = whiteAt + HEADER.drop;
  const top = insets.top;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height, zIndex: 40 }} pointerEvents="box-none">
      <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Defs>
          <ClipPath id={`${id}c`}><Path d={d} /></ClipPath>
          <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SHADE.bandTop} stopOpacity={0} />
            <Stop offset="1" stopColor={INK.blueLip} stopOpacity={HEADER.shadeOpacity} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={crest + dropAt} fill={DROP.color} />
        <Rect x={0} y={0} width={width} height={crest + whiteAt} fill={INK.white} />
        <Rect x={0} y={0} width={width} height={crest + navyAt} fill={INK.navy} />
        <G clipPath={`url(#${id}c)`}>
          <SvgImage href={ART.topBar} x={-width * 0.51} y={0} width={width * 2.03} height={crest * 1.38} preserveAspectRatio="none" />
          <Rect x={0} y={0} width={width} height={crest} fill={`url(#${id}g)`} />
        </G>
      </Svg>
      <PlaceProvider value={WORLD}>
        {children ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: top + 4, flexDirection: 'row', justifyContent: 'center', gap: 26, paddingLeft: 12 }} pointerEvents="box-none">
            {children}
          </View>
        ) : (
          <>
            {onBack ? <RoundButton kind="back" accessibilityLabel={backLabel} size={HEADER.round} onPress={onBack} style={{ position: 'absolute', left: 14, top: top - 4 }} /> : null}
            {title ? (
              <View style={{ position: 'absolute', left: 74, right: 74, top: top + 2 }} pointerEvents="none">
                <StickerText size={HEADER.title} stroke={STROKE.title} spacing={0.1} lineHeight={38} role="header">{title}</StickerText>
              </View>
            ) : null}
            {onHelp ? <RoundButton kind="help" accessibilityLabel={helpLabel} size={HEADER.round} onPress={onHelp} style={{ position: 'absolute', right: 13, top: top - 5 }} /> : null}
          </>
        )}
      </PlaceProvider>
    </View>
  );
}

const Header = memo(HeaderImpl);
export default Header;
