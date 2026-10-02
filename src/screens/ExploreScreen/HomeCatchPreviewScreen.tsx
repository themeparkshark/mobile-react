import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import Map, { type MapProjector } from '../../components/Map';
import { Marker } from '../../components/map/Marker';
import { LocationContext } from '../../context/LocationProvider';
import type { PrepItemType } from '../../models/prep-item-type';
import type redeemPrepItem from '../../api/endpoints/me/prep-items/redeem';
import Topbar from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import QuickAccessMenu from '../../components/QuickAccessMenu';
import RadialStatsMenu from '../../components/RadialStatsMenu';
import PrepItemMarker, { PREP_MARKER_ANCHOR } from './PrepItem';
import HomeCatchMoment, { resetRideHintForPreview, type CatchRequest } from './HomeCatchMoment';
import HomeHuntChip, { type HuntChipMessage } from './HomeHuntChip';
import { screenBearing, walkCloserLine } from './findPresentation';

/**
 * Development-only (EXPO_PUBLIC_HOME_CATCH_PREVIEW=1): the v3 home map with
 * fixture finds around the simulator's location and a fake catch endpoint,
 * so the catch moments can be recorded without a backend. Item art loads
 * from the local v3 art folder (simulator only). Never shipped in release.
 */
const ART_DIR = 'file:///Users/dustinsparage/apps/tps-prime-time-audit/next-wave/home-hunt-v3/art/items/';
const BOTTOM_SLOT = 100 + 76 + 14;

type Fixture = { slug: string; name: string; rarity: number; set: string; color: string; north: number; east: number; inRange: boolean };
const FIXTURES: Fixture[] = [
  { slug: 'mac-cheese-cone', name: 'Mac and Cheese Cone', rarity: 3, set: 'Snack Stand', color: '#FFB020', north: 26, east: 12, inRange: true },
  { slug: 'salted-pretzel', name: 'Giant Salted Pretzel', rarity: 1, set: 'Snack Stand', color: '#FFB020', north: -24, east: -20, inRange: true },
  { slug: 'nacho-tray', name: 'Loaded Nacho Tray', rarity: 2, set: 'Snack Stand', color: '#FFB020', north: 95, east: -55, inRange: false },
  { slug: 'turkey-leg', name: 'Smoky Turkey Leg', rarity: 4, set: 'Snack Stand', color: '#FFB020', north: -110, east: 70, inRange: false },
  { slug: 'golden-feast-platter', name: 'Golden Feast Platter', rarity: 5, set: 'Snack Stand', color: '#FFB020', north: 140, east: 60, inRange: false },
  { slug: 'popcorn-bucket', name: 'Striped Popcorn Bucket', rarity: 1, set: 'Snack Stand', color: '#FFB020', north: -70, east: -95, inRange: false },
];

export default function HomeCatchPreviewScreen() {
  const { location } = useContext(LocationContext);
  const base = useRef<{ latitude: number; longitude: number } | null>(null);
  if (!base.current && location) base.current = { latitude: location.latitude, longitude: location.longitude };
  const origin = base.current ?? { latitude: 28.3772, longitude: -81.5707 };
  const [caught, setCaught] = useState<Set<number>>(() => new Set());
  const [request, setRequest] = useState<CatchRequest | null>(null);
  const [chip, setChip] = useState<HuntChipMessage | null>(null);
  const projector = useRef<MapProjector | null>(null);
  const container = useRef<View>(null);
  const mapFocus = useSharedValue(0);
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const lean = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.07 * mapFocus.value }] }));
  const found = useRef(0);

  const items: PrepItemType[] = FIXTURES.map((fixture, index) => ({
    id: 900 + index, pivot_id: 9000 + index, name: fixture.name, variant_slug: null, description: null,
    icon_url: `${ART_DIR}${fixture.slug}.png`, rarity: fixture.rarity, energy_reward: 10, ticket_reward: 1,
    experience_reward: 25, is_new_variant: index !== 1, set_name: fixture.set, set_color: fixture.color,
    latitude: origin.latitude + fixture.north / 111320,
    longitude: origin.longitude + fixture.east / (111320 * Math.cos(origin.latitude * Math.PI / 180)),
    active_to: new Date(Date.now() + (index === 3 ? 4 : 25) * 60_000).toISOString(),
  }));

  const toLocal = useCallback(async (latitude: number, longitude: number) => {
    const point = await projector.current?.(latitude, longitude).catch(() => null);
    const at = await new Promise<{ x: number; y: number } | null>(resolve => container.current?.measureInWindow((x, y) => resolve({ x, y })) ?? resolve(null));
    return point && at ? { x: point.x - at.x, y: point.y - at.y } : null;
  }, []);

  const fakeRedeem: typeof redeemPrepItem = async (id) => {
    await new Promise(resolve => setTimeout(resolve, 450));
    const item = items.find(entry => entry.id === id)!;
    found.current += 1;
    return { success: true, data: {
      rewards: { energy: 20, tickets: 1, coins: 0, experience: 50 }, streak: { current: 3, multiplier: 1 },
      is_new_variant: item.is_new_variant, replayed: false,
      set_progress: { total: 12, collected: 4 + found.current, percentage: 40, is_complete: false, collected_ids: [] },
      dex: { set_slug: 'snack_stand', found: 4 + found.current, total: 12, reward_status: 'locked' },
      item: { id, name: item.name, rarity: item.rarity, rarity_label: '', set_name: item.set_name, set_color: item.set_color },
    } };
  };

  const startCatch = async (item: PrepItemType) => {
    setChip(null);
    const from = await toLocal(item.latitude!, item.longitude!);
    setFocus(from);
    setRequest({ item, pivotId: item.pivot_id!, from, attempt: Date.now() });
  };
  const autoplay = __DEV__ && process.env.EXPO_PUBLIC_HOME_CATCH_AUTOPLAY === '1';
  // UI-thread frame times while a catch plays, logged once a second (performance review).
  const frameCount = useSharedValue(0), frameSlow = useSharedValue(0), frameWorst = useSharedValue(0), frameSum = useSharedValue(0);
  const logFrames = (count: number, slow: number, worst: number, sum: number) => {
    console.log(`[catch-perf] frames=${count} avg=${(sum / Math.max(1, count)).toFixed(1)}ms worst=${worst.toFixed(1)}ms over25ms=${slow}`);
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
  useEffect(() => {
    if (!autoplay) return;
    resetRideHintForPreview();
    const timer = setTimeout(() => void startCatch(items[0]), 3500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay]);

  return (
    <View ref={container} collapsable={false} style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, lean, focus ? { transformOrigin: `${Math.round(focus.x)}px ${Math.round(focus.y)}px` } : null]}>
        <Map controlsTop={12} projector={projector}>
          {items.filter(item => !caught.has(item.pivot_id!)).map((item, index) => {
            const fixture = FIXTURES[index];
            return (
              <Marker key={item.pivot_id} coordinate={{ latitude: item.latitude!, longitude: item.longitude! }} anchor={PREP_MARKER_ANCHOR}
                onPress={async () => {
                  if (request) return;
                  if (!fixture.inRange) {
                    const distance = Math.hypot(fixture.north, fixture.east);
                    const key = `far-${item.pivot_id}-${Date.now()}`;
                    setChip({ key, text: walkCloserLine(distance) });
                    const [shark, find] = await Promise.all([toLocal(origin.latitude, origin.longitude), toLocal(item.latitude!, item.longitude!)]);
                    const arrowDeg = screenBearing(shark, find);
                    if (arrowDeg != null) setChip(current => (current?.key === key ? { ...current, arrowDeg } : current));
                    return;
                  }
                  await startCatch(item);
                }}>
                <PrepItemMarker prepItem={item} onExpire={() => undefined} inRange={fixture.inRange}
                  hidden={request?.pivotId === item.pivot_id} />
              </Marker>
            );
          })}
        </Map>
      </Animated.View>
      <Topbar>
        <TopbarColumn><Text style={styles.travel}>TRAVEL MODE</Text></TopbarColumn>
      </Topbar>
      {!request && <View style={styles.bottom} pointerEvents="box-none">
        <HomeHuntChip message={chip} onDismiss={() => setChip(null)} />
      </View>}
      <QuickAccessMenu position="left" />
      <RadialStatsMenu />
      <HomeCatchMoment request={request} badgeBottom={BOTTOM_SLOT} redeem={fakeRedeem} mapFocus={mapFocus} autoShots={autoplay ? [-2.2, 0.04] : null}
        onCollected={() => undefined} onUnavailable={() => undefined}
        onFailed={(line) => setChip({ key: `fail-${Date.now()}`, text: line, tone: 'error' })}
        onDone={done => {
          const pivot = request?.pivotId;
          setRequest(null);
          if (done && pivot != null) setCaught(current => new Set([...current, pivot]));
        }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0768b9' },
  travel: { color: '#fff', fontFamily: 'Shark', fontSize: 16, letterSpacing: 2, textAlign: 'center' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: BOTTOM_SLOT, zIndex: 12, alignItems: 'stretch' },
});
