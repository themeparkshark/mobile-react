import { StyleSheet, Text, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import useCrumbs from '../hooks/useCrumbs';
import { PlayerType } from '../models/player-type';
import GameIcon from '../ui/GameIcon';
import Progress from './Progress';

/**
 * Player level on the Profile: the level in Shark on a cream card and the XP
 * still needed inside this level (not the lifetime total, which lives in the
 * statistics below), so the two numbers never look like they disagree.
 */
export function experienceProgress(player: Pick<PlayerType, 'experience' | 'experience_level'>) {
  const needed = Math.max(0, Number(player.experience_level?.experience) || 0);
  const current = Math.max(0, Math.min(needed || Infinity, Number(player.experience) || 0));
  return {
    level: Number(player.experience_level?.level) || 1,
    current,
    needed,
    percent: needed > 0 ? Math.min(100, current / needed * 100) : 0,
  };
}

export default function Experience({
  player,
}: {
  readonly player: PlayerType;
}) {
  const { labels } = useCrumbs();
  const { level, current, needed, percent } = experienceProgress(player);

  return (
    <View style={styles.card} accessible accessibilityLabel={`Level ${level}. ${current} of ${needed} XP to level ${level + 1}.`}>
      <GameIcon name="xp" size={52} />
      <View style={{ flex: 1 }}>
        <Text style={styles.level}>{vsprintf(labels.experience_level || 'Level %s', [level])}</Text>
        <Progress progress={percent} />
        <Text style={styles.xp}>
          {needed > 0 ? `${current.toLocaleString()} / ${needed.toLocaleString()} XP to Level ${level + 1}` : `${current.toLocaleString()} XP`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff8e4', borderRadius: 18,
    borderWidth: 3, borderColor: '#ffffff', paddingVertical: 12, paddingHorizontal: 14,
    shadowColor: '#05346e', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 3 },
  level: { fontFamily: 'Shark', fontSize: 26, color: '#05346e', textTransform: 'uppercase', marginBottom: 6 },
  xp: { fontFamily: 'Knockout', fontSize: 16, color: '#3d5f8c', marginTop: 6 },
});
