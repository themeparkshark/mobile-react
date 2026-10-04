/**
 * The map's one HUD row. The lead pill shows at full size; every other status
 * waits behind a stack button at the row's end: a little pile of cards with a
 * count badge, the pill's own height and colours. Tapping it drops the rest in
 * a short stack over a dark scrim (so nothing on the map peeks between the
 * pills) that folds itself away after a few seconds. A new, more urgent status
 * (a Rush, a boss) simply takes the lead; one landing behind the button makes
 * it pulse once.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { NIGHT } from '../../services/fright/theme';
import { BRAND, GameIcon, SHADOW } from '../../ui';
import { HUD_EXPAND_MS, HUD_ROW_HEIGHT, HUD_TOP } from './statusStack';

/** The lead pill's colours, which the stack button wears too. */
export interface StatusTone {
  readonly fill: string;
  readonly border: string;
  /** The stack cards' outline and count text. */
  readonly ink: string;
}

export const TONES = {
  park: { fill: BRAND.blue, border: BRAND.white, ink: BRAND.white },
  night: { fill: NIGHT.haunt, border: NIGHT.fog, ink: NIGHT.candy },
  show: { fill: '#1b2f7a', border: BRAND.white, ink: BRAND.white },
  rush: { fill: BRAND.gold, border: BRAND.white, ink: BRAND.navy },
} as const satisfies Record<string, StatusTone>;

export interface StatusEntry {
  readonly key: string;
  /** Spoken name for the stack button ("Ride Control", "Lagoon show"). */
  readonly label: string;
  readonly node: ReactNode;
  /** Colours of this pill (the stack button matches the lead). */
  readonly tone?: StatusTone;
}

export default function MapStatusStack({ entries, defaultOpen = false }: {
  readonly entries: readonly StatusEntry[];
  /** Development previews: start expanded and stay open (captures). */
  readonly defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduced = useReducedGameMotion();
  const keys = entries.map(entry => entry.key).join('|');
  const lead = entries[0];
  const rest = entries.slice(1);
  // A different lead or set of statuses folds the stack (nothing moves under a finger for long).
  const lastKeys = useRef(keys);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (lastKeys.current === keys) return;
    const before = new Set(lastKeys.current.split('|').slice(1));
    const landedBehind = keys.split('|').slice(1).some(key => !before.has(key));
    lastKeys.current = keys;
    setOpen(false);
    if (landedBehind && !reduced) {
      pulse.value = withSequence(withTiming(1.14, { duration: 140 }), withSpring(1, { damping: 8, stiffness: 260 }));
    }
  }, [keys, reduced, pulse]);
  useEffect(() => {
    if (!open || defaultOpen) return;
    const timer = setTimeout(() => setOpen(false), HUD_EXPAND_MS);
    return () => clearTimeout(timer);
  }, [open, defaultOpen]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  if (!lead) return null;
  const tone = lead.tone ?? TONES.park;
  const toggle = () => { haptic('tapLight'); setOpen(value => !value); };
  return (
    <>
      {open && <Pressable testID="status-stack-scrim" accessibilityLabel="Close the status list" onPress={() => setOpen(false)}
        style={styles.scrim} />}
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.row} pointerEvents="box-none">
          <View style={styles.lead}>{lead.node}</View>
          {rest.length > 0 && (
            <Animated.View style={pulseStyle}>
              <Pressable accessibilityRole="button" onPress={toggle} hitSlop={6}
                accessibilityState={{ expanded: open }}
                accessibilityLabel={open ? 'Hide the other statuses' : `${rest.length} more: ${rest.map(entry => entry.label).join(', ')}`}
                style={({ pressed }) => [styles.more, { backgroundColor: tone.fill, borderColor: tone.border }, pressed && styles.pressed]}>
                {open ? <GameIcon name="close" size={22} /> : <StackGlyph ink={tone.ink} />}
                {!open && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{rest.length}</Text>
                  </View>
                )}
              </Pressable>
            </Animated.View>
          )}
        </View>
        {open && rest.map((entry, index) => (
          <Animated.View key={entry.key} entering={FadeInUp.duration(160).delay(index * 40)} exiting={FadeOutUp.duration(120)}
            style={styles.item}>
            {entry.node}
          </Animated.View>
        ))}
      </View>
    </>
  );
}

/** Three outlined cards fanned behind each other: "more statuses here". */
function StackGlyph({ ink }: { readonly ink: string }) {
  return (
    <View style={styles.glyph} pointerEvents="none">
      <View style={[styles.card, styles.cardBack, { borderColor: ink }]} />
      <View style={[styles.card, styles.cardMid, { borderColor: ink }]} />
      <View style={[styles.card, styles.cardFront, { borderColor: ink, backgroundColor: ink }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 24, backgroundColor: 'rgba(5,16,48,0.38)' },
  wrap: { position: 'absolute', top: HUD_TOP, left: 12, right: 12, zIndex: 25 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: HUD_ROW_HEIGHT },
  lead: { flex: 1, justifyContent: 'center' },
  item: { marginTop: 8, marginRight: 62 },
  // The lead pill's height (54) and corner, in its colours.
  more: { width: 54, height: HUD_ROW_HEIGHT, borderRadius: 16, borderWidth: 3, alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  pressed: { transform: [{ scale: 0.94 }] },
  glyph: { width: 26, height: 24 },
  card: { position: 'absolute', width: 18, height: 13, borderRadius: 3, borderWidth: 2 },
  cardBack: { left: 8, top: 0, opacity: 0.55 },
  cardMid: { left: 4, top: 5, opacity: 0.8 },
  cardFront: { left: 0, top: 10 },
  badge: { position: 'absolute', top: -7, right: -7, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy },
  badgeText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy },
});
