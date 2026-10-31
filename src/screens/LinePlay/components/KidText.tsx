/**
 * Kid text with its numbers in the card's number font (Shark), whose 1 has a
 * flag. In the body font (Knockout) a lone 1 reads like a capital I: "I hour",
 * "IO min", "CLUE I OF 3".
 */
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

export function digitRuns(line: string): readonly { readonly text: string; readonly digits: boolean }[] {
  return line.split(/(\d[\d:]*)/).filter(Boolean).map(text => ({ text, digits: /^\d/.test(text) }));
}

const DIGITS: TextStyle = { fontFamily: 'Shark', letterSpacing: 0.4 };

export default function KidText({ children, style, ...rest }: Omit<TextProps, 'children' | 'style'> & {
  readonly children: string;
  readonly style?: StyleProp<TextStyle>;
}) {
  const runs = digitRuns(children);
  // No numbers: plain text, nothing nested.
  if (!runs.some(run => run.digits)) return <Text style={style} {...rest}>{children}</Text>;
  return <Text style={style} {...rest}>
    {runs.map((run, index) => run.digits
      ? <Text key={index} style={DIGITS}>{run.text}</Text> : run.text)}
  </Text>;
}
