/**
 * The crew strip (L3): who is playing this wait and who leads. One slim row
 * above the activities; tap it to change the crew. Solo players get a quiet
 * way to add people later, because crews often form after the first game.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND, GameIcon } from '../../../ui';
import { groupStandings, hasKids, isPassAndPlay, type LineGroup } from '../../../services/lineplay/lineGroup';
import PlayerBadge from './PlayerBadge';

export function stripLine(group: LineGroup): string {
  const crew = `Crew of ${group.players.length}`;
  if (group.rounds.length === 0) return hasKids(group) ? `${crew} · Kid rounds on` : `${crew} · Pass and play`;
  const leaders = groupStandings(group).filter(row => row.place === 1 && row.turns > 0);
  if (leaders.length === 1) return `${crew} · ${leaders[0].player.name} leads`;
  return `${crew} · Tied at the top`;
}

export default function GroupStrip({ group, onEdit }: {
  readonly group: LineGroup | null;
  readonly onEdit: () => void;
}) {
  if (!isPassAndPlay(group)) {
    return <Pressable accessibilityRole="button" accessibilityLabel="Add your crew for pass and play"
      onPress={onEdit} hitSlop={6} style={({ pressed }) => [styles.soloChip, pressed && styles.pressed]}>
      <GameIcon name="crown" size={20} />
      <Text style={styles.soloText}>Here with friends? Add your crew!</Text>
    </Pressable>;
  }
  return <Pressable accessibilityRole="button" accessibilityLabel={`${stripLine(group)}. Edit crew`}
    onPress={onEdit} style={({ pressed }) => [styles.strip, pressed && styles.pressed]}>
    <View style={styles.badges}>
      {group.players.map((player, index) => <View key={player.id} style={index > 0 ? styles.overlap : null}>
        <PlayerBadge name={player.name} index={index} size={28} kid={player.kid} />
      </View>)}
    </View>
    <Text style={styles.line} numberOfLines={1}>{stripLine(group)}</Text>
    <GameIcon name="edit" size={22} />
  </Pressable>;
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,255,255,0.55)',
    paddingVertical: 5, paddingLeft: 6, paddingRight: 10, minHeight: 44 },
  badges: { flexDirection: 'row' },
  overlap: { marginLeft: -9 },
  line: { flex: 1, color: BRAND.white, fontFamily: 'Knockout', fontSize: 16 },
  // Easy to spot (group play is the best way to wait), still lighter than the main play card.
  soloChip: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginTop: 8,
    paddingHorizontal: 16, minHeight: 44, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  soloText: { color: '#ffffff', fontFamily: 'Shark', fontSize: 16 },
  pressed: { opacity: 0.8 },
});
