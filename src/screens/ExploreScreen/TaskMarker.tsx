import { Image } from 'expo-image';
import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Marker } from '../../components/map/Marker';
import RideTeamFlag from '../../components/map/RideTeamFlag';
import Countdown, { zeroPad } from 'react-countdown';
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

/** The ride's coin hovering over its landmark: slow spin and bob. */
function FloatingCoin({ reducedMotion }: { readonly reducedMotion: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    if (!reducedMotion) p.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [p, reducedMotion]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.sin(p.value * Math.PI * 2) * 4 }, { scaleX: Math.cos(p.value * Math.PI * 2) }],
  }));
  return <Animated.Image source={RIDE_COIN} style={[styles.floatingCoin, style]} />;
}

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
  readonly onPress: (task: TaskType) => void;
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
  distanceMeters = null, ticketCost = 1, revealDelay,
}: TaskMarkerProps) {
  const reducedMotion = useReducedGameMotion();
  const expiresAt = gameTimestamp(task.active_to);
  const minsLeft = expiresAt !== null ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000)) : null;

  const look = useMemo(() => rideLook(task.name), [task.name]);
  const rush = live?.rush && live.status === 'OPERATING' && new Date(live.rush.ends_at).getTime() > Date.now()
    ? live.rush : null;
  const down = live?.status === 'DOWN';
  const closed = live?.status === 'CLOSED' || live?.status === 'REFURBISHMENT';
  const resting = down || closed || restingUntil !== null;
  const owned = (task.times_completed ?? 0) > 0;
  const timerUrgent = minsLeft !== null && minsLeft < 5;

  // Rush gold, a held ride its team colour, red only in the last 5 minutes, gold in reach, else blue.
  const ringColor = markerRingColor({ rush: !!rush, team: control ? TEAMS[control.controller].color : null, urgent: timerUrgent, near: near || playable });
  const badge = markerBadge({ rush: !!rush, adventure, goal: isTripGoal, owned, selected: isSelected });
  const showTimer = expiresAt !== null && expiresAt > Date.now() && !rush && (isSelected || near || timerUrgent);
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

  const press = () => onPress(task);
  const status = live && (live.status === 'OPERATING' && live.wait !== null ? `${live.wait} min wait`
    : down ? 'Temporarily down' : closed ? 'Closed right now' : null);

  return (<>
    {waterKind && waterSpot && (
      <Marker coordinate={waterSpot} anchor={{ x: 0.5, y: 0.63 }}>
        <WaterAmbience kind={waterKind} />
      </Marker>
    )}
    <Marker
      coordinate={{ latitude, longitude }}
      onPress={press}
      accessibilityLabel={`${task.name}. ${isSelected ? 'Selected. ' : ''}${owned ? `Your coin, level ${task.coin_level ?? 1}. ` : 'New coin. '}${clusterCount ? `${clusterCount} more rides here. ` : ''}${restingUntil ? `${restingLabel(restingUntil)}. ` : ''}${minsLeft !== null ? `Bonus opportunity: ${minsLeft} minutes left. ` : ''}Show ride on the map.`}
      stopPropagation={true}
      anchor={{ x: 0.5, y: 0.9 }}
    >
      <Animated.View style={[styles.container, dropStyle]}>
        {/* One badge at a time keeps the map calm; the chip replaces it when selected. */}
        {!isSelected && badge === 'rush' && rush && (
          <View style={styles.rushBadge} accessibilityLabel={`Rush: ${live?.wait ?? rush.wait} minute wait`}>
            <GameIcon name="rush" size={14} />
            <Text style={styles.rushText}>RUSH {live?.wait ?? rush.wait} MIN</Text>
          </View>
        )}
        {!isSelected && badge === 'adventure' && <View style={styles.adventureBadge}><GameIcon name="ticket" size={13} /><Text style={styles.adventureText}>ADVENTURE</Text></View>}
        {!isSelected && badge === 'goal' && <View style={styles.goalBadge}><Text style={styles.goalText}>MY GOAL</Text></View>}
        {!isSelected && badge === 'new' && <View style={styles.newBadge}><GameIcon name="sparkle" size={16} /></View>}
        {!isSelected && showTimer && (
          <View style={[styles.timerBadge, timerUrgent && styles.timerBadgeUrgent, badge !== 'new' && badge !== 'level' && styles.timerLow]}>
            <Countdown
              date={expiresAt!}
              renderer={({ total, seconds }) => (
                <Text style={[styles.timerText, timerUrgent && styles.timerTextUrgent]}>
                  {Math.floor(total / 60000)}:{zeroPad(seconds)}
                </Text>
              )}
            />
          </View>
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
                  {(status || isTripGoal || adventure) && <Text style={styles.tooltipWait} numberOfLines={1}>
                    {[adventure ? 'Adventure ride' : isTripGoal ? 'My goal' : null, status].filter(Boolean).join(' · ')}
                  </Text>}
                </View>
              </View>
              {minsLeft !== null && expiresAt! > Date.now() && <Text style={[styles.tooltipTimer, timerUrgent && styles.timerTextUrgent]}>{minsLeft} min left</Text>}
            </View>
            <View style={styles.tooltipArrow} />
          </View>
        )}

        {/* Ground ring: flat, bright, no glow. */}
        <View style={[styles.groundRing, { borderColor: ringColor, backgroundColor: `${ringColor}33` }]} />
        {playable && !resting && <PlayPulse color={ringColor} reducedMotion={reducedMotion} />}

        {control && (
          <View style={styles.teamFlag}>
            <RideTeamFlag team={control.controller} contested={control.contested} raiseKey={flagRaiseKey} />
          </View>
        )}

        <RideAmbience kinds={behindKinds} seed={task.id} origin={GROUND} zIndex={1} />

        {/* The ride's landmark: themed art, or the classic shark tower. */}
        <Animated.View style={[styles.buildingContainer, liftStyle]}>
          <View style={[styles.landmarkWrap, resting && styles.landmarkResting]}>
            {(isSelected || near) && !resting && <FloatingCoin reducedMotion={reducedMotion} />}
            <Image source={LANDMARKS[look.landmark]} style={styles.landmarkImage} contentFit="contain" />
          </View>
          {owned && !isSelected && <View style={styles.levelPip}><Text style={styles.levelText}>{task.coin_level ?? 1}</Text></View>}
          {down && <View style={styles.downChip}><GameIcon name="wrench" size={12} /><Text style={styles.downText}>DOWN</Text></View>}
          {!down && restingUntil !== null && !isSelected && <View style={styles.restingSlot}><View style={styles.downChip}><Text style={styles.downText} numberOfLines={1}>{restingLabel(restingUntil).toUpperCase()}</Text></View></View>}
          {clusterCount > 0 && <View style={styles.clusterBadge}><Text style={styles.clusterText}>+{clusterCount}</Text></View>}
        </Animated.View>

        <RideAmbience kinds={frontKinds} seed={task.id} origin={GROUND} zIndex={8} />
      </Animated.View>
    </Marker>
  </>);
}

export default memo(TaskMarker);

const styles = StyleSheet.create({
  teamFlag: { position: 'absolute', top: 25, right: -3, zIndex: 21 },
  container: { width: 72, height: 96, position: 'relative', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 },
  goalBadge: { position: 'absolute', top: -24, zIndex: 22, backgroundColor: BRAND.gold,
    borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 2, borderColor: BRAND.navy },
  goalText: { color: BRAND.navy, fontSize: 10, fontFamily: 'Knockout', letterSpacing: 0.5 },
  adventureBadge: { position: 'absolute', top: -24, zIndex: 22, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: BRAND.white, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: BRAND.navy },
  adventureText: { color: BRAND.navy, fontSize: 10, fontFamily: 'Knockout', letterSpacing: 0.5 },
  newBadge: { position: 'absolute', top: 2, right: 2, zIndex: 22 },
  levelPip: { position: 'absolute', bottom: 2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3,
    backgroundColor: BRAND.blueBright, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  levelText: { fontFamily: 'Shark', fontSize: 10, color: BRAND.white },
  timerBadge: { position: 'absolute', top: -24, backgroundColor: BRAND.white, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: BRAND.navy, zIndex: 20 },
  timerLow: { top: -2 },
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
  clusterText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy },
  rushBadge: { position: 'absolute', top: -24, zIndex: 23, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: BRAND.gold, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 2, borderColor: BRAND.navy },
  rushText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy },
  landmarkImage: { width: 64, height: 64 },
  floatingCoin: { position: 'absolute', top: 0, width: 20, height: 20 },
});
