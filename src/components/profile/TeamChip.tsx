/**
 * "Which team am I on?" answered where you look first: the team crest and
 * name beside your title. No team yet (your own profile only): a small dashed
 * "Pick your team" pill that opens the team picker. Other players: read-only.
 */
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TEAMS, teamName, type TeamId } from '../../constants/teams';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { teamSlot } from './teamModel';

export default function TeamChip({ team, own, onPick }: {
  readonly team: TeamId | null;
  readonly own: boolean;
  /** Own profile with no team: opens team selection. */
  readonly onPick?: () => void;
}) {
  const slot = teamSlot(team, own && !!onPick);
  if (slot === 'none') return null;
  if (slot === 'pick') {
    return (
      <Pressable style={({ pressed }) => [styles.pill, styles.pick, pressed && styles.pressed]} hitSlop={6}
        onPress={() => { haptic('tapLight'); playSfx('ui.tap', 0.6); onPick?.(); }}
        accessibilityRole="button" accessibilityLabel="Pick your team" accessibilityHint="Opens the team picker">
        <View style={styles.crests}>
          {(['mouse', 'globe', 'shark'] as const).map((t, i) => (
            <Image key={t} source={TEAMS[t].badge} style={[styles.miniCrest, i > 0 && { marginLeft: -9 }]} contentFit="contain" />
          ))}
        </View>
        <Text style={[styles.text, styles.pickText]} maxFontSizeMultiplier={1.3} numberOfLines={1}>Pick your team</Text>
      </Pressable>
    );
  }
  const name = teamName(team!);
  return (
    <View style={[styles.pill, { borderColor: TEAMS[team!].color, borderBottomColor: TEAMS[team!].color }]}
      accessible accessibilityRole="text" accessibilityLabel={own ? `Your team: ${name}` : `Team: ${name}`}>
      <Image source={TEAMS[team!].badge} style={styles.crest} contentFit="contain" />
      <Text style={styles.text} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 2,
    borderBottomWidth: 5,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 4,
    shadowColor: '#05346e',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  crest: { width: 32, height: 32 },
  crests: { flexDirection: 'row', alignItems: 'center' },
  miniCrest: { width: 24, height: 24 },
  text: { color: '#05346e', fontFamily: 'Shark', fontSize: 17, flexShrink: 1 },
  pick: { borderStyle: 'dashed', borderColor: '#1b6fd1', borderBottomColor: '#1b6fd1', borderBottomWidth: 2, shadowOpacity: 0, paddingLeft: 10 },
  pickText: { color: '#1b6fd1', fontSize: 16 },
  pressed: { transform: [{ scale: 0.96 }] },
});
