import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Marker } from '../../components/map/Marker';
import Countdown, { zeroPad } from 'react-countdown';
import { TaskType } from '../../models/task-type';
import type { RideControlRide } from '../../api/endpoints/parks/rideControl';
import { TEAMS } from '../../constants/teams';

/**
 * TaskMarker — 100% STATIC children inside <Marker>.
 *
 * react-native-maps recalculates marker anchor whenever child layout shifts.
 * ANY Animated transform (even with useNativeDriver) causes teleporting.
 * All animations stripped — marker is rock-solid stationary.
 */
export default function TaskMarker({
  task,
  isSelected,
  isTripGoal = false,
  control,
  onPress,
}: {
  /** Today's Ride Control state for this ride, if any team holds it. */
  readonly control?: RideControlRide;
  readonly task: TaskType;
  readonly isSelected: boolean;
  readonly isTripGoal?: boolean;
  readonly onPress: () => void;
}) {
  const expiresAt = task.active_to ? new Date(task.active_to + 'Z') : null;
  const minsLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : null;

  // A held ride wears its team's color; unheld rides keep the timer colors.
  const ringColor = control ? TEAMS[control.controller].color
    : minsLeft !== null && minsLeft < 5 ? '#ef4444' : '#4ade80';
  const timerUrgent = minsLeft !== null && minsLeft < 5;
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 700);
    return () => clearTimeout(timer);
  }, [isSelected, isTripGoal, control?.controller, control?.contested]);

  return (
    <Marker
      coordinate={{
        latitude: Number(task.latitude),
        longitude: Number(task.longitude),
      }}
      onPress={onPress}
      stopPropagation={true}
      tracksViewChanges={tracksViewChanges}
      anchor={{ x: 0.5, y: 0.9 }}
    >
      <View style={styles.container}>
        {isTripGoal && <View style={styles.goalBadge}><Text style={styles.goalText}>MY GOAL</Text></View>}
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

        {/* Task building — static, no scale transform */}
        <View style={styles.buildingContainer}>
          <Image
            source={require('../../../assets/images/screens/explore/task_animation.gif')}
            style={styles.buildingImage}
            contentFit="contain"
          />
        </View>
      </View>
    </Marker>
  );
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
  buildingImage: {
    width: 120,
    height: 120,
  },
});
