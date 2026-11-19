/**
 * StickerText: Shark type, white (or gold) with a round navy stroke outside the letters and
 * a hard drop straight down. 17 pt and up only; under 17 pt it is plain white with a 1.5 pt
 * drop on blue, plain navy on paper (DIRECTION.md, type).
 *
 * How the stroke is drawn (the spike's measured choice, PARTS.md): 12 navy copies of the
 * words on a circle around the fill, moved with transforms only, each casting one hard text
 * shadow straight down, so the same 12 copies draw the drop. Every copy fills the fill's own
 * box, so a title that shrinks to fit or wraps lays out the same in every copy (no ghost
 * letters). One VoiceOver element per title: the container is the only accessible node.
 */
import { memo, type ReactNode } from 'react';
import { Text, View, type AccessibilityRole, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useStickerPlace } from './StickerContext';
import { RING_COPIES, dropFor, ring, strokeFor } from './outline';
import { FONT, INK, SHADE, STROKE } from './tokens';

export type StickerTextTone = 'white' | 'gold' | 'navy' | 'auto';
export type OutlineTechnique = 'shadow' | 'copies';

export type StickerTextProps = {
  readonly children: string;
  readonly size: number;
  /** 'auto' (default): white on blue and the map, navy on paper. */
  readonly tone?: StickerTextTone;
  /** Stroke outside the letters in pt (clamped to 3; none under 17 pt). */
  readonly stroke?: number;
  readonly strokeColor?: string;
  /** Letter colour override (the off button's pale ink). */
  readonly fill?: string;
  /** Hard drop under the letters in pt. */
  readonly drop?: number;
  /** Letter spacing in em (titles 0.09 to 0.10). */
  readonly spacing?: number;
  readonly lineHeight?: number;
  /** Lines before it wraps (default 1). */
  readonly lines?: number;
  /** One line that shrinks to fit (default on when lines is 1). */
  readonly fit?: boolean;
  readonly align?: TextStyle['textAlign'];
  readonly font?: 'shark' | 'knockout';
  /** Largest Dynamic Type multiplier (default 1.3). */
  readonly maxScale?: number;
  /** 'none' when a parent (a button) already speaks for it. */
  readonly role?: AccessibilityRole | 'none';
  /** What VoiceOver says, when the words on screen are not the words to speak. */
  readonly label?: string;
  readonly style?: StyleProp<ViewStyle>;
  /** Spike only: which outline build to draw, and with how many copies. */
  readonly technique?: OutlineTechnique;
  readonly copies?: number;
  /** Cache the finished title as one bitmap (default on): cheap to scroll and to animate. */
  readonly rasterize?: boolean;
};

const MIN_FIT_SCALE = 0.6;

function StickerTextImpl({
  children, size, tone = 'auto', stroke, strokeColor = INK.navy, fill: fillColor, drop, spacing = 0.04, lineHeight, lines = 1, fit,
  align = 'center', font = 'shark', maxScale = 1.3, role = 'text', label, style, technique = 'shadow',
  copies = RING_COPIES, rasterize = true,
}: StickerTextProps) {
  const place = useStickerPlace();
  const onPaper = place.surface === 'paper';
  const width = strokeFor(size, stroke);
  const shrink = fit ?? lines === 1;
  const fill = fillColor ?? (tone === 'gold' ? INK.gold : tone === 'navy' || (tone === 'auto' && onPaper && width === 0) ? INK.navy : INK.white);
  const base: TextStyle = {
    fontFamily: font === 'shark' ? FONT.shark : FONT.knockout,
    fontSize: size,
    lineHeight: lineHeight ?? Math.round(size * 1.25),
    letterSpacing: Math.round(size * spacing * 100) / 100,
    textAlign: align,
  };
  const textProps = {
    numberOfLines: lines,
    adjustsFontSizeToFit: shrink,
    minimumFontScale: shrink ? MIN_FIT_SCALE : undefined,
    maxFontSizeMultiplier: maxScale,
    accessible: false,
  } as const;
  const a11y = role === 'none'
    ? { accessible: false, importantForAccessibility: 'no-hide-descendants' as const }
    : { accessible: true, accessibilityRole: role, accessibilityLabel: label ?? children };

  // Small type: no stroke. White on blue gets one hard 1.5 pt drop; navy on paper stays plain.
  if (width === 0 || (tone === 'auto' && onPaper && stroke === undefined && size < STROKE.minSize)) {
    const small: TextStyle = fill === INK.white
      ? { color: fill, textShadowColor: SHADE.smallDrop, textShadowOffset: { width: 0, height: STROKE.smallDrop }, textShadowRadius: 0 }
      : { color: fill };
    return <View style={style} {...a11y}><Text {...textProps} style={[base, small]}>{children}</Text></View>;
  }

  const offsets = ring(width, copies);
  const d = dropFor(size, drop);
  // Room for the stroke and the drop inside this view (so a rasterized title keeps them), given
  // back with negative margins so the title takes the same layout space as plain text.
  const pad = Math.ceil(width) + 1;
  const room: ViewStyle = { padding: pad, paddingBottom: pad + d, margin: -pad, marginBottom: -(pad + d) };
  const box: TextStyle = { position: 'absolute', left: pad, right: pad, top: pad, bottom: pad + d };
  let layers: ReactNode[];
  if (technique === 'shadow') {
    const ringStyle: TextStyle = { color: strokeColor, textShadowColor: strokeColor, textShadowOffset: { width: 0, height: d }, textShadowRadius: 0 };
    layers = offsets.map((o, i) => (
      <Text key={i} {...textProps} style={[base, ringStyle, box, { transform: [{ translateX: o.x }, { translateY: o.y }] }]}>{children}</Text>
    ));
  } else {
    const ringStyle: TextStyle = { color: strokeColor };
    const lower = offsets.filter(o => o.y >= 0);
    layers = [
      ...lower.map((o, i) => (
        <Text key={`d${i}`} {...textProps} style={[base, ringStyle, box, { transform: [{ translateX: o.x }, { translateY: o.y + d }] }]}>{children}</Text>
      )),
      ...offsets.map((o, i) => (
        <Text key={`r${i}`} {...textProps} style={[base, ringStyle, box, { transform: [{ translateX: o.x }, { translateY: o.y }] }]}>{children}</Text>
      )),
    ];
  }
  return (
    <View style={[room, style]} shouldRasterizeIOS={rasterize} renderToHardwareTextureAndroid={rasterize} {...a11y}>
      {layers}
      <Text {...textProps} style={[base, { color: fill }]}>{children}</Text>
    </View>
  );
}

const StickerText = memo(StickerTextImpl);
export default StickerText;
