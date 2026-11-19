/**
 * WaveFoot: the bottom band of a sheet or dialog, cut with the soft wave, in Alex's
 * original-top-bar water. It always holds the way out, the price or the main action.
 *
 * One fixed-size SVG stretched to the page width (preserveAspectRatio none): it never
 * measures itself (kit rule: no measured SVG). The words and buttons are plain views.
 */
import { memo, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Stop } from 'react-native-svg';
import { ART } from './art';
import { INK, SHADE, WAVE } from './tokens';

/** The wave's path across a viewBox `width` wide: half-waves of period/2, crest at `crest`. */
export function wavePath(width: number, height: number, period: number = WAVE.period, crest: number = WAVE.crest, amplitude: number = WAVE.amplitude): string {
  const halves = Math.max(2, Math.round((width / period) * 2));
  const step = width / halves;
  // Control points sit `amplitude` above and below the crest line (the board: 3.8 and 14.2 around 9).
  const up = crest - amplitude;
  const down = crest + amplitude;
  let d = `M0,${crest}`;
  for (let i = 0; i < halves; i += 1) {
    const x0 = i * step;
    const cy = i % 2 === 0 ? up : down;
    d += ` Q${(x0 + step / 2).toFixed(2)},${cy.toFixed(2)} ${(x0 + step).toFixed(2)},${crest}`;
  }
  return `${d} L${width},${height + 4} L0,${height + 4} Z`;
}

const VIEW_W = 294;
let nextId = 0;

function WaveFootImpl({ height = WAVE.height, children, style }: {
  readonly height?: number;
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const id = useRef(`wave${(nextId += 1)}`).current;
  const d = wavePath(VIEW_W, height);
  return (
    <View style={[{ height }, style]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
        <Defs>
          <ClipPath id={`${id}c`}><Path d={d} /></ClipPath>
          <LinearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={SHADE.waveTop} />
            <Stop offset="1" stopColor={SHADE.blueDeep} />
          </LinearGradient>
        </Defs>
        <Path d={d} transform="translate(0,-5)" fill={SHADE.waveRim} />
        <Path d={d} transform="translate(0,-2.5)" fill={INK.navy} />
        <Path d={d} fill={`url(#${id}g)`} />
        <G clipPath={`url(#${id}c)`}>
          <SvgImage href={ART.topBar} x={-140} y={0} width={620} height={height + 10} preserveAspectRatio="none" opacity={WAVE.textureOpacity} />
        </G>
      </Svg>
      <View style={{ position: 'absolute', left: 0, right: 0, top: WAVE.contentTop, bottom: 0, alignItems: 'center' }}>
        {children}
      </View>
    </View>
  );
}

const WaveFoot = memo(WaveFootImpl);
export default WaveFoot;
