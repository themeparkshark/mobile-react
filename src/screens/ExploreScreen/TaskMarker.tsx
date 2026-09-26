import { Image } from 'expo-image';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Marker } from '../../components/map/Marker';
import Countdown, { zeroPad } from 'react-countdown';
import { TaskType } from '../../models/task-type';
import type { RideControlRide } from '../../api/endpoints/parks/rideControl';
import type { LiveRide } from '../../api/endpoints/parks/live';
import { TEAMS } from '../../constants/teams';
import { MapQueryContext } from '../../components/Map';
import { BEHIND, RideAmbience, WaterAmbience } from '../../components/map/RideAmbience';
import { ambienceNow, rideLook, WATER_AMBIENCE, type LandmarkId } from '../../services/rideLandmark';

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
// Where the ride sits inside the 140x160 pin (its anchor is x 0.5, y 0.9).
const GROUND = { x: 70, y: 146 };
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

/** The ride's coin hovering over its landmark: slow spin and bob. */
function FloatingCoin() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [p]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.sin(p.value * Math.PI * 2) * 4 }, { scaleX: Math.cos(p.value * Math.PI * 2) }],
  }));
  return <Animated.Image source={RIDE_COIN} style={[styles.floatingCoin, style]} />;
}

/**
 * TaskMarker: a ride's landmark on the game map (themed from its name), its
 * coin, team flag and timer, plus its Easter-egg scene when the player is near.
 * The map pins the outer view by its anchor, so inner animations are safe.
 */
export default function TaskMarker({
  task,
  isSelected,
  isTripGoal = false,
  control,
  ambient = false,
  live,
  onPress,
}: {
  /** Posted wait, status and Rush window from the live park feed. */
  readonly live?: LiveRide;
  /** Play the ride's ambient Easter eggs (only for rides near the player). */
  readonly ambient?: boolean;
  /** Today's Ride Control state for this ride, if any team holds it. */
  readonly control?: RideControlRide;
  readonly task: TaskType;
  readonly isSelected: boolean;
  readonly isTripGoal?: boolean;
  readonly onPress: () => void;
}) {
  const expiresAt = task.active_to ? new Date(task.active_to + 'Z') : null;
  const minsLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : null;

  const look = useMemo(() => rideLook(task.name), [task.name]);
  const rush = live?.rush && live.status === 'OPERATING' && new Date(live.rush.ends_at).getTime() > Date.now()
    ? live.rush : null;
  const down = live?.status === 'DOWN';
  const closed = live?.status === 'CLOSED' || live?.status === 'REFURBISHMENT';

  // Rush glows gold; a held ride wears its team's color; others keep the timer colors.
  const ringColor = rush ? '#ffcf3b' : control ? TEAMS[control.controller].color
    : minsLeft !== null && minsLeft < 5 ? '#ef4444' : '#4ade80';
  const timerUrgent = minsLeft !== null && minsLeft < 5;
  const kinds = useMemo(() => {
    const base = ambient ? ambienceNow(look.ambience) : [];
    // A Rush always sparkles, near or far: it's worth walking to.
    return rush ? [...base, 'rush' as const] : base;
  }, [ambient, look, rush]);
  const waterKind = kinds.find(k => WATER_AMBIENCE.includes(k));
  const [behindKinds, frontKinds] = useMemo(() => {
    const pin = kinds.filter(k => !WATER_AMBIENCE.includes(k));
    return [pin.filter(k => BEHIND.includes(k)), pin.filter(k => !BEHIND.includes(k))];
  }, [kinds]);
  const latitude = Number(task.latitude);
  const longitude = Number(task.longitude);
  const waterSpot = useWaterSpot(waterKind, latitude, longitude);
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 700);
    return () => clearTimeout(timer);
  }, [isSelected, isTripGoal, control?.controller, control?.contested]);

  return (<>
    {waterKind && waterSpot && (
      <Marker coordinate={waterSpot} anchor={{ x: 0.5, y: 0.63 }}>
        <WaterAmbience kind={waterKind} />
      </Marker>
    )}
    <Marker
      coordinate={{ latitude, longitude }}
      onPress={onPress}
      stopPropagation={true}
      tracksViewChanges={tracksViewChanges}
      anchor={{ x: 0.5, y: 0.9 }}
    >
      <View style={styles.container}>
        {isTripGoal && <View style={styles.goalBadge}><Text style={styles.goalText}>MY GOAL</Text></View>}
        {rush && (
          <View style={[styles.rushBadge, isTripGoal && { top: 24 }]} accessibilityLabel={`Rush: ${rush.wait} minute wait`}>
            <Text style={styles.rushText}>⚡ RUSH {rush.wait} MIN</Text>
          </View>
        )}
        {/* Timer badge */}
        {expiresAt && (
          <View style={[
            styles.timerBadge,
            timerUrgent && styles.timerBadgeUrgent,
          ]}>
            <Countdown
              date={expiresAt.getTime()}
              renderer={({ minutes, seconds }) => (
                <Text style={[
                  styles.timerText,
                  timerUrgent && styles.timerTextUrgent,
                ]}>
                  {minutes}:{zeroPad(seconds)}
                </Text>
              )}
            />
          </View>
        )}

        {/* Task name tooltip - always rendered, toggle opacity to avoid layout shift */}
        <View style={[styles.tooltipContainer, { opacity: isSelected ? 1 : 0 }]}>
          <View style={styles.tooltip}>
            <Text style={styles.tooltipTitle}>
              {task.name}
            </Text>
            {live && (live.status === 'OPERATING' && live.wait !== null
              ? <Text style={styles.tooltipWait}>{live.wait} min wait{live.typical ? ` · usually ${live.typical}` : ''}</Text>
              : down ? <Text style={styles.tooltipWait}>Temporarily down</Text>
                : closed ? <Text style={styles.tooltipWait}>Closed right now</Text> : null)}
          </View>
          <View style={styles.tooltipArrow} />
        </View>

        {/* Static glow rings (no animation) */}
        <View
          style={[
            styles.glowRingOuter,
            {
              shadowColor: ringColor,
              borderColor: ringColor,
            },
          ]}
        />
        <View
          style={[
            styles.glowRingInner,
            {
              borderColor: ringColor,
              backgroundColor: `${ringColor}20`,
            },
          ]}
        />

        {control && (
          <View style={styles.teamFlag} accessibilityLabel={`${TEAMS[control.controller].name} holds this ride`}>
            <Image source={TEAMS[control.controller].badge} style={styles.teamBadge} contentFit="contain" />
            {control.contested && <Text style={styles.contested}>⚔</Text>}
          </View>
        )}

        <RideAmbience kinds={behindKinds} seed={task.id} origin={GROUND} zIndex={1} />

        {/* The ride's landmark: themed art, or the classic shark tower. */}
        <View style={styles.buildingContainer}>
          <View style={[styles.landmarkWrap, (down || closed) && styles.landmarkResting]}>
            <FloatingCoin />
            <Image source={LANDMARKS[look.landmark]} style={styles.landmarkImage} contentFit="contain" />
          </View>
          {down && <View style={styles.downChip}><Text style={styles.downText}>🔧 DOWN</Text></View>}
        </View>

        <RideAmbience kinds={frontKinds} seed={task.id} origin={GROUND} zIndex={8} />
      </View>
    </Marker>
  </>);
}

const styles = StyleSheet.create({
  teamFlag: { position: 'absolute', top: 40, right: 22, zIndex: 21, alignItems: 'center' },
  teamBadge: { width: 34, height: 34 },
  contested: { position: 'absolute', bottom: -6, right: -8, fontSize: 16 },
  container: {
    width: 140,
    height: 160,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
  },
  goalBadge: { position: 'absolute', top: 3, zIndex: 22, backgroundColor: '#fbbf24',
    borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#1a1a2e' },
  goalText: { color: '#1a1a2e', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  timerBadge: {
    position: 'absolute',
    top: 65,
    backgroundColor: '#FFF8E7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1.5,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 20,
  },
  timerBadgeUrgent: {
    backgroundColor: '#FEE2E2',
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  timerText: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#B8860B',
    textAlign: 'center',
  },
  timerTextUrgent: {
    color: '#ef4444',
  },
  tooltipContainer: {
    position: 'absolute',
    top: 25,
    left: -10,
    right: -10,
    alignItems: 'center',
    zIndex: 15,
  },
  tooltip: {
    backgroundColor: 'white',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  tooltipTitle: {
    fontFamily: 'Shark',
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'white',
  },
  glowRingOuter: {
    position: 'absolute',
    bottom: 8,
    width: 80,
    height: 35,
    borderRadius: 40,
    borderWidth: 3,
    opacity: 0.7,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  glowRingInner: {
    position: 'absolute',
    bottom: 12,
    width: 65,
    height: 28,
    borderRadius: 32,
    borderWidth: 2,
    opacity: 0.8,
  },
  buildingContainer: {
    zIndex: 5,
  },
  landmarkWrap: { width: 96, height: 124, alignItems: 'center', justifyContent: 'flex-end' },
  landmarkResting: { opacity: 0.55 },
  downChip: { position: 'absolute', bottom: 2, alignSelf: 'center', backgroundColor: '#475569', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1.5, borderColor: '#fff' },
  downText: { fontFamily: 'Shark', fontSize: 11, color: '#fff' },
  rushBadge: { position: 'absolute', top: 3, zIndex: 23, backgroundColor: '#ffcf3b', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 2, borderColor: '#fff',
    shadowColor: '#ffb300', shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  rushText: { fontFamily: 'Shark', fontSize: 12, color: '#6a3b00' },
  tooltipWait: { fontFamily: 'Knockout', fontSize: 12, color: '#0768b9', textAlign: 'center', marginTop: 1 },
  landmarkImage: { width: 96, height: 96 },
  floatingCoin: { position: 'absolute', top: 0, width: 30, height: 30 },
});
