import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

/** The game's number face. Knockout draws 1 like a capital I ("I log from I rider"). */
export const NUMBER_FONT = 'Shark';

const DIGIT_RUN = /(\d[\d.:]*)/;
/** Knockout's space is so narrow next to a number-face digit that '1 log' read as '1log'. */
export const NUMBER_GAP = '\u2005';

/**
 * Splits a line into words and digit runs, and draws every digit run in the number face,
 * so "1 log from 1 rider" never reads "I log from I rider" in a Knockout line.
 * Returns children for a parent <Text> (nested Text keeps one line and one baseline).
 */
export function withNumberFont(line: string, numberStyle?: StyleProp<TextStyle>): ReactNode[] {
  return line.split(DIGIT_RUN).filter(part => part !== '').map((part, i, parts) => {
    if (/^\d/.test(part)) return <Text key={i} style={[{ fontFamily: NUMBER_FONT }, numberStyle]}>{part}</Text>;
    // A single space next to a number (before or after it) becomes a slightly wider gap.
    let text = part;
    if (i > 0 && /^\d/.test(parts[i - 1])) text = text.replace(/^ (?! )/, NUMBER_GAP);
    if (i < parts.length - 1 && /^\d/.test(parts[i + 1])) text = text.replace(/([^ ]) $/, `$1${NUMBER_GAP}`);
    return text;
  });
}
