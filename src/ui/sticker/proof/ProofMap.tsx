/**
 * Proof screen (dev gallery only): the map as board/pick/1-map, the screen Dustin watches closest.
 * The park is a real capture (atlas 018 with today's chrome swapped for the clean map of atlas 028,
 * built by design-v2/kit/work/map_plate.py), a still image under everything. The chips bar and the
 * footer are laid out by Screen, so every piece sits between them; the map is the ground and runs
 * under both, as it does today.
 *
 * Alex's discs are at today's size or bigger (follow and chest 56, wait times 72, Shelf 68): the
 * chrome covers no more park than today's with his art no smaller. The room comes from the guide
 * card, which hugs its words. The guide card's coin keeps 8 pt from the screen edge (Page clamps
 * it), and its chevron disc says it opens. The follow disc carries today's red locate pointer, so
 * it never reads as the Shelf's shark.
 *
 * The OpenStreetMap credit (a licence requirement) is part of the still: the plate is placed so the
 * credit ends at Screen's `attribution` line, fully clear of the footer's wave. The real map sets
 * its attribution margin from the same number.
 *
 * Map pieces wear the 3 pt navy line and the 50 percent drop. Pressing PLAY! slaps a toast on under
 * the bar. Route params: { toast: true } shows that toast on open; { bare: true } draws only the map
 * (the baseline for measuring what the chrome covers).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import CurrencyChip from '../CurrencyChip';
import { Fill, Row, Stack } from '../Arrange';
import Lift from '../Lift';
import Page from '../Page';
import RoundButton from '../RoundButton';
import Screen, { type ScreenInsets } from '../Screen';
import Spot from '../Spot';
import StickerButton from '../StickerButton';
import Tag from '../Tag';
import { Body, Caps, Name } from '../Text';
import { showToast } from '../Toast';
import { ART, ART_RATIO } from '../art';
import { mapAttributionBottom, screenFrameWidth, toastLane } from '../layout';
import { ART_SIZE, GAP, SPACE } from '../tokens';
import { useParkCoinArt } from './proofCoins';

const MAP = require('./img/map-park.jpg');
/** The plate's pixel size and where its OpenStreetMap credit pill ends (pixels from the top). */
const PLATE = { width: 1012, height: 2200, creditBottom: 2010 } as const;
const COIN = 'Walt Statue';
const noop = () => undefined;
export const FOOTER_ITEMS = [
  { key: 'news', label: 'News' },
  { key: 'standings', label: 'Standings' },
  { key: 'map', label: 'Map' },
  { key: 'social', label: 'Social' },
  { key: 'profile', label: 'Profile', badge: 2, badgeNoun: 'new' },
] as const;
/** Alex's discs at today's size or bigger (atlas 018 at the same scale). */
const DISC = { follow: 56, chest: 56, help: 48, watch: 72, shelf: 68 } as const;
/** The guide card's coin. */
const GUIDE_COIN = 52;
/** The guide card hugs its words (no wider than this): every point it does not take is park. */
const GUIDE_W = 268;
/** Room the discs beside it keep (their column and the gap). */
const DISC_COLUMN = DISC.follow + SPACE.cardGapLoose;

/**
 * Where the plate sits so its credit ends at `attribution` above the screen's bottom (pure): cover
 * fit, centred, then lifted just enough. The strip it leaves at the very bottom is under the band.
 */
export function platePlacement(w: number, h: number, attribution: number): { readonly left: number; readonly top: number; readonly width: number; readonly height: number } {
  const scale = Math.max(w / PLATE.width, h / PLATE.height);
  const width = PLATE.width * scale;
  const height = PLATE.height * scale;
  const top = (h - height) / 2;
  const credit = top + PLATE.creditBottom * scale;
  const lift = Math.max(0, credit - (h - attribution));
  return { left: (w - width) / 2, top: top - lift, width, height };
}

/** The real park, full screen, under everything (the ground, never content). Its credit ends clear of the footer. */
export function ParkMap({ attribution }: { readonly attribution?: number }) {
  const { width, height } = useWindowDimensions();
  // Default: placed as on the map screen, under its footer (a sheet or the win card over the map).
  const at = platePlacement(width, height, attribution ?? mapAttributionBottom(width));
  return <Image source={MAP} resizeMode="stretch" fadeDuration={0} style={{ position: 'absolute', left: at.left, top: at.top, width: at.width, height: at.height }} accessible={false} />;
}

/** The park tag on the guide card's top edge: today's tickets toward the next one, then the park. */
function ParkTag() {
  return (
    <Tag label="Disneyland Park. No treats toward a Ticket yet." leading={(
      <Row gap="hair" style={{ marginRight: SPACE.base }}>
        <Lift source={ART.ticket} width={Math.round(14 * ART_RATIO.ticket)} height={14} flat style={{ marginRight: GAP.hair }} />
        {[0, 1, 2].map(i => <Spot key={i} state="empty" size={11} />)}
      </Row>
    )}>Disneyland Park</Tag>
  );
}

/** The map layer: the plate placed from the Screen's attribution line. */
export const mapLayer = (insets: ScreenInsets) => <ParkMap attribution={insets.attribution} />;
/** The map as it sits under the map screen's footer, for a sheet or card that opens over it. */
export const mapBehind = <ParkMap />;

export default function ProofMap({ toastOnOpen = false, bare = false }: { readonly toastOnOpen?: boolean; readonly bare?: boolean }) {
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState('map');
  const [open, setOpen] = useState(false);
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
  // The baseline for the cover measurement: the same plate, placed as under the footer, with nothing on it.
  if (bare) return <Screen testID="proof-map-bare" ground="map" mapLayer={<ParkMap />} scroll={false} />;
  return (
    <Screen testID="proof-map" ground="map" mapLayer={mapLayer} scroll={false}
      header={{ children: [<CurrencyChip key="c" kind="coins" value={350} />, <CurrencyChip key="t" kind="tickets" value={2} />] }}
      footer={{ items: FOOTER_ITEMS, picked: tab, onPick: setTab }}>
      <Row align="start" justify="between" style={{ marginTop: toastLane() }}>
        <Page small padding="snug" width={Math.min(GUIDE_W, screenFrameWidth(width) - DISC_COLUMN)} onEdge={{ end: { node: <ParkTag />, kind: 'tag' } }}
          sideArt={coin ? { source: coin, width: GUIDE_COIN, height: GUIDE_COIN, along: 12 } : undefined}
          expand={{ open, onPress: () => setOpen(o => !o), accessibilityLabel: open ? 'Show less' : 'Show more about the next coin' }}>
          <View accessible accessibilityLabel={`Next coin: ${COIN}. You're here! Tap PLAY! One ticket plays it.`} style={{ paddingTop: SPACE.base }}>
            <Caps gold role="none">Next coin</Caps>
            <Name fit lines={1} role="none">{"You're here! Tap PLAY!"}</Name>
            <Row gap="base" style={{ marginTop: GAP.hair }}>
              <Lift source={ART.ticket} width={Math.round(ART_SIZE.mark * ART_RATIO.ticket)} height={ART_SIZE.mark} />
              <Lift source={ART.arrow} width={ART_SIZE.mark} height={Math.round(ART_SIZE.mark / ART_RATIO.arrow)} />
              {coin ? <Lift source={coin} width={22} height={22} /> : <Spot state="next" size={22} />}
              <Body size="small" align="left" lines={1} role="none">{COIN}</Body>
            </Row>
          </View>
        </Page>
        <Stack gap="card" align="center">
          <RoundButton kind="follow" accessibilityLabel="Follow my shark" size={DISC.follow} art={ART.followShark} onPress={noop} />
          <RoundButton kind="base" accessibilityLabel="Daily chest" badge={2} badgeNoun="ready" size={DISC.chest} art={ART.chestClosed} onPress={noop} />
        </Stack>
      </Row>
      <Fill />
      <Row align="end" justify="between">
        <Stack gap="base" align="center">
          <RoundButton kind="help" accessibilityLabel="How to play at the park" size={DISC.help} onPress={noop} />
          <RoundButton kind="disc" accessibilityLabel="Wait Times" size={DISC.watch} art={ART.queueTimes} artRatio={ART_RATIO.queueTimes} onPress={noop} />
        </Stack>
        <Stack gap="base" align="center" style={{ marginBottom: SPACE.base }}>
          <StickerButton label="PLAY!" variant="primary" size="large" width={164} accessibilityLabel={`Play for the ${COIN} coin, 1 ticket`} onPress={play} />
          <Tag label={`${COIN}, 1 ticket`} leading={(
            coin ? <Lift source={coin} width={ART_SIZE.mark} height={ART_SIZE.mark} flat /> : <Spot state="next" size={ART_SIZE.mark} />
          )} after={{ icon: ART.ticket, iconRatio: ART_RATIO.ticket, text: '1' }}>{COIN}</Tag>
        </Stack>
        <Stack align="center">
          <RoundButton kind="base" accessibilityLabel="Shelf: your coins at this park" size={DISC.shelf} art={ART.pinShark} onPress={noop} />
          <Tag style={{ marginTop: -SPACE.base * 2 }}>Shelf</Tag>
        </Stack>
      </Row>
    </Screen>
  );
}
