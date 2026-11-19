/**
 * Proof screen (dev gallery only): the win card as board/pick/2-win, with its motion built for
 * real. Under the chips bar, a page with Alex's ribbon ("COIN CAUGHT!"), the stage (his underwater
 * light and rays) holding the won coin (the server's Walt Statue art) with his NEW! sticker once,
 * "RIDE COIN" and the coin's name, the walking-dot bar with the bronze trophy on its end, and the
 * five prizes flat in one row on one card, art off its top edge. The screen's wave foot holds the
 * one gold NEXT COIN, the next coin's tag and "See my shelf".
 *
 * The sequence (WIN_BEATS): the page is stuck on, the coin lands on the stage, NEW! is stuck on,
 * the dot walks from 15 to 16, the prizes are stuck on one by one and count up, then the coins,
 * ticket and energy fly to their header chips, which bounce as each lands. Reduce Motion: every
 * step is a 150 ms fade in the same order, nothing flies, and the chips take their new counts
 * with a fade. Sample numbers; nothing is claimed.
 *
 * On a short phone (the SE) the stage gives up height first and "See my shelf" shares the tag's
 * row in the foot, so the whole card shows at rest with nothing under the foot.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import useUiReducedMotion from '../../useUiReducedMotion';
import Arrive from '../Arrive';
import Card from '../Card';
import CurrencyChip from '../CurrencyChip';
import Flight, { type FlightPoint } from '../Flight';
import GhostButton from '../GhostButton';
import Glyph from '../Glyph';
import Lift from '../Lift';
import Page from '../Page';
import ProgressBar from '../ProgressBar';
import Screen from '../Screen';
import Spot from '../Spot';
import Stage from '../Stage';
import StickerButton from '../StickerButton';
import Tag from '../Tag';
import { Body, Caps, Count, Title } from '../Text';
import { ART, ART_RATIO } from '../art';
import { buttonHeight, screenFrameWidth } from '../layout';
import { LINE, SPACE, TAG } from '../tokens';
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
const PRIZE_ART = 44;
/** The tag sits on the wave's crest, half above it. */
const WAVE_TAG_LIFT = 14;
/** A short phone: the foot puts the tag and "See my shelf" on one row. */
const SHORT = 700;
/** A tall phone has room for the week line under "See my shelf". */
const TALL = 800;
/** The stage takes what the card and the foot leave: half the window less this, never under STAGE_MIN (measured on the 17 Pro and the SE). */
const STAGE_ROOM = 293;
const STAGE_MIN = 80;
/** The ghost button's least touch height. */
const GHOST_H = 44;
/** The week line under "See my shelf" on a tall phone. */
const WEEK_LINE = 20;

/** "+10" counting up in a few steps once its prize is stuck on (Reduce Motion: the number is just there). */
const PrizeCount = memo(function PrizeCount({ value, delay, reduced }: { value: number; delay: number; reduced: boolean }) {
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setShown(value); return undefined; }
    const steps = countSteps(value);
    const timers = steps.map((v, i) => setTimeout(() => setShown(v), delay + i * WIN_BEATS.countStep));
    return () => timers.forEach(clearTimeout);
  }, [delay, reduced, value]);
  return <Count size="count" align="center" label={`plus ${value}`}>{`+${shown}`}</Count>;
});

type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };
function measure(node: Measurable | null): Promise<{ x: number; y: number; w: number; h: number } | null> {
  return new Promise(resolve => {
    if (!node) { resolve(null); return; }
    node.measureInWindow((x, y, w, h) => resolve(w || h ? { x, y, w, h } : null));
  });
}

/** The win card waits for the won coin's art (a real win has it before the card opens), then runs its beats from zero. */
export default function ProofWin() {
  const { art, ready } = useParkCoins(useMemo(() => [WON, NEXT], []));
  return ready ? <WinCard coins={art} /> : <Screen testID="proof-win-wait" header={{ children: [
    <CurrencyChip key="c" kind="coins" value={START.coins} />, <CurrencyChip key="e" kind="energy" value={START.energy} />, <CurrencyChip key="t" kind="tickets" value={START.tickets} />,
  ] }} />;
}

function WinCard({ coins }: { readonly coins: Readonly<Record<string, ImageSourcePropType | undefined>> }) {
  const { width, height } = useWindowDimensions();
  const reduced = useUiReducedMotion();
  const [found, setFound] = useState(15);
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
    const walk = setTimeout(() => setFound(16), WIN_BEATS.walk);
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
          from: { x: a.x - origin.x + a.w / 2, y: a.y - origin.y + a.h / 2, size: PRIZE_ART },
          // The chip's art sits on its left end: aim there.
          to: { x: b.x - origin.x + 12, y: b.y - origin.y + b.h / 2, size: 30 } });
      }
      if (live) setFlights(out);
    }, WIN_BEATS.fly);
    return () => { live = false; clearTimeout(walk); clearTimeout(fly); };
    // chipRefs are stable refs; the sequence runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [land, reduced]);

  const inner = screenFrameWidth(width) - LINE.page * 2 - SPACE.pagePad * 2;
  const short = height < SHORT;
  // The stage gives up height first on a short phone, so the prize row stays in view above the foot band.
  const stageH = Math.round(Math.max(STAGE_MIN, Math.min(inner * 0.5, height * 0.5 - STAGE_ROOM)));
  const coinH = Math.round(stageH * 0.86);
  const footH = short
    ? Math.max(TAG.height, GHOST_H) + SPACE.base * 2 + buttonHeight('large') + SPACE.base
    : TAG.height + SPACE.base * 2 + buttonHeight('large') + SPACE.base * 2 + GHOST_H + (height >= TALL ? WEEK_LINE : 0);
  const next = coins[NEXT];
  const nextTag = (
    <Tag label={`Next coin: ${NEXT}, 61 meters`} leading={next ? <Lift source={next} width={18} height={18} flat /> : <Spot state="next" size={18} />}
      style={{ alignSelf: 'center' }}>{`${NEXT}, 61 m`}</Tag>
  );
  const shelf = <GhostButton label="See my shelf" onPress={noop} />;
  const won = coins[WON];
  return (
    <Screen testID="proof-win"
      header={{ children: [
        <View key="c" ref={chipRefs.coins} collapsable={false}><CurrencyChip kind="coins" value={chips.coins} /></View>,
        <View key="e" ref={chipRefs.energy} collapsable={false}><CurrencyChip kind="energy" value={chips.energy} /></View>,
        <View key="t" ref={chipRefs.tickets} collapsable={false}><CurrencyChip kind="tickets" value={chips.tickets} /></View>,
      ] }}
      fx={(
        <View ref={fxRef} collapsable={false} style={{ flex: 1 }}>
          {flights.map(f => <Flight key={f.key} source={f.art} ratio={f.ratio} from={f.from} to={f.to} delay={f.delay} onLand={landers[f.chip]} />)}
        </View>
      )}
      foot={{ height: footH, children: (
        <View style={{ alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: SPACE.margin + 8, marginTop: -WAVE_TAG_LIFT }}>
          {short ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' }}>{nextTag}{shelf}</View>
          ) : nextTag}
          <StickerButton label="NEXT COIN" variant="primary" size="large" fullWidth style={{ marginTop: SPACE.base * 2 }} onPress={noop} />
          {short ? null : <View style={{ marginTop: SPACE.base }}>{shelf}</View>}
          {!short && height >= TALL ? (
            <View accessible accessibilityLabel="1 coin this week" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {won ? <Lift source={won} width={18} height={18} flat /> : null}
              <Glyph kind="check" size={18} />
              <Body size="small" lines={1} role="none">1 coin this week</Body>
            </View>
          ) : null}
        </View>
      ) }}>
      <Page arrive ribbon={{ text: 'COIN CAUGHT!', kind: 'page' }}>
        <Stage width={inner} height={stageH} label={`${WON} coin`} landDelay={WIN_BEATS.land}>
          {won ? <Lift source={won} width={coinH} height={coinH} /> : <Spot state="next" size={coinH} />}
        </Stage>
        <Arrive delay={WIN_BEATS.sticker} style={{ position: 'absolute', left: SPACE.base * 2, top: 44 }}>
          {() => <Lift source={ART.newSticker} width={74} height={Math.round(74 / ART_RATIO.newSticker)} style={{ transform: [{ rotate: `${-TAG.tilt}deg` }] }} />}
        </Arrive>
        <Caps gold align="center" style={{ marginTop: SPACE.cardGapLoose }}>Ride coin</Caps>
        <Title size="large">{WON}</Title>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: SPACE.base * 2, gap: SPACE.base * 2 }}>
          <Body align="left" lines={1}>{`${found} of ${TOTAL} coins`}</Body>
          <Body size="small" soft align="right" lines={1}>{`${winsLeft(found, GOAL)} more wins for Bronze`}</Body>
        </View>
        <ProgressBar value={found / TOTAL} label={`${found} of ${TOTAL} coins`} width={inner}
          prize={{ source: ART.bronze, width: 46, height: Math.round(46 / ART_RATIO.bronze) }} style={{ marginTop: SPACE.base }} />
        <Card style={{ marginTop: SPACE.cardGapLoose + PRIZE_ART / 2 }}>
          <View style={{ flexDirection: 'row', paddingTop: PRIZE_ART / 2 + SPACE.base, paddingBottom: SPACE.base * 2 }}>
            {PRIZES.map((p, i) => (
              <Arrive key={p.key} delay={WIN_BEATS.prizes + i * WIN_BEATS.prizeGap} style={{ flex: 1, alignItems: 'center' }}>
                {() => (
                  <>
                    <View ref={r => { prizeRefs.current[p.key] = r; }} collapsable={false} style={{ position: 'absolute', top: -PRIZE_ART - SPACE.base }}>
                      <Lift source={p.art} width={Math.round(PRIZE_ART * Math.min(1.5, p.ratio))} height={PRIZE_ART} />
                    </View>
                    <PrizeCount value={p.count} delay={WIN_BEATS.prizes + i * WIN_BEATS.prizeGap + WIN_BEATS.countLead} reduced={reduced} />
                    {/* Two lines at large text sizes ("Shark / Coins"), never an ellipsis. */}
                    <Body size="small" soft lines={2}>{p.name}</Body>
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
