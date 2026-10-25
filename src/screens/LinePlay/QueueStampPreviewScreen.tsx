import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SessionRecap from './components/SessionRecap';

/**
 * Dev-only sample of the real recap after a verified ten-minute queue session.
 * Like LinePlay itself, the recap appears in place on a screen that is already open: it mounts
 * once the push transition has ended (the native stack's transitionEnd; a 900 ms fallback), so a capture
 * shows the moment's own first frame, never the half-presented screen.
 * The insets come from the provider's first measurement (no SafeAreaView re-layout on frame 2).
 */
export default function QueueStampPreviewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const end = () => setEnded(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const off = (navigation as any).addListener('transitionEnd', (e: { data?: { closing?: boolean } }) => { if (!e?.data?.closing) end(); });
    const fallback = setTimeout(end, 900);
    return () => { off?.(); clearTimeout(fallback); };
  }, [navigation]);
  return <View style={{ flex: 1, backgroundColor: '#06396c', paddingTop: insets.top + 24, paddingBottom: insets.bottom }}>
    <View style={{ flex: 1 }}>
      {ended && <RideUpSample />}
    </View>
  </View>;
}

/** The sample recap (a verified ten-minute wait that boarded): the preview and the park moments capture share it. */
export function RideUpSample() {
  return <SessionRecap
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
        endReason={process.env.EXPO_PUBLIC_QUEUE_PREVIEW_END === 'left' ? 'left_queue' : 'boarded'}
      />;
}
