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
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';

export default function TitlePill({ title, trophy, onPress, art }: {
  readonly title?: string | null;
  /** The single event trophy slot (renders nothing without data). */
  readonly trophy?: ReactNode;
  /** Your own profile only: opens the title sheet (what it means, change, remove). */
  readonly onPress?: () => void;
  /** The title's own art (your profile: the book badge); the crown when absent. */
  readonly art?: ReactNode;
}) {
  // Your own profile with no title: a quiet dashed pill that opens the sheet (how to get one, the titles you have).
  if (!title && onPress) {
    return (
      <View style={styles.row}>
        <Pressable style={({ pressed }) => [styles.pill, styles.empty, pressed && styles.pressed]} hitSlop={6}
          onPress={() => { haptic('tapLight'); playSfx('ui.tap', 0.6); onPress(); }}
          accessibilityRole="button" accessibilityLabel="No title yet" accessibilityHint="Shows how to get a title and the titles you have">
          <GameIcon name="crown" size={22} />
          <Text style={[styles.text, styles.emptyText]} maxFontSizeMultiplier={1.3}>Get a title</Text>
        </Pressable>
        {trophy}
      </View>
    );
  }
  if (!title && !trophy) return null;
  const label = (
    <>
      {art ?? <GameIcon name="crown" size={22} />}
      <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
        maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      {onPress && <GameIcon name="swap" size={20} />}
    </>
  );
  return (
    <View style={styles.row}>
      {!!title && (onPress ? (
        <Pressable style={({ pressed }) => [styles.pill, pressed && styles.pressed]} onPress={() => { haptic('tapLight'); playSfx('ui.tap', 0.6); onPress(); }} hitSlop={6}
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
  empty: { backgroundColor: '#ffffff', borderStyle: 'dashed', borderColor: '#d99a00', borderBottomColor: '#d99a00', borderWidth: 2, borderBottomWidth: 2, shadowOpacity: 0 },
  emptyText: { color: '#8a5a00', fontSize: 16 },
});
