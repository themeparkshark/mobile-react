/**
 * Text with a cartoon outline (Alex's chunky lettering). React Native has no
 * text stroke, so the outline is 8 offset copies under the fill plus a drop lip.
 *
 * Sized ONCE, then every copy is drawn at that exact size: a single line is
 * measured at its natural width (off-layout, on one line) and scaled to fit
 * its box; multi-line text keeps the size the caller gives it. No copy ever
 * shrinks itself to fit, so all ten copies lay out identically (no ghost
 * glyphs), and the card holds its capture until the size is known.
 */
import { useId, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { useReadyGate } from './FlexArtwork';

/** Fit a single line: scale the font so its natural width fills the box (never up, never under half). */
export function fitScale(box: number, natural: number): number {
  if (!(box > 0) || !(natural > 0)) return 1;
  return Math.max(0.5, Math.min(1, box / natural));
}

const OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

export function Outlined({ text, style, outline, lines = 1, weight }: {
  readonly text: string;
  readonly style: StyleProp<TextStyle>;
  readonly outline: string;
  readonly lines?: number;
  /** Outline thickness in pt (default: 7% of the drawn font size, at least 1.5). */
  readonly weight?: number;
}) {
  const id = useId();
  const flat = StyleSheet.flatten(style) ?? {};
  const base = Number(flat.fontSize) || 20;
  const single = lines === 1;
  const [box, setBox] = useState(0);
  const [natural, setNatural] = useState(0);
  const sized = !single || (box > 0 && natural > 0);
  useReadyGate(`outlined:${id}`, sized);

  const scale = single ? fitScale(box, natural) : 1;
  const fontSize = Math.floor(base * scale * 10) / 10;
  const lineHeight = flat.lineHeight ? Math.round(Number(flat.lineHeight) * scale * 10) / 10 : undefined;
  const size: TextStyle = { fontSize, ...(lineHeight ? { lineHeight } : null) };
  const w = weight ?? Math.max(1.5, fontSize * 0.07);
  const shown = sized ? null : styles.hidden;

  return (
    <View onLayout={event => setBox(event.nativeEvent.layout.width)}>
      {single && (
        // Natural one-line width at the base size, measured outside the layout.
        <View style={styles.measure} pointerEvents="none">
          <Text style={[style, styles.hidden]} numberOfLines={1}
            onTextLayout={event => setNatural(Math.max(0, ...event.nativeEvent.lines.map(line => line.width)))}>{text}</Text>
        </View>
      )}
      <Text style={[style, size, styles.hidden]} numberOfLines={lines}>{text}</Text>
      {OFFSETS.map(([x, y], i) => (
        <Text key={i} numberOfLines={lines} style={[style, size, styles.layer, shown,
          { color: outline, left: x * w, right: -x * w, top: y * w + w * 0.6 }]}>{text}</Text>
      ))}
      <Text numberOfLines={lines} style={[style, size, styles.layer, shown]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  layer: { position: 'absolute', left: 0, right: 0, top: 0 },
  measure: { position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 },
});
