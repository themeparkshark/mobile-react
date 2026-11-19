/**
 * StickerGallery (dev only): every STICKER BOOK part in every state, on the blue world, on a
 * tan map-like ground and inside a page, plus the outlined-title measurements of the spike.
 *
 * Route params: { section?: GallerySection } opens one section alone (captures);
 * section 'titles30' also takes { variant?: TitleVariant, t0?: number } and records the time
 * from t0 (performance.now() when the navigation was sent) until the 30 titles have laid out
 * and two frames have passed, into globalThis.__stickerBench.
 */
import { memo, useCallback, useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Badge from './Badge';
import Card from './Card';
import CurrencyChip from './CurrencyChip';
import Lift from './Lift';
import Page from './Page';
import ProgressBar from './ProgressBar';
import RoundButton from './RoundButton';
import Spot, { type SpotState } from './Spot';
import StickerButton from './StickerButton';
import { StickerGround } from './StickerContext';
import StickerText, { type OutlineTechnique } from './StickerText';
import Tag from './Tag';
import TitleLabel from './TitleLabel';
import WaveFoot from './WaveFoot';
import { ART, ART_RATIO } from './art';
import SvgTitle from './spike/SvgTitle';
import { FONT, GALLERY, INK, SHADE, STROKE } from './tokens';

export type GallerySection = 'level' | 'type' | 'text' | 'textcand' | 'titles30' | 'page' | 'card' | 'button' | 'spot' | 'chips' | 'round' | 'wave' | 'progress';
export type TitleVariant = 'shadow16' | 'shadow12' | 'shadow8' | 'copies16' | 'copies12' | 'svg' | 'plain';

const SECTIONS: readonly GallerySection[] = ['level', 'type', 'text', 'textcand', 'page', 'card', 'button', 'spot', 'chips', 'round', 'wave', 'progress', 'titles30'];
const noop = () => undefined;

/** Knockout caps section label, white on blue (12 pt, no stroke). */
function Caps({ children, color = INK.white }: { children: string; color?: string }) {
  return <Text style={{ fontFamily: FONT.knockout, fontSize: 12, lineHeight: 14, letterSpacing: 1.3, color, marginBottom: 6 }}>{children.toUpperCase()}</Text>;
}

function Note({ children, paper = false }: { children: string; paper?: boolean }) {
  return <Text style={{ fontFamily: FONT.knockout, fontSize: 12, lineHeight: 14, color: paper ? INK.navySoft : SHADE.onBlueSoft, marginTop: 4 }}>{children}</Text>;
}

/** The blue world: the gallery's own ground. */
function World({ children, label = 'on the world' }: { children: ReactNode; label?: string }) {
  return (
    <View style={styles.ground}>
      <LinearGradient colors={[INK.blueBright, INK.blue]} style={StyleSheet.absoluteFill} />
      <Caps>{label}</Caps>
      <StickerGround level="world">{children}</StickerGround>
    </View>
  );
}

/** A tan map-like ground: streets and a patch of grass (dev colours, GALLERY). */
function MapGround({ children }: { children: ReactNode }) {
  return (
    <View style={[styles.ground, { backgroundColor: GALLERY.mapGround }]}>
      <View style={{ position: 'absolute', left: -20, right: -20, top: 54, height: 18, backgroundColor: GALLERY.mapStreet, transform: [{ rotate: '-8deg' }] }} />
      <View style={{ position: 'absolute', right: -30, top: -10, width: 120, height: 90, borderRadius: 45, backgroundColor: GALLERY.mapGrass }} />
      <Caps color={INK.navy}>on the map</Caps>
      <StickerGround level="map">{children}</StickerGround>
    </View>
  );
}

/** Inside a page: level 2. */
function InPage({ children }: { children: ReactNode }) {
  return (
    <View style={[styles.ground, { paddingTop: 22 }]}>
      <LinearGradient colors={[INK.blueBright, INK.blue]} style={StyleSheet.absoluteFill} />
      <StickerGround level="world">
        <Page label={{ text: 'Inside a page' }}>{children}</Page>
      </StickerGround>
    </View>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }} testID={`gallery-${id}`}>
      <StickerText size={22} stroke={2.4} spacing={0.08} style={{ alignSelf: 'flex-start', marginBottom: 8 }} role="header">{title}</StickerText>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

const Row = ({ children, gap = 12 }: { children: ReactNode; gap?: number }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap }}>{children}</View>
);

const CHEST = { source: ART.chestClosed, width: 58, height: 58 };

function RowCard({ title, line, art = CHEST, children }: { title: string; line: string; art?: typeof CHEST; children?: ReactNode }) {
  return (
    <Card art={{ ...art, side: 'left', over: 13, along: 0 }} style={{ height: 62 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 58, paddingRight: 10 }}>
        <View style={{ flex: 1 }}>
          <StickerText size={18} tone="navy" stroke={0} align="left" lineHeight={21} style={{ alignSelf: 'flex-start' }}>{title}</StickerText>
          <Text style={{ fontFamily: FONT.knockout, fontSize: 14, lineHeight: 16, color: INK.navySoft }}>{line}</Text>
        </View>
        {children}
      </View>
    </Card>
  );
}

// ---------- sections ----------

function LevelSection() {
  return (
    <Section id="level" title="The level rule">
      <World>
        <RowCard title="Card on the world" line="Level 1: white cut edge, 4 pt drop." />
      </World>
      <InPage>
        <RowCard title="Card on a page" line="Level 2: navy line and a lip only." />
        <View style={{ height: 12 }} />
        <Card edge style={{ height: 46 }}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: FONT.knockout, fontSize: 14, color: INK.navySoft }}>This card asked for a white edge inside a page: refused, dev warning logged.</Text>
          </View>
        </Card>
        <View style={{ height: 12 }} />
        <Row>
          <Tag>Tag</Tag>
          <CurrencyChip art={ART.coins} artRatio={ART_RATIO.coins} artHeight={34} value={350} label="350 coins" minWidth={70} />
        </Row>
      </InPage>
    </Section>
  );
}

function TypeSection() {
  return (
    <Section id="type" title="Type">
      <World>
        <Row gap={24}>
          <StickerText size={32} stroke={2.8} drop={2.5} spacing={0.09}>COIN CAUGHT!</StickerText>
          <StickerText size={32} tone="gold" stroke={2.8} drop={2.5} spacing={0.06}>15 of 35</StickerText>
        </Row>
        <Note>Shark, white, navy stroke (3 pt max), hard drop. 17 pt and up only.</Note>
        <View style={{ height: 8 }} />
        <StickerText size={17} stroke={0} align="left" style={{ alignSelf: 'flex-start' }}>Start a flame with Daily 3</StickerText>
        <Note>Small Shark on blue: plain white, 1.5 pt drop.</Note>
        <View style={{ height: 8 }} />
        <Caps color={INK.gold}>Next coin</Caps>
        <StickerText size={16} font="knockout" align="left" spacing={0.015} style={{ alignSelf: 'flex-start' }}>Hand the phone to a grown-up.</StickerText>
      </World>
    </Section>
  );
}

const SIZES = [17, 22, 30, 35] as const;
const strokeAt = (size: number) => (size >= 24 ? STROKE.title : STROKE.button);

function TextSection() {
  return (
    <Section id="text" title="Outlined titles">
      <World label="the pick: 16 copies, shadow drop">
        {SIZES.map(size => (
          <View key={size} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={styles.sizeTag}>{size}</Text>
            <StickerText size={size} spacing={size >= 30 ? 0.09 : 0.05} align="left" style={{ alignSelf: 'flex-start' }}>{size >= 30 ? 'Jumpy Ça!' : 'Jumpy Élan Ñu gq'}</StickerText>
          </View>
        ))}
        <Caps>one line, shrinks to fit (160 pt box)</Caps>
        <View style={{ width: 160, borderWidth: 1, borderColor: SHADE.spotBlueLine, borderStyle: 'dashed' }}>
          <StickerText size={30} spacing={0.09}>Universal Studios</StickerText>
        </View>
        <Caps>wraps to two lines (220 pt box)</Caps>
        <View style={{ width: 220, borderWidth: 1, borderColor: SHADE.spotBlueLine, borderStyle: 'dashed' }}>
          <StickerText size={30} spacing={0.09} lines={2} fit={false}>Disneyland Park Coin Caught</StickerText>
        </View>
      </World>
    </Section>
  );
}

function Candidate({ technique, copies, size }: { technique: OutlineTechnique | 'svg'; copies: number; size: number }) {
  const word = 'MAX ark';
  if (technique === 'svg') return <SvgTitle size={size} width={size * 4.2} stroke={strokeAt(size)} drop={size >= 24 ? 2.5 : 2}>{word}</SvgTitle>;
  return <StickerText size={size} technique={technique} copies={copies} spacing={0.06}>{word}</StickerText>;
}

function TextCandidatesSection() {
  const rows: readonly { name: string; technique: OutlineTechnique | 'svg'; copies: number }[] = [
    { name: 'A copies 16 + 8 drop', technique: 'copies', copies: 16 },
    { name: 'B shadow 16 (pick)', technique: 'shadow', copies: 16 },
    { name: 'B shadow 12', technique: 'shadow', copies: 12 },
    { name: 'B shadow 8', technique: 'shadow', copies: 8 },
    { name: 'C one SVG text', technique: 'svg', copies: 0 },
  ];
  return (
    <Section id="textcand" title="Stroke candidates">
      <World label="same words, same sizes">
        {rows.map(row => (
          <View key={row.name} style={{ marginBottom: 6 }}>
            <Caps>{row.name}</Caps>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
              {[17, 22, 35].map(size => <Candidate key={size} technique={row.technique} copies={row.copies} size={size} />)}
            </View>
          </View>
        ))}
      </World>
    </Section>
  );
}

const WORDS = ['Coin caught!', 'Daily Chest', 'Rewards', 'Walt Statue', 'Shark Shop', 'Level 7', 'Disneyland', 'Play!', 'Starter pack', 'Ride coins'];

declare global {
  // eslint-disable-next-line no-var
  var __stickerBench: { variant: string; ms: number; at: number }[] | undefined;
}

function BenchTitle({ text, size, variant, onLaid }: { text: string; size: number; variant: TitleVariant; onLaid: () => void }) {
  const stroke = strokeAt(size);
  if (variant === 'svg') {
    return <View onLayout={onLaid} style={{ alignItems: 'center', marginBottom: 6 }}><SvgTitle size={size} width={330} stroke={stroke} drop={2.5}>{text}</SvgTitle></View>;
  }
  const technique: OutlineTechnique = variant.startsWith('copies') ? 'copies' : 'shadow';
  const copies = Number(variant.replace(/\D/g, '')) || 16;
  return (
    <View style={{ alignItems: 'center', marginBottom: 6 }}>
      <StickerText size={size} stroke={variant === 'plain' ? 0 : undefined} technique={technique} copies={copies} spacing={0.08} onReady={onLaid}>{text}</StickerText>
    </View>
  );
}

const BenchList = memo(function BenchList({ variant, t0 }: { variant: TitleVariant; t0: number }) {
  const laid = useRef(0);
  const done = useRef(false);
  const onLaid = useCallback(() => {
    laid.current += 1;
    if (laid.current < 30 || done.current) return;
    done.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ms = Math.round((performance.now() - t0) * 10) / 10;
      globalThis.__stickerBench = [...(globalThis.__stickerBench ?? []), { variant, ms, at: Date.now() }];
      console.log(`[sticker bench] ${variant} 30 titles settled in ${ms} ms`);
    }));
  }, [t0, variant]);
  return (
    <View>
      {Array.from({ length: 30 }, (_, i) => (
        <BenchTitle key={i} text={WORDS[i % WORDS.length]} size={SIZES[i % SIZES.length]} variant={variant} onLaid={onLaid} />
      ))}
    </View>
  );
});

function Titles30Section({ variant, t0 }: { variant: TitleVariant; t0: number }) {
  return (
    <Section id="titles30" title={`30 titles: ${variant}`}>
      <World label="mount cost and one VoiceOver element each">
        <BenchList variant={variant} t0={t0} />
      </World>
    </Section>
  );
}

function PageSection() {
  return (
    <Section id="page" title="Page">
      <World>
        <Page label={{ text: 'Title label', tone: 'gold' }} style={{ marginTop: 16 }}>
          <RowCard title="Card on a page" line="Navy line and a lip only." />
        </Page>
      </World>
      <MapGround>
        <Page small padding={10} style={{ width: 240 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Lift source={ART.coin} width={44} height={44 / ART_RATIO.coin} style={{ marginLeft: -22 }} />
            <View>
              <Caps color={INK.gold}>Next coin</Caps>
              <StickerText size={19} stroke={2.2} align="left" style={{ alignSelf: 'flex-start' }}>Tap PLAY!</StickerText>
            </View>
          </View>
        </Page>
        <Note paper>On the map: white edge 3, drop 5 at 50 percent navy.</Note>
      </MapGround>
      <View style={[styles.ground, { backgroundColor: GALLERY.mapGround, paddingTop: 30 }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: INK.scrim }]} />
        <StickerGround level="world">
          <Page floating label={{ text: 'Use 1 Ticket?', large: true, left: 60 }} footHeight={58}
            foot={<WaveFoot height={58}><StickerText size={19} stroke={2.2}>Not now</StickerText></WaveFoot>}>
            <StickerText size={16} font="knockout" spacing={0.015}>Play for the Walt Statue coin.</StickerText>
            <View style={{ height: 12 }} />
            <StickerButton label="PLAY!" color="gold" size="medium" fontSize={22} faceHeight={46} width={160} style={{ alignSelf: 'center' }} onPress={noop} />
          </Page>
        </StickerGround>
      </View>
    </Section>
  );
}

function CardSection() {
  return (
    <Section id="card" title="Card">
      <World>
        <RowCard title="Cream on the world" line="Level 1, white edge." />
        <View style={{ height: 10 }} />
        <Card paper="white" style={{ height: 62 }}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 14 }}>
            <StickerText size={18} tone="navy" stroke={0} align="left" style={{ alignSelf: 'flex-start' }}>White on the world</StickerText>
          </View>
        </Card>
      </World>
      <MapGround>
        <RowCard title="Cream on the map" line="3 pt line, 50 percent drop." />
      </MapGround>
      <InPage>
        <RowCard title="Daily Chest" line="Day 1 of 7 is ready">
          <StickerButton label="OPEN" color="gold" size="medium" faceHeight={36} fontSize={18} width={86} onPress={noop} />
        </RowCard>
        <View style={{ height: 11 }} />
        <RowCard title="Level 7 Chest" line="New gear inside" art={{ source: ART.levelChest, width: 58, height: 58 }}>
          <StickerButton label="OPEN" color="blue" size="medium" faceHeight={36} fontSize={18} width={86} onPress={noop} />
        </RowCard>
        <View style={{ height: 11 }} />
        <RowCard title="Daily 3" line="0 of 3 done" art={{ source: ART.brownChest, width: 50, height: 50 }}>
          <StickerButton label="SEE" color="white" size="medium" faceHeight={36} fontSize={18} width={70} onPress={noop} />
        </RowCard>
        <View style={{ height: 22 }} />
        <Card paper="white" art={{ source: ART.coin, width: 54, height: 54 / ART_RATIO.coin, side: 'top', over: 26, along: 128 }} style={{ height: 70 }}>
          <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 10 }}>
            <StickerText size={17} tone="navy" stroke={0}>Art off the top edge</StickerText>
          </View>
        </Card>
      </InPage>
    </Section>
  );
}

function ButtonSection() {
  return (
    <Section id="button" title="StickerButton">
      <World>
        <Row>
          <StickerButton label="PLAY!" size="large" primary width={170} onPress={noop} />
          <StickerButton label="PLAY!" size="large" width={170} showPressed onPress={noop} />
          <StickerButton label="PLAY!" size="large" width={170} disabled onPress={noop} />
          <StickerButton label="PLAY!" accessibilityLabel="Play, loading" size="large" width={170} busy onPress={noop} />
        </Row>
        <Note>Primary with the glint, pressed by its lip, off, busy.</Note>
      </World>
      <MapGround>
        <Row>
          <StickerButton label="PLAY!" size="large" primary width={170} onPress={noop} />
          <Tag>Shelf</Tag>
        </Row>
      </MapGround>
      <InPage>
        <Row gap={10}>
          <StickerButton label="OPEN" color="gold" width={96} onPress={noop} />
          <StickerButton label="OPEN" color="blue" width={96} onPress={noop} />
          <StickerButton label="SEE" color="white" width={80} onPress={noop} />
          <StickerButton label="DELETE" color="red" width={110} onPress={noop} />
          <StickerButton label="OK" color="blue" size="small" fontSize={18} width={62} onPress={noop} />
          <StickerButton label="7" color="key" size="key" width={70} onPress={noop} />
          <StickerButton label="OPEN" color="gold" width={96} showPressed onPress={noop} />
          <StickerButton label="OPEN" color="gold" width={96} disabled onPress={noop} />
          <StickerButton label="OPEN" accessibilityLabel="Open, loading" color="blue" width={96} busy onPress={noop} />
        </Row>
        <Note>Inside a page: line and lip, no white edge.</Note>
      </InPage>
    </Section>
  );
}

const SPOT_STATES: readonly SpotState[] = ['empty', 'ghost', 'next', 'yours'];

function SpotSection() {
  return (
    <Section id="spot" title="Spot">
      <World>
        <Row gap={18}>{SPOT_STATES.map(s => <View key={s} style={{ alignItems: 'center' }}><Spot state={s} art={ART.coin} label={`coin, ${s}`} /><Note>{s}</Note></View>)}</Row>
      </World>
      <InPage>
        <Card padding={14}>
          <Row gap={18}>{SPOT_STATES.map(s => <Spot key={s} state={s} art={ART.coin} label={`coin, ${s}`} />)}</Row>
          <View style={{ height: 12 }} />
          <Row gap={6}>
            <Spot state="yours" art={ART.coin} size={22} />
            <Spot state="yours" art={ART.coin} size={22} />
            <Spot state="next" size={22} />
            {[0, 1, 2, 3].map(i => <Spot key={i} state="empty" size={22} />)}
            <Text style={{ fontFamily: FONT.knockout, fontSize: 14, color: INK.navySoft }}>Day 3 of 7</Text>
          </Row>
        </Card>
      </InPage>
    </Section>
  );
}

function ChipsSection() {
  return (
    <Section id="chips" title="Chips, tags, labels">
      <World>
        <Row gap={22}>
          <CurrencyChip art={ART.coins} artRatio={ART_RATIO.coins} artHeight={40} artOver={16} value={4075} label="4075 coins" />
          <CurrencyChip art={ART.energy} artRatio={ART_RATIO.energy} artHeight={36} artOver={8} value={3} label="3 energy" minWidth={70} />
          <CurrencyChip art={ART.ticket} artRatio={ART_RATIO.ticket} artHeight={32} artOver={18} value={12} label="12 tickets" minWidth={74} />
        </Row>
        <View style={{ height: 12 }} />
        <Row gap={9}>
          <Tag>Walt Statue</Tag>
          <Tag plain>Disneyland Park</Tag>
          <Tag paper="cream" large icon={ART.ticket} iconRatio={ART_RATIO.ticket} label="15 tickets">15</Tag>
          <Badge count={20} label="20 new" />
          <Tag tilt>NEW ROW</Tag>
        </Row>
        <View style={{ height: 14 }} />
        <Row gap={14}>
          <TitleLabel>Ask a grown-up</TitleLabel>
          <TitleLabel tone="gold">STARTER PACK</TitleLabel>
          <TitleLabel tone="blue">FREE TICKETS</TitleLabel>
          <Lift source={ART.newSticker} width={70} height={70 / ART_RATIO.newSticker} style={{ transform: [{ rotate: '-8deg' }] }} />
        </Row>
      </World>
      <MapGround>
        <Row><Tag>Shelf</Tag><Tag plain>Navy line 3 and a 50 percent navy drop</Tag></Row>
      </MapGround>
      <InPage>
        <Row gap={9}><Tag>Tag in a page</Tag><Tag paper="gold">Gold tag</Tag><Badge count={3} /></Row>
      </InPage>
    </Section>
  );
}

function RoundSection() {
  return (
    <Section id="round" title="Round buttons">
      <World>
        <Row gap={14}>
          <RoundButton kind="back" accessibilityLabel="Back" onPress={noop} />
          <RoundButton kind="help" accessibilityLabel="Help" size={52} onPress={noop} />
          <RoundButton kind="close" accessibilityLabel="Close" size={48} onPress={noop} />
          <RoundButton kind="base" accessibilityLabel="Shark" size={58} art={ART.shark} artMirror onPress={noop} />
          <RoundButton kind="base" accessibilityLabel="Daily chest, 2 ready" size={56} art={ART.chestClosed} badge={2} onPress={noop} />
        </Row>
        <Note>Alex's discs: arrow (mirrored), faq, close, base. Hit area 48.</Note>
      </World>
      <MapGround>
        <Row gap={14}>
          <RoundButton kind="base" accessibilityLabel="Daily chest, 2 ready" size={56} art={ART.chestClosed} badge={2} onPress={noop} />
          <RoundButton kind="help" accessibilityLabel="Help" size={48} onPress={noop} />
        </Row>
      </MapGround>
    </Section>
  );
}

function WaveSection() {
  return (
    <Section id="wave" title="Wave foot">
      <View style={[styles.ground, { backgroundColor: GALLERY.mapGround, paddingTop: 34 }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: INK.scrim }]} />
        <StickerGround level="world">
          <Page floating footHeight={60} label={{ text: 'Rewards', tone: 'gold', large: true, left: 110 }}
            foot={<WaveFoot>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Lift source={ART.arrow} width={26} height={26 / ART_RATIO.arrow} mirror flat />
                <StickerText size={20} stroke={2.2} spacing={0.06}>BACK TO MAP</StickerText>
              </View>
            </WaveFoot>}>
            <RowCard title="Daily Chest" line="Day 1 of 7 is ready">
              <StickerButton label="OPEN" color="gold" size="medium" faceHeight={36} fontSize={18} width={80} onPress={noop} />
            </RowCard>
          </Page>
        </StickerGround>
      </View>
    </Section>
  );
}

function ProgressSection() {
  return (
    <Section id="progress" title="Progress bar">
      <World>
        <ProgressBar value={0.457} label="16 of 35 coins" prize={{ source: ART.bronze, width: 47, height: 50 }} />
        <View style={{ height: 12 }} />
        <ProgressBar value={0.3} second={0.25} label="3 of 10, 2 more today" />
      </World>
      <InPage>
        <Card padding={14}>
          <ProgressBar value={0.6} label="6 of 10 sights" />
        </Card>
      </InPage>
    </Section>
  );
}

type Params = { section?: GallerySection; variant?: TitleVariant; t0?: number };

export default function StickerGallery({ route }: { route?: { params?: Params } }) {
  const insets = useSafeAreaInsets();
  const params = route?.params ?? {};
  const mountAt = useRef(performance.now()).current;
  const only = params.section;
  const variant = params.variant ?? 'shadow16';
  const t0 = params.t0 ?? mountAt;
  const shown = only ? [only] : SECTIONS;
  return (
    <View style={{ flex: 1, backgroundColor: INK.blue }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}>
        {shown.map(section => {
          switch (section) {
            case 'level': return <LevelSection key={section} />;
            case 'type': return <TypeSection key={section} />;
            case 'text': return <TextSection key={section} />;
            case 'textcand': return <TextCandidatesSection key={section} />;
            case 'titles30': return <Titles30Section key={`${section}-${variant}-${t0}`} variant={variant} t0={t0} />;
            case 'page': return <PageSection key={section} />;
            case 'card': return <CardSection key={section} />;
            case 'button': return <ButtonSection key={section} />;
            case 'spot': return <SpotSection key={section} />;
            case 'chips': return <ChipsSection key={section} />;
            case 'round': return <RoundSection key={section} />;
            case 'wave': return <WaveSection key={section} />;
            case 'progress': return <ProgressSection key={section} />;
            default: return null;
          }
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  ground: { borderRadius: 14, borderWidth: 2, borderColor: SHADE.smallDrop, padding: 16, overflow: 'hidden' },
  sizeTag: { fontFamily: FONT.knockout, fontSize: 12, color: SHADE.onBlueSoft, width: 26 },
});
