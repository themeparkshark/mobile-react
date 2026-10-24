/**
 * The crew strip (L3): who is playing this wait and who leads. One slim row
 * above the activities; tap it to change the crew. Solo players get a quiet
 * way to add people later, because crews often form after the first game.
 */
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { CrewBadgeFx } from './CrewBadgeFx';
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

export default function GroupStrip({ group, onEdit, compact = false }: {
  readonly group: LineGroup | null;
  readonly onEdit: () => void;
  /** Short phones: a slimmer row (still a 40 pt target with its hitSlop). */
  readonly compact?: boolean;
}) {
  // Who was already in the crew the first time the strip drew: only players who join after that drop in.
  const seen = useRef<Set<string> | null>(null);
  const reduced = useReducedGameMotion();
  const ids = group?.players.map(player => String(player.id)).join('|') ?? '';
  // Remember the crew after each draw (never during render), so the next new player is the only one that drops in.
  useEffect(() => { seen.current = new Set(ids ? ids.split('|') : []); }, [ids]);
  if (!isPassAndPlay(group)) {
    return <Pressable accessibilityRole="button" accessibilityLabel="Add your crew for pass and play"
      onPress={onEdit} hitSlop={6} style={({ pressed }) => [styles.soloChip, compact && styles.compactChip, pressed && styles.pressed]}>
      <GameIcon name="crown" size={compact ? 18 : 20} />
      <Text style={[styles.soloText, compact && styles.compactText]}>Here with friends? Add your crew!</Text>
    </Pressable>;
  }
  return <Pressable accessibilityRole="button" accessibilityLabel={`${stripLine(group)}. Edit crew`}
    onPress={onEdit} hitSlop={compact ? 4 : undefined} style={({ pressed }) => [styles.strip, compact && styles.compactChip, pressed && styles.pressed]}>
    <View style={styles.badges}>
      {(() => {
        const known = seen.current;
        const stars = new Map(groupStandings(group).map(row => [String(row.player.id), row.stars]));
        let joining = 0;
        const badges = group.players.map((player, index) => {
          const id = String(player.id);
          const joinOrder = known && !known.has(id) ? joining++ : null;
          return <View key={player.id} style={index > 0 ? styles.overlap : null}>
            <CrewBadgeFx joinOrder={joinOrder} starsKey={stars.get(id) ?? 0} reduced={reduced}>
              <PlayerBadge name={player.name} index={index} size={28} kid={player.kid} />
            </CrewBadgeFx>
          </View>;
        });
        return badges;
      })()}
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
    paddingHorizontal: 16, minHeight: 44, borderRadius: 999, backgroundColor: 'rgba(5,52,110,0.55)',
    borderWidth: 2, borderColor: '#ffcf3b' },
  soloText: { color: '#ffffff', fontFamily: 'Shark', fontSize: 16 },
  compactChip: { minHeight: 36, marginTop: 4 },
  compactText: { fontSize: 14 },
  pressed: { opacity: 0.8 },
});
