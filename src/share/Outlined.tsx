/**
 * Text with a cartoon outline (Alex's chunky lettering). React Native has no
 * text stroke, so the outline is 8 offset copies under the fill plus a drop
 * lip. Only for short lines on cards.
 */
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

const OUTLINE_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

export function Outlined({ text, style, outline, lines = 1, weight }: {
  readonly text: string;
  readonly style: StyleProp<TextStyle>;
  readonly outline: string;
  readonly lines?: number;
  /** Outline thickness in pt (default: 7% of the font size, at least 1.5). */
  readonly weight?: number;
}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const w = weight ?? Math.max(1.5, (Number(flat.fontSize) || 20) * 0.07);
  // Only single lines shrink to fit: multi-line fitting can break each copy differently, so callers size those.
  const common = lines === 1
    ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6 } as const
    : { numberOfLines: lines } as const;
  return (
    <View>
      <Text {...common} style={[style, styles.hidden]}>{text}</Text>
      {OUTLINE_OFFSETS.map(([x, y], i) => (
        // Offsets are layout (left/top), not transforms: a transform on a fitted Text is dropped on a card's first mount.
        <Text key={i} {...common} style={[style, styles.layer, { color: outline, left: x * w, right: -x * w, top: y * w + w * 0.6 }]}>{text}</Text>
      ))}
      <Text {...common} style={[style, styles.layer]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  layer: { position: 'absolute', left: 0, right: 0, top: 0 },
});
