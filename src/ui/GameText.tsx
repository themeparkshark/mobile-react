import { Text, type TextProps, type TextStyle, type StyleProp } from 'react-native';
import { textPreset, type TextPresetName, type TextTone } from './TextPresets';

export type GameTextProps = TextProps & {
  readonly preset?: TextPresetName;
  readonly tone?: TextTone;
  readonly align?: TextStyle['textAlign'];
  readonly style?: StyleProp<TextStyle>;
};

/** Text on a brand preset. Extra styles apply after the preset. */
export default function GameText({ preset = 'body', tone = 'onLight', align, style, ...rest }: GameTextProps) {
  return <Text maxFontSizeMultiplier={1.4} {...rest}
    style={[textPreset(preset, tone), align ? { textAlign: align } : null, style]} />;
}
