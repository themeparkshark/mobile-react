import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import type { RideControlPark } from '../api/endpoints/parks/rideControl';
import { TEAMS, type TeamId } from '../constants/teams';
import type { TaskType } from '../models/task-type';
import * as RootNavigation from '../RootNavigation';

const ORDER: TeamId[] = ['mouse', 'globe', 'shark'];

/**
 * Today's fight for the park: how many rides each team holds, who leads, and
 * (on tap) the rides that are up for grabs right now.
 */
export default function RideControlBar({ control, tasks, onFocusTask }: {
  readonly control: RideControlPark | null;
  readonly tasks: readonly TaskType[];
  readonly onFocusTask: (task: TaskType) => void;
}) {
  const [open, setOpen] = useState(false);
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
    : leader ? `${TEAMS[leader].name.toUpperCase()} LEADS` : 'EVERY RIDE IS OPEN';

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${headline}. Mouse ${held.mouse}, Globe ${held.globe}, Shark ${held.shark} rides. Show rides to take.`}
        onPress={() => setOpen(true)} style={styles.bar}>
        <Text style={styles.kicker} numberOfLines={1}>{headline}</Text>
        <View style={styles.chips}>
          {ORDER.map(team => (
            <View key={team} style={[styles.chip, { backgroundColor: TEAMS[team].color },
              yours === team && styles.chipYours, leader === team && styles.chipLead]}>
              <Image source={TEAMS[team].badge} style={styles.chipBadge} contentFit="contain" />
              <Text style={styles.chipCount}>{held[team]}</Text>
            </View>
          ))}
        </View>
      </Pressable>

      <Modal isVisible={open} onBackdropPress={() => setOpen(false)} onSwipeComplete={() => setOpen(false)}
        swipeDirection="down" style={styles.sheetModal} backdropOpacity={0.5}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>RIDE CONTROL</Text>
          <Text style={styles.sheetSub}>
            {yours
              ? control?.your_team_is_underdog
                ? `${TEAMS[yours].name} is the underdog today: your points count 1.5x!`
                : `Catch coins and earn Parts in line to win rides for ${TEAMS[yours].name}.`
              : 'Pick a team to start claiming rides.'}
          </Text>
          <View style={styles.standings}>
            {ORDER.map(team => (
              <View key={team} style={styles.standing}>
                <Image source={TEAMS[team].badge} style={styles.standingBadge} contentFit="contain" />
                <Text style={[styles.standingCount, { color: TEAMS[team].color }]}>{held[team]}</Text>
                <Text style={styles.standingLabel}>{TEAMS[team].name.replace('Team ', '')}</Text>
              </View>
            ))}
          </View>
          {!yours && <Pressable style={styles.cta} accessibilityRole="button"
            onPress={() => { setOpen(false); RootNavigation.navigate('TeamSelection', {}); }}>
            <Text style={styles.ctaText}>PICK YOUR TEAM</Text>
          </Pressable>}
          <Text style={styles.section}>{targets.length ? 'UP FOR GRABS' : unclaimed ? `${unclaimed} RIDES STILL UNCLAIMED` : 'NO FIGHTS YET TODAY'}</Text>
          <ScrollView style={{ maxHeight: 300 }}>
            {targets.map(r => {
              const task = taskFor(r.asset_id)!;
              const sorted = [...ORDER].sort((a, b) => r.scores[b] - r.scores[a]);
              return (
                <Pressable key={r.asset_id} style={styles.row} accessibilityRole="button"
                  onPress={() => { setOpen(false); onFocusTask(task); }}>
                  <View style={[styles.rowFlag, { backgroundColor: TEAMS[r.controller].color }]}>
                    <Image source={TEAMS[r.controller].badge} style={styles.rowBadge} contentFit="contain" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{task.name}</Text>
                    <Text style={styles.rowDetail} numberOfLines={1}>
                      {r.contested ? '⚔ ' : ''}{r.controller === yours
                        ? `Hold it! ${TEAMS[sorted[1]].name.replace('Team ', '')} is ${r.margin} behind`
                        : `${TEAMS[r.controller].name.replace('Team ', '')} leads ${TEAMS[sorted[1]].name.replace('Team ', '')} by ${r.margin}`}
                      {r.captain?.username ? ` · Captain ${r.captain.username}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.rowGo}>GO ›</Text>
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
  bar: { marginHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(5, 52, 110, 0.88)', borderRadius: 18, borderWidth: 3, borderColor: '#fff',
    paddingVertical: 6, paddingLeft: 12, paddingRight: 6 },
  kicker: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: '#ffcf3b' },
  chips: { flexDirection: 'row', gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 3, paddingRight: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: 'transparent' },
  chipYours: { borderColor: '#fff' },
  chipLead: { transform: [{ scale: 1.08 }] },
  chipBadge: { width: 22, height: 22 },
  chipCount: { fontFamily: 'Shark', fontSize: 16, color: '#fff', marginLeft: 2 },
  sheetModal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { backgroundColor: '#0768b9', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 4, borderColor: '#fff',
    padding: 18, paddingBottom: 40 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 10 },
  sheetTitle: { fontFamily: 'Shark', fontSize: 28, color: '#ffcf3b', textAlign: 'center' },
  sheetSub: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff', textAlign: 'center', marginTop: 4 },
  standings: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 14 },
  standing: { alignItems: 'center' },
  standingBadge: { width: 54, height: 54 },
  standingCount: { fontFamily: 'Shark', fontSize: 30, textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  standingLabel: { fontFamily: 'Knockout', fontSize: 14, color: '#fff' },
  cta: { backgroundColor: '#ffcf3b', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 4,
    borderBottomColor: '#d99a00', marginBottom: 10 },
  ctaText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
  section: { fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1.5, color: '#cdeaff', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14,
    padding: 8, marginBottom: 6 },
  rowFlag: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  rowBadge: { width: 28, height: 28 },
  rowName: { fontFamily: 'Shark', fontSize: 17, color: '#fff' },
  rowDetail: { fontFamily: 'Knockout', fontSize: 13, color: '#cdeaff' },
  rowGo: { fontFamily: 'Shark', fontSize: 16, color: '#ffcf3b' },
});
