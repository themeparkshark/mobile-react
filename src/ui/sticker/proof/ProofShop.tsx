/**
 * Proof screen (dev gallery only): the Shark Shop's Supplies tab as board/pick/4-shop. The title
 * bar (Alex's back and help discs), the GEAR and SUPPLIES tabs with the white lifted pick, the
 * wallet chips, the free-ways card (a white card on the world with the blue FREE TICKETS label),
 * the welcome card with its blue OK, the real-money note, and the Starter Pack: a blue page with
 * the gold STARTER PACK label, Alex's heart disc and the ONE PER PLAYER tag on its top edge, his
 * chest on the stage, the what-you-get tags (never header chips, so "what you get" never looks
 * like "what you have"), the Starter Frame, and the price as the one gold button in its wave foot.
 *
 * The body scrolls under the bar's straight edge; nothing sits under the bar at rest. Copy is the
 * live Supplies copy (SuppliesShop.tsx); numbers are sample numbers.
 */
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Card from '../Card';
import CurrencyChip from '../CurrencyChip';
import Glyph from '../Glyph';
import Lift from '../Lift';
import Page from '../Page';
import RoundButton from '../RoundButton';
import Screen from '../Screen';
import Stage from '../Stage';
import StickerButton from '../StickerButton';
import Tabs from '../Tabs';
import Tag from '../Tag';
import { Body, Name } from '../Text';
import { ART, ART_RATIO } from '../art';
import { PAGE_GAP, screenFrameWidth } from '../layout';
import { LINE, SPACE, TAG } from '../tokens';

const noop = () => undefined;
const TABS = [{ key: 'gear', label: 'GEAR' }, { key: 'supplies', label: 'SUPPLIES' }];
const FREE_WAYS = [
  { art: ART.search, ratio: ART_RATIO.search, text: 'Every 3 treats on your home map = 1 Ticket' },
  { art: ART.star, ratio: ART_RATIO.star, text: 'Stamps in your Stamp Book give free Tickets' },
  { art: ART.gift, ratio: ART_RATIO.gift, text: 'Today’s free try plays one ride coin' },
  { art: ART.ride, ratio: ART_RATIO.ride, text: 'Your first wait at a ride earns a Ticket' },
] as const;
const GETS = [
  { key: 't', art: ART.ticket, ratio: ART_RATIO.ticket, n: '15', said: '15 Tickets' },
  { key: 'c', art: ART.coins, ratio: ART_RATIO.coins, n: '1500', said: '1,500 Shark Coins' },
  { key: 'e', art: ART.energy, ratio: ART_RATIO.energy, n: '150', said: '150 Energy' },
  { key: 'r', art: ART.retry, ratio: ART_RATIO.retry, n: '2', said: '2 extra tries' },
] as const;
/** Alex's heart disc on the pack's top edge (40 pt, the wishlist). */
const HEART = 40;
/** The free ways' icons sit in one column so the words line up. */
const ICON_BOX = 40;
/** A tag's laid-out height: the pill and its drop. */
const TAG_H = TAG.height + 3;

export default function ProofShop() {
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState('supplies');
  const [wished, setWished] = useState(false);
  const inner = screenFrameWidth(width) - LINE.page * 2 - SPACE.pagePad * 2;
  const stageW = Math.round(inner * 0.4);
  const stageH = Math.round(stageW * 0.8);
  return (
    <Screen testID="proof-shop" header={{ title: 'SHARK SHOP', onBack: noop, onHelp: noop, helpLabel: 'How the shop works' }}>
      <Tabs items={TABS} picked={tab} onPick={setTab} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: SPACE.cardGapLoose * 2, rowGap: SPACE.cardGap, marginTop: SPACE.cardGapLoose + 2 }}>
        <CurrencyChip kind="tickets" value={12} />
        <CurrencyChip kind="coins" value={3825} />
        <CurrencyChip kind="energy" value={935} />
      </View>
      <CurrencyChip kind="tries" value={0} unit="extra tries" style={{ alignSelf: 'center', marginTop: SPACE.cardGap }} />
      <Card paper="white" label={{ text: 'FREE TICKETS', tone: 'blue', icon: ART.ticket, iconRatio: ART_RATIO.ticket }} style={{ marginTop: PAGE_GAP }}>
        <View accessible accessibilityLabel={`Free ways to get Tickets: ${FREE_WAYS.map(w => w.text).join('. ')}.`}
          style={{ paddingHorizontal: SPACE.pageSnug, paddingBottom: SPACE.pageSnug, gap: SPACE.base * 2 }}>
          {FREE_WAYS.map(w => (
            <View key={w.text} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.cardGap }}>
              <View style={{ width: ICON_BOX, alignItems: 'center' }}>
                <Lift source={w.art} width={Math.round(30 * Math.min(1.3, w.ratio))} height={30} />
              </View>
              <Body align="left" style={{ flex: 1 }} role="none">{w.text}</Body>
            </View>
          ))}
        </View>
      </Card>
      <Card style={{ marginTop: SPACE.cardGapLoose }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: SPACE.pageSnug, gap: SPACE.cardGap }}>
          <View style={{ flex: 1 }}>
            <Name>Welcome to Supplies</Name>
            <Body size="mid" soft align="left" lines={3}>Packs of Tickets, Shark Coins, Energy and extra tries. Each one shows what you get.</Body>
          </View>
          <StickerButton label="OK" variant="second" size="medium" width={92} accessibilityLabel="OK, got it" onPress={noop} />
        </View>
      </Card>
      <Tag plain leading={<Glyph kind="money" size={20} />} style={{ alignSelf: 'center', marginTop: SPACE.cardGapLoose }}>
        Supplies cost real money. A grown-up buys them.
      </Tag>
      <Page style={{ marginTop: PAGE_GAP }}
        label={{ text: 'STARTER PACK', tone: 'gold', large: true }}
        onEdge={{
          start: { node: <RoundButton kind="disc" art={ART.heart} artRatio={ART_RATIO.heart} size={HEART} accessibilityLabel={wished ? 'On your wishlist' : 'Add to your wishlist'} onPress={() => setWished(w => !w)} />, height: HEART, width: HEART },
          end: { node: <Tag>ONE PER PLAYER</Tag>, height: TAG_H },
        }}
        foot={{ children: (
          <View style={{ alignSelf: 'stretch', paddingHorizontal: SPACE.pageSnug }}>
            <StickerButton label="$1.99" variant="primary" size="large" fullWidth accessibilityLabel="Buy the Starter Pack for $1.99. A grown-up checks first." onPress={noop} />
          </View>
        ) }}>
        <View style={{ flexDirection: 'row', gap: SPACE.cardGapLoose, alignItems: 'center' }}>
          <Stage width={stageW} height={stageH} label="Starter Pack chest">
            <Lift source={ART.packChest} width={Math.round(stageW * 0.98)} height={Math.round((stageW * 0.98) / ART_RATIO.packChest)} />
          </Stage>
          <View accessible accessibilityLabel={`You get ${GETS.map(g => g.said).join(', ')}, plus the Starter Frame.`} style={{ flex: 1, gap: SPACE.base * 2 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: SPACE.base * 2, rowGap: SPACE.base * 2 }}>
              {GETS.map(g => (
                <View key={g.key} style={{ width: '47%' }}>
                  <Tag large paper="cream" icon={g.art} iconRatio={Math.min(1.5, g.ratio)} style={{ alignSelf: 'stretch' }}>{g.n}</Tag>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.base * 2 }}>
              <Lift source={ART.starterFrame} width={30} height={30} />
              <Body size="mid" align="left" style={{ flex: 1 }} role="none">Plus the Starter Frame</Body>
            </View>
          </View>
        </View>
      </Page>
    </Screen>
  );
}
