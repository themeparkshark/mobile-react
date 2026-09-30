import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { BossRaid } from '../../api/endpoints/parks/raid';
import { TEAM_ORDER, TEAMS, teamShortName } from '../../constants/teams';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';

/**
 * The shared HP bar. When HP drops the red fill snaps down and a pale "damage
 * lag" bar drains after it, so every hit (yours or the park's) reads at a glance.
 */
export function BossHpBar({ hpLeft, hpMax, height = 18 }: { readonly hpLeft: number; readonly hpMax: number; readonly height?: number }) {
  const reduced = useReducedGameMotion();
  const pct = Math.min(100, Math.max(0, (hpLeft / Math.max(1, hpMax)) * 100));
  const fill = useSharedValue(pct);
  const lag = useSharedValue(pct);
  const flash = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduced) { first.current = false; fill.value = pct; lag.value = pct; return; }
    const dropped = pct < fill.value;
    fill.value = withTiming(pct, { duration: 180, easing: Easing.out(Easing.quad) });
    lag.value = withDelay(dropped ? 320 : 0, withTiming(pct, { duration: 520, easing: Easing.inOut(Easing.quad) }));
    if (dropped) flash.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 260 }));
  }, [pct, reduced, fill, lag, flash]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));
  const lagStyle = useAnimatedStyle(() => ({ width: `${lag.value}%` }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  return <View style={[parts.hpTrack, { height, borderRadius: height / 2 }]} accessibilityRole="progressbar"
    accessibilityValue={{ min: 0, max: hpMax, now: hpLeft }}>
    <Animated.View style={[parts.hpLag, lagStyle]} />
    <Animated.View style={[parts.hpFill, fillStyle]} />
    <View style={parts.hpShine} />
    <Animated.View style={[parts.hpFlash, flashStyle]} />
  </View>;
}

/** Your attacks this raid: one pip each, filled with the damage it did. */
export function AttackPips({ raid }: { readonly raid: BossRaid }) {
  const max = raid.max_attacks ?? 5;
  const log = raid.you.log ?? [];
  return <View style={parts.pips} accessibilityLabel={`${raid.you.attacks} of ${max} attacks used`}>
    {Array.from({ length: max }, (_, i) => {
      const hit = log[i] ?? (i < raid.you.attacks ? { damage: 0, remote: false } : null);
      return <View key={i} style={parts.pipCol}>
        <View style={[parts.pip, hit && (hit.remote ? parts.pipRemote : parts.pipUsed)]}>
          {hit ? <GameIcon name="swords" size={18} /> : <Text style={parts.pipNumber}>{i + 1}</Text>}
        </View>
        <Text style={parts.pipDamage} numberOfLines={1}>{hit ? hit.damage.toLocaleString() : ' '}</Text>
      </View>;
    })}
  </View>;
}

/** Damage by team: each team's badge on its flag colour, the leader crowned. */
export function TeamDamage({ raid }: { readonly raid: BossRaid }) {
  const total = Math.max(1, TEAM_ORDER.reduce((sum, team) => sum + raid.teams[team], 0));
  const top = Math.max(...TEAM_ORDER.map(team => raid.teams[team]));
  return <View style={parts.teams}>
    {TEAM_ORDER.map(team => {
      const leads = top > 0 && raid.teams[team] === top;
      return <View key={team} style={parts.teamRow}>
        <View style={[parts.teamFlag, { backgroundColor: TEAMS[team].color }]}>
          <Image source={TEAMS[team].badge} style={parts.teamBadge} contentFit="contain" />
          {leads && <View style={parts.teamCrown}><GameIcon name="crown" size={16} /></View>}
        </View>
        <Text style={parts.teamName} numberOfLines={1}>{teamShortName(team)}</Text>
        <View style={parts.teamTrack}>
          <View style={[parts.teamFill, { width: `${(raid.teams[team] / total) * 100}%`, backgroundColor: TEAMS[team].color }]} />
        </View>
        <Text style={parts.teamDmg}>{raid.teams[team].toLocaleString()}</Text>
      </View>;
    })}
  </View>;
}

const MEDALS = ['medal1', 'medal2', 'medal3'] as const;

export function TopFighters({ raid }: { readonly raid: BossRaid }) {
  if (!raid.top.length) return null;
  return <View style={parts.top}>
    {raid.top.map((fighter, i) => (
      <View key={`${fighter.username}-${i}`} style={parts.topRow}>
        <GameIcon name={MEDALS[i] ?? 'medal3'} size={22} accessibilityLabel={`Place ${i + 1}`} />
        <Text style={[parts.topName, fighter.you && parts.topYou]} numberOfLines={1}>{fighter.username}{fighter.you ? ' (you)' : ''}</Text>
        <Text style={[parts.topDamage, fighter.you && parts.topYou]}>{fighter.damage.toLocaleString()}</Text>
      </View>
    ))}
  </View>;
}

/** The sheet's shape while the raid loads, breathing gently (still under reduced motion). */
export function BossSheetSkeleton() {
  const reduced = useReducedGameMotion();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    if (reduced) { pulse.value = 0.55; return; }
    pulse.value = withRepeat(withTiming(0.95, { duration: 700, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={style} accessibilityLabel="Loading the boss raid">
    <View style={parts.skHead}>
      <View style={parts.skArt} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[parts.skLine, { width: '45%' }]} />
        <View style={[parts.skLine, { width: '75%', height: 22 }]} />
        <View style={[parts.skLine, { width: '55%' }]} />
      </View>
    </View>
    <View style={[parts.skLine, { height: 18, marginTop: 14, borderRadius: 9 }]} />
    <View style={parts.pips}>{[0, 1, 2, 3, 4].map(i => <View key={i} style={[parts.pip, parts.skPip]} />)}</View>
    {[0, 1, 2].map(i => <View key={i} style={[parts.skLine, { marginTop: 8, width: `${90 - i * 12}%` }]} />)}
  </Animated.View>;
}

export const parts = StyleSheet.create({
  hpTrack: { width: '100%', backgroundColor: 'rgba(5,52,110,0.55)', borderWidth: 2, borderColor: BRAND.white, overflow: 'hidden' },
  hpLag: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#ffd9d4' },
  hpFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.red },
  hpShine: { position: 'absolute', left: 4, right: 4, top: 2, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  hpFlash: { ...StyleSheet.absoluteFillObject, backgroundColor: BRAND.white },
  pips: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 },
  pipCol: { alignItems: 'center', width: 50 },
  pip: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,52,110,0.25)' },
  pipUsed: { borderStyle: 'solid', borderColor: BRAND.white, backgroundColor: BRAND.gold },
  pipRemote: { borderStyle: 'solid', borderColor: BRAND.white, backgroundColor: BRAND.skyDeep },
  pipNumber: { fontFamily: 'Shark', fontSize: 16, color: 'rgba(255,255,255,0.8)' },
  pipDamage: { marginTop: 2, fontFamily: 'Shark', fontSize: 12, color: BRAND.white },
  teams: { marginTop: 12, gap: 6, backgroundColor: 'rgba(5,52,110,0.25)', borderRadius: 14, padding: 8 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamFlag: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.white },
  teamBadge: { width: 22, height: 22 },
  teamCrown: { position: 'absolute', top: -11, right: -8, transform: [{ rotate: '14deg' }] },
  teamName: { width: 54, fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  teamTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  teamFill: { height: '100%', borderRadius: 5 },
  teamDmg: { width: 56, textAlign: 'right', fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  top: { marginTop: 10, backgroundColor: BRAND.cream, borderRadius: 14, borderWidth: 2, borderColor: BRAND.white, padding: 8, gap: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topName: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  topDamage: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navySoft },
  topYou: { color: '#b56a00' },
  skHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skArt: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.3)' },
  skLine: { height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.3)' },
  skPip: { borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.3)' },
});
