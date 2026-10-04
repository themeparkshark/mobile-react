import { Image } from 'expo-image';
import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useMapAlive } from '../../components/map/alive/MapAliveContext';
import { hash01, withinBudget } from '../../components/map/alive/ambientBudget';
import { waitGlow, type WaitGlow as WaitGlowLook } from '../../components/map/alive/parkPulse';
import { arrivalBurstAllowed } from '../../components/map/alive/presence';
import { Marker } from '../../components/map/Marker';
import RideTeamFlag from '../../components/map/RideTeamFlag';
import { TaskType } from '../../models/task-type';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { gameTimestamp } from './mapOpportunityTiming';
import type { RideControlRide } from '../../api/endpoints/parks/rideControl';
import type { LiveRide } from '../../api/endpoints/parks/live';
import { TEAMS } from '../../constants/teams';
import { MapQueryContext } from '../../components/Map';
import { BEHIND, RideAmbience, WaterAmbience } from '../../components/map/RideAmbience';
import { ambienceNow, rideLook, WATER_AMBIENCE, type LandmarkId } from '../../services/rideLandmark';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, GameIcon } from '../../ui';
import { formatDistance } from './adventureTicketPresentation';
import { markerBadge, markerRingColor, restingLabel } from './mapMarkerPresentation';
import { limitedLabel } from '../../services/collection/limitedCoins';
import { FoldBadge, Placed, TagSlot, usePlacement } from '../../components/map/declutter/Placed';
import type { Placement } from '../../components/map/declutter/solver';
import { RIDE_BODY, RIDE_BOX, rideLayoutId, rideTagKind, rideTagSize } from './parkMapLayout';
import { findClock } from './FindLife';

const LANDMARKS: Record<LandmarkId, number> = {
  shark: require('../../../assets/images/map/landmarks/shark.png'),
  snack: require('../../../assets/images/map/landmarks/snack.png'),
  plaza: require('../../../assets/images/map/landmarks/plaza.png'),
  pirates: require('../../../assets/images/map/landmarks/pirates.png'),
  space: require('../../../assets/images/map/landmarks/space.png'),
  snow: require('../../../assets/images/map/landmarks/snow.png'),
  haunted: require('../../../assets/images/map/landmarks/haunted.png'),
  tiki: require('../../../assets/images/map/landmarks/tiki.png'),
  volcano: require('../../../assets/images/map/landmarks/volcano.png'),
  wizard: require('../../../assets/images/map/landmarks/wizard.png'),
  waterfall: require('../../../assets/images/map/landmarks/waterfall.png'),
  race: require('../../../assets/images/map/landmarks/race.png'),
  train: require('../../../assets/images/map/landmarks/train.png'),
  circus: require('../../../assets/images/map/landmarks/circus.png'),
  studio: require('../../../assets/images/map/landmarks/studio.png'),
  ocean: require('../../../assets/images/map/landmarks/ocean.png'),
  city: require('../../../assets/images/map/landmarks/city.png'),
  lighthouse: require('../../../assets/images/map/landmarks/lighthouse.png'),
};
// Keep the tappable pin close to its artwork so adjacent rides do not steal taps.
const GROUND = { x: 36, y: 86 };
const RIDE_COIN = require('../../../assets/images/map/ride-coin.png');

// Water spots found for rides, kept across re-mounts and re-renders.
const waterSpots = new Map<string, { latitude: number; longitude: number } | null>();

// Sailing ships need open water; a hippo or fin fits a narrow river.
const WATER_MARGIN: Partial<Record<string, number>> = { ship: 16, fin: 8, hippo: 5 };

function useWaterSpot(kind: string | undefined, latitude: number, longitude: number) {
  const enabled = !!kind;
  const query = useContext(MapQueryContext);
  const key = `${kind}:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const [spot, setSpot] = useState(() => waterSpots.get(key) ?? null);
  useEffect(() => {
    if (!enabled || !query || waterSpots.has(key)) return;
    let dead = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    // Tiles may still be streaming in; look again a few times before giving up.
    const look = async () => {
      const found = await query.findWater(latitude, longitude, WATER_MARGIN[kind ?? ''] ?? 5).catch(() => null);
      if (dead) return;
      if (found) { waterSpots.set(key, found); setSpot(found); }
      else if (++tries < 4) timer = setTimeout(look, 2500 * tries);
      else waterSpots.set(key, null);
    };
    timer = setTimeout(look, 1200);
    return () => { dead = true; clearTimeout(timer); };
  }, [enabled, kind, query, key, latitude, longitude]);
  return spot;
}

const SPARKLE = require('../../../assets/images/map/fx/sparkle.png');
const COIN_TURN = 3.2; // seconds per coin turn

/**
 * The ride's coin hovering over its landmark: a slow turn and bob on the map's
 * ambient clock, a soft shadow on the roof that tightens as it rises, and a
 * glint across its face every other turn. Calm (Reduce Motion) holds it face on.
 */
function FloatingCoin({ seed, moving }: { readonly seed: number; readonly moving: boolean }) {
  const { clock } = useMapAlive();
  const phase = hash01(seed);
  const coin = useAnimatedStyle(() => {
    if (!moving) return { transform: [{ translateY: 0 }, { scaleX: 1 }] };
    const a = (clock.value / COIN_TURN + phase) * Math.PI * 2;
    return { transform: [{ translateY: -2 + Math.sin(a) * 4 }, { scaleX: Math.cos(a) }] };
  });
  const shadow = useAnimatedStyle(() => {
    const rise = moving ? (Math.sin((clock.value / COIN_TURN + phase) * Math.PI * 2) + 1) / 2 : 0.5;
    return { opacity: 0.3 - rise * 0.12, transform: [{ scaleX: 1 - rise * 0.25 }] };
  });
  const glint = useAnimatedStyle(() => {
    if (!moving) return { opacity: 0 };
    const turns = clock.value / COIN_TURN + phase;
    const face = Math.cos(turns * Math.PI * 2);
    const k = Math.floor(turns) % 2 === 0 && face > 0 ? face ** 14 : 0;
    return { opacity: k, transform: [{ translateY: -2 + Math.sin(turns * Math.PI * 2) * 4 }, { scale: 0.3 + k * 0.8 }, { rotate: `${k * 45}deg` }] };
  });
  return <>
    <Animated.View style={[styles.coinShadow, shadow]} />
    <Animated.Image source={RIDE_COIN} style={[styles.floatingCoin, coin]} />
    <Animated.Image source={SPARKLE} tintColor="#ffffff" resizeMode="contain" style={[styles.coinGlint, glint]} />
  </>;
}

const GLOW = require('../../../assets/images/map/fx/glow.png');

/** A soft pool of light: one tinted radial texture (GPU composited; motion comes from the wrapping view). */
function GlowPool({ color, width, height }: { color: string; width: number; height: number }) {
  return <Image source={GLOW} tintColor={color} style={{ width, height }} contentFit="fill" />;
}

/**
 * Park pulse: the island breathes a glow from the live wait. Walk-ons glow cool
 * mint, a normal line gold, a slammed ride warm coral and quicker. Islands past
 * the animation budget (or calm) hold the same glow still.
 */
function WaitGlow({ id, glow, moving }: { readonly id: number; readonly glow: WaitGlowLook; readonly moving: boolean }) {
  const { clock } = useMapAlive();
  const phase = hash01(id + 0.25);
  const style = useAnimatedStyle(() => {
    const k = moving ? (Math.sin((clock.value / glow.period + phase) * Math.PI * 2) + 1) / 2 : 0.7;
    return { opacity: glow.strength * (0.6 + 0.4 * k), transform: [{ scaleX: 0.92 + 0.1 * k }, { scaleY: 0.92 + 0.1 * k }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.waitGlow, style]}>
      <GlowPool color={glow.color} width={104} height={40} />
    </Animated.View>
  );
}

/**
 * After sunset each island stands in a warm pool of lamp light, so the pins
 * glow against the darker map. The nearest few flicker very slightly.
 */
function LampGlow({ id, level, moving }: { readonly id: number; readonly level: number; readonly moving: boolean }) {
  const { clock } = useMapAlive();
  const phase = hash01(id + 0.75) * 10;
  const style = useAnimatedStyle(() => {
    const flicker = moving ? Math.sin(clock.value * 7.3 + phase) * Math.sin(clock.value * 3.1 + phase) * 0.06 : 0;
    return { opacity: level * (0.78 + flicker) };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.lampGlow, style]}>
      <GlowPool color="#ffcf72" width={124} height={64} />
    </Animated.View>
  );
}

const FLECKS = ['#ffcf3b', '#ffffff', '#7cc6f5', '#ff8a6b', '#8fe8c6', '#ffcf3b', '#ffffff', '#c9a6ff', '#7cc6f5', '#ffcf3b'];

function Fleck({ p, i }: { p: SharedValue<number>; i: number }) {
  const angle = Math.PI * (0.12 + (i / (FLECKS.length - 1)) * 0.76) + (hash01(i) - 0.5) * 0.3;
  const speed = 70 + hash01(i + 9) * 55;
  const style = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: t < 0.7 ? 1 : (1 - t) / 0.3,
      transform: [{ translateX: Math.cos(angle) * speed * t }, { translateY: -Math.sin(angle) * speed * t + 90 * t * t },
        { rotate: `${(i % 2 ? 1 : -1) * t * 540}deg` }, { scaleY: 0.5 + 0.5 * Math.abs(Math.cos(t * 12 + i)) }],
    };
  });
  return <Animated.View style={[styles.fleck, { backgroundColor: FLECKS[i] }, style]} />;
}

/**
 * Arrival: stepping into a ride's range pops a gold ring off the island's base
 * and a puff of confetti flecks, once per ride per stretch of play.
 */
function ArrivalBurst({ onDone }: { readonly onDone: () => void }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 950, easing: Easing.out(Easing.quad) });
    const timer = setTimeout(onDone, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ring = useAnimatedStyle(() => ({ opacity: 1 - p.value, transform: [{ scaleX: 0.7 + p.value * 1.9 }, { scaleY: 0.7 + p.value * 1.9 }] }));
  const star = useAnimatedStyle(() => {
    const k = Math.sin(Math.min(1, p.value / 0.6) * Math.PI);
    return { opacity: k, transform: [{ translateY: -48 - p.value * 16 }, { scale: 0.4 + k * 0.9 }, { rotate: `${p.value * 120}deg` }] };
  });
  return (
    <View pointerEvents="none" style={styles.burst}>
      <Animated.View style={[styles.burstRing, ring]} />
      <View style={styles.burstOrigin}>{FLECKS.map((_, i) => <Fleck key={i} p={p} i={i} />)}</View>
      <Animated.Image source={SPARKLE} resizeMode="contain" style={[styles.burstStar, star]} />
    </View>
  );
}

// Last arrival burst per ride, kept across re-mounts (islands remount as clusters change).
const lastArrival = new Map<number, number>();

/** A sleeping island: little "z" float up and fade, one after another. */
function SleepyZ({ i, moving, seed }: { readonly i: number; readonly moving: boolean; readonly seed: number }) {
  const { clock } = useMapAlive();
  const phase = hash01(seed + 7);
  const style = useAnimatedStyle(() => {
    if (!moving) return { opacity: i === 2 ? 0 : 0.9, transform: [{ translateX: i * 8 }, { translateY: -i * 9 }, { rotate: '-12deg' }] };
    const p = (clock.value / 3.3 + phase + i / 3) % 1;
    return {
      opacity: p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1,
      transform: [{ translateX: p * 18 + Math.sin(p * Math.PI * 2) * 3 }, { translateY: -p * 30 }, { rotate: '-12deg' }, { scale: 0.7 + p * 0.6 }],
    };
  });
  return <Animated.Text style={[styles.sleepyZ, style]}>z</Animated.Text>;
}

const LIMITED_COLORS = ['#c9a6ff', '#8fe8ff', '#fff1a3', '#ffb3de', '#c9a6ff', '#8fe8ff', '#fff1a3', '#ffb3de', '#c9a6ff'] as const;
const LIMITED_BAND = 128; // px of one colour cycle in the halo

/** A twinkle on the limited island, timed off the shared clock. */
function LimitedTwinkle({ seed, x, y, tint }: { seed: number; x: number; y: number; tint: string }) {
  const { clock } = useMapAlive();
  const period = 1.9 + hash01(seed) * 0.9;
  const phase = hash01(seed + 3);
  const style = useAnimatedStyle(() => {
    const p = (clock.value / period + phase) % 1;
    const k = Math.sin(p * Math.PI) ** 2;
    return { opacity: k, transform: [{ scale: 0.3 + k * 0.7 }, { rotate: `${p * 90}deg` }] };
  });
  return <Animated.Image source={SPARKLE} tintColor={tint} resizeMode="contain" style={[styles.limitedTwinkle, { left: x, top: y }, style]} />;
}

/**
 * Limited coins shimmer: an iridescent halo flows around the island's base and
 * two pastel twinkles wink over it, so a coin that is leaving reads as special
 * from across the map. Over budget or calm, the halo holds still.
 */
function LimitedShimmer({ seed, moving }: { readonly seed: number; readonly moving: boolean }) {
  const { clock } = useMapAlive();
  const phase = hash01(seed + 11) * LIMITED_BAND;
  const flow = useAnimatedStyle(() => ({
    transform: [{ translateX: moving ? -((clock.value * 26 + phase) % LIMITED_BAND) : -LIMITED_BAND / 3 }],
  }));
  return <>
    <View pointerEvents="none" style={styles.limitedHalo}>
      <Animated.View style={[styles.limitedFlow, flow]}>
        <LinearGradient colors={LIMITED_COLORS} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
    {moving && <LimitedTwinkle seed={seed} x={4} y={30} tint="#e3ccff" />}
    {moving && <LimitedTwinkle seed={seed + 1} x={52} y={18} tint="#fff1a3" />}
  </>;
}

/**
 * The island's timer chip ("m:ss", or "1h 2m" past an hour). Ticks once a second
 * while the map is on screen and holds still otherwise. Counts up to the second
 * (never reads 0:00) and fades itself out at zero, before the ride's data catches
 * up. Always the same View and Text, so nothing inside the map marker swaps.
 */
function MarkerTimer({ expiresAt, ticking, urgent, badgeStyle }: {
  readonly expiresAt: number; readonly ticking: boolean; readonly urgent: boolean; readonly badgeStyle: StyleProp<ViewStyle>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const left = expiresAt - now;
  const done = left <= 0;
  useEffect(() => {
    if (!ticking || done) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking, done]);
  const shown = useSharedValue(done ? 0 : 1);
  useEffect(() => { shown.value = withTiming(done ? 0 : 1, { duration: TIMER_FADE_MS }); }, [done, shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  return <Animated.View style={[badgeStyle, fade]}>
    <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>{findClock(left)}</Text>
  </Animated.View>;
}
const TIMER_FADE_MS = 280;

/** "Play here": a soft ring swells out from the island's base while the ride is playable. */
function PlayPulse({ color, reducedMotion }: { readonly color: string; readonly reducedMotion: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) { p.value = 0.5; return; }
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }), -1, false);
    return () => cancelAnimation(p);
  }, [p, reducedMotion]);
  const style = useAnimatedStyle(() => ({ opacity: reducedMotion ? 0.55 : 0.75 * (1 - p.value),
    transform: [{ scaleX: 0.8 + p.value * 0.7 }, { scaleY: 0.8 + p.value * 0.7 }] }));
  return <Animated.View pointerEvents="none" style={[styles.playPulse, { borderColor: color }, style]} />;
}

export interface TaskMarkerProps {
  /** Posted wait, status and Rush window from the live park feed. */
  readonly live?: LiveRide;
  /** Play the ride's ambient Easter eggs (only for rides near the player). */
  readonly ambient?: boolean;
  /** Today's Ride Control state for this ride, if any team holds it. */
  readonly control?: RideControlRide;
  readonly flagRaiseKey?: string;
  readonly task: TaskType;
  readonly isSelected: boolean;
  readonly isTripGoal?: boolean;
  /** Within walking reach: the floating coin and the timer show. */
  readonly near?: boolean;
  /** The player can play this ride right here: the base pulses. */
  readonly playable?: boolean;
  /** Today's Adventure Ticket ride (discover and play phases). */
  readonly adventure?: boolean;
  /** Other rides folded under this island (declutter), shown as +N. */
  readonly clusterCount?: number;
  /** A timed ride that opens later: drawn resting with "Back 2:00 PM". */
  readonly restingUntil?: number | null;
  /** Selected chip: distance from the player and the Ticket price. */
  readonly distanceMeters?: number | null;
  readonly ticketCost?: number;
  /** First reveal: drop in after this many ms (stagger). */
  readonly revealDelay?: number;
  /** Distance order among the islands on the map (0 = nearest): only the nearest few spend animation. */
  readonly aliveRank?: number;
  readonly onPress: (task: TaskType) => void;
  /** An empty pool slot: both markers stay mounted, parked and empty (MapView children never mount mid-list). */
  readonly parked?: boolean;
}

/**
 * TaskMarker: a ride's landmark on the game map (themed from its name), its
 * coin, team flag and timer, plus its Easter-egg scene when the player is near.
 * Selecting it lifts the landmark on a spring and opens a chip with the coin,
 * distance and Ticket price. The map pins the outer view by its anchor, so
 * inner animations are safe.
 */
function TaskMarker({
  task, isSelected, isTripGoal = false, control, flagRaiseKey, ambient = false, live, onPress,
  near = false, playable = false, adventure = false, clusterCount = 0, restingUntil = null,
  distanceMeters = null, ticketCost = 1, revealDelay, aliveRank, parked = false,
}: TaskMarkerProps) {
  const reducedMotion = useReducedGameMotion();
  const alive = useMapAlive();
  // Declutter: shown, receded or folded away, and where this island's chip goes (parkMapLayout).
  const placed = usePlacement(rideLayoutId(task.id));
  const placement = parked ? PARKED_PLACEMENT : placed;
  const shown = placement.visible;
  // A hidden island holds every loop still (battery) and ignores taps.
  const calm = alive.tier === 'calm' || !shown;
  const shownRef = useRef(shown); shownRef.current = shown;
  // The chip's clock ticks only while the map runs and this island is on show.
  const timerTicking = shown ? alive.active : false;
  const expiresAt = gameTimestamp(task.active_to);
  const minsLeft = expiresAt !== null ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000)) : null;

  const look = useMemo(() => rideLook(task.name), [task.name]);
  const rush = live?.rush && live.status === 'OPERATING' && new Date(live.rush.ends_at).getTime() > Date.now()
    ? live.rush : null;
  const down = live?.status === 'DOWN';
  const closed = live?.status === 'CLOSED' || live?.status === 'REFURBISHMENT';
  const resting = down || closed || restingUntil !== null;
  const owned = (task.times_completed ?? 0) > 0;
  // A closed ride never hurries the player: no countdown and no red on it.
  const timerUrgent = !resting && minsLeft !== null && minsLeft < 5;

  // Rush gold, a held ride its team colour, red only in the last 5 minutes, gold in reach, else blue.
  const ringColor = markerRingColor({ rush: !!rush, team: control ? TEAMS[control.controller].color : null, urgent: timerUrgent, near: near || playable });
  // A limited coin on the map is in rotation: "Limited · leaves Oct 31".
  const limited = task.limited?.active ? limitedLabel(task.limited) : null;
  const badge = markerBadge({ rush: !!rush, adventure, goal: isTripGoal, owned, limited: !!limited, selected: isSelected });
  const showTimer = !resting && expiresAt !== null && expiresAt > Date.now() && !rush && (isSelected || near || timerUrgent);
  // One chip above the art: the badge, else the timer (the timer drops into the art when a badge holds the chip).
  const tagKind = isSelected ? null : rideTagKind({ badge, showTimer });
  const tagSize = rideTagSize(tagKind, limited?.toUpperCase() ?? '');
  const folded = clusterCount + placement.folded;
  // Scenes stay mounted while the living map pauses; their loops stop inside
  // (RideAmbience reads the map's running state). Mounting or unmounting views
  // inside 37 markers at once on every return to the map crashed MapLibre's
  // subview insert (-[MLRNMapView insertReactSubview:atIndex:]) in testing.
  const kinds = useMemo(() => {
    const base = ambient && !reducedMotion ? ambienceNow(look.ambience) : [];
    // A Rush always sparkles, near or far: it's worth walking to.
    return rush && !reducedMotion ? [...base, 'rush' as const] : base;
  }, [ambient, look, rush, reducedMotion]);
  const waterKind = kinds.find(k => WATER_AMBIENCE.includes(k));
  const [behindKinds, frontKinds] = useMemo(() => {
    const pin = kinds.filter(k => !WATER_AMBIENCE.includes(k));
    return [pin.filter(k => BEHIND.includes(k)), pin.filter(k => !BEHIND.includes(k))];
  }, [kinds]);
  const latitude = Number(task.latitude);
  const longitude = Number(task.longitude);
  const glow = useMemo(() => resting ? null : waitGlow(live), [live, resting]);
  const waterSpot = useWaterSpot(waterKind, latitude, longitude);

  // Selection: anticipation dip, spring lift to 1.15, settle. Haptic on the lift.
  const lift = useSharedValue(isSelected ? 1 : 0);
  const wasSelected = useRef(isSelected);
  useEffect(() => {
    if (isSelected && !wasSelected.current) haptic('tapLight');
    wasSelected.current = isSelected;
    if (reducedMotion) { lift.value = isSelected ? 1 : 0; return; }
    lift.value = isSelected
      ? withSequence(withTiming(-0.2, { duration: 70 }), withSpring(1, { damping: 8, stiffness: 260, mass: 0.7 }))
      : withSpring(0, { damping: 14, stiffness: 220 });
  }, [isSelected, reducedMotion, lift]);
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 8 }, { scale: 1 + lift.value * 0.15 }],
  }));

  // First reveal: islands drop in one after another, bounce and settle.
  const drop = useSharedValue(revealDelay === undefined || reducedMotion ? 1 : 0);
  useEffect(() => {
    if (revealDelay === undefined || reducedMotion) { drop.value = 1; return; }
    drop.value = withDelay(revealDelay, withSpring(1, { damping: 10, stiffness: 170 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dropStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 2),
    transform: [{ translateY: (1 - drop.value) * -36 }, { scale: 0.7 + drop.value * 0.3 }],
  }));

  // Entering the ride's range: a burst (motion permitting) and a happy buzz, once in a while.
  const [burst, setBurst] = useState(0);
  const wasPlayable = useRef(playable);
  useEffect(() => {
    if (playable && !wasPlayable.current && arrivalBurstAllowed(lastArrival.get(task.id), Date.now())) {
      lastArrival.set(task.id, Date.now());
      haptic('success');
      if (!calm) setBurst(value => value + 1);
    }
    wasPlayable.current = playable;
  }, [playable, task.id, calm]);

  const press = () => { if (shownRef.current) onPress(task); };
  const status = live && (live.status === 'OPERATING' && live.wait !== null ? `${live.wait} min wait`
    : down ? 'Temporarily down' : closed ? 'Closed right now' : null);

  return (<>
    {/* Always mounted (hidden without a water scene): the island's two map markers never come and go. */}
    <Marker coordinate={waterSpot ?? { latitude, longitude }} hidden={parked || !(waterKind && waterSpot)} anchor={{ x: 0.5, y: 0.63 }}>
      {/* Same box size either way, so the marker's layout never changes (no corner blink). */}
      <View style={styles.waterBox}>{waterKind && waterSpot && !parked ? <WaterAmbience kind={waterKind} /> : null}</View>
    </Marker>
    <Marker
      coordinate={{ latitude, longitude }}
      onPress={press}
      accessibilityLabel={`${task.name}. ${isSelected ? 'Selected. ' : ''}${owned ? `Your coin, level ${task.coin_level ?? 1}. ` : 'New coin. '}${limited ? `${limited}. ` : ''}${folded ? `${folded} more rides here. ` : ''}${restingUntil ? `${restingLabel(restingUntil)}. ` : ''}${minsLeft !== null ? `Bonus opportunity: ${minsLeft} minutes left. ` : ''}Show ride on the map.`}
      stopPropagation={true}
      hidden={parked}
      anchor={{ x: 0.5, y: 0.9 }}
    >
      {/* One chip at a time keeps the map calm, on the free side the declutter picked (unscaled: the
          solver sized it around the scaled art); the info card replaces it when selected. */}
      <Placed placement={placement} anchor={RIDE_BOX.anchor} overlay={tagKind && tagSize ? (
          <TagSlot tag={placement.tag} anchor={RIDE_BOX.anchor} width={tagSize.w} height={tagSize.h}
            fallback={{ x: -tagSize.w / 2, y: RIDE_BODY.y - tagSize.h - 3 }}>
            {tagKind === 'rush' && rush && (
              <View style={styles.rushBadge} accessibilityLabel={`Rush: ${live?.wait ?? rush.wait} minute wait`}>
                <GameIcon name="rush" size={14} />
                <Text style={styles.rushText}>RUSH {live?.wait ?? rush.wait} MIN</Text>
              </View>
            )}
            {tagKind === 'adventure' && <View style={styles.adventureBadge}><GameIcon name="ticket" size={13} /><Text style={styles.adventureText}>ADVENTURE</Text></View>}
            {tagKind === 'goal' && <View style={styles.goalBadge}><Text style={styles.goalText}>MY GOAL</Text></View>}
            {tagKind === 'limited' && limited && <View style={styles.limitedBadge}><GameIcon name="timer" size={12} />
              <Text style={styles.limitedText} numberOfLines={1}>{limited.toUpperCase()}</Text></View>}
            {tagKind === 'timer' && (
              <MarkerTimer expiresAt={expiresAt!} ticking={timerTicking} urgent={timerUrgent}
                badgeStyle={[styles.timerBadge, timerUrgent && styles.timerBadgeUrgent]} />
            )}
          </TagSlot>
      ) : undefined}>
      <Animated.View style={[styles.container, dropStyle]}>
        {!isSelected && badge === 'new' && <View style={styles.newBadge}><GameIcon name="sparkle" size={16} /></View>}
        {!isSelected && showTimer && tagKind !== 'timer' && (
          <MarkerTimer expiresAt={expiresAt!} ticking={timerTicking} urgent={timerUrgent}
            badgeStyle={[styles.timerBadge, styles.timerLow, timerUrgent && styles.timerBadgeUrgent]} />
        )}

        {/* Selected chip: the coin, how far, and what it costs. */}
        {isSelected && (
          <View pointerEvents="none" style={styles.tooltipContainer}>
            <View style={styles.tooltip}>
              <View style={styles.tooltipRow}>
                <Image source={task.coin_url ? { uri: task.coin_url } : RIDE_COIN} style={styles.tooltipCoin} contentFit="contain" />
                <View style={styles.tooltipCopy}>
                  <Text style={styles.tooltipTitle} numberOfLines={1}>{task.name}</Text>
                  <View style={styles.tooltipMeta}>
                    {distanceMeters !== null && <Text style={styles.tooltipDetail}>{formatDistance(distanceMeters)}</Text>}
                    {restingUntil ? <Text style={styles.tooltipDetail}>{restingLabel(restingUntil)}</Text> : <>
                      <GameIcon name="ticket" size={14} />
                      <Text style={styles.tooltipDetail}>{ticketCost} {ticketCost === 1 ? 'Ticket' : 'Tickets'}</Text>
                    </>}
                  </View>
                  {(status || isTripGoal || adventure || limited) && <Text style={styles.tooltipWait} numberOfLines={1}>
                    {[adventure ? 'Adventure ride' : isTripGoal ? 'My goal' : null, status, limited].filter(Boolean).join(' · ')}
                  </Text>}
                </View>
              </View>
              {minsLeft !== null && expiresAt! > Date.now() && <Text style={[styles.tooltipTimer, timerUrgent && styles.timerTextUrgent]}>{minsLeft} min left</Text>}
            </View>
            <View style={styles.tooltipArrow} />
          </View>
        )}

        {alive.light.lamps >= 0.05 && <LampGlow id={task.id} level={alive.light.lamps} moving={!calm && withinBudget(aliveRank, alive.caps.pulsingRides)} />}
        {glow && <WaitGlow id={task.id} glow={glow} moving={!calm && withinBudget(aliveRank, alive.caps.pulsingRides)} />}
        {limited && <LimitedShimmer seed={task.id} moving={!calm && withinBudget(aliveRank, alive.caps.limitedShimmer)} />}
        {/* Ground ring: flat, bright, no glow. */}
        <View style={[styles.groundRing, { borderColor: ringColor, backgroundColor: `${ringColor}33` }]} />
        {playable && !resting && <PlayPulse color={ringColor} reducedMotion={reducedMotion || !alive.active} />}

        {control && (
          <View style={styles.teamFlag}>
            <RideTeamFlag team={control.controller} contested={control.contested} raiseKey={flagRaiseKey} />
          </View>
        )}

        <RideAmbience kinds={behindKinds} seed={task.id} origin={GROUND} zIndex={1} />

        {/* The ride's landmark: themed art, or the classic shark tower. */}
        <Animated.View style={[styles.buildingContainer, liftStyle]}>
          <View style={[styles.landmarkWrap, resting && styles.landmarkResting]}>
            {(isSelected || near) && !resting && <FloatingCoin seed={task.id} moving={!calm && (isSelected || withinBudget(aliveRank, alive.caps.idleCoins))} />}
            <Image source={LANDMARKS[look.landmark]} style={styles.landmarkImage} contentFit="contain" />
          </View>
          {owned && !isSelected && <View style={styles.levelPip}><Text style={styles.levelText}>{task.coin_level ?? 1}</Text></View>}
          {resting && <View pointerEvents="none" style={styles.sleepy}>
            {[0, 1, 2].map(i => <SleepyZ key={i} i={i} seed={task.id} moving={!calm && withinBudget(aliveRank, alive.caps.sleepyRides)} />)}
          </View>}
          {down && <View style={styles.downChip}><GameIcon name="wrench" size={12} /><Text style={styles.downText}>DOWN</Text></View>}
          {!down && restingUntil !== null && !isSelected && <View style={styles.restingSlot}><View style={styles.downChip}><Text style={styles.downText} numberOfLines={1}>{restingLabel(restingUntil).toUpperCase()}</Text></View></View>}
          <FoldBadge count={folded} style={styles.clusterBadge} />
        </Animated.View>

        <RideAmbience kinds={frontKinds} seed={task.id} origin={GROUND} zIndex={8} />
        {burst > 0 && <ArrivalBurst key={burst} onDone={() => setBurst(0)} />}
      </Animated.View>
      </Placed>
    </Marker>
  </>);
}

export default memo(TaskMarker);

/** An empty slot's placement: not drawn, no chip, no loops. */
const PARKED_PLACEMENT: Placement = { visible: false, scale: 1, folded: 0, foldedInto: null, tag: null, reason: 'offscreen' };

const styles = StyleSheet.create({
  waterBox: { width: 110, height: 70 },
  teamFlag: { position: 'absolute', top: 25, right: -3, zIndex: 21 },
  container: { width: 72, height: 96, position: 'relative', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 },
  goalBadge: { backgroundColor: BRAND.gold,
    borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 2, borderColor: BRAND.navy },
  goalText: { color: BRAND.navy, fontSize: 10, fontFamily: 'Knockout', letterSpacing: 0.5 },
  adventureBadge: { flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: BRAND.white, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: BRAND.navy },
  adventureText: { color: BRAND.navy, fontSize: 10, fontFamily: 'Knockout', letterSpacing: 0.5 },
  limitedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.white, borderRadius: 9,
    paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: BRAND.navy },
  limitedText: { color: BRAND.navy, fontSize: 10, fontFamily: 'Knockout', letterSpacing: 0.5 },
  newBadge: { position: 'absolute', top: 2, right: 2, zIndex: 22 },
  levelPip: { position: 'absolute', bottom: 2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3,
    backgroundColor: BRAND.blueBright, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  levelText: { fontFamily: 'Shark', fontSize: 10, color: BRAND.white },
  timerBadge: { backgroundColor: BRAND.white, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: BRAND.navy },
  // Under a badge, the timer sits on the art's shoulder.
  timerLow: { position: 'absolute', top: -2, zIndex: 20 },
  timerBadgeUrgent: { borderColor: BRAND.red },
  timerText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, textAlign: 'center' },
  timerTextUrgent: { color: BRAND.red },
  tooltipContainer: { position: 'absolute', top: -84, left: -74, right: -74, alignItems: 'center', zIndex: 25 },
  tooltip: { backgroundColor: BRAND.white, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 3, borderColor: BRAND.navy, maxWidth: 220 },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tooltipCoin: { width: 30, height: 30 },
  tooltipCopy: { flexShrink: 1 },
  tooltipTitle: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  tooltipMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  tooltipDetail: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.navySoft, marginRight: 2 },
  tooltipWait: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.blue },
  tooltipTimer: { fontFamily: 'Shark', fontSize: 11, color: BRAND.navy, textAlign: 'center', marginTop: 2 },
  tooltipArrow: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: BRAND.navy },
  groundRing: { position: 'absolute', bottom: 10, width: 58, height: 20, borderRadius: 29, borderWidth: 3 },
  playPulse: { position: 'absolute', bottom: 8, width: 62, height: 24, borderRadius: 31, borderWidth: 3 },
  buildingContainer: { zIndex: 5 },
  // Small enough that a park full of pins stays a calm map, not a sticker sheet.
  landmarkWrap: { width: 64, height: 86, alignItems: 'center', justifyContent: 'flex-end' },
  landmarkResting: { opacity: 0.55 },
  downChip: { position: 'absolute', bottom: 2, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: BRAND.navySoft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1.5, borderColor: BRAND.white },
  downText: { fontFamily: 'Shark', fontSize: 11, color: BRAND.white },
  // Wider than the island so "BACK 2:00 PM" never clips.
  restingSlot: { position: 'absolute', bottom: 2, left: -30, right: -30, alignItems: 'center' },
  clusterBadge: { position: 'absolute', top: 16, left: -4, minWidth: 26, height: 22, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  rushBadge: { flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: BRAND.gold, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 2, borderColor: BRAND.navy },
  rushText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy },
  landmarkImage: { width: 64, height: 64 },
  floatingCoin: { position: 'absolute', top: 0, width: 20, height: 20 },
  coinShadow: { position: 'absolute', top: 23, width: 14, height: 4, borderRadius: 7, backgroundColor: 'rgba(5,52,110,0.9)' },
  coinGlint: { position: 'absolute', top: -2, marginLeft: 12, width: 12, height: 12 },
  limitedHalo: { position: 'absolute', bottom: 7, width: 68, height: 26, borderRadius: 34, overflow: 'hidden', opacity: 0.7 },
  // Two full colour cycles (9 stops), so sliding one band left loops seamlessly.
  limitedFlow: { position: 'absolute', left: 0, top: 0, bottom: 0, width: LIMITED_BAND * 2 },
  waitGlow: { position: 'absolute', bottom: 0, width: 104, height: 40 },
  burst: { position: 'absolute', left: 0, right: 0, bottom: 10, height: 24, alignItems: 'center', justifyContent: 'center', zIndex: 30 },
  burstRing: { position: 'absolute', width: 60, height: 22, borderRadius: 30, borderWidth: 4, borderColor: BRAND.gold },
  burstOrigin: { position: 'absolute', width: 0, height: 0 },
  burstStar: { position: 'absolute', width: 26, height: 26 },
  fleck: { position: 'absolute', left: -3, top: -2, width: 6, height: 4, borderRadius: 1 },
  lampGlow: { position: 'absolute', bottom: -8, width: 124, height: 64 },
  sleepy: { position: 'absolute', top: 14, right: 4, width: 30, height: 40, zIndex: 6 },
  sleepyZ: { position: 'absolute', left: 0, bottom: 0, fontFamily: 'Shark', fontSize: 15, color: BRAND.navy,
    textShadowColor: BRAND.white, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  limitedTwinkle: { position: 'absolute', width: 13, height: 13, zIndex: 9 },
});
