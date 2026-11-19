/**
 * Proof screen (dev gallery only): the win card as board/pick/2-win, with its motion built for
 * real, over the dimmed map it is won on. Under the chips bar, a page with Alex's ribbon ("COIN
 * CAUGHT!"), the stage (his underwater light and rays) holding the won coin (the server's Walt
 * Statue art) with his NEW! sticker on the stage's corner, "RIDE COIN" and the coin's name, the
 * count line beside the bronze trophy over the walking-dot bar, and the five prizes in one row on
 * one card, each stuck into its own spot on the card's top edge. The screen's wave foot holds the
 * one gold NEXT COIN, the next coin's tag and "See my shelf".
 *
 * The hero never gives up size first: the stage grows into what the page leaves and the coin is
 * at least winHeroSize (110 on the SE, about 145 on the 17 Pro); on a short phone the window
 * shrinks under it and the coin breaks the window's top edge, and the prize names give way (the
 * art says what each prize is; VoiceOver still hears the names).
 *
 * The sequence (WIN_BEATS): until the won coin's art is on the phone the map stays as it was (the
 * screen the player was on, no blank frame); then the map dims and the page is stuck on whole, a
 * gold "next" spot waiting on the stage and five empty spots on the prize card. The coin lands on
 * the stage (squash, ring, sparkles), NEW! is stuck on, the dot walks from 15 to 16, the prizes are
 * stuck into their spots one by one and count up, then coins, ticket and energy fly to their header
 * chips, which bounce as each lands. Reduce Motion: every step is a 150 ms fade in the same order,
 * nothing flies, the chips take their new counts with a fade. Sample numbers; nothing is claimed.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import useUiReducedMotion from '../../useUiReducedMotion';
import Card from '../Card';
import CurrencyChip from '../CurrencyChip';
import Flight, { type FlightPoint } from '../Flight';
import GhostButton from '../GhostButton';
import Glyph from '../Glyph';
import { Row, Stack } from '../Arrange';
import Lift from '../Lift';
import Page from '../Page';
import ProgressBar from '../ProgressBar';
import Screen from '../Screen';
import Spot from '../Spot';
import Stage, { winHeroSize } from '../Stage';
import StickerButton from '../StickerButton';
import Tag from '../Tag';
import { Body, Caps, Count, Title } from '../Text';
import { ART, ART_RATIO } from '../art';
import { ART_SIZE, SPACE } from '../tokens';
import { mapLayer } from './ProofMap';
import { useParkCoins } from './proofCoins';
import { WIN_BEATS, countSteps, winsLeft } from './proofData';

const noop = () => undefined;
const TOTAL = 35;
const GOAL = 26;
const WON = 'Walt Statue';
const NEXT = 'Tiki Room';
type ChipKey = 'coins' | 'energy' | 'tickets';
const PRIZES = [
  { key: 'coins', art: ART.coins, ratio: ART_RATIO.coins, count: 10, name: 'Shark Coins', chip: 'coins' as ChipKey },
  { key: 'ticket', art: ART.ticket, ratio: ART_RATIO.ticket, count: 1, name: 'Ticket', chip: 'tickets' as ChipKey },
  { key: 'part', art: ART.rideParts, ratio: ART_RATIO.rideParts, count: 1, name: 'Ride Part', chip: null },
  { key: 'energy', art: ART.energy, ratio: ART_RATIO.energy, count: 10, name: 'Energy', chip: 'energy' as ChipKey },
  { key: 'xp', art: ART.xp, ratio: ART_RATIO.xp, count: 25, name: 'XP', chip: null },
] as const;
const START: Record<ChipKey, number> = { coins: 4075, energy: 3, tickets: 12 };
/** A short phone (the SE): the foot puts the tag and "See my shelf" on one row and the prize names give way. */
const SHORT = 700;
/** A tall phone has room for the week line under "See my shelf". */
const TALL = 800;

/** "+10" counting up in a few steps once its prize is stuck on (Reduce Motion: the number is just there). */
const PrizeCount = memo(function PrizeCount({ value, delay, reduced, label }: { value: number; delay: number; reduced: boolean; label: string }) {
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setShown(value); return undefined; }
    const steps = countSteps(value);
    const timers = steps.map((v, i) => setTimeout(() => setShown(v), delay + i * WIN_BEATS.countStep));
    return () => timers.forEach(clearTimeout);
  }, [delay, reduced, value]);
  return <Count size="count" align="center" label={label}>{shown ? `+${shown}` : ' '}</Count>;
});

type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };
function measure(node: Measurable | null): Promise<{ x: number; y: number; w: number; h: number } | null> {
  return new Promise(resolve => {
    if (!node) { resolve(null); return; }
    node.measureInWindow((x, y, w, h) => resolve(w || h ? { x, y, w, h } : null));
  });
}

/** The win card waits on the map (the screen it is won on) for the won coin's art, then runs its beats from zero. */
export default function ProofWin() {
  const { art, ready } = useParkCoins(useMemo(() => [WON, NEXT], []));
  return <WinScreen coins={art} ready={ready} />;
}

function WinScreen({ coins, ready }: { readonly coins: Readonly<Record<string, ImageSourcePropType | undefined>>; readonly ready: boolean }) {
  const { height } = useWindowDimensions();
  const reduced = useUiReducedMotion();
  const [chips, setChips] = useState<Record<ChipKey, number>>(START);
  const [flights, setFlights] = useState<{ key: string; chip: ChipKey; from: FlightPoint; to: FlightPoint; delay: number; art: number; ratio: number }[]>([]);
  const fxRef = useRef<View>(null);
  const chipRefs = { coins: useRef<View>(null), energy: useRef<View>(null), tickets: useRef<View>(null) };
  const prizeRefs = useRef<Record<string, View | null>>({});

  const land = useCallback((chip: ChipKey) => {
    setChips(c => ({ ...c, [chip]: c[chip] + (PRIZES.find(p => p.chip === chip)?.count ?? 0) }));
  }, []);
  const landers = useMemo(() => ({ coins: () => land('coins'), energy: () => land('energy'), tickets: () => land('tickets') }), [land]);

  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    const fly = setTimeout(async () => {
      const flying = PRIZES.filter(p => p.chip);
      if (reduced) {
        flying.forEach((p, i) => setTimeout(() => { if (live && p.chip) land(p.chip); }, i * WIN_BEATS.flyGap));
        return;
      }
      const origin = await measure(fxRef.current);
      const out: typeof flights = [];
      for (const [i, p] of flying.entries()) {
        const chip = p.chip as ChipKey;
        const a = await measure(prizeRefs.current[p.key]);
        const b = await measure(chipRefs[chip].current);
        if (!origin || !a || !b) { land(chip); continue; }
        out.push({ key: p.key, chip, art: p.art, ratio: p.ratio, delay: i * WIN_BEATS.flyGap,
          from: { x: a.x - origin.x + a.w / 2, y: a.y - origin.y + a.h / 2, size: ART_SIZE.prize },
          // The chip's art sits on its left end: aim there.
          to: { x: b.x - origin.x + SPACE.cardGapLoose, y: b.y - origin.y + b.h / 2, size: ART_SIZE.chip } });
      }
      if (live) setFlights(out);
    }, WIN_BEATS.fly);
    return () => { live = false; clearTimeout(fly); };
    // chipRefs are stable refs; the sequence runs once the card is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [land, ready, reduced]);

  const short = height < SHORT;
  const header = { children: [
    <View key="c" ref={chipRefs.coins} collapsable={false}><CurrencyChip kind="coins" value={chips.coins} /></View>,
    <View key="e" ref={chipRefs.energy} collapsable={false}><CurrencyChip kind="energy" value={chips.energy} /></View>,
    <View key="t" ref={chipRefs.tickets} collapsable={false}><CurrencyChip kind="tickets" value={chips.tickets} /></View>,
  ] };
  // Until the art is on the phone, the map the coin was won on stays exactly as it was.
  if (!ready) return <Screen testID="proof-win-wait" ground="map" mapLayer={mapLayer} scroll={false} header={header} />;
  const next = coins[NEXT];
  const won = coins[WON];
  const nextTag = (
    <Tag label={`Next coin: ${NEXT}, 61 meters`} leading={next ? <Lift source={next} width={ART_SIZE.mark} height={ART_SIZE.mark} flat /> : <Spot state="next" size={ART_SIZE.mark} />}
      style={{ alignSelf: 'center' }}>{`${NEXT}, 61 m`}</Tag>
  );
  const shelf = <GhostButton label="See my shelf" onPress={noop} />;
  return (
    <Screen testID="proof-win" ground="map" mapLayer={mapLayer} dim header={header}
      fx={(
        <View ref={fxRef} collapsable={false} style={{ flex: 1 }}>
          {flights.map(f => <Flight key={f.key} source={f.art} ratio={f.ratio} from={f.from} to={f.to} delay={f.delay} onLand={landers[f.chip]} />)}
        </View>
      )}
      foot={{ children: (
        // The tag sits on the wave's crest, half above it.
        <Stack align="center" style={{ alignSelf: 'stretch', marginHorizontal: SPACE.margin + SPACE.base * 2, marginTop: -SPACE.base * 4 + 2 }}>
          {short ? <Row justify="between" style={{ alignSelf: 'stretch' }}>{nextTag}{shelf}</Row> : nextTag}
          <StickerButton label="NEXT COIN" variant="primary" size="large" style={{ marginTop: SPACE.base * 2 }} onPress={noop} />
          {short ? null : <View style={{ marginTop: SPACE.base }}>{shelf}</View>}
          {!short && height >= TALL ? (
            <Row gap="base" style={{ marginTop: -SPACE.base }}>
              <View accessible accessibilityLabel="1 coin this week"><Row gap="base">
                <Lift source={ART.coin} width={ART_SIZE.mark} height={Math.round(ART_SIZE.mark / ART_RATIO.coin)} />
                <Glyph kind="check" size={ART_SIZE.mark} />
                <Body size="small" lines={1} role="none">1 coin this week</Body>
              </Row></View>
            </Row>
          ) : null}
        </Stack>
      ) }}>
      <Page arrive fill ribbon={{ text: 'COIN CAUGHT!', kind: 'page' }}>
        <Stage label={`${WON} coin`} landDelay={WIN_BEATS.land}
          hero={{ min: winHeroSize(height), render: size => (won ? <Lift source={won} width={size} height={size} /> : <Spot state="next" size={size} />) }}
          corner={{ delay: WIN_BEATS.sticker, node: <Lift source={ART.newSticker} width={74} height={Math.round(74 / ART_RATIO.newSticker)} /> }} />
        <Caps gold align="center" style={{ marginTop: SPACE.cardGap }}>Ride coin</Caps>
        <Title size="large" lines={1} fit>{WON}</Title>
        <WalkingBar />
        <Card style={{ marginTop: SPACE.cardGap }} topRow={{ size: 'prize', children: (
          <Row even align="center" style={{ minHeight: ART_SIZE.prize }}>
            {PRIZES.map((p, i) => (
              <View key={p.key} ref={r => { prizeRefs.current[p.key] = r; }} collapsable={false}>
                <Spot state="empty" stickAt={WIN_BEATS.prizes + i * WIN_BEATS.prizeGap} art={p.art} artRatio={p.ratio} size={ART_SIZE.prize} />
              </View>
            ))}
          </Row>
        ) }}>
          <Row even align="start" style={{ marginBottom: SPACE.base * 2, marginHorizontal: SPACE.base }}>
            {PRIZES.map((p, i) => (
              <Stack key={p.key} gap="none" align="stretch">
                <PrizeCount value={p.count} delay={WIN_BEATS.prizes + i * WIN_BEATS.prizeGap + WIN_BEATS.countLead} reduced={reduced} label={`plus ${p.count} ${p.name}`} />
                {short ? null : <Body size="small" soft lines={2} role="none">{p.name}</Body>}
              </Stack>
            ))}
          </Row>
        </Card>
      </Page>
    </Screen>
  );
}

/** The count line beside the bronze trophy over the walking-dot bar (the dot walks 15 to 16). */
function WalkingBar() {
  const [found, setFound] = useState(15);
  useEffect(() => {
    const walk = setTimeout(() => setFound(16), WIN_BEATS.walk);
    return () => clearTimeout(walk);
  }, []);
  return (
    <ProgressBar value={found / TOTAL} label={`${found} of ${TOTAL} coins`} style={{ marginTop: SPACE.base * 2 }}
      prize={{ source: ART.bronze, width: ART_SIZE.trophy, height: Math.round(ART_SIZE.trophy / ART_RATIO.bronze) }}
      above={(
        <Row justify="between" align="end" gap="base">
          <Body align="left" lines={1} role="none">{`${found} of ${TOTAL} coins`}</Body>
          <Body size="small" soft align="right" lines={1} role="none" style={{ flexShrink: 1 }}>{`${winsLeft(found, GOAL)} more wins for Bronze`}</Body>
        </Row>
      )} />
  );
}
