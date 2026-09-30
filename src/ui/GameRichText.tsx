/**
 * <GameRichText> renders copy with inline GameIcons (WS0 UI kit).
 *
 *   <GameRichText preset="body">Spend [icon:ticket] 1 Ticket to play</GameRichText>
 *
 * Safe for server strings: legacy emoji are mapped to icons or dropped, so an
 * emoji never reaches the screen. The accessibility label is the plain text.
 */
import { Text, View, type StyleProp, type TextStyle } from 'react-native';
import GameIcon from './GameIcon';
import { textPreset, type TextPresetName, type TextTone } from './TextPresets';
import { parseIconTokens, stripIconTokens } from './iconTokens';

export type GameRichTextProps = {
  readonly children: string;
  readonly preset?: TextPresetName;
  readonly tone?: TextTone;
  readonly style?: StyleProp<TextStyle>;
  readonly numberOfLines?: number;
  /** Icon size; defaults to 1.15x the preset font size. */
  readonly iconSize?: number;
};

export default function GameRichText({ children, preset = 'body', tone = 'onLight', style, numberOfLines, iconSize }: GameRichTextProps) {
  const base = textPreset(preset, tone);
  const size = iconSize ?? Math.round((base.fontSize ?? 16) * 1.15);
  const parts = parseIconTokens(children ?? '');
  return <Text style={[base, style]} numberOfLines={numberOfLines} maxFontSizeMultiplier={1.4}
    accessibilityLabel={stripIconTokens(children ?? '')}>
    {parts.map((part, index) => part.kind === 'text' ? part.text
      : <View key={index} style={{ width: size, height: size, marginBottom: -Math.round(size * 0.18) }}>
        <GameIcon name={part.name} size={size} />
      </View>)}
  </Text>;
}
