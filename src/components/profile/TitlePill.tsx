/**
 * The identity row under the shark stage: the player's equipped title (from
 * stamps or a finished shop set) as a gold pill with a crown, plus at most ONE
 * event trophy chip beside it (Fin-ister Nights, fright-nights/CONTRACT.md
 * section 5). Same on your profile and on other players' pages. The chip
 * renders nothing until the player has earned one.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import GameIcon from '../../ui/GameIcon';

export default function TitlePill({ title, trophy, onPress }: {
  readonly title?: string | null;
  /** The single event trophy slot (renders nothing without data). */
  readonly trophy?: ReactNode;
  /** Your own profile only: opens the title sheet (what it means, change, remove). */
  readonly onPress?: () => void;
}) {
  if (!title && !trophy) return null;
  const label = (
    <>
      <GameIcon name="crown" size={22} />
      <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
        maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      {onPress && <GameIcon name="info" size={18} />}
    </>
  );
  return (
    <View style={styles.row}>
      {!!title && (onPress ? (
        <Pressable style={({ pressed }) => [styles.pill, pressed && styles.pressed]} onPress={onPress} hitSlop={6}
          accessibilityRole="button" accessibilityLabel={`Title: ${title}`} accessibilityHint="Shows what your title means and lets you change or remove it">
          {label}
        </Pressable>
      ) : (
        <View style={styles.pill} accessible accessibilityRole="text" accessibilityLabel={`Title: ${title}`}>
          {label}
        </View>
      ))}
      {trophy}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  pill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    backgroundColor: '#ffcf3b',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderBottomWidth: 5,
    borderBottomColor: '#d99a00',
    paddingHorizontal: 16,
    paddingVertical: 6,
    shadowColor: '#05346e',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  text: { color: '#05346e', fontFamily: 'Shark', fontSize: 18, flexShrink: 1 },
  pressed: { transform: [{ scale: 0.96 }] },
});
