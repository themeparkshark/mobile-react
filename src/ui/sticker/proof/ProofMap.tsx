/**
 * Proof screen (dev gallery only): the map as board/pick/1-map, the screen Dustin watches closest.
 * The park is a real capture (atlas 018 with today's chrome swapped for the clean map of atlas 028,
 * built by design-v2/kit/work/map_plate.py), a still image under everything. The chips bar and the
 * footer are laid out in flow by Screen, so every piece sits between them; the map is the ground
 * and runs under both, as it does today.
 *
 * Chrome covers as little of the park as it can: one short guide card (its park tag on the top
 * edge, the real coin hanging off its left end), two of Alex's discs beside it, then open park, then
 * the bottom row (help and wait-times discs, PLAY! as the one gold with its coin tag, the shelf disc).
 * The guide card starts below the toast's lane, so a toast never covers it.
 *
 * Map pieces wear the 3 pt navy line and the 50 percent drop. Pressing PLAY! slaps a toast on under
 * the bar. Route params: { toast: true } shows that toast on open; { bare: true } draws only the
 * map (the baseline for measuring what the chrome covers).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import CurrencyChip from '../CurrencyChip';
import Lift from '../Lift';
import Page from '../Page';
import RoundButton from '../RoundButton';
import Screen from '../Screen';
import Spot from '../Spot';
import StickerButton from '../StickerButton';
import Tag from '../Tag';
import { Body, Caps, Name } from '../Text';
import { showToast } from '../Toast';
import { ART, ART_RATIO } from '../art';
import { toastLane } from '../layout';
import { DROP, SPACE, TAG } from '../tokens';
import { useParkCoinArt } from './proofCoins';

const MAP = require('./img/map-park.jpg');
const FILL = { width: '100%', height: '100%' } as const;
const COIN = 'Walt Statue';
const noop = () => undefined;
const FOOTER_ITEMS = [
  { key: 'news', label: 'News' },
  { key: 'standings', label: 'Standings' },
  { key: 'map', label: 'Map' },
  { key: 'social', label: 'Social' },
  { key: 'profile', label: 'Profile', badge: 2, accessibilityLabel: 'Profile, 2 new' },
] as const;
/** A tag's laid-out height on the map: the pill and its 3 pt map drop. */
const TAG_ON_MAP = TAG.height + DROP.tagOnMap;
/** The guide coin hangs 8 pt off the card's left end (kept 8 pt from the screen edge). */
const GUIDE_COIN = 58;

/** The real park, full screen, under everything (the ground, never content). */
export function ParkMap() {
  // A bundled image takes its pixel size unless told otherwise: fill the screen.
  return <Image source={MAP} resizeMode="cover" fadeDuration={0} style={[StyleSheet.absoluteFill, FILL]} accessible={false} />;
}

/** The park tag on the guide card's top edge: today's tickets toward the next one, then the park. */
function ParkTag() {
  return (
    <Tag label="Disneyland Park. No treats toward a Ticket yet." leading={(
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 4 }}>
        <Lift source={ART.ticket} width={Math.round(14 * ART_RATIO.ticket)} height={14} flat style={{ marginRight: 2 }} />
        {[0, 1, 2].map(i => <Spot key={i} state="empty" size={11} />)}
      </View>
    )}>Disneyland Park</Tag>
  );
}

export default function ProofMap({ toastOnOpen = false, bare = false }: { readonly toastOnOpen?: boolean; readonly bare?: boolean }) {
  const [tab, setTab] = useState('map');
  const coins = useParkCoinArt(useMemo(() => [COIN], []));
  const coin = coins[COIN];
  const play = useCallback(() => {
    showToast({ title: '+1 Ticket', line: 'Treats found', art: ART.ticket, artRatio: ART_RATIO.ticket });
  }, []);
  useEffect(() => {
    if (!toastOnOpen) return undefined;
    const t = setTimeout(play, 900);
    return () => clearTimeout(t);
  }, [play, toastOnOpen]);
  if (bare) return <Screen testID="proof-map-bare" ground="map" mapLayer={<ParkMap />} scroll={false} />;
  return (
    <Screen testID="proof-map" ground="map" mapLayer={<ParkMap />} scroll={false}
      header={{ children: [<CurrencyChip key="c" kind="coins" value={350} />, <CurrencyChip key="t" kind="tickets" value={2} />] }}
      footer={{ items: FOOTER_ITEMS, picked: tab, onPick: setTab }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.cardGap, marginTop: toastLane() }}>
        <View style={{ flex: 1 }}>
          <Page small padding="snug" onEdge={{ end: { node: <ParkTag />, height: TAG_ON_MAP } }}
            sideArt={coin ? { source: coin, width: GUIDE_COIN, height: GUIDE_COIN, along: 12 } : undefined}>
            <View accessible accessibilityLabel={`Next coin: ${COIN}. You're here! Tap PLAY! One ticket plays it.`} style={{ paddingTop: SPACE.base }}>
              <Caps gold role="none">Next coin</Caps>
              <Name fit role="none">{"You're here! Tap PLAY!"}</Name>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Lift source={ART.ticket} width={Math.round(18 * ART_RATIO.ticket)} height={18} />
                <Lift source={ART.arrow} width={18} height={Math.round(18 / ART_RATIO.arrow)} />
                {coin ? <Lift source={coin} width={22} height={22} /> : <Spot state="next" size={22} />}
                <Body size="small" align="left" lines={1} role="none">{COIN}</Body>
              </View>
            </View>
          </Page>
        </View>
        <View style={{ gap: SPACE.cardGap, alignItems: 'center' }}>
          <RoundButton kind="base" accessibilityLabel="Follow my shark" size={52} art={ART.followShark} onPress={noop} />
          <RoundButton kind="base" accessibilityLabel="Daily chest, 2 ready" size={54} art={ART.chestClosed} badge={2} onPress={noop} />
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ gap: SPACE.base * 2, alignItems: 'center' }}>
          <RoundButton kind="help" accessibilityLabel="How to play at the park" size={48} onPress={noop} />
          <RoundButton kind="disc" accessibilityLabel="Wait Times" size={60} art={ART.queueTimes} artRatio={ART_RATIO.queueTimes} onPress={noop} />
        </View>
        <View style={{ alignItems: 'center', gap: SPACE.base * 2, paddingBottom: SPACE.base }}>
          <StickerButton label="PLAY!" variant="primary" size="large" width={196} accessibilityLabel={`Play for the ${COIN} coin, 1 ticket`} onPress={play} />
          <Tag label={`${COIN}, 1 ticket`} leading={(
            coin ? <Lift source={coin} width={18} height={18} flat /> : <Spot state="next" size={18} />
          )} after={{ icon: ART.ticket, iconRatio: ART_RATIO.ticket, text: '1' }}>{COIN}</Tag>
        </View>
        <View style={{ alignItems: 'center' }}>
          <RoundButton kind="base" accessibilityLabel="Shelf: your coins at this park" size={60} art={ART.pinShark} onPress={noop} />
          <Tag style={{ marginTop: -SPACE.base * 2 }}>Shelf</Tag>
        </View>
      </View>
    </Screen>
  );
}
