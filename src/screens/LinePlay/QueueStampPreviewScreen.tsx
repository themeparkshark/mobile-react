import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SessionRecap from './components/SessionRecap';

/** Dev-only sample of the real recap after a verified ten-minute queue session. */
export default function QueueStampPreviewScreen() {
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#06396c', paddingTop: 24 }}>
    <View style={{ flex: 1 }}>
      <SessionRecap
        elapsedSeconds={786}
        activityCount={3}
        activityNames={['Ride trivia', 'Crew Bingo', 'Memory Match']}
        earnedEnergy={8}
        experience={30}
        partsCount={1}
        ticketsEarned={1}
        masteryBonusParts={0}
        rewardsPending={false}
        rewardsConfirmed
        rewardTrackingAvailable
        queueStamp={{ earned: true, new: true }}
        onOpenStampBook={() => {}}
        resolution={null}
        predictionUnscored={false}
        crewPuzzle={null}
        crewRelay={null}
        crewRouteNames={null}
        crewScoreNoun="Signals solved"
        coin={null}
        coinState="unowned"
        playerEnergy={18}
        rideName="Space Mountain"
        onOpenCoin={() => {}}
        onOpenPark={() => {}}
        parkAvailable
        onDone={() => {}}
      />
    </View>
  </SafeAreaView>;
}
