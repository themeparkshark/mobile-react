/**
 * Proof screen (dev gallery only): the win card as board/pick/2-win. Under the chips bar, a page
 * with Alex's ribbon ("COIN CAUGHT!"), the stage (his underwater light and rays) holding the won
 * coin with his NEW! sticker, the coin's name, the bar whose dot walks to the new count with the
 * bronze trophy on its end, and the five prizes flat in one row on one card, art off its top edge.
 * The screen's wave foot holds the one gold NEXT COIN (wearing the white edge in the foot), the
 * next coin's tag and "See my shelf".
 *
 * Motion on arrival (the clip): the page is stuck on, the coin is stuck on the stage, the prizes
 * are stuck on one after another, the dot walks from 15 to 16, and the chips bounce as the prizes
 * land. Reduce Motion: every step is a 150 ms fade. Sample numbers; nothing is claimed.
 */
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Arrive from '../Arrive';
import Card from '../Card';
import CurrencyChip from '../CurrencyChip';
import GhostButton from '../GhostButton';
import Lift from '../Lift';
import Page from '../Page';
import ProgressBar from '../ProgressBar';
import Screen from '../Screen';
import Stage from '../Stage';
import StickerButton from '../StickerButton';
import Tag from '../Tag';
import { Body, Caps, Count, Title } from '../Text';
import { ART, ART_RATIO } from '../art';
import { buttonHeight, screenFrameWidth } from '../layout';
import { LINE, SPACE, TAG } from '../tokens';
import { winsLeft } from './proofData';

const noop = () => undefined;
const TOTAL = 35;
const GOAL = 26;
const PRIZES = [
  { key: 'coins', art: ART.coins, ratio: ART_RATIO.coins, count: '+10', name: 'Shark Coins' },
  { key: 'ticket', art: ART.ticket, ratio: ART_RATIO.ticket, count: '+1', name: 'Ticket' },
  { key: 'part', art: ART.rideParts, ratio: ART_RATIO.rideParts, count: '+1', name: 'Ride Part' },
  { key: 'energy', art: ART.energy, ratio: ART_RATIO.energy, count: '+10', name: 'Energy' },
  { key: 'xp', art: ART.xp, ratio: ART_RATIO.xp, count: '+25', name: 'XP' },
] as const;
const PRIZE_ART = 44;
/** The foot band: the tag on the wave, the large primary, the ghost. */
const FOOT = TAG.height + SPACE.base * 2 + buttonHeight('large') + SPACE.base * 2 + 44;

export default function ProofWin() {
  const { width } = useWindowDimensions();
  const [found, setFound] = useState(15);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const walk = setTimeout(() => setFound(16), 900);
    const land = setTimeout(() => setLanded(true), 1500);
    return () => { clearTimeout(walk); clearTimeout(land); };
  }, []);
  const inner = screenFrameWidth(width) - LINE.page * 2 - SPACE.pagePad * 2;
  const stageH = Math.round(inner * 0.5);
  const coin = Math.round(stageH * 0.86);
  return (
    <Screen testID="proof-win" header={{ children: [
      <CurrencyChip key="c" kind="coins" value={landed ? 4085 : 4075} />,
      <CurrencyChip key="e" kind="energy" value={landed ? 13 : 3} />,
      <CurrencyChip key="t" kind="tickets" value={landed ? 13 : 12} />,
    ] }}
      foot={{ height: FOOT, children: (
        <View style={{ alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: SPACE.margin + 8, marginTop: -WAVE_TAG_LIFT }}>
          <Tag icon={ART.coin} iconRatio={ART_RATIO.coin} label="Next coin: Tiki Room, 61 meters" style={{ alignSelf: 'center' }}>Tiki Room, 61 m</Tag>
          <StickerButton label="NEXT COIN" variant="primary" size="large" fullWidth style={{ marginTop: SPACE.base * 2 }} onPress={noop} />
          <GhostButton label="See my shelf" style={{ marginTop: SPACE.base }} onPress={noop} />
        </View>
      ) }}>
      <Page arrive ribbon={{ text: 'COIN CAUGHT!', kind: 'page' }}>
        <Stage width={inner} height={stageH} label="Walt Statue coin">
          <Arrive delay={260}>{() => <Lift source={ART.coin} width={Math.round(coin * ART_RATIO.coin)} height={coin} />}</Arrive>
        </Stage>
        <Lift source={ART.newSticker} width={74} height={Math.round(74 / ART_RATIO.newSticker)}
          style={{ position: 'absolute', left: SPACE.base * 2, top: 44, transform: [{ rotate: `${-TAG.tilt}deg` }] }} />
        <Caps align="center" style={{ marginTop: SPACE.cardGapLoose }}>Ride coin</Caps>
        <Title size="large">Walt Statue</Title>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: SPACE.base * 2, gap: SPACE.base * 2 }}>
          <Body align="left" lines={1}>{`${found} of ${TOTAL} coins`}</Body>
          <Body size="small" soft align="right" lines={1}>{`${winsLeft(found, GOAL)} more wins for Bronze`}</Body>
        </View>
        <ProgressBar value={found / TOTAL} label={`${found} of ${TOTAL} coins`} width={inner}
          prize={{ source: ART.bronze, width: 46, height: Math.round(46 / ART_RATIO.bronze) }} style={{ marginTop: SPACE.base }} />
        <Card style={{ marginTop: SPACE.cardGapLoose + PRIZE_ART / 2 }}>
          <View style={{ flexDirection: 'row', paddingTop: PRIZE_ART / 2 + SPACE.base, paddingBottom: SPACE.base * 2 }}>
            {PRIZES.map((p, i) => (
              <Arrive key={p.key} delay={420 + i * 90} style={{ flex: 1, alignItems: 'center' }}>
                {() => (
                  <>
                    <Lift source={p.art} width={Math.round(PRIZE_ART * Math.min(1.5, p.ratio))} height={PRIZE_ART} style={{ position: 'absolute', top: -PRIZE_ART - SPACE.base }} />
                    <Count size="count" align="center">{p.count}</Count>
                    <Body size="small" soft lines={1}>{p.name}</Body>
                  </>
                )}
              </Arrive>
            ))}
          </View>
        </Card>
      </Page>
    </Screen>
  );
}

/** The tag sits on the wave's crest, half above it. */
const WAVE_TAG_LIFT = 14;
