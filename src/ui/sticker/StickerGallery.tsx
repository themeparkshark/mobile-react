/**
 * StickerGallery (dev only): every STICKER BOOK part in every state, on the blue world, on a tan
 * map-like ground and inside a page, plus the outlined-title measurements of the spike and the
 * proof screens.
 *
 * Route params: { section?: GallerySection } opens one section alone (captures);
 * section 'titles30' also takes { variant?: TitleVariant, t0?: number } and records the time
 * from t0 (performance.now() when the navigation was sent) until the 30 titles have laid out
 * and two frames have passed, into globalThis.__stickerBench.
 * Proof sections: gate, rewards, shelf, win, map, shop (map also takes { toast: true } and { bare: true };
 * win and map take { run: n } to play their arrival again).
 */
import { memo, useCallback, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import Badge from './Badge';
import Card from './Card';
import CurrencyChip from './CurrencyChip';
import { DialogCustomBody, DialogModelBody } from './Dialog';
import Footer from './Footer';
import GhostButton from './GhostButton';
import { MapGround as MapPlace, World as WorldPlace } from './Ground';
import Header from './Header';
import Lift from './Lift';
import ListRow from './ListRow';
import Page from './Page';
import ProgressBar from './ProgressBar';
import RoundButton from './RoundButton';
import { SheetBody } from './Sheet';
import Spot, { type SpotState } from './Spot';
import Stage from './Stage';
import StatePanel from './StatePanel';
import StickerButton, { PressedSample } from './StickerButton';
import { FrameProvider } from './StickerContext';
import StickerText, { type OutlineTechnique } from './StickerText';
import Switch from './Switch';
import Tabs, { FilterChips } from './Tabs';
import Tag from './Tag';
import { Body, Caps, Count, Heading, Name, Title } from './Text';
import TitleLabel from './TitleLabel';
import { ToastPill } from './Toast';
import WaveFoot from './WaveFoot';
import { ART, ART_RATIO } from './art';
import { layerWidth } from './layout';
import SvgTitle from './spike/SvgTitle';
import ProofGate from './proof/ProofGate';
import ProofMap, { ParkMap } from './proof/ProofMap';
import ProofRewards from './proof/ProofRewards';
import ProofShelf from './proof/ProofShelf';
import ProofShop from './proof/ProofShop';
import ProofWin from './proof/ProofWin';
import { FONT, GALLERY, INK, SHADE, SPACE, STROKE } from './tokens';

/** Full-screen compositions with sample data. */
export type ProofSection = 'gate' | 'rewards' | 'shelf' | 'win' | 'map' | 'shop';
export type GallerySection = ProofSection | 'level' | 'type' | 'text' | 'textcand' | 'titles30' | 'page' | 'card' | 'button' | 'spot' | 'chips' | 'round' | 'wave'
  | 'progress' | 'header' | 'footer' | 'stage' | 'sheet' | 'dialog' | 'tabs' | 'listrow' | 'switch' | 'toast' | 'state';
export type TitleVariant = 'shadow16' | 'shadow12' | 'shadow8' | 'copies16' | 'copies12' | 'svg' | 'plain';

const SECTIONS: readonly GallerySection[] = ['level', 'type', 'page', 'card', 'button', 'spot', 'chips', 'round', 'wave', 'progress', 'header', 'footer', 'stage', 'sheet', 'dialog', 'tabs', 'listrow', 'switch', 'toast', 'state', 'text', 'textcand', 'titles30'];
const noop = () => undefined;
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/** Knockout caps section label (the gallery's own notes, not kit copy). */
function Note({ children, paper = false }: { children: string; paper?: boolean }) {
  return <Text style={{ fontFamily: FONT.knockout, fontSize: 12, lineHeight: 14, color: paper ? INK.navySoft : SHADE.onBlueSoft, marginTop: 4 }}>{children}</Text>;
}
function GroundLabel({ children, navy = false }: { children: string; navy?: boolean }) {
  return <Text style={{ fontFamily: FONT.knockout, fontSize: 12, lineHeight: 14, letterSpacing: 1.3, color: navy ? INK.navy : INK.white, marginBottom: 8 }}>{children.toUpperCase()}</Text>;
}

/** The blue world: the gallery's own ground. */
function World({ children, label = 'on the world', pad = true }: { children: ReactNode; label?: string; pad?: boolean }) {
  return (
    <View style={[styles.ground, pad ? null : { padding: 0, paddingTop: 12 }]}>
      <LinearGradient colors={[INK.blueBright, INK.blue]} style={StyleSheet.absoluteFill} />
      <View style={pad ? null : { paddingHorizontal: 16 }}><GroundLabel>{label}</GroundLabel></View>
      <WorldPlace>{children}</WorldPlace>
    </View>
  );
}

/** A tan map-like ground (dev colours, GALLERY). */
function MapGround({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  return (
    <View style={[styles.ground, { backgroundColor: GALLERY.mapGround }, pad ? null : { padding: 0, paddingTop: 12 }]}>
      <View style={{ position: 'absolute', left: -20, right: -20, top: 54, height: 18, backgroundColor: GALLERY.mapStreet, transform: [{ rotate: '-8deg' }] }} />
      <View style={{ position: 'absolute', right: -30, top: -10, width: 120, height: 90, borderRadius: 45, backgroundColor: GALLERY.mapGrass }} />
      <View style={pad ? null : { paddingHorizontal: 16 }}><GroundLabel navy>on the map</GroundLabel></View>
      <MapPlace>{children}</MapPlace>
    </View>
  );
}

/** Inside a page: level 2. */
function InPage({ children, label = 'Inside a page' }: { children: ReactNode; label?: string }) {
  return (
    <View style={styles.ground}>
      <LinearGradient colors={[INK.blueBright, INK.blue]} style={StyleSheet.absoluteFill} />
      <WorldPlace><Page label={{ text: label }}>{children}</Page></WorldPlace>
    </View>
  );
}

/** A scrim over the map, for floating pages drawn still. */
function Scrim({ children }: { children: ReactNode }) {
  return (
    <View style={[styles.ground, { backgroundColor: GALLERY.mapGround, alignItems: 'center' }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: INK.scrim }]} />
      <WorldPlace><FrameWidth>{children}</FrameWidth></WorldPlace>
    </View>
  );
}
function FrameWidth({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const w = Math.min(layerWidth(width), width - 68);
  return <FrameProvider width={w}><View style={{ width: w }}>{children}</View></FrameProvider>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }} testID={`gallery-${id}`}>
      <WorldPlace><Heading size="sub" align="left" style={{ marginBottom: 8 }}>{title}</Heading></WorldPlace>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

const Row = ({ children, gap = 12 }: { children: ReactNode; gap?: number }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap }}>{children}</View>
);

const CHEST = { source: ART.chestClosed, width: 58, height: 58 };

// ---------- sections ----------

function LevelSection() {
  return (
    <Section id="level" title="The level rule">
      <World>
        <ListRow art={CHEST} title="Card on the world" line="Level 1: white cut edge, 4 pt drop." state="ready" actionLabel='OPEN' />
      </World>
      <InPage>
        <ListRow art={CHEST} title="Card on a page" line="Level 2: navy line and a lip only." state="second" actionLabel='OPEN' />
        <View style={{ height: 12 }} />
        <WorldPlace>
          <Card style={{ minHeight: 46 }}>
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 14 }}>
              <Body size="small" soft align="left">A world ground asked for inside a page: refused, no white edge.</Body>
            </View>
          </Card>
        </WorldPlace>
        <View style={{ height: 12 }} />
        <Row><Tag>Tag</Tag><CurrencyChip kind="coins" value={350} /></Row>
      </InPage>
    </Section>
  );
}

function TypeSection() {
  return (
    <Section id="type" title="Text roles">
      <World>
        <Row gap={20}><Title size="large">COIN CAUGHT!</Title><Count size="hero" gold>15 of 35</Count></Row>
        <Note>Title, Count: Shark, white, navy stroke (3 pt max), hard drop.</Note>
        <Heading align="left">Heading 24</Heading>
        <Name>Name 18: Start a flame with Daily 3</Name>
        <Caps>Next coin</Caps>
        <Body align="left">Body 16: Hand the phone to a grown-up.</Body>
        <Body size="small" soft align="left">Body 14 soft: the second line on blue.</Body>
      </World>
      <InPage>
        <Card padding="snug">
          <Title align="left">Title on paper</Title>
          <Name>Name on paper: plain navy</Name>
          <Caps>Caps on paper: gold ink</Caps>
          <Body size="small" soft align="left">Body soft on paper: navy soft, never stroked.</Body>
        </Card>
      </InPage>
    </Section>
  );
}

const SIZES = [17, 22, 30, 35] as const;
const strokeAt = (size: number) => (size >= 24 ? STROKE.title : STROKE.button);

function TextSection() {
  return (
    <Section id="text" title="Outlined titles">
      <World label="12 copies under 24 pt, 16 from 24 pt">
        {SIZES.map(size => (
          <View key={size} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={styles.sizeTag}>{size}</Text>
            <StickerText size={size} spacing={size >= 30 ? 0.09 : 0.05} align="left" style={{ alignSelf: 'flex-start' }}>{size >= 30 ? 'Jumpy Ça!' : 'Jumpy Élan Ñu gq'}</StickerText>
          </View>
        ))}
        <GroundLabel>one line, shrinks to fit (160 pt box)</GroundLabel>
        <View style={{ width: 160, borderWidth: 1, borderColor: SHADE.spotBlueLine, borderStyle: 'dashed' }}>
          <Title fit>Universal Studios</Title>
        </View>
        <GroundLabel>wraps to two lines (220 pt box)</GroundLabel>
        <View style={{ width: 220, borderWidth: 1, borderColor: SHADE.spotBlueLine, borderStyle: 'dashed' }}>
          <Title lines={2}>Welcome to Disneyland Park</Title>
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
            <GroundLabel>{row.name}</GroundLabel>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
              {[17, 22, 35].map(size => <Candidate key={size} technique={row.technique} copies={row.copies} size={size} />)}
            </View>
          </View>
        ))}
      </World>
    </Section>
  );
}

const WORDS = ['Coin caught!', 'Daily Chest', 'Rewards', 'Walt Statue', 'Shark Shop', 'Level 7', 'Disneyland', 'Play!', 'Starter pack', 'Coin shelf'];

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
  return <View>{Array.from({ length: 30 }, (_, i) => <BenchTitle key={i} text={WORDS[i % WORDS.length]} size={SIZES[i % SIZES.length]} variant={variant} onLaid={onLaid} />)}</View>;
});

function Titles30Section({ variant, t0 }: { variant: TitleVariant; t0: number }) {
  return (
    <Section id="titles30" title={`30 titles: ${variant}`}>
      <World label="mount cost and one VoiceOver element each"><BenchList variant={variant} t0={t0} /></World>
    </Section>
  );
}

function PageSection() {
  return (
    <Section id="page" title="Page">
      <World>
        <Page label={{ text: 'Title label', tone: 'gold' }}>
          <ListRow art={CHEST} title="Card on a page" line="Navy line and a lip only." state="third" actionLabel='SEE' />
        </Page>
        <Note>The label rises above the page; the page reserves it as its top margin.</Note>
      </World>
      <MapGround>
        <Page small padding="snug" width={250}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Spot state="next" art={ART.coin} size={44} />
            <View><Caps>Next coin</Caps><Name>Tap PLAY!</Name></View>
          </View>
        </Page>
        <Note paper>On the map: white edge 3, drop 5 at 50 percent navy.</Note>
      </MapGround>
      <Scrim>
        <Page floating label={{ text: 'Use 1 Ticket?', large: true }} foot={{ children: <GhostButton label="Not now" /> }}>
          <Body>Play for the Walt Statue coin.</Body>
          <StickerButton label="PLAY!" variant="primary" size="medium" width={160} style={{ alignSelf: 'center', marginTop: 12 }} />
        </Page>
      </Scrim>
    </Section>
  );
}

function CardSection() {
  return (
    <Section id="card" title="Card">
      <World>
        <Card style={{ minHeight: 62 }} art={{ ...CHEST, along: 2 }}>
          <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 58 }}><Name>Cream on the world</Name><Body size="small" soft align="left">Level 1, white edge.</Body></View>
        </Card>
        <View style={{ height: 10 }} />
        <Card paper="white" style={{ minHeight: 52 }}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 14 }}><Name>White on the world</Name></View>
        </Card>
      </World>
      <MapGround>
        <Card style={{ minHeight: 62 }} art={{ ...CHEST, along: 2 }}>
          <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 58 }}><Name>Cream on the map</Name><Body size="small" soft align="left">3 pt line, 50 percent drop.</Body></View>
        </Card>
      </MapGround>
      <InPage>
        <Card paper="white" art={{ source: ART.coin, width: 54, height: 54 / ART_RATIO.coin, side: 'top', over: 26, along: 128 }} style={{ minHeight: 70, marginTop: 20 }}>
          <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 10 }}><Name align="center">Art off the top edge</Name></View>
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
          <StickerButton variant="primary" label="PLAY!" size="large" width={170} />
          <PressedSample variant="primary" label="PLAY!" size="large" width={170} />
          <StickerButton variant="primary" label="PLAY!" size="large" width={170} disabled reason="Come back tomorrow" />
          <StickerButton variant="primary" label="PLAY!" accessibilityLabel="Play, loading" size="large" width={170} busy />
        </Row>
        <Note>Primary: rest with the glint and the white edge, pressed by its lip, off, busy.</Note>
        <Row><StickerButton label="OPEN" variant="second" width={96} /><StickerButton label="SEE" variant="third" width={80} /></Row>
        <Note>Second and third on the world: no white edge (only the one primary wears it).</Note>
      </World>
      <MapGround><Row><StickerButton variant="primary" label="PLAY!" size="large" width={170} /><Tag>Shelf</Tag></Row></MapGround>
      <InPage>
        <Row gap={10}>
          <StickerButton variant="primary" label="OPEN" width={96} />
          <StickerButton label="OPEN" variant="second" width={96} />
          <StickerButton label="SEE" variant="third" width={80} />
          <StickerButton label="DELETE" variant="danger" width={110} />
          <StickerButton label="OK" variant="second" size="small" width={62} />
          <StickerButton label="7" variant="key" size="key" width={70} />
          <StickerButton label="OPEN" variant="second" size="row" width={86} />
          <PressedSample label="OPEN" variant="second" width={96} />
          <StickerButton label="OPEN" variant="second" width={96} disabled />
          <StickerButton label="OPEN" accessibilityLabel="Open, loading" variant="second" width={96} busy />
          <GhostButton label="See my shelf" />
        </Row>
        <Note>Inside a page: line and lip, no white edge. Sizes 58, 44, 36 (small, row), key 42.</Note>
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
      <MapGround><Row gap={18}>{SPOT_STATES.map(s => <Spot key={s} state={s} art={ART.coin} />)}</Row></MapGround>
      <InPage>
        <Card padding="snug">
          <Row gap={18}>{SPOT_STATES.map(s => <Spot key={s} state={s} art={ART.coin} label={`coin, ${s}`} />)}</Row>
          <View style={{ height: 12 }} />
          <Row gap={4}>
            {(['yours', 'yours', 'next', 'empty', 'empty', 'empty', 'empty'] as const).map((s, i) => <Spot key={i} state={s} art={s === 'yours' ? ART.coin : undefined} size={24} />)}
            <Body size="small" soft align="left" lines={1} style={{ marginLeft: 4 }}>Day 3 of 7</Body>
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
          <CurrencyChip kind="coins" value={4075} />
          <CurrencyChip kind="energy" value={3} />
          <CurrencyChip kind="tickets" value={12} />
        </Row>
        <View style={{ height: 12 }} />
        <Row gap={9}>
          <Tag>Walt Statue</Tag>
          <Tag plain>Disneyland Park</Tag>
          <Tag paper="cream" large icon={ART.ticket} iconRatio={ART_RATIO.ticket} label="15 tickets">15</Tag>
          <Badge count={20} label="20 new" />
          <Badge count={120} label="120 new" />
          <Tag tilt>NEW ROW</Tag>
        </Row>
        <View style={{ height: 14 }} />
        <Row gap={14}>
          <TitleLabel>Ask a grown-up</TitleLabel>
          <TitleLabel tone="gold">STARTER PACK</TitleLabel>
          <TitleLabel tone="blue">FREE TICKETS</TitleLabel>
          <Lift source={ART.newSticker} width={70} height={70 / ART_RATIO.newSticker} />
        </Row>
      </World>
      <MapGround><Row><Tag>Shelf</Tag><Tag plain>Navy line and a 50 percent navy drop</Tag></Row></MapGround>
      <InPage><Row gap={9}><Tag>Tag in a page</Tag><Tag paper="gold">Gold tag</Tag><Badge count={3} label="3 new" /><TitleLabel tone="gold">LABEL IN A PAGE</TitleLabel></Row></InPage>
    </Section>
  );
}

function RoundSection() {
  return (
    <Section id="round" title="Round buttons">
      <World>
        <Row gap={14}>
          <RoundButton kind="back" accessibilityLabel="Back" />
          <RoundButton kind="help" accessibilityLabel="Help, 3 new" size={52} badge={3} />
          <RoundButton kind="close" accessibilityLabel="Close" size={48} />
          <RoundButton kind="base" accessibilityLabel="Shark" size={58} art={ART.shark} artMirror />
          <RoundButton kind="base" accessibilityLabel="Daily chest, off" size={56} art={ART.chestClosed} disabled />
          <RoundButton kind="base" accessibilityLabel="Daily chest, loading" size={56} art={ART.chestClosed} busy />
        </Row>
        <Note>Alex's discs: arrow (mirrored), faq, close, base. Badge said in the label. Off, busy. Hit 48.</Note>
      </World>
      <MapGround><Row gap={14}><RoundButton kind="base" accessibilityLabel="Daily chest, 2 ready" size={56} art={ART.chestClosed} badge={2} /><RoundButton kind="help" accessibilityLabel="Help" size={48} /></Row></MapGround>
      <InPage><Row gap={14}><RoundButton kind="close" accessibilityLabel="Close" size={44} /><RoundButton kind="back" accessibilityLabel="Back" size={44} /></Row></InPage>
    </Section>
  );
}

function WaveSection() {
  return (
    <Section id="wave" title="Wave foot">
      <Scrim>
        <Page floating label={{ text: 'Rewards', tone: 'gold', large: true }} foot={{ children: <GhostButton label="BACK TO MAP" size="large" art="back" /> }}>
          <ListRow art={CHEST} title="Daily Chest" line="Day 1 of 7 is ready" state="ready" actionLabel='OPEN' />
        </Page>
      </Scrim>
      <World label="a screen's foot band: the one primary wears its edge" pad={false}>
        <WaveFootSample />
      </World>
    </Section>
  );
}
function WaveFootSample() {
  const { width } = useWindowDimensions();
  return (
    <WaveFoot width={width - 32} height={130}>
      <View style={{ alignSelf: 'stretch', paddingHorizontal: 20, alignItems: 'center' }}>
        <StickerButton variant="primary" label="NEXT COIN" size="large" fullWidth />
        <GhostButton label="See my shelf" />
      </View>
    </WaveFoot>
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
      <MapGround><ProgressBar value={0.6} label="6 of 10" /></MapGround>
      <InPage><Card padding="snug"><ProgressBar value={0.6} label="6 of 10 sights" /></Card></InPage>
    </Section>
  );
}

function HeaderSection() {
  return (
    <Section id="header" title="Header">
      <SafeAreaInsetsContext.Provider value={NO_INSETS}>
        <World label="title: back, name, help" pad={false}><Header title="DISNEYLAND" onBack={noop} onHelp={noop} /></World>
        <World label="chips (the map)" pad={false}>
          <Header><CurrencyChip kind="coins" value={4075} /><CurrencyChip kind="energy" value={3} /><CurrencyChip kind="tickets" value={12} /></Header>
        </World>
        <World label="night (Secret Shop) and purple" pad={false}>
          <Header title="SECRET SHOP" variant="night" onBack={noop} />
          <View style={{ height: 8 }} />
          <Header title="SHARK SHOP" variant="purple" onBack={noop} onHelp={noop} />
        </World>
        <MapGround pad={false}><Header title="ON THE MAP" onBack={noop} /></MapGround>
        <InPage label="Inside a page: refused"><Header title="NOT DRAWN" /><Body size="small">The Header refuses to mount in a page (dev warning).</Body></InPage>
      </SafeAreaInsetsContext.Provider>
    </Section>
  );
}

const FOOTER_ITEMS = [
  { key: 'news', label: 'News' }, { key: 'standings', label: 'Standings' }, { key: 'map', label: 'Map' },
  { key: 'social', label: 'Social' }, { key: 'profile', label: 'Profile', badge: 2, badgeNoun: 'new' },
] as const;

function FooterSection() {
  const [picked, setPicked] = useState('map');
  return (
    <Section id="footer" title="Footer">
      <World label="Map picked, on the world" pad={false}><Footer items={FOOTER_ITEMS} picked={picked} onPick={setPicked} /></World>
      <MapGround pad={false}><Footer items={FOOTER_ITEMS} picked="news" onPick={noop} /></MapGround>
      <View style={[styles.ground, { padding: 0, height: 150 }]}>
        <ParkMap attribution={0} />
        <View style={{ flex: 1 }} />
        <WorldPlace><Footer items={FOOTER_ITEMS} picked="profile" onPick={noop} /></WorldPlace>
      </View>
      <InPage label="Inside a page: refused"><Footer items={FOOTER_ITEMS} /><Body size="small">The Footer refuses to mount in a page.</Body></InPage>
    </Section>
  );
}

function StageSection() {
  return (
    <Section id="stage" title="Stage">
      <InPage label="The one hero thing">
        <Stage width={250} height={150} label="Walt Statue coin" style={{ alignSelf: 'center' }}>
          <Lift source={ART.coin} width={Math.round(128 * ART_RATIO.coin)} height={128} />
        </Stage>
        <View style={{ height: 14 }} />
        <Stage width={250} height={120} label="Offer chest" style={{ alignSelf: 'center' }}>
          <Lift source={ART.levelChest} width={110} height={110} />
        </Stage>
      </InPage>
      <World><Stage width={200} height={110}><Lift source={ART.chestClosed} width={92} height={92} /></Stage></World>
    </Section>
  );
}

function SheetSection() {
  return (
    <Section id="sheet" title="Sheet">
      <Scrim>
        <SheetBody title="REWARDS" wayOut={{ label: 'BACK TO MAP', art: 'back', onPress: noop }}>
          <ListRow art={CHEST} title="Daily Chest" line="Day 1 of 7 is ready" state="ready" actionLabel='OPEN' />
        </SheetBody>
      </Scrim>
      <Scrim>
        <SheetBody title="SHARK PASS" wayOut={{ label: 'Not now', onPress: noop }} foot={<StickerButton label="$4.99" variant="primary" size="medium" width={160} />}>
          <Body>The wave foot can hold the price instead; the way out still answers the scrim, escape and back.</Body>
        </SheetBody>
      </Scrim>
    </Section>
  );
}

function DialogSection() {
  return (
    <Section id="dialog" title="Dialog">
      <Scrim>
        <DialogModelBody request={{ title: 'Use 1 Ticket?', message: 'Play for the Walt Statue coin.', buttons: [{ text: 'Not now', style: 'cancel' }, { text: 'PLAY!' }] }} onAnswer={noop} />
      </Scrim>
      <Scrim>
        <DialogModelBody request={{ title: 'Leave the line?', message: 'Your progress is saved.', buttons: [{ text: 'Stay', style: 'cancel' }, { text: 'Leave', style: 'destructive' }] }} onAnswer={noop} />
      </Scrim>
      <Scrim>
        <DialogModelBody request={{ title: 'Saved!', message: 'Your shark is ready.' }} onAnswer={noop} />
      </Scrim>
      <Scrim>
        <DialogCustomBody label={{ text: 'Ask a grown-up', large: true, art: 'lock' }} wayOut={{ label: 'Not now', onPress: noop }}>
          <Body>A custom body: the grown-up gate.</Body>
        </DialogCustomBody>
      </Scrim>
    </Section>
  );
}

function TabsSection() {
  const [tab, setTab] = useState('supplies');
  const [chip, setChip] = useState('rides');
  const tabs = [{ key: 'gear', label: 'GEAR' }, { key: 'supplies', label: 'SUPPLIES' }];
  const chips = [
    { key: 'rides', label: 'RIDES 9/25', icon: ART.ride, iconRatio: ART_RATIO.ride },
    { key: 'sights', label: 'SIGHTS 6/10', icon: ART.star, iconRatio: ART_RATIO.star },
    { key: 'limited', label: 'LIMITED', icon: ART.sparkle, iconRatio: ART_RATIO.sparkle },
  ];
  return (
    <Section id="tabs" title="Tabs and filter chips">
      <World>
        <Tabs items={tabs} picked={tab} onPick={setTab} />
        <View style={{ height: 12 }} />
        <FilterChips items={chips} picked={chip} onPick={setChip} />
        <Note>The pick is a white lifted sticker. Never gold.</Note>
      </World>
      <MapGround><FilterChips items={chips} picked="sights" /></MapGround>
      <InPage><Tabs items={tabs} picked="gear" /><View style={{ height: 10 }} /><FilterChips items={chips} picked="limited" /></InPage>
    </Section>
  );
}

function ListRowSection() {
  return (
    <Section id="listrow" title="List row">
      <InPage label="Four states">
        <View style={{ gap: SPACE.cardGap }}>
          <ListRow art={CHEST} title="Daily Chest" line="Day 1 of 7 is ready" state="ready" actionLabel='OPEN' />
          <ListRow art={{ source: ART.levelChest, width: 60, height: 60 }} title="Level 7 Chest" line="New gear inside" state="second" actionLabel='OPEN' />
          <ListRow art={{ source: ART.chestOpen, width: 60, height: 60 }} title="Daily Chest" line="Back tomorrow" state="done" doneLabel="Opened" />
          <ListRow art={{ source: ART.brownChest, width: 50, height: Math.round(50 / ART_RATIO.brownChest) }} title="Daily 3" state="notyet" actionLabel='SEE'
            strip={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{[0, 1, 2].map(i => <Spot key={i} state="empty" size={20} />)}<Body size="small" soft align="left" lines={1} style={{ marginLeft: 4 }}>0 of 3 done</Body></View>} />
        </View>
      </InPage>
      <World><ListRow art={CHEST} title="Row on the world" line="Level 1: the card wears the edge." state="third" actionLabel='SEE' /></World>
      <MapGround><ListRow art={CHEST} title="Row on the map" line="3 pt line, 50 percent drop." state="third" actionLabel='SEE' /></MapGround>
    </Section>
  );
}

function SwitchSection() {
  const [on, setOn] = useState(true);
  return (
    <Section id="switch" title="Switch">
      <World><Row gap={16}><Switch value={on} onChange={setOn} accessibilityLabel="Music" /><Switch value={false} accessibilityLabel="Sound effects" /><Switch value accessibilityLabel="Off" disabled /></Row><Note>On (gold), off (blue), off and disabled.</Note></World>
      <MapGround><Row gap={16}><Switch value accessibilityLabel="On" /><Switch value={false} accessibilityLabel="Off" /></Row></MapGround>
      <InPage><Card padding="snug"><Row gap={16}><Name>Music</Name><Switch value accessibilityLabel="Music" /></Row></Card></InPage>
    </Section>
  );
}

function ToastSection() {
  return (
    <Section id="toast" title="Toast">
      <MapGround><ToastPill title="+1 Ticket" line="Treats found" art={ART.ticket} artRatio={ART_RATIO.ticket} /><Tag plain style={{ marginTop: 10 }}>Slaps on under the header, peels off</Tag></MapGround>
      <World><ToastPill title="Saved" art={ART.coin} artRatio={ART_RATIO.coin} /></World>
      <InPage><ToastPill title="In a page" line="Level 2: no edge" /></InPage>
    </Section>
  );
}

function StateSection() {
  return (
    <Section id="state" title="Empty, error, loading">
      <World>
        <View style={{ gap: 14 }}>
          <StatePanel kind="empty" line="No coins here yet" action={{ label: 'GO PLAY', onPress: noop }} />
          <StatePanel kind="error" line="That did not work" action={{ label: 'TRY AGAIN', onPress: noop }} />
          <StatePanel kind="loading" />
        </View>
      </World>
    </Section>
  );
}

type Params = { section?: GallerySection; variant?: TitleVariant; t0?: number; toast?: boolean; bare?: boolean; run?: number };

export default function StickerGallery({ route }: { route?: { params?: Params } }) {
  const insets = useSafeAreaInsets();
  const params = route?.params ?? {};
  const mountAt = useRef(performance.now()).current;
  const only = params.section;
  const variant = params.variant ?? 'shadow16';
  const t0 = params.t0 ?? mountAt;
  const shown = only ? [only] : SECTIONS;
  if (only === 'gate') return <ProofGate />;
  if (only === 'rewards') return <ProofRewards />;
  if (only === 'shelf') return <ProofShelf />;
  // `run` remounts a proof so its arrival plays again (clips).
  if (only === 'win') return <ProofWin key={params.run ?? 0} />;
  if (only === 'map') return <ProofMap key={params.run ?? 0} toastOnOpen={!!params.toast} bare={!!params.bare} />;
  if (only === 'shop') return <ProofShop />;
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
            case 'header': return <HeaderSection key={section} />;
            case 'footer': return <FooterSection key={section} />;
            case 'stage': return <StageSection key={section} />;
            case 'sheet': return <SheetSection key={section} />;
            case 'dialog': return <DialogSection key={section} />;
            case 'tabs': return <TabsSection key={section} />;
            case 'listrow': return <ListRowSection key={section} />;
            case 'switch': return <SwitchSection key={section} />;
            case 'toast': return <ToastSection key={section} />;
            case 'state': return <StateSection key={section} />;
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
