import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { BOSS_NAMES, type BossRaid } from '../api/endpoints/parks/raid';
import type { RideControlClaim } from '../api/endpoints/parks/rideControl';
import { TEAMS, teamName } from '../constants/teams';
import type { BossMapMoment } from '../hooks/useBossMapMoment';
import { useAppActive } from '../hooks/useLivePoll';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import type { TaskType } from '../models/task-type';
import type { BossAttackCheckpoint } from '../services/boss/attackRecovery';
import type { RushPick } from '../services/live/rush';
import { BRAND, GameIcon } from '../ui';
import { BOSS_ART } from './boss/bossArt';

export type { RushPick };

function clock(endsAt: string, now: number): string {
  const s = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The Rush bolt: his Rush icon with a live pulse (still under reduced motion). */
function RushBolt({ size = 26 }: { readonly size?: number }) {
  const reduced = useReducedGameMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced) { pulse.value = 0; return; }
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 680, easing: Easing.inOut(Easing.sin) })), -1, false);
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.16 }, { rotate: `${-8 + pulse.value * 12}deg` }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - pulse.value), transform: [{ scale: 0.8 + pulse.value * 0.7 }] }));
  return <View style={styles.boltWrap}>
    <Animated.View style={[styles.boltHalo, halo]} />
    <Animated.View style={style}><GameIcon name="rush" size={size} /></Animated.View>
  </View>;
}

/**
 * One slot under the team bar for what's happening in the park right now. A
 * boss raid takes the slot (with a small Rush chip when a ride is also on Rush),
 * otherwise the nearest Rush does. After a boss falls it becomes the receipt of
 * the map moment. Nothing rotates under your finger.
 */
export default function LiveEventsPill({ raid, rushes, onBoss, onRush, pendingAttack, receiptNeedsCheck, mapMoment, mapFlag, onMapMoment, onDismissMoment, inline = false }: {
  readonly raid: BossRaid | null;
  readonly rushes: readonly RushPick[];
  readonly onBoss: () => void;
  readonly onRush: (task: TaskType) => void;
  readonly pendingAttack?: BossAttackCheckpoint | null;
  readonly receiptNeedsCheck?: boolean;
  readonly mapMoment?: BossMapMoment | null;
  readonly mapFlag?: RideControlClaim | null;
  readonly onMapMoment?: () => void;
  readonly onDismissMoment?: () => void;
  /** Inside the map's status row: no outer margin. */
  readonly inline?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  // The countdowns tick once a second only while one is on screen.
  const focused = useIsFocused();
  const appActive = useAppActive();
  const ticking = focused && appActive && (rushes.length > 0 || raid?.status === 'active');
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);
  const liveRushes = rushes.filter(r => new Date(r.rush.ends_at).getTime() > now);
  const boss = raid && raid.status === 'active' && new Date(raid.ends_at).getTime() > now ? raid : null;
  if (mapMoment) {
    const shown = !!mapFlag && (mapMoment.phase === 'flag' || mapMoment.phase === 'settled');
    const held = shown && !mapFlag!.flipped;
    const title = !shown ? 'YOU HELPED CLEAR THE BOSS!' : held ? 'RIDE HELD!' : 'FLAG RAISED!';
    return <View style={[styles.pill, styles.victoryPill, inline && styles.inline]}>
      <Pressable accessibilityRole="button" onPress={onMapMoment} style={styles.victoryAction}
        accessibilityLabel={`Boss cleared at ${mapMoment.impact.rideName}. Your ${mapMoment.impact.yourDamage} damage helped.${shown
          ? ` ${teamName(mapFlag!.team)} ${held ? 'held the ride' : 'raised its flag'}.` : ''} Show ride.`}>
        <Image source={shown ? TEAMS[mapFlag!.team].badge : BOSS_ART[mapMoment.impact.boss]} style={styles.bossIcon} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, styles.victoryTitle]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.sub, styles.victorySub]} numberOfLines={1}>{shown ? `${teamName(mapFlag!.team)}  ·  ${mapMoment.impact.rideName}`
            : `${mapMoment.impact.yourDamage.toLocaleString()} damage counted  ·  ${mapMoment.impact.rideName}`}</Text>
        </View>
        <Text style={[styles.go, styles.victoryTitle]}>SEE</Text>
        <GameIcon name="arrow" size={18} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss boss map receipt" onPress={onDismissMoment} style={styles.dismiss}>
        <GameIcon name="close" size={24} />
      </Pressable>
    </View>;
  }
  if (pendingAttack || receiptNeedsCheck) return <Pressable accessibilityRole="button" onPress={onBoss}
    accessibilityLabel="Your boss brawl receipt needs confirmation. Open saved round."
    style={[styles.pillShadow, inline && styles.inline]}>
    <LinearGradient colors={[BRAND.blueBright, BRAND.blue]} style={[styles.pill, styles.bossPill]}>
      {pendingAttack && <Image source={BOSS_ART[pendingAttack.boss]} style={styles.bossIcon} contentFit="contain" />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, styles.bossTitle]} numberOfLines={1}>YOUR SAVED BRAWL</Text>
        <Text style={[styles.sub, styles.bossSub]} numberOfLines={1}>Confirm your round before another attack</Text>
      </View>
      <Text style={[styles.go, styles.bossGo]}>CHECK</Text>
      <GameIcon name="arrow" size={18} />
    </LinearGradient>
  </Pressable>;
  if (!boss && !liveRushes.length) return null;

  if (boss) {
    const pct = Math.round((boss.hp_left / Math.max(1, boss.hp_max)) * 100);
    return (
      <Pressable accessibilityRole="button" onPress={onBoss} style={[styles.pillShadow, inline && styles.inline]}
        accessibilityLabel={`Boss raid: ${BOSS_NAMES[boss.boss]} at ${boss.ride_name}. ${pct} percent health, ${boss.fighters} fighting, ${clock(boss.ends_at, now)} left. Open.`}>
        <LinearGradient colors={[BRAND.blueBright, BRAND.blue]} style={[styles.pill, styles.bossPill]}>
          <Image source={BOSS_ART[boss.boss]} style={styles.bossIcon} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, styles.bossTitle]} numberOfLines={1}>{BOSS_NAMES[boss.boss].toUpperCase()}  ·  {boss.ride_name}</Text>
            <View style={styles.hpRow}>
              <View style={styles.hpTrack}><View style={[styles.hpFill, { width: `${Math.max(2, pct)}%` }]} /></View>
              <Text style={[styles.sub, styles.bossSub]} numberOfLines={1}>{boss.fighters} fighting  ·  {clock(boss.ends_at, now)}</Text>
            </View>
          </View>
          {liveRushes.length > 0 ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onRush(liveRushes[0].task)} style={styles.rushChip}
              accessibilityLabel={`Also a Rush on ${liveRushes[0].task.name}. Show on map.`}>
              <GameIcon name="rush" size={16} />
              <Text style={styles.rushChipText}>RUSH</Text>
            </Pressable>
          ) : <View style={styles.fightTag}><Text style={styles.fightTagText}>FIGHT</Text></View>}
        </LinearGradient>
      </Pressable>
    );
  }
  const { task, rush, wait } = liveRushes[0];
  return (
    <Pressable accessibilityRole="button" onPress={() => onRush(task)} style={[styles.pill, styles.rushPill, inline && styles.inline]}
      accessibilityLabel={`Rush on ${task.name}: ${wait} minute wait, usually ${rush.typical}. ${clock(rush.ends_at, now)} left. Show on map.`}>
      <RushBolt />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, styles.rushTitle]} numberOfLines={1}>RUSH  ·  {task.name}</Text>
        <Text style={[styles.sub, styles.rushSub]} numberOfLines={1}>
          {wait} min wait (usually {rush.typical})  ·  2x Parts  ·  {clock(rush.ends_at, now)}
          {liveRushes.length > 1 ? `  +${liveRushes.length - 1} more` : ''}
        </Text>
      </View>
      <Text style={[styles.go, styles.rushGo]}>GO</Text>
      <GameIcon name="arrow" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inline: { marginHorizontal: 0, marginTop: 0 },
  pillShadow: { marginHorizontal: 12, marginTop: 8, borderRadius: 16, shadowColor: BRAND.shadow, shadowOpacity: 0.25,
    shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  pill: { marginHorizontal: 12, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16,
    borderWidth: 3, borderColor: BRAND.white, paddingVertical: 5, paddingLeft: 8, paddingRight: 10, minHeight: 50 },
  bossPill: { marginHorizontal: 0, marginTop: 0 },
  rushPill: { backgroundColor: BRAND.gold, shadowColor: '#d99a00', shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  title: { fontFamily: 'Shark', fontSize: 15 },
  sub: { fontFamily: 'Knockout', fontSize: 12 },
  go: { fontFamily: 'Shark', fontSize: 15 },
  rushTitle: { color: '#6a3b00' },
  rushSub: { color: '#7a4a00' },
  rushGo: { color: BRAND.navy },
  bossTitle: { color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  bossSub: { color: '#e4f7ff', flexShrink: 1 },
  bossGo: { color: BRAND.white },
  bossIcon: { width: 38, height: 38 },
  hpRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  hpTrack: { width: 70, height: 8, borderRadius: 4, backgroundColor: 'rgba(5,52,110,0.5)', borderWidth: 1.5, borderColor: BRAND.white, overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: BRAND.red },
  fightTag: { backgroundColor: BRAND.red, borderRadius: 10, borderWidth: 2, borderColor: BRAND.white, borderBottomWidth: 4,
    borderBottomColor: BRAND.redLip, paddingHorizontal: 9, paddingVertical: 3 },
  fightTagText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white },
  victoryPill: { backgroundColor: BRAND.cream, shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, paddingRight: 0 },
  victoryAction: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  victoryTitle: { color: BRAND.navy, fontSize: 14 },
  victorySub: { color: BRAND.navySoft },
  dismiss: { minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  boltWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: BRAND.blue, borderWidth: 2, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center' },
  boltHalo: { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: BRAND.white },
  rushChip: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: BRAND.gold, borderRadius: 10, paddingHorizontal: 7,
    paddingVertical: 3, borderWidth: 2, borderColor: BRAND.white },
  rushChipText: { fontFamily: 'Shark', fontSize: 12, color: '#6a3b00' },
});
