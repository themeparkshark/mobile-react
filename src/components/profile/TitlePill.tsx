/**
 * The identity row under the shark stage: the player's equipped title (from
 * stamps or a finished shop set) as a gold pill with a crown, plus at most ONE
 * event trophy chip beside it (reserved for Fright Nights; see
 * next-wave/fright-nights/CONTRACT.md). Same on your profile and on other
 * players' pages. Renders nothing when there is neither.
 */
import { Image, type ImageSource } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import HapticPatterns from '../../helpers/hapticPatterns';
import GameIcon from '../../ui/GameIcon';

export type ProfileTrophyChip = {
  /** Spoken name, e.g. "Fright Nights trophy". */
  readonly label: string;
  readonly icon: ImageSource | number | string;
  /** Opens the event card read-only (works on other players' pages too). */
  readonly onPress: () => void;
};

export default function TitlePill({ title, trophy }: {
  readonly title?: string | null;
  /** The single event trophy slot. Pass one only when the player earned it. */
  readonly trophy?: ProfileTrophyChip | null;
}) {
  if (!title && !trophy) return null;
  return (
    <View style={styles.row}>
      {!!title && (
        <View style={styles.pill} accessible accessibilityRole="text" accessibilityLabel={`Title: ${title}`}>
          <GameIcon name="crown" size={22} />
          <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
            maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
        </View>
      )}
      {!!trophy && (
        <Pressable
          onPress={() => { HapticPatterns.buttonTap(); trophy.onPress(); }}
          accessibilityRole="button"
          accessibilityLabel={trophy.label}
          hitSlop={4}
          style={({ pressed }) => [styles.trophy, pressed && { transform: [{ scale: 0.92 }] }]}
        >
          <Image source={trophy.icon} style={{ width: 30, height: 30 }} contentFit="contain" />
        </Pressable>
      )}
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
  trophy: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2b1d4a',
    borderWidth: 2,
    borderColor: '#ffffff',
    borderBottomWidth: 4,
    borderBottomColor: '#140b29',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
