import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { HelpTopicId } from '../../services/help/glossary';
import { BRAND, GameIcon } from '../../ui';
import { useHelp } from './HelpProvider';

/** Round "?" that opens How to play, optionally at one card. */
export default function HelpButton({ topic, size = 44, style, label = 'How to play', onPress }: {
  readonly topic?: HelpTopicId;
  /** Replace the default (open How to play), e.g. a small chooser while an event mode is on. */
  readonly onPress?: () => void;
  readonly size?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly label?: string;
}) {
  const { openHowToPlay } = useHelp();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      onPress={() => { void Haptics.selectionAsync().catch(() => undefined); if (onPress) onPress(); else openHowToPlay(topic); }}
      style={({ pressed }) => [styles.button, { width: size, height: size, borderRadius: size / 2 },
        pressed && { transform: [{ scale: 0.94 }] }, style]}>
      <GameIcon name="info" size={Math.round(size * 0.72)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.white, borderWidth: 3,
    borderColor: BRAND.blue, shadowColor: BRAND.navy, shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
});
