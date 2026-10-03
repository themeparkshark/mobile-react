/**
 * The map's one HUD row. The lead pill shows at full size; every other status
 * waits behind a round "+N" button at the row's end. Tapping it drops the rest
 * in a short stack (over a tap-to-close scrim) that folds itself away after a
 * few seconds. A new, more urgent status (a Rush, a boss) simply takes the lead.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, GameIcon, SHADOW } from '../../ui';
import { HUD_EXPAND_MS, HUD_ROW_HEIGHT, HUD_TOP } from './statusStack';

export interface StatusEntry {
  readonly key: string;
  /** Spoken name for the stack button ("Ride Control", "Lagoon show"). */
  readonly label: string;
  /** The pill, or a render that knows whether it leads and whether the stack is open. */
  readonly node: ReactNode | ((state: { readonly lead: boolean; readonly open: boolean; readonly alone: boolean }) => ReactNode);
}

function render(entry: StatusEntry, lead: boolean, open: boolean, alone: boolean): ReactNode {
  return typeof entry.node === 'function' ? entry.node({ lead, open, alone }) : entry.node;
}

export default function MapStatusStack({ entries, defaultOpen = false }: {
  readonly entries: readonly StatusEntry[];
  /** Development previews: start expanded and stay open (captures). */
  readonly defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const keys = entries.map(entry => entry.key).join('|');
  const lead = entries[0];
  const rest = entries.slice(1);
  // A different lead or set of statuses folds the stack (nothing moves under a finger for long).
  const lastKeys = useRef(keys);
  useEffect(() => {
    if (lastKeys.current !== keys) { lastKeys.current = keys; setOpen(false); }
  }, [keys]);
  useEffect(() => {
    if (!open || defaultOpen) return;
    const timer = setTimeout(() => setOpen(false), HUD_EXPAND_MS);
    return () => clearTimeout(timer);
  }, [open, defaultOpen]);
  if (!lead) return null;
  const toggle = () => { haptic('tapLight'); setOpen(value => !value); };
  return (
    <>
      {open && <Pressable testID="status-stack-scrim" accessibilityLabel="Close the status list" onPress={() => setOpen(false)}
        style={styles.scrim} />}
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.row} pointerEvents="box-none">
          <View style={styles.lead}>{render(lead, true, open, rest.length === 0)}</View>
          {rest.length > 0 && (
            <Pressable accessibilityRole="button" onPress={toggle} hitSlop={6}
              accessibilityState={{ expanded: open }}
              accessibilityLabel={open ? 'Hide the other statuses' : `${rest.length} more: ${rest.map(entry => entry.label).join(', ')}`}
              style={({ pressed }) => [styles.more, open && styles.moreOpen, pressed && styles.pressed]}>
              {open ? <GameIcon name="close" size={20} /> : <>
                <View style={styles.stackCard} />
                <Text style={styles.moreText}>+{rest.length}</Text>
              </>}
            </Pressable>
          )}
        </View>
        {open && rest.map((entry, index) => (
          <Animated.View key={entry.key} entering={FadeInUp.duration(160).delay(index * 40)} exiting={FadeOutUp.duration(120)}
            style={styles.item}>
            {render(entry, false, open, false)}
          </Animated.View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 24, backgroundColor: 'rgba(5,20,60,0.18)' },
  wrap: { position: 'absolute', top: HUD_TOP, left: 12, right: 12, zIndex: 25 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: HUD_ROW_HEIGHT },
  lead: { flex: 1, justifyContent: 'center' },
  item: { marginTop: 8, marginRight: 52 },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blue, borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  moreOpen: { backgroundColor: BRAND.navy },
  pressed: { transform: [{ scale: 0.94 }] },
  // A second card peeking behind the button says "there is more here".
  stackCard: { position: 'absolute', top: -5, left: 6, right: 6, height: 8, borderTopLeftRadius: 6, borderTopRightRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.55)' },
  moreText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
});
