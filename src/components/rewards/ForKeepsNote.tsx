/**
 * "This is for keeps" with its lock picture (T186, hold-2). Both team picks (the step inside the first
 * win card, where players meet it, and the full TeamSelection screen) draw this one note, so the lock
 * can never be missing on one of them again. The picture leads, so a child reads it before a word.
 */
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import GameIcon from '../../ui/GameIcon';

export const FOR_KEEPS_SHORT = 'This is for keeps.';
export const FOR_KEEPS_LONG = 'This is for keeps: you can’t switch teams later.';

export default function ForKeepsNote({ text = FOR_KEEPS_SHORT, iconSize = 22, style, textStyle }: {
  readonly text?: string;
  readonly iconSize?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.row, style]} accessible accessibilityLabel={text === FOR_KEEPS_SHORT ? FOR_KEEPS_LONG : text}>
      <GameIcon name="lock" size={iconSize} />
      <Text style={[styles.text, textStyle]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  text: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff', textAlign: 'center', flexShrink: 1 },
});
