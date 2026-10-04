/**
 * Right after "Remove title": a small bar in the title's slot, "Title removed"
 * with UNDO, for 6 seconds. Undo wears the same title again through the
 * server (the endpoint that owns it), then the profile refreshes.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../../gamekit/Haptics';
import { BRAND } from '../../ui';
import type { EarnedTitle } from './titleModel';

export const UNDO_MS = 6000;

export default function TitleUndoBar({ previous, onUndo, onDone }: {
  /** The title that came off; no bar without one. */
  readonly previous: EarnedTitle | null;
  readonly onUndo: (previous: EarnedTitle) => Promise<unknown>;
  /** The bar timed out or the undo finished. */
  readonly onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!previous) return;
    setFailed(false);
    const timer = setTimeout(onDone, UNDO_MS);
    return () => clearTimeout(timer);
  }, [previous, onDone]);
  if (!previous) return null;
  return (
    <View style={styles.row}>
      <View style={styles.bar} accessibilityLiveRegion="polite">
        <Text style={styles.text} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {failed ? 'Undo did not save.' : 'Title removed.'}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Undo, wear ${previous.title} again`} disabled={busy} hitSlop={10}
          style={({ pressed }) => [styles.undo, pressed && { transform: [{ scale: 0.95 }] }]}
          onPress={async () => {
            setBusy(true);
            haptic('tapLight');
            try {
              await onUndo(previous);
              haptic('success');
              onDone();
            } catch {
              haptic('warning');
              setFailed(true);
            } finally {
              setBusy(false);
            }
          }}>
          <Text style={styles.undoText} maxFontSizeMultiplier={1.2}>{busy ? '...' : 'UNDO'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingHorizontal: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, backgroundColor: BRAND.navy, borderRadius: 22,
    paddingLeft: 18, paddingRight: 6, borderWidth: 2, borderColor: '#ffffff' },
  text: { fontFamily: 'Knockout', fontSize: 17, color: '#ffffff' },
  undo: { backgroundColor: '#ffcf3b', borderRadius: 16, paddingHorizontal: 14, minHeight: 32, justifyContent: 'center',
    borderBottomWidth: 3, borderBottomColor: '#d99a00' },
  undoText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
});
