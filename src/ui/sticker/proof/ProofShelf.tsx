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
 * that changes while scrolling (no scroll handler at all), so a scroll never renders React. The
 * footer sits over the body's bottom as today's: the last plank ends clear of the wave at the end
 * of the scroll, and coins pass under the wave while scrolling.
 *
 * Alex's shark stands tucked onto the summary page's top-right corner (rising 22 pt, as 3-shelf),
 * so there is no bare band under the bar. Widths come from the pages themselves (usePageWidth).
 */
import { memo, useContext, useEffect, useMemo, useState } from 'react';
import { Image, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { AuthContext } from '../../../context/AuthProvider';
import type { TaskType } from '../../../models/task-type';
import { fetchParkShelf, type ParkShelfData } from '../../../services/collection/parkShelfPrefetch';
import Card from '../Card';
import CurrencyChip from '../CurrencyChip';
import { Row } from '../Arrange';
import Page from '../Page';
import ProgressBar from '../ProgressBar';
import Screen from '../Screen';
import Spot from '../Spot';
import { usePageWidth } from '../StickerContext';
import StickerButton from '../StickerButton';
import { FilterChips, type TabItem } from '../Tabs';
import { Body, Caps, Count, Name } from '../Text';
import { ART, ART_RATIO } from '../art';
import { PAGE_GAP } from '../layout';
import { SPACE } from '../tokens';
import { FOOTER_ITEMS } from './ProofMap';
import { rowsOf, sampleFound, shelfStates, type ProofSpotState } from './proofData';

const PARK = 8;
const PARK_NAME = 'DISNEYLAND';
const TOTAL = 35;
const PER_ROW = 5;
/** Alex's shark tucked onto the summary page's top-right corner: 100 wide, rising 22 (the page reserves the rise). */
const SHARK_W = 100;
const SHARK_RISE = 22;
const noop = () => undefined;

type Coin = { readonly id: number; readonly name: string; readonly source: ImageSourcePropType; readonly state: ProofSpotState; readonly limited: boolean };

const CoinCell = memo(function CoinCell({ coin, size }: { coin: Coin; size: number }) {
  const said = coin.state === 'yours' ? 'found' : coin.state === 'next' ? 'next up' : coin.state === 'empty' ? 'still hidden' : 'not yet';
  return <Spot state={coin.state} art={coin.state === 'empty' ? undefined : coin.source} size={size} label={`${coin.name}, ${said}`} />;
});

/** The planks, sized from the page they sit in. */
const ShelfGrid = memo(function ShelfGrid({ rows }: { rows: readonly (readonly Coin[])[] }) {
  const plankWidth = usePageWidth();
  const cell = Math.floor(plankWidth / PER_ROW);
  return <>{rows.map((row, i) => <ShelfRow key={i} coins={row} cell={cell} plankWidth={plankWidth} />)}</>;
});

/** The summary page's top: the hero count and the bar, kept clear of the shark on the right. */
function Summary({ found, total, tabs, tab, onTab, next }: { found: number; total: number; tabs: TabItem[]; tab: string; onTab: (k: string) => void; next: Coin | undefined }) {
  const inner = usePageWidth();
  const besideShark = inner - SHARK_W - SPACE.base;
  return (
    <>
      <Row align="end" gap="base" style={{ width: besideShark }}>
        <Count size="hero" gold label={`${found} of ${total} coins`}>{`${found} of ${total}`}</Count>
        <View style={{ marginBottom: SPACE.base * 2 }}><Name small lines={1} role="none">COINS</Name></View>
      </Row>
      <ProgressBar value={total ? found / total : 0} label={`${found} of ${total} coins`} width={besideShark}
        prize={{ source: ART.bronze, width: 38, height: Math.round(38 / ART_RATIO.bronze) }} style={{ marginTop: SPACE.base }} />
      <Row gap="loose" style={{ marginTop: SPACE.base * 2 }}>
        <Body size="mid" align="left" style={{ flex: 1 }}>{`${Math.max(0, 20 - found)} more for the bronze trophy`}</Body>
        <CurrencyChip kind="energy" value={1020} />
      </Row>
      <FilterChips items={tabs} picked={tab} onPick={onTab} style={{ marginTop: SPACE.cardGap }} />
      <Card style={{ marginTop: SPACE.cardGapLoose }}>
        <Row gap="card" style={{ marginHorizontal: SPACE.cardGap, marginVertical: SPACE.base * 2 }}>
          <Spot state="next" art={next?.source} size={44} label={next ? `${next.name}, next up` : 'Next coin'} />
          <View style={{ flex: 1 }}>
            <Caps>Next coin</Caps>
            <Name fit lines={1}>{next?.name ?? 'Loading'}</Name>
            <Body size="small" soft align="left">The map shows the way.</Body>
          </View>
          <StickerButton label="GO" variant="primary" size="medium" width={78} accessibilityLabel="Go to the next coin" onPress={noop} />
        </Row>
      </Card>
    </>
  );
}

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
  const { coins, sample, failed } = useShelfCoins();
  const [tab, setTab] = useState('all');
  const [footTab, setFootTab] = useState('profile');
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
  const shark = useMemo(() => ({ source: ART.pinShark, width: SHARK_W, height: Math.round(SHARK_W / ART_RATIO.pinShark), rise: SHARK_RISE }), []);
  return (
    <Screen testID="proof-shelf" ground={{ image: ART.parkBackground }} header={{ title: PARK_NAME, onBack: noop, onHelp: noop }}
      footer={{ items: FOOTER_ITEMS, picked: footTab, onPick: setFootTab }}>
      <View accessibilityLabel={sample ? 'Coin shelf, sample found coins' : 'Coin shelf'}>
        <Page padding="snug" topArt={shark}>
          <Summary found={found} total={coins.length || TOTAL} tabs={tabs} tab={tab} onTab={setTab} next={next} />
        </Page>
        <Page padding="flush" ribbon={{ text: tab === 'tofind' ? 'TO FIND' : tab === 'found' ? 'FOUND' : 'ALL COINS', kind: 'section', size: 'small' }} style={{ marginTop: PAGE_GAP }}>
          <ShelfGrid rows={rows} />
          {!coins.length ? <Body style={{ marginVertical: SPACE.base * 7 }}>{failed ? 'The shelf did not load.' : 'Loading the shelf.'}</Body> : null}
        </Page>
      </View>
    </Screen>
  );
}
