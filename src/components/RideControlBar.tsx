import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { RideControlPark } from '../api/endpoints/parks/rideControl';
import { applyTeamNames, TEAM_ORDER, TEAMS, teamName, teamShortName, type TeamId } from '../constants/teams';
import { haptic } from '../gamekit/Haptics';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import type { TaskType } from '../models/task-type';
import * as RootNavigation from '../RootNavigation';
import { BRAND, GameButton, GameIcon } from '../ui';

/** One team's ride count: pops when it goes up, wears the crown while leading. */
export function TeamChip({ team, count, yours, leading }: {
  readonly team: TeamId; readonly count: number; readonly yours: boolean; readonly leading: boolean;
}) {
  const reduced = useReducedGameMotion();
  const pop = useSharedValue(1);
  const crown = useSharedValue(leading ? 1 : 0);
  const last = useRef(count);
  useEffect(() => {
    const grew = count > last.current;
    last.current = count;
    if (!grew || reduced) return;
    // Anticipation, overshoot, settle: the chip that just took a ride.
    pop.value = withSequence(withTiming(0.9, { duration: 70 }), withSpring(1.22, { damping: 7, stiffness: 420 }),
      withSpring(1, { damping: 12, stiffness: 260 }));
    haptic('tickSelection');
    return () => cancelAnimation(pop);
  }, [count, reduced, pop]);
  useEffect(() => {
    crown.value = reduced ? (leading ? 1 : 0) : withSpring(leading ? 1 : 0, { damping: 10, stiffness: 240 });
  }, [leading, reduced, crown]);
  const chipStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const crownStyle = useAnimatedStyle(() => ({ opacity: crown.value, transform: [{ translateY: (1 - crown.value) * 6 }, { rotate: '-14deg' }, { scale: 0.6 + crown.value * 0.4 }] }));
  return (
    <Animated.View style={[styles.chip, { backgroundColor: TEAMS[team].color }, yours && styles.chipYours, chipStyle]}>
      <Image source={TEAMS[team].badge} style={styles.chipBadge} contentFit="contain" />
      <Text style={styles.chipCount}>{count}</Text>
      <Animated.View style={[styles.crown, crownStyle]} pointerEvents="none">
        <GameIcon name="crown" size={18} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Today's fight for the park: how many rides each team holds, who leads, and
 * (on tap) the rides that are up for grabs right now.
 */
export default function RideControlBar({ control, tasks, onFocusTask, compact = false }: {
  readonly control: RideControlPark | null;
  /** While a boss is live: just the team chips, tucked to the right, so the map stays clear. */
  readonly compact?: boolean;
  readonly tasks: readonly TaskType[];
  readonly onFocusTask: (task: TaskType) => void;
}) {
  const [open, setOpen] = useState(false);
  const names = control?.team_names;
  useEffect(() => applyTeamNames(names), [names]);
  const held = control?.rides_held ?? { mouse: 0, globe: 0, shark: 0 };
  const leader = control?.leading_team ?? null;
  const yours = control?.your_team ?? null;
  const taskFor = (assetId: number) => tasks.find(t => Number(t.asset_id) === assetId);

  // Rides worth walking to: close fights first, then rides your team doesn't hold.
  const targets = (control?.rides ?? [])
    .filter(r => taskFor(r.asset_id) && (!yours || r.controller !== yours || r.contested))
    .sort((a, b) => Number(b.contested) - Number(a.contested) || a.margin - b.margin)
    .slice(0, 8);
  const unclaimed = tasks.filter(t => !(control?.rides ?? []).some(r => r.asset_id === Number(t.asset_id))).length;

  const headline = !control ? 'RIDE CONTROL'
    : leader ? `${teamName(leader, names).toUpperCase()} LEADS` : 'EVERY RIDE IS OPEN';

  return (
    <>
      <Pressable accessibilityRole="button"
        accessibilityLabel={`${headline}. ${TEAM_ORDER.map(team => `${teamShortName(team, names)} ${held[team]}`).join(', ')} rides. Show rides to take.`}
        onPress={() => setOpen(true)} style={[styles.barWrap, compact && styles.barWrapCompact]}>
        <LinearGradient colors={[BRAND.blueBright, BRAND.blue, BRAND.blueLip]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={[styles.bar, compact && styles.barCompact]}>
          {!compact && <Text style={styles.kicker} numberOfLines={1}>{headline}</Text>}
          <View style={styles.chips}>
            {TEAM_ORDER.map(team => <TeamChip key={team} team={team} count={held[team]} yours={yours === team} leading={leader === team} />)}
          </View>
        </LinearGradient>
      </Pressable>

      <Modal isVisible={open} onBackdropPress={() => setOpen(false)} onSwipeComplete={() => setOpen(false)}
        swipeDirection="down" style={styles.sheetModal} backdropColor={BRAND.navy} backdropOpacity={0.35}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>RIDE CONTROL</Text>
          <Text style={styles.sheetSub}>
            {yours
              ? control?.your_team_is_underdog
                ? `${teamName(yours, names)} is the underdog today: your points count 1.5x!`
                : `Catch coins and earn Parts in line to win rides for ${teamName(yours, names)}.`
              : 'Pick a team to start claiming rides.'}
          </Text>
          <View style={styles.standings}>
            {TEAM_ORDER.map(team => (
              <View key={team} style={styles.standing}>
                <View>
                  <Image source={TEAMS[team].badge} style={styles.standingBadge} contentFit="contain" />
                  {leader === team && <View style={styles.standingCrown}><GameIcon name="crown" size={26} /></View>}
                </View>
                <Text style={[styles.standingCount, { color: TEAMS[team].color }]}>{held[team]}</Text>
                <Text style={styles.standingLabel}>{teamShortName(team, names)}{yours === team ? ' (you)' : ''}</Text>
              </View>
            ))}
          </View>
          {!yours && <GameButton label="Pick your team" onPress={() => { setOpen(false); RootNavigation.navigate('TeamSelection', {}); }}
            style={{ marginBottom: 10 }} />}
          <Text style={styles.section}>{targets.length ? 'UP FOR GRABS' : unclaimed ? `${unclaimed} RIDES STILL UNCLAIMED` : 'NO FIGHTS YET TODAY'}</Text>
          <ScrollView style={{ maxHeight: 300 }}>
            {targets.map(r => {
              const task = taskFor(r.asset_id)!;
              const sorted = [...TEAM_ORDER].sort((a, b) => r.scores[b] - r.scores[a]);
              return (
                <Pressable key={r.asset_id} style={styles.row} accessibilityRole="button"
                  onPress={() => { setOpen(false); onFocusTask(task); }}>
                  <View style={[styles.rowFlag, { backgroundColor: TEAMS[r.controller].color }]}>
                    <Image source={TEAMS[r.controller].badge} style={styles.rowBadge} contentFit="contain" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{task.name}</Text>
                    <View style={styles.rowDetailLine}>
                      {r.contested && <GameIcon name="swords" size={16} accessibilityLabel="Contested" />}
                      <Text style={styles.rowDetail} numberOfLines={1}>
                        {r.controller === yours
                          ? `Hold it! ${teamShortName(sorted[1], names)} is ${r.margin} behind`
                          : `${teamShortName(r.controller, names)} leads ${teamShortName(sorted[1], names)} by ${r.margin}`}
                        {r.captain?.username ? `  ·  Captain ${r.captain.username}` : ''}
                      </Text>
                    </View>
                  </View>
                  <GameIcon name="arrow" size={22} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  barWrap: { marginHorizontal: 12, borderRadius: 18, shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 } },
  barWrapCompact: { alignSelf: 'flex-end' },
  barCompact: { paddingVertical: 3, paddingLeft: 6, paddingRight: 4 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, borderWidth: 3, borderColor: BRAND.white,
    paddingVertical: 6, paddingLeft: 12, paddingRight: 6, overflow: 'visible' },
  kicker: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: BRAND.gold, textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  chips: { flexDirection: 'row', gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 3, paddingRight: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: 'transparent' },
  chipYours: { borderColor: BRAND.white },
  chipBadge: { width: 22, height: 22 },
  chipCount: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, marginLeft: 2, textShadowColor: 'rgba(5,52,110,0.6)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  crown: { position: 'absolute', top: -12, right: -6 },
  sheetModal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { backgroundColor: BRAND.blue, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 4, borderColor: BRAND.white,
    padding: 18, paddingBottom: 40 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 10 },
  sheetTitle: { fontFamily: 'Shark', fontSize: 28, color: BRAND.gold, textAlign: 'center', textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  sheetSub: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff', textAlign: 'center', marginTop: 4 },
  standings: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 14 },
  standing: { alignItems: 'center' },
  standingBadge: { width: 54, height: 54 },
  standingCrown: { position: 'absolute', top: -16, right: -12, transform: [{ rotate: '-12deg' }] },
  standingCount: { fontFamily: 'Shark', fontSize: 30, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  standingLabel: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.white },
  section: { fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1.5, color: '#cdeaff', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14,
    padding: 8, marginBottom: 6, minHeight: 52 },
  rowFlag: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: BRAND.white },
  rowBadge: { width: 28, height: 28 },
  rowName: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white },
  rowDetailLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowDetail: { flexShrink: 1, fontFamily: 'Knockout', fontSize: 13, color: '#cdeaff' },
});
