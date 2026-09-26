import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BOSS_NAMES, type BossRaid } from '../api/endpoints/parks/raid';
import { BOSS_ART } from '../games/boss/BossBrawl';
import type { TaskType } from '../models/task-type';
import type { RushPick } from './RushCallout';

function clock(endsAt: string, now: number): string {
  const s = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * One slot under the team bar for what's happening in the park right now. A
 * boss raid takes the slot (with a small Rush chip when a ride is also on Rush),
 * otherwise the nearest Rush does. Nothing rotates under your finger.
 */
export default function LiveEventsPill({ raid, rushes, onBoss, onRush }: {
  readonly raid: BossRaid | null;
  readonly rushes: readonly RushPick[];
  readonly onBoss: () => void;
  readonly onRush: (task: TaskType) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const liveRushes = rushes.filter(r => new Date(r.rush.ends_at).getTime() > now);
  const boss = raid && raid.status === 'active' && new Date(raid.ends_at).getTime() > now ? raid : null;
  if (!boss && !liveRushes.length) return null;

  if (boss) {
    const pct = Math.round((boss.hp_left / Math.max(1, boss.hp_max)) * 100);
    return (
      <Pressable accessibilityRole="button" onPress={onBoss} style={[styles.pill, styles.bossPill]}
        accessibilityLabel={`Boss raid: ${BOSS_NAMES[boss.boss]} at ${boss.ride_name}. ${pct} percent health, ${boss.fighters} fighting, ${clock(boss.ends_at, now)} left. Open.`}>
        <Image source={BOSS_ART[boss.boss]} style={styles.bossIcon} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, styles.bossTitle]} numberOfLines={1}>BOSS · {BOSS_NAMES[boss.boss]} at {boss.ride_name}</Text>
          <Text style={[styles.sub, styles.bossSub]} numberOfLines={1}>
            {pct}% HP · {boss.fighters} {boss.fighters === 1 ? 'shark' : 'sharks'} fighting · {clock(boss.ends_at, now)} left
          </Text>
        </View>
        {liveRushes.length > 0 ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onRush(liveRushes[0].task)} style={styles.rushChip}
            accessibilityLabel={`Also a Rush on ${liveRushes[0].task.name}. Show on map.`}>
            <Text style={styles.rushChipText}>⚡ RUSH</Text>
          </Pressable>
        ) : <Text style={[styles.go, styles.bossGo]}>FIGHT ›</Text>}
      </Pressable>
    );
  }
  const { task, rush, wait } = liveRushes[0];
  return (
    <Pressable accessibilityRole="button" onPress={() => onRush(task)} style={[styles.pill, styles.rushPill]}
      accessibilityLabel={`Rush on ${task.name}: ${wait} minute wait, usually ${rush.typical}. ${clock(rush.ends_at, now)} left. Show on map.`}>
      <View style={styles.boltWrap}><Text style={styles.bolt}>⚡</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, styles.rushTitle]} numberOfLines={1}>RUSH · {task.name}</Text>
        <Text style={[styles.sub, styles.rushSub]} numberOfLines={1}>
          {wait} min wait (usually {rush.typical}) · 2x Parts · {clock(rush.ends_at, now)} left
          {liveRushes.length > 1 ? `  +${liveRushes.length - 1} more` : ''}
        </Text>
      </View>
      <Text style={[styles.go, styles.rushGo]}>GO ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { marginHorizontal: 12, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16,
    borderWidth: 3, borderColor: '#fff', paddingVertical: 5, paddingLeft: 8, paddingRight: 12,
    shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  rushPill: { backgroundColor: '#ffcf3b', shadowColor: '#ffb300' },
  bossPill: { backgroundColor: '#3b1a5c', shadowColor: '#ef4444' },
  title: { fontFamily: 'Shark', fontSize: 15 },
  sub: { fontFamily: 'Knockout', fontSize: 12 },
  go: { fontFamily: 'Shark', fontSize: 16 },
  rushTitle: { color: '#6a3b00' },
  rushSub: { color: '#7a4a00' },
  rushGo: { color: '#075083' },
  bossTitle: { color: '#ffcf3b' },
  bossSub: { color: '#e9d9ff' },
  bossGo: { color: '#ff7a7a' },
  bossIcon: { width: 34, height: 34 },
  boltWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#075083', alignItems: 'center', justifyContent: 'center' },
  bolt: { fontSize: 18 },
  rushChip: { backgroundColor: '#ffcf3b', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: '#fff' },
  rushChipText: { fontFamily: 'Shark', fontSize: 12, color: '#6a3b00' },
});
