/**
 * Proof screen (dev gallery only): the Rewards sheet as board/pick/5-rewards. A Sheet (Alex's
 * ribbon title with its white cut edge from his own file) under the chips bar, which stays above
 * the scrim so prizes can fly to it. List rows with his chests off the left edge in four states,
 * exactly one gold action, the Daily Chest week row on its own line (seven spots in Alex's coin,
 * one gold ring), Daily 3 as a normal card with three clear empty spots, and the wave foot holding
 * the way back. Built from kit parts only, with sample numbers.
 */
import { View } from 'react-native';
import CurrencyChip from '../CurrencyChip';
import Lift from '../Lift';
import ListRow from '../ListRow';
import Screen from '../Screen';
import Sheet from '../Sheet';
import Spot from '../Spot';
import { Body, Name } from '../Text';
import { ART, ART_RATIO } from '../art';
import { SPACE, SPOT } from '../tokens';
import { weekSpots } from './proofData';

const TODAY = 3;
const noop = () => undefined;

export default function ProofRewards() {
  const week = weekSpots(TODAY);
  return (
    <Screen testID="proof-rewards" header={{ children: [
      <CurrencyChip key="c" kind="coins" value={4850} />,
      <CurrencyChip key="e" kind="energy" value={935} />,
      <CurrencyChip key="t" kind="tickets" value={6} />,
    ] }}>
      <Sheet visible title="REWARDS" wayOut={{ label: 'BACK TO MAP', art: 'back', onPress: noop }} testID="proof-rewards-sheet">
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginBottom: SPACE.cardGapLoose }}>
          <Lift source={ART.streak} width={Math.round(24 * ART_RATIO.streak)} height={24} flat />
          <Name small align="center" fit>Start a flame with Daily 3</Name>
        </View>
        <View style={{ gap: SPACE.cardGap }}>
          <ListRow art={{ source: ART.chestClosed, width: 60, height: 60 }} title="Daily Chest" line={`Day ${TODAY} of 7 is ready`} state="ready"
            action={{ label: 'OPEN', onPress: noop }} accessibilityLabel={`Daily Chest, day ${TODAY} of 7 is ready, open`} stripWide
            strip={(
              <View style={{ flexDirection: 'row', gap: SPACE.base }}>
                {week.map((state, i) => <Spot key={i} state={state} size={SPOT.weekMin} art={state === 'yours' ? ART.coin : undefined} />)}
              </View>
            )} />
          <ListRow art={{ source: ART.levelChest, width: 60, height: 60 }} title="Level 7 Chest" line="New gear inside" state="second" action={{ label: 'OPEN', onPress: noop }} />
          <ListRow art={{ source: ART.stampBook, width: Math.round(54 * ART_RATIO.stampBook), height: 54 }} badge={{ count: 20 }}
            title="Stamps" line="20 prizes to claim" state="second" action={{ label: 'CLAIM', onPress: noop }} accessibilityLabel="Stamps, 20 prizes to claim, claim" />
          <ListRow art={{ source: ART.brownChest, width: Math.round(50 * ART_RATIO.brownChest), height: 50 }} title="Daily 3" state="notyet" action={{ label: 'SEE', onPress: noop }}
            accessibilityLabel="Daily 3, 0 of 3 done, see"
            strip={(
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.base }}>
                {[0, 1, 2].map(i => <Spot key={i} state="empty" size={20} />)}
                <Body size="small" soft align="left" lines={1} role="none" style={{ marginLeft: SPACE.base }}>0 of 3 done</Body>
              </View>
            )} />
        </View>
      </Sheet>
    </Screen>
  );
}
