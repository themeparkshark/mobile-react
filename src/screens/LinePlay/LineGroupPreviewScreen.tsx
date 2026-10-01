import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createLineGroup, currentTurn, groupRecap, kidRoundNote, lastRound, recordGroupTurn, roundPodium,
  startGroupRound, waitLine, type LineGroup,
} from '../../services/lineplay/lineGroup';
import WhosInLineSheet from './group/WhosInLineSheet';
import PassPhoneOverlay from './group/PassPhoneOverlay';
import GroupStrip from './group/GroupStrip';
import GroupRecapCard, { seatMap } from './group/GroupRecapCard';
import GroupShareCard from './group/GroupShareCard';
import { leaderLine } from './group/useGroupPlay';
import type { RideCoinLevelType } from '../../models/ride-coin-level-type';

/** Development-only visual check of Play together (L3). Stages advance on a timer or a tap. */
const STAGES = ['opener', 'names', 'handoff', 'kid', 'podium', 'strip', 'recap', 'card'] as const;
const STAGE_MS = 6000;

const family = createLineGroup('family', [{ name: 'Dustin' }, { name: 'Maya', kid: true }, { name: 'Leo', kid: true }, { name: 'Jess' }]);
const lastCrew = family;

function firstRound(): LineGroup {
  let group = startGroupRound(family, { activityId: 'mg-tap', gameId: 'tap', seed: 7, difficulty: 2, title: null });
  for (const [stars, score] of [[2, 1240], [3, 860], [2, 790], [3, 1410]] as const) group = recordGroupTurn(group, stars, score);
  return group;
}
const triviaStart = startGroupRound(firstRound(), { activityId: 'mg-trivia', gameId: 'trivia', seed: 9, difficulty: 2, title: null });
function played(): LineGroup {
  let group = triviaStart;
  for (const [stars, score] of [[3, 640], [2, 610], [2, 900], [1, 300]] as const) group = recordGroupTurn(group, stars, score);
  return group;
}
const afterRounds = played();
const midRound = recordGroupTurn(startGroupRound(afterRounds, { activityId: 'mg-memory', gameId: 'memory', seed: 3, difficulty: 2, title: null }), 3, 980);

const coin = {
  id: 1, ride_id: 1, ride_name: 'Preview ride', current_level: 4, max_level: 10, times_collected: 3,
  coin_url: 'https://assets.themeparkshark.com/mobile/production/assets/YcExEGuduIZNjtBCnEPVgnenzhSzvMSs7ZA2QOgC.png',
  available_parts: 6, energy_to_next_level: 40, parts_to_next_level: 8, required_parts: [],
  player_level_required: 1, is_unlocked: true, current_perks: [], next_level_perks: [],
} as RideCoinLevelType;

export default function LineGroupPreviewScreen() {
  const fixed = process.env.EXPO_PUBLIC_LINE_GROUP_STAGE;
  const [index, setIndex] = useState(() => Math.max(0, STAGES.indexOf(fixed as typeof STAGES[number])));
  useEffect(() => {
    if (fixed) return;
    const timer = setInterval(() => setIndex(value => (value + 1) % STAGES.length), STAGE_MS);
    return () => clearInterval(timer);
  }, [fixed]);
  const stage = STAGES[index];
  const seats = seatMap(family);
  const noop = () => undefined;
  const handoffTurn = currentTurn(midRound)!;
  const kidTurn = currentTurn(triviaStart)!;
  const recap = groupRecap(afterRounds)!;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0a7dd1', '#07569e', '#073e87']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.fill}>
        <Pressable style={styles.fill} onPress={() => setIndex(value => (value + 1) % STAGES.length)}>
          <View style={styles.fakeWait}><Text style={styles.fakeWaitText}>Wait screen (L2)</Text></View>
          {(stage === 'strip' || stage === 'opener' || stage === 'names') && <GroupStrip group={afterRounds} onEdit={noop} />}
          {stage === 'strip' && <GroupStrip group={null} onEdit={noop} />}
          {stage === 'recap' && <ScrollView contentContainerStyle={styles.recap}>
            <GroupRecapCard group={afterRounds} realMinutes={38} postedMinutes={60} partsEarned={3} rewardsConfirmed coin={coin} />
          </ScrollView>}
          {stage === 'card' && <View style={styles.cardWrap}>
            <View style={styles.cardScale}>
              <GroupShareCard recap={recap} seats={seats} waitLine={waitLine(38, 60)} partsEarned={3}
                coin={{ url: coin.coin_url, level: 4, maxLevel: 10 }} dateLabel="Thursday, October 1" />
            </View>
          </View>}
        </Pressable>
      </SafeAreaView>
      <WhosInLineSheet visible={stage === 'opener' || stage === 'names'} ownerName="Dustin" lastCrew={lastCrew}
        editing={stage === 'names' ? family : null} onChoose={noop} onClose={noop} />
      {stage === 'handoff' && <PassPhoneOverlay moving={false} onGo={noop} onSkip={noop} onEndRound={noop} onNext={noop} onDone={noop}
        mode={{ kind: 'handoff', turn: handoffTurn, seat: seats[handoffTurn.player.id] ?? 0, firstTurn: false,
          gameLabel: 'Memory Match', kidNote: null }} />}
      {stage === 'kid' && <PassPhoneOverlay moving onGo={noop} onSkip={noop} onEndRound={noop} onNext={noop} onDone={noop}
        mode={{ kind: 'handoff', turn: kidTurn, seat: seats[kidTurn.player.id] ?? 0, firstTurn: false,
          gameLabel: 'Ride Trivia', kidNote: kidRoundNote({ gameId: 'trivia', difficulty: 2 }) }} />}
      {stage === 'podium' && <PassPhoneOverlay moving={false} onGo={noop} onSkip={noop} onEndRound={noop} onNext={noop} onDone={noop}
        mode={{ kind: 'podium', entries: roundPodium(afterRounds, lastRound(afterRounds)!), seats,
          gameLabel: 'Ride Trivia', leaderLine: leaderLine(afterRounds), nextLabel: 'Sharky Swim' }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07569e' },
  fill: { flex: 1 },
  fakeWait: { height: 150, marginHorizontal: 16, marginTop: 8, borderRadius: 24, borderWidth: 3, borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  fakeWaitText: { color: '#cdeaff', fontFamily: 'Knockout', fontSize: 16 },
  recap: { paddingHorizontal: 16, paddingBottom: 40 },
  cardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardScale: { transform: [{ scale: 0.92 }] },
});
