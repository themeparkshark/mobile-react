/**
 * StickerText (internal: screens use the roles in Text.tsx). Shark type, white (or gold) with a
 * round navy stroke outside the letters and a hard drop straight down, 17 pt and up on colour.
 * Under 17 pt on colour it is plain white with a 1.5 pt drop. On paper it is plain navy at every
 * size, never stroked (DIRECTION.md, type).
 *
 * How the stroke is drawn (the spike's measured choice, PARTS.md): navy copies of the words on a
 * circle around the fill (12 copies under 24 pt, 16 from 24 pt), each in a box the size of the
 * fill's moved by its offset, each casting one hard text shadow straight down, so the same copies
 * draw the drop. A one-line title that is asked to fit is drawn at the asked size from its first
 * frame, measured once by a hidden node that is then removed, and redrawn at the fitted size if
 * it is too wide (every copy at that exact size: no copy shrinks itself, so no ghost letters).
 * One VoiceOver element per title: the container is the only accessible node.
 */
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type AccessibilityRole, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useStickerPlace } from './StickerContext';
import { copiesFor, dropFor, ring, strokeFor } from './outline';
import { inkFor, type InkDecision, type TextRoleSpec } from './textRoles';
import { FONT, INK, SHADE, STROKE } from './tokens';

/** The colour of each ink the one rule (inkFor) can pick. */
const INK_OF: Record<InkDecision['ink'], string> = {
  white: INK.white, gold: INK.gold, navy: INK.navy, navySoft: INK.navySoft, goldInk: INK.goldInk, onBlueSoft: SHADE.onBlueSoft,
};

export type StickerTextTone = 'auto' | 'white' | 'gold' | 'navy' | 'soft';
export type OutlineTechnique = 'shadow' | 'copies';

export type StickerTextProps = {
  readonly children: string;
  /** A role row from text.ts: font, size, spacing, stroke, drop, leading, max scale. */
  readonly spec?: TextRoleSpec;
  readonly size?: number;
  /** 'auto' (default): white on colour, navy on paper. 'soft': the second-line colour. */
  readonly tone?: StickerTextTone;
  /** Stroke outside the letters in pt (clamped to 3; none under 17 pt; none on paper). */
  readonly stroke?: number;
  readonly strokeColor?: string;
  /** Letter colour override (internal: the off button's label). */
  readonly fill?: string;
  readonly drop?: number;
  readonly spacing?: number;
  readonly lineHeight?: number;
  /** Lines before it wraps (default 1). */
  readonly lines?: number;
  /** One line that shrinks to fit its box, never under 60 percent. Off by default. */
  readonly fit?: boolean;
  readonly align?: TextStyle['textAlign'];
  readonly font?: 'shark' | 'knockout';
  readonly maxScale?: number;
  /** 'none' when a parent (a button) already speaks for it. */
  readonly role?: AccessibilityRole | 'none';
  readonly label?: string;
  /** Digits of equal width (counts that tick). */
  readonly tabular?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  /** Spike only: which outline build to draw, and with how many copies. */
  readonly technique?: OutlineTechnique;
  readonly copies?: number;
  readonly rasterize?: boolean;
  /** Called once the title is laid out (the spike's mount timer). */
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
  children, spec, size: sizeProp, tone = 'auto', stroke, strokeColor = INK.navy, fill: fillColor, drop, spacing: spacingProp, lineHeight, lines = 1, fit = false,
  align = 'center', font: fontProp, maxScale: maxScaleProp, role = 'text', label, tabular = false, style, technique = 'shadow',
  copies, rasterize = false, onReady,
}: StickerTextProps) {
  const place = useStickerPlace();
  const onPaper = place.surface === 'paper';
  const size = sizeProp ?? spec?.size ?? 16;
  const spacing = spacingProp ?? spec?.spacing ?? 0.04;
  const font = fontProp ?? spec?.font ?? 'shark';
  const maxScale = maxScaleProp ?? spec?.maxScale ?? 1.3;
  const askedStroke = stroke ?? spec?.stroke;
  // One rule for ink, stroke and drop: inkFor (tested). A white face (tone 'navy') inks like paper.
  const ink = inkFor({
    font, size, spacing, stroke: strokeFor(size, askedStroke), drop: drop ?? spec?.drop ?? 0, leading: spec?.leading ?? 1.25, maxScale, caps: spec?.caps,
  }, (onPaper && tone !== 'white') || tone === 'navy', tone === 'gold' ? 'gold' : tone === 'soft' ? 'soft' : 'auto');
  const width = ink.stroke;
  const outlined = width > 0;
  const shrink = fit && lines === 1;
  const key = `${children}|${size}|${spacing}|${maxScale}|${font}`;
  const [box, setBox] = useState(0);
  const [measured, setMeasured] = useState<{ key: string; width: number } | null>(null);
  const natural = measured && measured.key === key ? measured.width : 0;
  const readyRef = useRef(false);
  useEffect(() => {
    if (box > 0 && !readyRef.current) { readyRef.current = true; onReady?.(); }
  }, [box, onReady]);
  const fill = fillColor ?? INK_OF[ink.ink];
  const drawn = shrink ? fitSize(size, box, natural) : size;
  const base: TextStyle = {
    fontFamily: font === 'shark' ? FONT.shark : FONT.knockout,
    fontSize: drawn,
    lineHeight: lineHeight ?? Math.round(size * (spec?.leading ?? 1.25)),
    letterSpacing: Math.round(drawn * spacing * 100) / 100,
    textAlign: align,
    fontVariant: tabular ? ['tabular-nums'] : undefined,
  };
  // Wrapped lines break the iOS way that avoids a lone last word ("= 1 / Ticket"); one line never wraps.
  const textProps = { numberOfLines: lines, maxFontSizeMultiplier: maxScale, accessible: false, lineBreakStrategyIOS: lines === 1 ? undefined : 'push-out' } as const;
  const a11y = role === 'none'
    ? { accessible: false, importantForAccessibility: 'no-hide-descendants' as const }
    : { accessible: true, accessibilityRole: role, accessibilityLabel: label ?? children };
  const d = dropFor(size, drop ?? spec?.drop);
  const pad = Math.ceil(width) + 1;
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round((e.nativeEvent.layout.width - (outlined ? pad * 2 : 0)) * 10) / 10;
    setBox(prev => (prev === w ? prev : w));
  }, [outlined, pad]);
  const wantsLayout = shrink || !!onReady;

  // The natural one-line width at the asked size, measured once outside the layout, then removed.
  const measureNode = shrink && natural === 0 ? (
    <View style={styles.measure} pointerEvents="none">
      <Text numberOfLines={1} maxFontSizeMultiplier={maxScale} accessible={false} style={[base, { fontSize: size, letterSpacing: Math.round(size * spacing * 100) / 100 }]}
        onTextLayout={e => { const w = Math.max(0, ...e.nativeEvent.lines.map(line => line.width)); if (w > 0) setMeasured({ key, width: w }); }}>{children}</Text>
    </View>
  ) : null;

  if (!outlined) {
    const small: TextStyle = ink.smallDrop && !fillColor
      ? { color: fill, textShadowColor: SHADE.smallDrop, textShadowOffset: { width: 0, height: STROKE.smallDrop }, textShadowRadius: 0 }
      : { color: fill };
    return (
      <View style={style} onLayout={wantsLayout ? onLayout : undefined} {...a11y}>
        {measureNode}
        <Text {...textProps} style={[base, small]}>{children}</Text>
      </View>
    );
  }

  const offsets = ring(width, copies ?? copiesFor(size));
  // Room for the stroke and the drop inside this view, given back with negative margins so the
  // title takes the same layout space as plain text.
  const room: ViewStyle = { padding: pad, paddingBottom: pad + d, margin: -pad, marginBottom: -(pad + d) };
  // Each copy gets a box the same size as the fill's, moved by its offset (a transform on a Fabric
  // Text was not drawn in the spike, so the offset is in the box).
  const at = (x: number, y: number): TextStyle => ({ position: 'absolute', left: x, right: -x, top: y, bottom: -y });
  let layers: ReactNode[];
  if (technique === 'shadow') {
    const ringStyle: TextStyle = { color: strokeColor, textShadowColor: strokeColor, textShadowOffset: { width: 0, height: d }, textShadowRadius: 0 };
    layers = offsets.map((o, i) => <Text key={i} {...textProps} style={[base, ringStyle, at(o.x, o.y)]}>{children}</Text>);
  } else {
    const ringStyle: TextStyle = { color: strokeColor };
    const lower = offsets.filter(o => o.y >= 0);
    layers = [
      ...lower.map((o, i) => <Text key={`d${i}`} {...textProps} style={[base, ringStyle, at(o.x, o.y + d)]}>{children}</Text>),
      ...offsets.map((o, i) => <Text key={`r${i}`} {...textProps} style={[base, ringStyle, at(o.x, o.y)]}>{children}</Text>),
    ];
  }
  return (
    <View style={[room, style]} onLayout={wantsLayout ? onLayout : undefined}
      shouldRasterizeIOS={rasterize} renderToHardwareTextureAndroid={rasterize} {...a11y}>
      {measureNode}
      <View>
        {layers}
        <Text {...textProps} style={[base, { color: fill }]}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  measure: { position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 },
});

const StickerText = memo(StickerTextImpl);
export default StickerText;
