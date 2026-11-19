/**
 * Proof screen 3 (dev gallery only): a 35-coin shelf as board/pick/3-shelf. The header band,
 * the summary page with the tabs (white lifted pick), the next coin card, and a scrolling grid of
 * 35 real coins on spots (yours, next up with the gold ring, ghost, empty) on Alex's shelves.
 * Coins keep their own ring and get no white edge.
 *
 * Coin art is real: the Disneyland shelf of the signed-in player through the app's read-only
 * shelf reads (fetchParkShelf). When the scratch player has found too few coins to show every
 * state, a fixed sample of 15 found coins is used (said on screen for VoiceOver and in SPIKE.md).
 *
 * Scrolling: one ScrollView, 35 memoised cells with stable sources, no blur anywhere, no state
 * that changes while scrolling (no scroll handler at all), so a scroll never renders React.
 */
import { memo, useContext, useEffect, useMemo, useState } from 'react';
import { Image, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { AuthContext } from '../../../context/AuthProvider';
import type { TaskType } from '../../../models/task-type';
import { fetchParkShelf, type ParkShelfData } from '../../../services/collection/parkShelfPrefetch';
import Card from '../Card';
import CurrencyChip from '../CurrencyChip';
import Page from '../Page';
import ProgressBar from '../ProgressBar';
import Screen from '../Screen';
import Spot from '../Spot';
import StickerButton from '../StickerButton';
import { FilterChips, type TabItem } from '../Tabs';
import { Body, Caps, Count, Name } from '../Text';
import { ART, ART_RATIO } from '../art';
import { PAGE_GAP, screenFrameWidth } from '../layout';
import { LINE, SPACE } from '../tokens';
import { rowsOf, sampleFound, shelfStates, type ProofSpotState } from './proofData';

const PARK = 8;
const PARK_NAME = 'DISNEYLAND';
const TOTAL = 35;
const PER_ROW = 5;
/** Alex's shark stands on the summary page's top edge: 100 wide, rising 36 (the page reserves the rise). */
const SHARK_W = 100;
const SHARK_RISE = 36;
const noop = () => undefined;

type Coin = { readonly id: number; readonly name: string; readonly source: ImageSourcePropType; readonly state: ProofSpotState; readonly limited: boolean };

const CoinCell = memo(function CoinCell({ coin, size }: { coin: Coin; size: number }) {
  const said = coin.state === 'yours' ? 'found' : coin.state === 'next' ? 'next up' : coin.state === 'empty' ? 'still hidden' : 'not yet';
  return <Spot state={coin.state} art={coin.state === 'empty' ? undefined : coin.source} size={size} label={`${coin.name}, ${said}`} />;
});

const ShelfRow = memo(function ShelfRow({ coins, cell, plankWidth }: { coins: readonly Coin[]; cell: number; plankWidth: number }) {
  const plankH = plankWidth / ART_RATIO.shelf;
  const spot = Math.round(cell * 0.84);
  // The coins stand on the plank's top face (218 of the file's 725 px), a little into it.
  const plankTop = Math.round(spot - plankH * 0.37);
  return (
    <View style={{ height: Math.round(plankH * 0.93) }}>
      <Image source={ART.shelf} resizeMode="contain" fadeDuration={0} style={{ position: 'absolute', left: 0, top: plankTop, width: plankWidth, height: plankH }} />
      <View style={{ flexDirection: 'row', paddingHorizontal: (plankWidth - cell * PER_ROW) / 2 }}>
        {coins.map(c => <View key={c.id} style={{ width: cell, alignItems: 'center' }}><CoinCell coin={c} size={spot} /></View>)}
      </View>
    </View>
  );
});

function useShelfCoins(): { coins: Coin[]; sample: boolean; failed: boolean } {
  const auth = useContext(AuthContext);
  const player = auth?.player?.id ?? 0;
  const [data, setData] = useState<ParkShelfData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!player) return;
    let live = true;
    fetchParkShelf(PARK, player).then(d => { if (live) setData(d); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [player]);
  return useMemo(() => {
    if (!data) return { coins: [], sample: false, failed };
    const seen = new Set<number>();
    // The park's secret coins close the shelf as empty spots (no art until found); up to 5 of them.
    const secret = data.secret.slice(0, 5).map(t => ({ id: t.id, name: t.name, coin_url: '', limited: null as TaskType['limited'] }));
    const open = [...data.available, ...data.limited].filter(t => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    const tasks = [...open.slice(0, TOTAL - secret.length).map(t => ({ t, limited: !!t.limited, secret: false })),
      ...secret.map(t => ({ t, limited: false, secret: true }))];
    const done = new Set(data.completed.map(t => t.id));
    const realFound = tasks.map(({ t }) => done.has(t.id));
    const sample = realFound.filter(Boolean).length < 3;
    const found = sample ? sampleFound(open.slice(0, TOTAL - secret.length).length, 15).concat(secret.map(() => false)) : realFound;
    const coming = tasks.map(({ t, secret: isSecret }) => isSecret || (!!t.limited && !t.limited.active));
    const states = shelfStates(found, coming);
    return {
      coins: tasks.map(({ t, limited, secret: isSecret }, i) => ({ id: isSecret ? -t.id : t.id, name: isSecret ? 'Secret coin' : t.name, source: { uri: t.coin_url }, state: states[i], limited })),
      sample, failed,
    };
  }, [data, failed]);
}

export default function ProofShelf() {
  const { width } = useWindowDimensions();
  const { coins, sample, failed } = useShelfCoins();
  const [tab, setTab] = useState('all');
  const pageWidth = screenFrameWidth(width);
  const plankWidth = pageWidth - LINE.page * 2 - SPACE.pageFlush * 2;
  const cell = Math.floor(plankWidth / PER_ROW);
  const shown = useMemo(() => (tab === 'tofind' ? coins.filter(c => c.state !== 'yours') : tab === 'found' ? coins.filter(c => c.state === 'yours') : coins), [coins, tab]);
  const rows = useMemo(() => rowsOf(shown, PER_ROW), [shown]);
  const found = coins.filter(c => c.state === 'yours').length;
  const next = coins.find(c => c.state === 'next');
  const toFind = coins.length - found;
  const tabs: TabItem[] = useMemo(() => [
    { key: 'all', label: `ALL ${found}/${coins.length}` },
    { key: 'found', label: `FOUND ${found}`, icon: ART.coin, iconRatio: ART_RATIO.coin },
    { key: 'tofind', label: `TO FIND ${toFind}`, leading: <Spot state="empty" size={18} /> },
  ], [coins.length, found, toFind]);
  // The words and the bar stay clear of the shark standing on the page's right end.
  const besideShark = pageWidth - LINE.page * 2 - SPACE.pageSnug * 2 - SHARK_W - SPACE.base;
  const shark = useMemo(() => ({ source: ART.pinShark, width: SHARK_W, height: Math.round(SHARK_W / ART_RATIO.pinShark), rise: SHARK_RISE }), []);
  return (
    <Screen testID="proof-shelf" ground={{ image: ART.parkBackground }} header={{ title: PARK_NAME, onBack: noop, onHelp: noop }}>
      <View accessibilityLabel={sample ? 'Coin shelf, sample found coins' : 'Coin shelf'}>
        <Page padding="snug" topArt={shark}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, width: besideShark }}>
            <Count size="hero" gold label={`${found} of ${coins.length || TOTAL} coins`}>{`${found} of ${coins.length || TOTAL}`}</Count>
            <View style={{ paddingBottom: 7 }}><Name small role="none">COINS</Name></View>
          </View>
          <ProgressBar value={coins.length ? found / coins.length : 0} label={`${found} of ${coins.length} coins`} width={besideShark}
            prize={{ source: ART.bronze, width: 38, height: Math.round(38 / ART_RATIO.bronze) }} style={{ marginTop: SPACE.base }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.cardGapLoose, marginTop: SPACE.base * 2 }}>
            <Body size="mid" align="left" style={{ flex: 1 }}>{`${Math.max(0, 20 - found)} more for the bronze trophy`}</Body>
            <CurrencyChip kind="energy" value={1020} />
          </View>
          <FilterChips items={tabs} picked={tab} onPick={setTab} style={{ marginTop: SPACE.cardGap }} />
          <Card style={{ marginTop: SPACE.cardGapLoose }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.cardGap, paddingVertical: 8, gap: SPACE.cardGap }}>
              <Spot state="next" art={next?.source} size={44} label={next ? `${next.name}, next up` : 'Next coin'} />
              <View style={{ flex: 1 }}>
                <Caps>Next coin</Caps>
                <Name fit>{next?.name ?? 'Loading'}</Name>
                <Body size="small" soft align="left">The map shows the way.</Body>
              </View>
              <StickerButton label="GO" variant="primary" size="medium" width={78} accessibilityLabel="Go to the next coin" onPress={noop} />
            </View>
          </Card>
        </Page>
        <Page padding="flush" ribbon={{ text: tab === 'tofind' ? 'TO FIND' : tab === 'found' ? 'FOUND' : 'ALL COINS', kind: 'section', size: 'small' }} style={{ marginTop: PAGE_GAP }}>
          {rows.map((row, i) => <ShelfRow key={i} coins={row} cell={cell} plankWidth={plankWidth} />)}
          {!coins.length ? <Body style={{ paddingVertical: 30 }}>{failed ? 'The shelf did not load.' : 'Loading the shelf.'}</Body> : null}
        </Page>
      </View>
    </Screen>
  );
}
