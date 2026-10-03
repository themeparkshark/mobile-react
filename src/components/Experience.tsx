import { useCallback, useContext, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import { nextLevelCaption } from '../constants/levelUnlocks';
import { SoundEffectContext, SoundEffectContextType } from '../context/SoundEffectProvider';
import HapticPatterns from '../helpers/hapticPatterns';
import useCrumbs from '../hooks/useCrumbs';
import { PlayerType } from '../models/player-type';
import { useProgressionFlags } from '../services/progression/progressionFlags';
import XpPotion from './XpPotion';

/**
 * Player level on the Profile: the level in Shark on a cream card, Alex's XP
 * potion filled to the progress inside this level, the XP still needed (not
 * the lifetime total, which lives in the statistics below, so the two numbers
 * never look like they disagree) and one line on what the next level opens.
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

/** The last level and fill each player's potion showed, so a return visit only animates what changed. */
const seen = new Map<number, { level: number; progress: number }>();

export default function Experience({
  player,
  own = true,
  paused = false,
}: {
  readonly player: PlayerType;
  /** The signed-in player's card: shows what the next level unlocks and celebrates level ups. */
  readonly own?: boolean;
  /** Stop the potion's animation (scrolled off screen or screen not focused). */
  readonly paused?: boolean;
}) {
  const { labels } = useCrumbs();
  const { rideBoss } = useProgressionFlags();
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const { level, current, needed, percent } = experienceProgress(player);
  const progress = percent / 100;
  const before = useRef(seen.get(player.id)).current;
  useEffect(() => { seen.set(player.id, { level, progress }); }, [player.id, level, progress]);

  const onBurst = useCallback(() => {
    if (!own) return;
    HapticPatterns.levelUp();
    playSound(require('../../assets/sounds/reward.mp3'));
  }, [own, playSound]);

  const atMax = needed > 0 && current >= needed;
  const numbers = needed > 0
    ? `${current.toLocaleString()} / ${needed.toLocaleString()} XP`
    : `${current.toLocaleString()} XP`;
  const toNext = needed > 0 && !atMax ? `to Level ${level + 1}` : null;
  const caption = own ? (atMax ? 'Top level reached' : nextLevelCaption(level, rideBoss)) : null;
  const spoken = needed > 0
    ? `Level ${level}. ${current.toLocaleString()} of ${needed.toLocaleString()} XP to level ${level + 1}.`
    : `Level ${level}. ${current.toLocaleString()} XP.`;

  return (
    <View style={styles.card} accessible accessibilityRole="summary"
      accessibilityLabel={own && caption ? `${spoken} ${caption}.` : spoken}>
      <XpPotion
        progress={progress}
        level={level}
        size={70}
        paused={paused}
        initialProgress={before?.progress}
        initialLevel={before?.level}
        onLevelUpBurst={onBurst}
        style={styles.potion}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.level} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {vsprintf(labels.experience_level || 'Level %s', [level])}
        </Text>
        <View style={styles.numbersRow}>
          <Text style={styles.numbers} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{numbers}</Text>
          {toNext && <Text style={styles.toNext} numberOfLines={1}>{toNext}</Text>}
        </View>
        {own && caption && (
          <Text style={styles.caption} numberOfLines={2}>{caption}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff8e4', borderRadius: 20,
    borderWidth: 3, borderColor: '#ffffff', borderBottomWidth: 5, borderBottomColor: '#f0dcae',
    paddingVertical: 12, paddingLeft: 18, paddingRight: 14, minHeight: 96,
    shadowColor: '#05346e', shadowOpacity: 0.16, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, elevation: 3 },
  potion: { marginVertical: 2 },
  level: { fontFamily: 'Shark', fontSize: 26, color: '#05346e', textTransform: 'uppercase' },
  numbersRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  numbers: { fontFamily: 'Shark', fontSize: 18, color: '#1f8a2b', flexShrink: 1 },
  toNext: { fontFamily: 'Knockout', fontSize: 16, color: '#3d5f8c' },
  caption: { fontFamily: 'Knockout', fontSize: 15, color: '#3d5f8c', marginTop: 3 },
});
