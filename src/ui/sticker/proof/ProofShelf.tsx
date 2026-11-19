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
import { Image, ScrollView, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../../../context/AuthProvider';
import type { TaskType } from '../../../models/task-type';
import { fetchParkShelf, type ParkShelfData } from '../../../services/collection/parkShelfPrefetch';
import Card from '../Card';
import CurrencyChip from '../CurrencyChip';
import Header, { headerHeight } from '../Header';
import Lift from '../Lift';
import Page from '../Page';
import ProgressBar from '../ProgressBar';
import Spot from '../Spot';
import StickerButton from '../StickerButton';
import { StickerGround } from '../StickerContext';
import StickerText from '../StickerText';
import Tabs, { type TabItem } from '../Tabs';
import { ART, ART_RATIO } from '../art';
import { INK, SPACE, TYPE } from '../tokens';
import { rowsOf, sampleFound, shelfStates, type ProofSpotState } from './proofData';

const PARK = 8;
const PARK_NAME = 'DISNEYLAND';
const TOTAL = 35;
const PER_ROW = 5;
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { coins, sample, failed } = useShelfCoins();
  const [tab, setTab] = useState('all');
  const pageWidth = width - SPACE.margin * 2;
  const plankWidth = pageWidth - 6 - 12;
  const cell = Math.floor(plankWidth / PER_ROW);
  const shown = useMemo(() => (tab === 'tofind' ? coins.filter(c => c.state !== 'yours') : tab === 'found' ? coins.filter(c => c.state === 'yours') : coins), [coins, tab]);
  const rows = useMemo(() => rowsOf(shown, PER_ROW), [shown]);
  const found = coins.filter(c => c.state === 'yours').length;
  const next = coins.find(c => c.state === 'next');
  const toFind = coins.length - found;
  const tabs: TabItem[] = [
    { key: 'all', label: `ALL ${found}/${coins.length}`, icon: ART.ride, iconRatio: ART_RATIO.ride },
    { key: 'found', label: `FOUND ${found}`, icon: ART.star, iconRatio: ART_RATIO.star },
    { key: 'tofind', label: `TO FIND ${toFind}`, icon: ART.sparkle, iconRatio: ART_RATIO.sparkle },
  ];
  const ribbonWidth = Math.round(width * 0.71);
  return (
    <View style={{ flex: 1, backgroundColor: INK.blue }}>
      <Image source={ART.parkBackground} resizeMode="cover" fadeDuration={0} style={{ position: 'absolute', left: 0, top: 0, width, height: '100%' }} />
      <StickerGround level="world">
        <ScrollView contentContainerStyle={{ paddingTop: headerHeight(insets.top) + 14, paddingBottom: insets.bottom + 32, paddingHorizontal: SPACE.margin }}
          accessibilityLabel={sample ? 'Coin shelf, sample found coins' : 'Coin shelf'}>
          <Page padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingLeft: 4 }}>
              <StickerText size={TYPE.hero} tone="gold" spacing={0.06} lineHeight={40} align="left">{`${found} of ${coins.length || TOTAL}`}</StickerText>
              <View style={{ paddingBottom: 7 }}><StickerText size={TYPE.body} stroke={0} spacing={0.08} lineHeight={18}>COINS</StickerText></View>
            </View>
            <Lift source={ART.pinShark} width={100} height={Math.round(100 / ART_RATIO.pinShark)} style={{ position: 'absolute', right: -18, top: -36 }} />
            <ProgressBar value={coins.length ? found / coins.length : 0} label={`${found} of ${coins.length} coins`}
              prize={{ source: ART.bronze, width: 38, height: Math.round(38 / ART_RATIO.bronze) }} style={{ marginTop: 6, marginLeft: 4, width: pageWidth - 140 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingLeft: 4 }}>
              <StickerText size={TYPE.bodyMid} font="knockout" stroke={0} lineHeight={17} align="left" fit={false} style={{ flexShrink: 1 }}>{`${Math.max(0, 20 - found)} more for the bronze trophy`}</StickerText>
              <CurrencyChip art={ART.energy} artRatio={ART_RATIO.energy} artHeight={34} artOver={8} value={1020} label="1020 energy" minWidth={74} />
            </View>
            <Tabs items={tabs} picked={tab} onPick={setTab} style={{ marginTop: 10 }} />
            <Card style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 10 }}>
                <Spot state="next" art={next?.source} size={44} label={next ? `${next.name}, next up` : 'Next coin'} />
                <View style={{ flex: 1 }}>
                  <StickerText size={TYPE.caps} font="knockout" fill={INK.goldInk} stroke={0} spacing={0.11} align="left" lineHeight={14} fit={false} role="none">NEXT COIN</StickerText>
                  <View style={{ paddingTop: 2 }}>
                    <StickerText size={19} tone="navy" stroke={0} spacing={0.03} align="left" lineHeight={22} fit>{next?.name ?? 'Loading'}</StickerText>
                  </View>
                  <StickerText size={TYPE.bodySmall} font="knockout" fill={INK.navySoft} stroke={0} align="left" lineHeight={16} fit={false}>The map shows the way.</StickerText>
                </View>
                <StickerButton label="GO" color="gold" primary size="medium" faceHeight={40} fontSize={21} width={78} accessibilityLabel="Go to the next coin" onPress={noop} />
              </View>
            </Card>
          </Page>
          <View style={{ height: 58 }} />
          <Page padding={6} ribbon={{ text: tab === 'tofind' ? 'TO FIND' : tab === 'found' ? 'FOUND' : 'ALL COINS', width: ribbonWidth, size: 27 }}>
            {rows.map((row, i) => <ShelfRow key={i} coins={row} cell={cell} plankWidth={plankWidth} />)}
            {!coins.length ? (
              <StickerText size={TYPE.body} font="knockout" stroke={0} lineHeight={20} fit={false} style={{ paddingVertical: 30 }}>{failed ? 'The shelf did not load.' : 'Loading the shelf.'}</StickerText>
            ) : null}
          </Page>
        </ScrollView>
      </StickerGround>
      <Header title={PARK_NAME} onBack={noop} onHelp={noop} />
    </View>
  );
}
