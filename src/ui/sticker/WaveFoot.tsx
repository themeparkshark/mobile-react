/**
 * WaveFoot: the bottom band of a sheet or dialog (or a screen's foot band, the win card), cut with
 * the soft wave in Alex's original-top-bar water. It always holds the way out, the price or the
 * main action. The one primary in a foot wears the white edge (level rule: insideFoot).
 *
 * One SVG drawn at its real width (known from the frame or the window, never measured: kit rule,
 * no measured SVG), with the one wave period the footer shares. The words and buttons are plain views.
 */
import { memo, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Stop } from 'react-native-svg';
import { PlaceProvider } from './StickerContext';
import { ART } from './art';
import { insideFoot } from './level';
import { INK, SHADE, SPACE, WAVE } from './tokens';

/** Half-waves of period/2 across [x0, x1] at `crest` (control points `amplitude` above and below), as path commands after a move to (x0, crest). */
export function waveRun(x0: number, x1: number, crest: number, period: number = WAVE.period, amplitude: number = WAVE.amplitude, startUp: boolean = true): string {
  const halves = Math.max(1, Math.round(((x1 - x0) / period) * 2));
  const step = (x1 - x0) / halves;
  let d = '';
  for (let i = 0; i < halves; i += 1) {
    const a = x0 + i * step;
    const up = (i % 2 === 0) === startUp;
    d += ` Q${(a + step / 2).toFixed(2)},${(up ? crest - amplitude : crest + amplitude).toFixed(2)} ${(a + step).toFixed(2)},${crest}`;
  }
  return d;
}

/** The wave's path across a band `width` wide: the soft wave along the top at `crest`, then straight down and across. */
export function wavePath(width: number, height: number, period: number = WAVE.period, crest: number = WAVE.crest, amplitude: number = WAVE.amplitude): string {
  return `M0,${crest}${waveRun(0, width, crest, period, amplitude)} L${width},${height + 4} L0,${height + 4} Z`;
}

let nextId = 0;
/** How much taller than its least height the water is drawn. */
const GROW = 120;

function WaveFootImpl({ width, height = WAVE.height, padBottom = SPACE.base * 2, children, style }: {
  /** The band's real width (Page passes its own; a screen band passes the window's). */
  readonly width: number;
  /** The band's least height; it grows with what it holds (a gold primary and its edge), never clipping it. */
  readonly height?: number;
  /** Room under the content (a screen band adds the home bar inset). */
  readonly padBottom?: number;
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const id = useRef(`wave${(nextId += 1)}`).current;
  const w = Math.max(1, Math.round(width));
  // The water is drawn taller than the least height, so a band that grows never shows its end.
  const drawn = height + GROW;
  const d = wavePath(w, drawn);
  return (
    <View style={[{ minHeight: height, overflow: 'hidden' }, style]}>
      <Svg width={w} height={drawn} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Defs>
          <ClipPath id={`${id}c`}><Path d={d} /></ClipPath>
          <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SHADE.waveTop} />
            <Stop offset="1" stopColor={SHADE.blueDeep} />
          </LinearGradient>
        </Defs>
        <Path d={d} transform={`translate(0,-${WAVE.rim})`} fill={SHADE.waveRim} />
        <Path d={d} transform={`translate(0,-${WAVE.line})`} fill={INK.navy} />
        <Path d={d} fill={`url(#${id}g)`} />
        <G clipPath={`url(#${id}c)`}>
          <SvgImage href={ART.topBar} x={-w * 0.476} y={0} width={w * 2.11} height={drawn + 10} preserveAspectRatio="none" opacity={WAVE.textureOpacity} />
        </G>
      </Svg>
      <View style={{ paddingTop: WAVE.contentTop, paddingBottom: padBottom, alignItems: 'center' }}>
        <PlaceProvider value={insideFoot()}>{children}</PlaceProvider>
      </View>
    </View>
  );
}

const WaveFoot = memo(WaveFootImpl);
export default WaveFoot;
