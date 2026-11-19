/**
 * Proof screen 2 (dev gallery only): the Rewards sheet as board/pick/5-rewards. Alex's ribbon
 * title with its white cut edge made from his own file, list rows with his chests hanging off the
 * left edge, exactly one gold action, Daily 3 as a normal card with three clear empty spots,
 * the week row as spots in their four states, and the wave foot holding the way back.
 * Built from kit parts only, with sample numbers.
 */
import { View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CurrencyChip from '../CurrencyChip';
import GhostButton from '../GhostButton';
import Header from '../Header';
import Lift from '../Lift';
import ListRow from '../ListRow';
import Overlay, { OVERLAY_MARGIN } from '../Overlay';
import Page from '../Page';
import Spot from '../Spot';
import StickerText from '../StickerText';
import WaveFoot from '../WaveFoot';
import { ART, ART_RATIO } from '../art';
import { INK, SPACE, TYPE } from '../tokens';
import { weekSpots } from './proofData';

const FOOT = 62;
const TODAY = 3;
const noop = () => undefined;

export default function ProofRewards() {
  const { width } = useWindowDimensions();
  const pageWidth = width - OVERLAY_MARGIN * 2;
  // Room the week row has on the Daily Chest row: card inner width less the art, the button and gaps.
  const weekRoom = pageWidth - 6 - SPACE.pagePad * 2 - 5 - 58 - 10 - 8 - 80;
  const weekSpot = Math.max(14, Math.min(20, Math.floor((weekRoom - 6 * 3) / 7)));
  const week = weekSpots(TODAY);
  return (
    <View style={{ flex: 1, backgroundColor: INK.blue }}>
      <LinearGradient colors={[INK.blueBright, INK.blue]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <Header>
        <CurrencyChip art={ART.coins} artRatio={ART_RATIO.coins} artHeight={42} artOver={16} value={4850} label="4850 coins" />
        <CurrencyChip art={ART.energy} artRatio={ART_RATIO.energy} artHeight={36} artOver={8} value={935} label="935 energy" />
        <CurrencyChip art={ART.ticket} artRatio={ART_RATIO.ticket} artHeight={30} artOver={18} value={6} label="6 tickets" minWidth={70} />
      </Header>
      <Overlay top={40}>
        <Page floating arrive ribbon={{ text: 'REWARDS', width: pageWidth + 8 }}
          foot={<WaveFoot height={FOOT}><GhostButton label="BACK TO MAP" size={20} spacing={0.06} art={{ source: ART.arrow, width: 26, height: Math.round(26 / ART_RATIO.arrow), mirror: true }} onPress={noop} /></WaveFoot>}
          footHeight={FOOT}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginBottom: 14 }}>
            <Lift source={ART.streak} width={Math.round(24 * ART_RATIO.streak)} height={24} flat />
            <View style={{ paddingTop: 2 }}>
              <StickerText size={17} stroke={0} spacing={0.04} lineHeight={20}>Start a flame with Daily 3</StickerText>
            </View>
          </View>
          <View style={{ gap: 11 }}>
            <ListRow art={{ source: ART.chestClosed, width: 60, height: 60 }} title="Daily Chest"
              extra={(
                <View accessible accessibilityRole="text" accessibilityLabel={`Day ${TODAY} of 7 is ready`} style={{ flexDirection: 'row', gap: 3, marginTop: 4 }}>
                  {week.map((state, i) => <Spot key={i} state={state} size={weekSpot} art={state === 'yours' ? ART.chestOpen : ART.chestClosed} />)}
                </View>
              )}
              action={{ label: 'OPEN', color: 'gold', primary: true, width: 80, accessibilityLabel: 'Open the Daily Chest' }} />
            <ListRow art={{ source: ART.levelChest, width: 60, height: 60 }} title="Level 7 Chest" line="New gear inside"
              action={{ label: 'OPEN', color: 'blue', width: 80, accessibilityLabel: 'Open the Level 7 Chest' }} />
            <ListRow art={{ source: ART.stampBook, width: Math.round(54 * ART_RATIO.stampBook), height: 54, over: 12 }} badge={20}
              title="Stamps" line="20 stamp prizes to claim" lineLines={2}
              action={{ label: 'CLAIM ALL', color: 'blue', width: 112, accessibilityLabel: 'Claim all 20 stamp prizes' }} />
            <ListRow art={{ source: ART.brownChest, width: Math.round(50 * ART_RATIO.brownChest), height: 50, over: 13 }} title="Daily 3"
              extra={(
                <View accessible accessibilityRole="text" accessibilityLabel="0 of 3 done" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  {[0, 1, 2].map(i => <Spot key={i} state="empty" size={20} />)}
                  <StickerText size={TYPE.bodySmall} font="knockout" fill={INK.navySoft} stroke={0} lineHeight={16} fit={false} role="none" style={{ marginLeft: 3 }}>0 of 3 done</StickerText>
                </View>
              )}
              action={{ label: 'SEE', color: 'white', width: 70, accessibilityLabel: 'See Daily 3' }} />
          </View>
        </Page>
      </Overlay>
    </View>
  );
}
