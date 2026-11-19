/**
 * StickerText: Shark type, white (or gold) with a round navy stroke outside the letters and
 * a hard drop straight down. 17 pt and up only; under 17 pt it is plain white with a 1.5 pt
 * drop on blue, plain navy on paper (DIRECTION.md, type).
 *
 * How the stroke is drawn (the spike's measured choice, PARTS.md): 16 navy copies of the
 * words on a circle around the fill, each in a box the size of the fill's moved by its offset,
 * each casting one hard text shadow straight down, so the same 16 copies draw the drop.
 * A one-line title that must shrink is sized once (natural width against its box) and every
 * copy is drawn at that exact size: no copy shrinks itself, so no ghost letters. Wrapped titles
 * lay out the same in every copy because every box has the same width.
 * One VoiceOver element per title: the container is the only accessible node.
 */
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type AccessibilityRole, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
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
  /** Cache the title as one bitmap (default off: Fabric rasterizes at 1x, the spike saw jagged edges). */
  readonly rasterize?: boolean;
  /** Called once the title is laid out and sized (the spike's mount timer). */
  readonly onReady?: () => void;
};

const MIN_FIT_SCALE = 0.6;

/**
 * The size a one-line title is drawn at so it fits its box: the natural one-line width at the
 * asked size against the room it has, never bigger, never under 60 percent (then it ends in an
 * ellipsis). Rounded down to 0.1 pt so every copy gets the identical size.
 */
export function fitSize(size: number, box: number, natural: number): number {
  if (!(box > 0) || !(natural > 0) || natural <= box) return size;
  return Math.floor(size * Math.max(MIN_FIT_SCALE, box / natural) * 10) / 10;
}

function StickerTextImpl({
  children, size, tone = 'auto', stroke, strokeColor = INK.navy, fill: fillColor, drop, spacing = 0.04, lineHeight, lines = 1, fit,
  align = 'center', font = 'shark', maxScale = 1.3, role = 'text', label, style, technique = 'shadow',
  copies = RING_COPIES, rasterize = false, onReady,
}: StickerTextProps) {
  const place = useStickerPlace();
  const onPaper = place.surface === 'paper';
  const width = strokeFor(size, stroke);
  const outlined = !(width === 0 || (tone === 'auto' && onPaper && stroke === undefined && size < STROKE.minSize));
  // A one-line outlined title shrinks to fit by default; plain text only when asked.
  const shrink = (fit ?? (outlined && lines === 1)) && lines === 1;
  // Sized once here, never by the system: iOS's own shrink drew tiny ghost copies (and tiny plain
  // labels) in the spike.
  const measure = shrink;
  const [box, setBox] = useState(0);
  const [natural, setNatural] = useState(0);
  const sized = !measure || (box > 0 && natural > 0);
  const readyRef = useRef(false);
  useEffect(() => {
    if (sized && box > 0 && !readyRef.current) { readyRef.current = true; onReady?.(); }
  }, [box, onReady, sized]);
  const fill = fillColor ?? (tone === 'gold' ? INK.gold : tone === 'navy' || (tone === 'auto' && onPaper && width === 0) ? INK.navy : INK.white);
  const drawn = measure ? fitSize(size, box, natural) : size;
  const base: TextStyle = {
    fontFamily: font === 'shark' ? FONT.shark : FONT.knockout,
    fontSize: drawn,
    lineHeight: lineHeight ?? Math.round(size * 1.25),
    letterSpacing: Math.round(drawn * spacing * 100) / 100,
    textAlign: align,
  };
  const textProps = {
    numberOfLines: lines,
    maxFontSizeMultiplier: maxScale,
    accessible: false,
  } as const;
  const a11y = role === 'none'
    ? { accessible: false, importantForAccessibility: 'no-hide-descendants' as const }
    : { accessible: true, accessibilityRole: role, accessibilityLabel: label ?? children };
  const d = dropFor(size, drop);
  const pad = Math.ceil(width) + 1;
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round((e.nativeEvent.layout.width - (outlined ? pad * 2 : 0)) * 10) / 10;
    setBox(prev => (prev === w ? prev : w));
  }, [outlined, pad]);

  // The natural one-line width at the asked size, measured outside the layout.
  const measureNode = (
    <View style={styles.measure} pointerEvents="none">
      <Text numberOfLines={1} maxFontSizeMultiplier={maxScale} accessible={false} style={[base, { fontSize: size, letterSpacing: Math.round(size * spacing * 100) / 100 }]}
        onTextLayout={e => { const w = Math.max(0, ...e.nativeEvent.lines.map(line => line.width)); setNatural(prev => (Math.abs(prev - w) < 0.5 ? prev : w)); }}>{children}</Text>
    </View>
  );

  // Small type: no stroke. White on blue gets one hard 1.5 pt drop; navy on paper stays plain.
  if (!outlined) {
    const small: TextStyle = fill === INK.white
      ? { color: fill, textShadowColor: SHADE.smallDrop, textShadowOffset: { width: 0, height: STROKE.smallDrop }, textShadowRadius: 0 }
      : { color: fill };
    return (
      <View style={style} onLayout={measure || onReady ? onLayout : undefined} {...a11y}>
        {measure ? measureNode : null}
        <Text {...textProps} style={[base, small, sized ? styles.shown : styles.hidden]}>{children}</Text>
      </View>
    );
  }

  const offsets = ring(width, copies);
  // Room for the stroke and the drop inside this view, given back with negative margins so the
  // title takes the same layout space as plain text.
  const room: ViewStyle = { padding: pad, paddingBottom: pad + d, margin: -pad, marginBottom: -(pad + d) };
  // Each copy gets a box the same size as the fill's, moved by its offset (a transform on a Fabric
  // Text was not drawn in the spike, so the offset is in the box).
  // Copies sit in the fill's own wrapper, so a box is the fill's box moved by the offset.
  const at = (x: number, y: number): TextStyle => ({ position: 'absolute', left: x, right: -x, top: y, bottom: -y });
  let layers: ReactNode[];
  if (technique === 'shadow') {
    const ringStyle: TextStyle = { color: strokeColor, textShadowColor: strokeColor, textShadowOffset: { width: 0, height: d }, textShadowRadius: 0 };
    layers = offsets.map((o, i) => (
      <Text key={i} {...textProps} style={[base, ringStyle, at(o.x, o.y)]}>{children}</Text>
    ));
  } else {
    const ringStyle: TextStyle = { color: strokeColor };
    const lower = offsets.filter(o => o.y >= 0);
    layers = [
      ...lower.map((o, i) => (
        <Text key={`d${i}`} {...textProps} style={[base, ringStyle, at(o.x, o.y + d)]}>{children}</Text>
      )),
      ...offsets.map((o, i) => (
        <Text key={`r${i}`} {...textProps} style={[base, ringStyle, at(o.x, o.y)]}>{children}</Text>
      )),
    ];
  }
  return (
    <View style={[room, style]} onLayout={measure || onReady ? onLayout : undefined}
      shouldRasterizeIOS={rasterize} renderToHardwareTextureAndroid={rasterize} {...a11y}>
      {measure ? measureNode : null}
      <View style={sized ? styles.shown : styles.hidden}>
        {layers}
        <Text {...textProps} style={[base, { color: fill }]}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  measure: { position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 },
  shown: { opacity: 1 },
  hidden: { opacity: 0 },
});

const StickerText = memo(StickerTextImpl);
export default StickerText;
