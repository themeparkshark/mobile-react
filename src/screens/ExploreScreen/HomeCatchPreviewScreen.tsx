import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, LogBox, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, Group, PaintStyle, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import Animated, { runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import Map, { type MapProjector } from '../../components/Map';
import { LocationContext } from '../../context/LocationProvider';
import type { PrepItemType } from '../../models/prep-item-type';
import type redeemPrepItem from '../../api/endpoints/me/prep-items/redeem';
import Topbar from '../../components/Topbar';
import Wrapper from '../../components/Wrapper';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import QuickAccessMenu from '../../components/QuickAccessMenu';
import RadialStatsMenu from '../../components/RadialStatsMenu';
import HomeFindMarker from './HomeFindMarker';
import type { FingerSide } from './PrepItem';
import HomeCatchMoment, { resetRideHintForPreview, type BookItem, type CatchRequest, type HomeCatchHandle } from './HomeCatchMoment';
import { resetRevealSeenForPreview } from './ridePhoto/CatchReveal';
import HomeHuntChip, { chipWidthFor, type HuntChipMessage } from './HomeHuntChip';
import FindEdgeArrows, { type EdgeFind } from './FindEdgeArrows';
import { bannerCovers, edgeArrowPlacement, findFootprint, hudRowTop, peekBottom, sharkFootprint, type Rect } from './findEdges';
import { peekLine, walkCloserLine } from './findPresentation';
import HomeHudChips from './HomeHudChips';
import { rideSpec, GRADE_BONUS_XP, type PhotoGrade } from './ridePhoto';
import { preloadRidePhoto, useRideArt } from './ridePhoto/rideAssets';
import { RIDES, buildStage, sceneVariant } from './ridePhoto/rides';
import { catchShown, useCatchOpen } from './catchPresence';
import type { RideKind, Sky } from './ridePhoto/rides';
import { resetRideMemoryForPreview } from './ridePhoto/rides/rideMemory';
import { catchTraceBuffer } from './ridePhoto/catchAudio';
import * as FileSystem from 'expo-file-system';

/**
 * Development-only (EXPO_PUBLIC_HOME_CATCH_PREVIEW=1): the v3 home map with
 * fixture finds around the simulator's location and a fake catch endpoint, so
 * the catch can be recorded without a server. EXPO_PUBLIC_HOME_CATCH_AUTOPLAY=1
 * taps the Rare find and shoots on a script. Never shipped in release.
 */
const ART_DIR = 'file:///Users/dustinsparage/apps/tps-prime-time-audit/next-wave/home-hunt-v3/art/items/';
const BOTTOM_SLOT = 100 + 76 + 14;

type Fixture = { slug: string; name: string; rarity: number; set: string; color: string; north: number; east: number; inRange: boolean };
const FIXTURES: Fixture[] = [
  { slug: 'mac-cheese-cone', name: 'Mac and Cheese Cone', rarity: 3, set: 'Snack Stand', color: '#FF8A3D', north: 26, east: 12, inRange: true },
  { slug: 'salted-pretzel', name: 'Giant Salted Pretzel', rarity: 1, set: 'Snack Stand', color: '#FF8A3D', north: -24, east: -20, inRange: true },
  { slug: 'nacho-tray', name: 'Loaded Nacho Tray', rarity: 2, set: 'Snack Stand', color: '#FF8A3D', north: 95, east: -55, inRange: false },
  { slug: 'turkey-leg', name: 'Smoky Turkey Leg', rarity: 4, set: 'Snack Stand', color: '#FF8A3D', north: -30, east: 34, inRange: true },
  { slug: 'golden-feast-platter', name: 'Golden Feast Platter', rarity: 5, set: 'Snack Stand', color: '#FF8A3D', north: 260, east: 90, inRange: false },
  { slug: 'popcorn-bucket', name: 'Striped Popcorn Bucket', rarity: 1, set: 'Snack Stand', color: '#FF8A3D', north: -70, east: -95, inRange: false },
];

/**
 * The recording script (EXPO_PUBLIC_HOME_CATCH_AUTOPLAY=1): one catch per ride and look the graders
 * asked for. Each step pins the ride and sky, can re-rarity or mark the find as owned, and shoots at
 * scripted latency-compensated offsets (ms; negative is early).
 */
// Recordings show the app, not the dev warning toast.
if (__DEV__ && process.env.EXPO_PUBLIC_HOME_CATCH_AUTOPLAY === '1') LogBox.ignoreAllLogs(true);

type ScriptStep = { index: number; kind: RideKind; sky: Sky; shots: number[]; rarity?: number; owned?: boolean; reduced?: boolean; skip?: boolean;
  /** The server's Legendary roll says no: the find rides by (409). */ escape?: boolean;
  /** The escape picks RIDE AGAIN (the next ride then catches). */ again?: boolean;
  /** R6: a gull crosses at arrival on this pass (the shot is photobombed). */ gullPass?: number;
  /** R6: a repeat whose photo beats its stored best (the server says new_best). */ newBest?: boolean };
/**
 * Performance experiments (EXPO_PUBLIC_HH3_EXP): 'nowarm' disables the next-step stage warm; 'order'
 * rides teacups, coaster, flume first, to see whether slow hand-backs follow new ride kinds; 'noforce' lets
 * the picker choose every ride and sky (the production pick-and-warm path).
 */
const EXP = __DEV__ ? process.env.EXPO_PUBLIC_HH3_EXP ?? '' : '';
/** Map-chrome budget captures: 'still' (frozen map, resting chrome), 'still-bare' (same, chrome invisible), 'still-peek' (a find tapped). */
const STILL = EXP.startsWith('still');
const BARE = EXP === 'still-bare';
/**
 * Ride Photo v2 captures (EXPO_PUBLIC_HH3_EXP=v2): every rarity's first full reveal, every grade, a Blurry,
 * a repeat tier skipped with a tap, an owned find, and Reduce Motion. Offsets are latency compensated.
 */
const V2_SCRIPT: ScriptStep[] = [
  // Uncommon, first ride: the one-time freeze gives a Frame It!.
  { index: 2, kind: 'coaster', sky: 'day', shots: [0], rarity: 2 },
  // Rare: a Blurry, then a dead-on shot as a gull crosses the frame: Photobombed! (capped at Good).
  { index: 0, kind: 'flume', sky: 'sunset', shots: [-420, 10], rarity: 3, gullPass: 1 },
  // Epic: two photos, Great then Frame It! (the dark ride).
  { index: 3, kind: 'teacups', sky: 'night', shots: [50, 4], rarity: 4 },
  // Legendary: a Frame It! and the charge; the server's roll takes 1.6 s, so the print keeps shivering.
  { index: 4, kind: 'coaster', sky: 'night', shots: [4], rarity: 5 },
  // Legendary again: a Great, and the roll says no. The print shakes free: SO CLOSE! Then RIDE AGAIN, and it's caught.
  { index: 4, kind: 'flume', sky: 'sunset', shots: [45], rarity: 5, escape: true, again: true },
  // Uncommon again, owned, a Great that beats its stored Good: skipped with a tap, which lands on NEW BEST!.
  { index: 5, kind: 'teacups', sky: 'day', shots: [70], rarity: 2, owned: true, skip: true, newBest: true },
  // Reduce Motion: the car waits in the frame, one tap is a Great, the reveal fades.
  { index: 2, kind: 'flume', sky: 'day', shots: [-400], rarity: 3, reduced: true },
];
const BASE_SCRIPT: ScriptStep[] = [
  // Five different finds (tall, wide and round art), every ride, three skies, an owned find and the Epic.
  { index: 0, kind: 'coaster', sky: 'day', shots: [-650] },
  { index: 2, kind: 'flume', sky: 'sunset', shots: [12], rarity: 2 },
  { index: 5, kind: 'teacups', sky: 'day', shots: [-300, 20], rarity: 3 },
  { index: 1, kind: 'coaster', sky: 'night', shots: [55], rarity: 3, owned: true },
  { index: 3, kind: 'flume', sky: 'night', shots: [-420, 6, 45] },
  // Reduce Motion: the car waits in the frame, one tap is a Great, no shake, hop or sunburst.
  { index: 4, kind: 'teacups', sky: 'sunset', shots: [-400], rarity: 2, reduced: true },
];
const SCRIPT: ScriptStep[] = EXP === 'v2' ? V2_SCRIPT : EXP === 'order'
  ? [{ ...BASE_SCRIPT[2], shots: [-650] }, { ...BASE_SCRIPT[0], shots: [12] }, { ...BASE_SCRIPT[1], shots: [-300, 20] },
    BASE_SCRIPT[3], BASE_SCRIPT[4]]
  : BASE_SCRIPT;

/**
 * EXPO_PUBLIC_HH3_EXP=seeds:<ride>: the 9-seed scenery sheet. Nine finds' stages for one ride, drawn still
 * (backdrop, ride, camera rig) in a 3 x 3 grid, so dressing, props, mounts and skies can be compared.
 */
function SeedSheet({ kind }: { kind: RideKind }) {
  const art = useRideArt();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const sceneH = Math.max(360, win.height - (insets.bottom + 128));
  const tiles = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const seed = 101 + i * 37;
    const variant = sceneVariant({ seed, kind });
    const stage = buildStage(kind, { width: win.width, height: sceneH, top: insets.top, spec: rideSpec(3), tier: 3, variant, art });
    const state = { t: stage.stationT + (stage.frameT - stage.stationT) * 0.85, clock: 0, rock: 0, riderIn: 1, alpha: 1, ghost: false, photo: false };
    const moving = createPicture(canvas => {
      stage.paint(canvas, state, stage.data, art);
      stage.front?.(canvas, state, stage.data, art);
      stage.emissive?.(canvas, state, stage.data, art);
      const cam = stage.cam;
      const paint = Skia.Paint();
      // The photo crop, outlined so the sheet shows what the print frames.
      const outline = Skia.Paint(); outline.setStyle(PaintStyle.Stroke); outline.setStrokeWidth(4); outline.setColor(Skia.Color('#ff3b6b'));
      canvas.drawRect(Skia.XYWHRect(stage.crop.x, stage.crop.y, stage.crop.w, stage.crop.h), outline);
      if (cam.beam) { paint.setColor(Skia.Color('#fff5e1')); canvas.drawRect(Skia.XYWHRect(cam.beam.x, cam.beam.y, cam.beam.w, cam.beam.h), paint); }
      if (art.cameraPole) canvas.drawImageRect(art.cameraPole, Skia.XYWHRect(0, 0, art.cameraPole.width(), art.cameraPole.height()), Skia.XYWHRect(cam.pole.x, cam.pole.y, cam.pole.w, cam.pole.h), paint);
      if (art.camera) {
        canvas.save();
        if (cam.facing === 'right') { canvas.translate(cam.x * 2 + cam.w, 0); canvas.scale(-1, 1); }
        canvas.drawImageRect(art.camera, Skia.XYWHRect(0, 0, art.camera.width(), art.camera.height()), Skia.XYWHRect(cam.x, cam.y, cam.w, cam.h), paint);
        canvas.restore();
      }
    }, { width: win.width, height: sceneH });
    return { seed, sky: variant.sky, backdrop: stage.backdrop, foreground: stage.foreground, moving };
  }), [kind, art, win.width, sceneH, insets.top]);
  const tileW = win.width / 3, scale = tileW / win.width, tileH = sceneH * scale;
  return (
    <View style={{ flex: 1, backgroundColor: '#0b2f5c', paddingTop: insets.top + 8 }}>
      <Text style={{ color: '#fff', fontFamily: 'Shark', fontSize: 16, textAlign: 'center', marginBottom: 6 }}>{RIDES[kind].name}: 9 seeds</Text>
      <Canvas style={{ width: win.width, height: tileH * 3 }}>
        {tiles.map((tile, i) => (
          <Group key={tile.seed} transform={[{ translateX: (i % 3) * tileW }, { translateY: Math.floor(i / 3) * tileH }, { scale }]}>
            <Picture picture={tile.backdrop} />
            {tile.foreground ? <Picture picture={tile.foreground} /> : null}
            <Picture picture={tile.moving} />
          </Group>
        ))}
      </Canvas>
    </View>
  );
}

export default function HomeCatchPreviewScreen() {
  if (EXP.startsWith('seeds:')) return <SeedSheet kind={EXP.slice(6) as RideKind} />;
  return <HomeCatchPreview />;
}

function HomeCatchPreview() {
  const { location } = useContext(LocationContext);
  const base = useRef<{ latitude: number; longitude: number } | null>(null);
  if (!base.current && location) base.current = { latitude: location.latitude, longitude: location.longitude };
  const origin = base.current ?? { latitude: 28.3772, longitude: -81.5707 };
  const [caught, setCaught] = useState<Set<number>>(() => new Set());
  const [request, setRequest] = useState<CatchRequest | null>(null);
  const [mapStill, setMapStill] = useState<string | null>(null);
  const catches = useRef(0);
  const [chip, setChip] = useState<HuntChipMessage | null>(null);
  const projector = useRef<MapProjector | null>(null);
  const snapshotter = useRef<(() => Promise<string | null>) | null>(null);
  const catchRef = useRef<HomeCatchHandle>(null);
  const container = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [edges, setEdges] = useState<EdgeFind[]>([]);
  const points = useRef(new globalThis.Map<number, { x: number; y: number }>());
  const found = useRef(0);
  const lastGrade = useRef<PhotoGrade>('good');
  const catchOpen = useCatchOpen();
  const chromeFade = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - catchShown.value * 1.6) }));

  const items: PrepItemType[] = useMemo(() => FIXTURES.map((fixture, index) => ({
    id: 900 + index, pivot_id: 9000 + index, name: fixture.name, variant_slug: null, description: null,
    icon_url: `${ART_DIR}${fixture.slug}.png`, rarity: fixture.rarity, energy_reward: 10, ticket_reward: 1,
    experience_reward: 25, is_new_variant: index !== 1, set_name: fixture.set, set_slug: 'snack_stand', set_color: fixture.color,
    latitude: origin.latitude + fixture.north / 111320,
    longitude: origin.longitude + fixture.east / (111320 * Math.cos(origin.latitude * Math.PI / 180)),
    active_to: new Date(Date.now() + (index === 3 ? 4 : 25) * 60_000).toISOString(),
  })), [origin.latitude, origin.longitude]);
  useEffect(() => { void preloadRidePhoto(items.map(item => item.icon_url)); }, [items]);

  const toLocal = useCallback(async (latitude: number, longitude: number) => {
    const point = await projector.current?.(latitude, longitude).catch(() => null);
    const at = await new Promise<{ x: number; y: number } | null>(resolve => container.current?.measureInWindow((x, y) => resolve({ x, y })) ?? resolve(null));
    return point && at ? { x: point.x - at.x, y: point.y - at.y } : null;
  }, []);
  const measure = useCallback(async () => {
    if (size.width === 0) return;
    const next: EdgeFind[] = [];
    for (const [index, item] of items.entries()) {
      const point = await toLocal(item.latitude!, item.longitude!);
      if (!point) continue;
      points.current.set(item.pivot_id!, point);
      if (point.x < 0 || point.y < 0 || point.x > size.width || point.y > size.height) {
        next.push({ item, point, distance: Math.hypot(FIXTURES[index].north, FIXTURES[index].east) });
      }
    }
    setEdges(next);
    const shark = await toLocal(origin.latitude, origin.longitude);
    // The shark is map content, and its idle pose drifts between captures: the budget tool skips its box.
    if (shark) { chromeRect.current = { ...chromeRect.current, shark: sharkFootprint(shark) }; writeChromeRect(); }
    setFootprints([...points.current.entries()].map(([pivot, p]) => findFootprint(p, pivot === items[nearestInRange]?.pivot_id))
      .concat(shark ? [sharkFootprint(shark)] : []));
    // Same finger rule as the app: away from the shark, under the find when it sits below the shark.
    const nextSides: Record<number, FingerSide> = {};
    points.current.forEach((point, pivot) => {
      const side = point.x < size.width / 2 ? 'left' : 'right';
      nextSides[pivot] = point.y > size.height / 2 ? (side === 'left' ? 'below-left' : 'below-right') : side;
    });
    setSides(nextSides);
  }, [items, toLocal, size.width, size.height]);

  const fakeRedeem: typeof redeemPrepItem = async (id, _pivot, _lat, _lng, details) => {
    const item = stepItem.current?.id === id ? stepItem.current : items.find(entry => entry.id === id)!;
    // A Legendary's server roll takes a moment (the reveal's shiver waits for it).
    await new Promise(resolve => setTimeout(resolve, item.rarity >= 5 ? 2600 : 450));
    if (SCRIPT[stepRef.current]?.escape && !rodeAgain.current) {
      throw Object.assign(new Error('rode_by'), { response: { status: 409, data: { error: 'It rode by! Get ready for the next ride.', photo: { rides_left: 2 } } } });
    }
    found.current += 1;
    const quality = details?.photo_quality ?? null;
    if (quality) lastGrade.current = quality;
    // Rarity-scaled like production home finds (ECONOMY_DECISIONS.md: uncommon 9 E / 23 XP ... legendary 50 E / 100 XP),
    // plus the server's photo bonus.
    const tier = Math.max(1, Math.min(5, item.rarity));
    const base = ([0, { e: 5, xp: 9 }, { e: 9, xp: 23 }, { e: 16, xp: 57 }, { e: 30, xp: 75 }, { e: 50, xp: 100 }] as const)[tier] as { e: number; xp: number };
    const bonus = quality ? GRADE_BONUS_XP[quality] : 0;
    return { success: true, data: {
      rewards: { energy: base.e, tickets: tier >= 4 ? 1 : 0, coins: tier >= 4 ? 0 : 10 * tier, experience: base.xp + bonus }, streak: { current: 3, multiplier: 1 },
      is_new_variant: item.is_new_variant, replayed: false,
      // Consistent with the preview book page: 4 owned there, plus this find when it is new.
      set_progress: { total: 12, collected: 4 + (item.is_new_variant ? 1 : 0), percentage: 40, is_complete: false, collected_ids: [] },
      dex: { set_slug: 'snack_stand', found: 4 + (item.is_new_variant ? 1 : 0), total: 12, reward_status: 'locked' },
      photo: quality ? { quality, golden_hour: false, bonus_xp: GRADE_BONUS_XP[quality],
        // As the server: the best before this catch, and whether this photo beat it (owned finds only).
        previous_best: item.is_new_variant ? null : 'good', new_best: !item.is_new_variant && !!SCRIPT[stepRef.current]?.newBest && quality !== 'good' } : null,
      item: { id, name: item.name, rarity: item.rarity, rarity_label: '', set_name: item.set_name, set_color: item.set_color, caught_count: item.is_new_variant ? 1 : 3 },
    } };
  };

  const startCatch = async (item: PrepItemType) => {
    setChip(null);
    const from = points.current.get(item.pivot_id!) ?? await toLocal(item.latitude!, item.longitude!);
    catchRef.current?.primeRide(item, from);
    setRequest({ item, pivotId: item.pivot_id!, from, attempt: Date.now() });
  };
  // Stable handlers (as in HomeExplore), so the recording measures the app, not the harness.
  const tapState = useRef({ request, startCatch, items });
  tapState.current = { request, startCatch, items };
  const tapFind = useCallback((item: PrepItemType) => {
    const state = tapState.current;
    if (state.request) return;
    const index = state.items.findIndex(entry => entry.pivot_id === item.pivot_id);
    const fixture = FIXTURES[index];
    if (!fixture) return;
    if (!fixture.inRange) {
      const distance = Math.hypot(fixture.north, fixture.east);
      setChip({ key: `far-${item.pivot_id}-${Date.now()}`, text: peekLine(item.name, distance), ttlMs: 5000 });
      return;
    }
    void state.startCatch(item);
  }, []);
  const onEdgePress = useCallback((entry: EdgeFind) => setChip({ key: `e-${Date.now()}`, text: walkCloserLine(entry.distance) }), []);
  const [step, setStep] = useState(0);
  const chromeRect = useRef<Record<string, unknown>>({});
  const writeChromeRect = () => {
    if (STILL) void FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}map-chrome.json`, JSON.stringify(chromeRect.current)).catch(() => undefined);
  };
  // As in the app: the chip row and the peek keep clear of finds; edge tokens centre below the row.
  const [footprints, setFootprints] = useState<readonly Rect[]>([]);
  const [hudWidth, setHudWidth] = useState(0);
  const obstacles = footprints.concat(edges.map(edge => {
    const at = edgeArrowPlacement(edge.point, size, { top: 12 + 30 + 8 + 24, bottom: 190, side: 30 });
    return { x: at.x - 28, y: at.y - 28, w: 56, h: 56 };
  }));
  const hudTop = hudWidth > 0 ? hudRowTop(obstacles, 12, hudWidth) : 12;
  const slotBottom = chip && size.width > 0 ? peekBottom(obstacles, size, BOTTOM_SLOT, hudTop + 30 + 8, chipWidthFor(chip)) : BOTTOM_SLOT;
  const stepRef = useRef(0);
  /** RIDE AGAIN in the script: the next ride of the same find (it catches), and the step only advances after it. */
  const rodeAgain = useRef(false);
  stepRef.current = step;
  // 'still-peek': a far find tapped, its one-line peek held for the capture.
  useEffect(() => {
    if (EXP !== 'still-peek') return;
    const timer = setTimeout(() => setChip({ key: 'peek', text: peekLine(items[1]?.name ?? 'Find', 70), ttlMs: 120_000 }), 2500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [sides, setSides] = useState<Record<number, FingerSide>>({});
  const [cascadeOn, setCascadeOn] = useState(false);
  const stepItem = useRef<PrepItemType | null>(null);
  const runStep = (index: number) => {
    const entry = SCRIPT[index];
    if (!entry) return;
    setStep(index);
    const next = scriptItem(index);
    stepItem.current = next;
    void startCatch(next);
  };
  const scriptItem = (index: number): PrepItemType => {
    const entry = SCRIPT[index];
    const base = items[entry.index];
    return { ...base, rarity: entry.rarity ?? base.rarity, is_new_variant: entry.owned ? false : base.is_new_variant,
      // A fresh id per step, so each step builds its own ride.
      id: base.id * 10 + index };
  };
  const autoplay = __DEV__ && process.env.EXPO_PUBLIC_HOME_CATCH_AUTOPLAY === '1';
  // UI-thread frame times while a catch plays, logged once a second (performance review).
  const frameCount = useSharedValue(0), frameSlow = useSharedValue(0), frameWorst = useSharedValue(0), frameSum = useSharedValue(0);
  const logFrames = (count: number, slow: number, worst: number, sum: number) => {
    const line = `[catch-perf] ${Date.now()} frames=${count} avg=${(sum / Math.max(1, count)).toFixed(1)}ms worst=${worst.toFixed(1)}ms over25ms=${slow}`;
    console.log(line);
    catchTraceBuffer.push(line);
  };
  useFrameCallback(info => {
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    frameCount.value += 1; frameSum.value += dt;
    if (dt > 25) frameSlow.value += 1;
    if (dt > frameWorst.value) frameWorst.value = dt;
    if (frameSum.value >= 1000) {
      runOnJS(logFrames)(frameCount.value, frameSlow.value, frameWorst.value, frameSum.value);
      frameCount.value = 0; frameSlow.value = 0; frameWorst.value = 0; frameSum.value = 0;
    }
  }, true);
  // A Release preview build has no console: the trace is flushed to Documents/catch-trace.log.
  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => {
      void FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}catch-trace.log`, catchTraceBuffer.join('\n')).catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [autoplay]);
  useEffect(() => {
    if (!autoplay) return;
    resetRideHintForPreview();
    resetRevealSeenForPreview();
    resetRideMemoryForPreview();
    const timer = setTimeout(() => runStep(0), 4000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay]);
  const stageItem = request?.item ?? items[0];

  return (
    <Wrapper><View style={styles.root}>
    <Topbar>
      <TopbarColumn><Text style={styles.travel}>TRAVEL MODE</Text></TopbarColumn>
    </Topbar>
    <View ref={container} collapsable={false} style={styles.content}
      onLayout={event => {
        setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height });
        container.current?.measureInWindow((x, y, w, h) => {
          // The map area for the chrome budget: this view (the status HUD is above it, the tab bar below).
          chromeRect.current = { ...chromeRect.current, x, y, w, h, screenW: Dimensions.get('window').width };
          writeChromeRect();
        });
      }}>
      <Map controlsTop={12} projector={projector} snapshotter={snapshotter} ambientFrozen={catchOpen || STILL} chromeHidden={catchOpen || BARE} onUserPan={() => setChip(null)}
        onZoomChange={() => {
          void measure();
          if (!mapStill) setTimeout(() => void snapshotter.current?.().then(uri => uri && setMapStill(uri)), 600);
        }}>
        {items.filter(item => !caught.has(item.pivot_id!)).map((item, index) => (
          <HomeFindMarker key={item.pivot_id} item={item} distance={Math.round(Math.hypot(FIXTURES[index].north, FIXTURES[index].east) / 5) * 5} inRange={FIXTURES[index].inRange}
            animated={!STILL && index < 4} hidden={request?.pivotId === item.pivot_id} onTap={tapFind} onExpire={noop}
            fingerSide={sides[item.pivot_id!] ?? 'right'} showFinger={index === nearestInRange}
            chromeless={BARE || cascadeOn && !!points.current.get(item.pivot_id!) && bannerCovers(points.current.get(item.pivot_id!)!, size, BOTTOM_SLOT)} />
        ))}
      </Map>
      {/* Same as the app: kept mounted, hidden and inert during a catch. */}
      <Animated.View style={[StyleSheet.absoluteFill, chromeFade, BARE && styles.hidden]} pointerEvents={catchOpen ? 'none' : 'box-none'}>
        <FindEdgeArrows finds={edges} size={size} onPress={onEdgePress} insetTop={12 + 30 + 8 + 24} />
      </Animated.View>
      {!request && <Animated.View style={[styles.bottom, { bottom: slotBottom }, chromeFade, BARE && styles.hidden]} pointerEvents="box-none">
        <HomeHuntChip message={chip} onDismiss={() => setChip(null)} />
      </Animated.View>}
      <Animated.View style={[StyleSheet.absoluteFill, chromeFade, BARE && styles.hidden]} pointerEvents={catchOpen ? 'none' : 'box-none'}>
        <QuickAccessMenu position="left" />
        <RadialStatsMenu />
        {/* As in the app: the top HUD row (free-Ticket countdown, park story). */}
        <HomeHudChips top={hudTop} onWidth={setHudWidth} findsUntilTicket={2} onTicketPress={line => setChip({ key: `t-${Date.now()}`, text: line, ttlMs: 5000 })}
          parkStory={{ title: 'Park story', points: 3, goal: 10, onPress: () => undefined }} />
      </Animated.View>
      <HomeCatchMoment ref={catchRef} request={request} stageItem={rideSpec(stageItem.rarity).style === 'ride_photo' ? stageItem : null}
        badgeBottom={BOTTOM_SLOT} redeem={fakeRedeem} getFix={() => origin}
        mapStill={mapStill}
        autoShots={autoplay ? SCRIPT[step]?.shots ?? null : null} refreshAfterCatch={false}
        forceRide={autoplay && SCRIPT[step] && EXP !== 'noforce' ? { kind: SCRIPT[step].kind, sky: SCRIPT[step].sky, gullPass: SCRIPT[step].gullPass } : null}
        onCascade={setCascadeOn} forceReducedMotion={autoplay && !!SCRIPT[step]?.reduced}
        autoSkipReveal={autoplay && !!SCRIPT[step]?.skip}
        loadSetPage={async () => previewSetPage(stepItem.current ?? request?.item ?? null)}
        autoEscape={autoplay && SCRIPT[step]?.again ? 'again' : 'map'}
        onRideAgain={(item) => { if (autoplay) rodeAgain.current = true; void startCatch(item); }}
        warm={autoplay && EXP !== 'nowarm' ? SCRIPT.slice(step, step + 2).map((entry, i) => ({ item: scriptItem(step + i), forceRide: EXP === 'noforce' ? null : { kind: entry.kind, sky: entry.sky } })) : undefined}
        onCollected={() => undefined} onUnavailable={() => undefined}
        onFailed={(line) => setChip({ key: `fail-${Date.now()}`, text: line, tone: 'error' })}
        onDone={done => {
          const pivot = request?.pivotId;
          setRequest(null);
          if (done && pivot != null && !autoplay) setCaught(current => new Set([...current, pivot]));
          // Autoplay: after the Rare, ride the Epic (dark ride, 2 photos). A RIDE AGAIN escape waits for its next ride.
          if (autoplay && SCRIPT[stepRef.current]?.again && !rodeAgain.current) return;
          if (autoplay && rodeAgain.current && !done) return;
          rodeAgain.current = false;
          catches.current += 1;
          if (autoplay && catches.current < SCRIPT.length) setTimeout(() => runStep(catches.current), 2600);
        }} />
    </View>
    </View></Wrapper>
  );
}

const noop = () => undefined;
/** The Snack Stand page for the reveal's book slots: the six fixtures plus six more (the caught one carries the step's id). */
function previewSetPage(caught: PrepItemType | null): BookItem[] {
  const extra = ['corn-dog', 'cotton-candy', 'hot-dog', 'funnel-cake', 'pizza-slice', 'mini-donut-bag'];
  const fixtures = FIXTURES.map((f, i) => ({ id: caught && caught.name === f.name ? caught.id : 900 + i, name: f.name,
    icon_url: `${ART_DIR}${f.slug}.png`, variant_slug: f.slug,
    // Owned on the page: the pretzel, and a repeat being caught again (it is in the book already).
    is_collected: i === 1 || (!!caught && caught.name === f.name && caught.is_new_variant === false),
    // Book stars: the stored best photo per owned item (the repeat being caught had a Good).
    best_photo_grade: i === 1 ? 'great' : caught && caught.name === f.name && caught.is_new_variant === false ? 'good' : null }));
  const rest = extra.map((slug, i) => ({ id: 950 + i, name: slug, icon_url: `${ART_DIR}${slug}.png`, variant_slug: slug, is_collected: i < 3,
    best_photo_grade: (['frame_it', 'good', null] as const)[i] ?? null }));
  return [...rest.slice(0, 3), ...fixtures, ...rest.slice(3)];
}
/** The nearest in-range fixture shows the only finger (as in the app). */
const nearestInRange = FIXTURES.map((f, i) => ({ i, d: f.inRange ? Math.hypot(f.north, f.east) : Infinity }))
  .sort((a, b) => a.d - b.d)[0].i;

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  root: { flex: 1, backgroundColor: '#0768b9' },
  content: { flex: 1, marginTop: -8 },
  travel: { color: '#fff', fontFamily: 'Shark', fontSize: 16, letterSpacing: 2, textAlign: 'center' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: BOTTOM_SLOT, zIndex: 12, alignItems: 'stretch' },
});
