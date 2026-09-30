import { Image } from 'expo-image';
import { nextCoinEyebrow, ticketsReadyHint } from '../services/collection/nextCoinCopy';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import GameIcon from '../ui/GameIcon';
import useReducedGameMotion from '../hooks/useReducedGameMotion';

interface Props {
  readonly parkName: string;
  readonly isOwnPark?: boolean;
  readonly collected: number;
  readonly available: number;
  readonly completionRate: number;
  readonly ridePassportCollected?: number;
  readonly ridePassportAvailable?: number;
  readonly onOpenRidePassport?: () => void;
  readonly onBrowseSecrets?: () => void;
  readonly onOpenStampBook?: () => void;
  readonly nextRideName?: string | null;
  readonly nextRideOwned?: boolean;
  readonly ownedGoalHint?: string | null;
  readonly nearbyRideName?: string | null;
  readonly nearbyReportedOpen?: boolean;
  readonly ticketsNeeded?: number;
  readonly rescuePassAvailable?: boolean;
  readonly goalStale?: boolean;
  readonly goalReportedDown?: boolean;
  readonly alternateRideName?: string | null;
  readonly secretMilestones: number;
  /** Retired: the shelf now sits right under this header, and park coin and task stats left it. */
  readonly onBrowseCoins?: () => void;
  readonly parkCoins?: number;
  readonly taskMilestones?: number;
  /**
   * While a new coin is flying to its slot the count shows the shelf before the
   * catch; `tickKey` changes when it lands and the count ticks up (3/26 -> 4/26).
   */
  readonly holdCount?: boolean;
  /** Server coin_kind of the goal coin; only 'ride' is called a ride. */
  readonly nextCoinKind?: string | null;
  readonly tickKey?: string | number | null;
}

/** The slim park header: park, one Ride Coins count, and one next step. */
export default function ParkCollectionHeader({ parkName, isOwnPark = true, collected, available, completionRate,
  ridePassportCollected, ridePassportAvailable, onOpenRidePassport, onBrowseSecrets, onOpenStampBook,
  nextRideName, nextRideOwned, ownedGoalHint, nearbyRideName, ticketsNeeded = 0,
  rescuePassAvailable = false, goalStale = false,
  goalReportedDown = false, alternateRideName, nearbyReportedOpen = false,
  secretMilestones, holdCount = false, tickKey, nextCoinKind }: Props) {
  const reduced = useReducedGameMotion();
  const shownCollected = holdCount ? Math.max(0, collected - 1) : collected;
  const rate = available > 0 ? Math.max(0, Math.min(100, shownCollected / available * 100))
    : Math.max(0, Math.min(100, Number.isFinite(completionRate) ? completionRate : 0));
  const passportComplete = typeof ridePassportAvailable === 'number' && ridePassportAvailable > 0 &&
    (ridePassportCollected ?? 0) >= ridePassportAvailable;

  // Count tick: a quick pop and a gold flash when a landed coin adds to the shelf.
  const pop = useSharedValue(1);
  const [flash, setFlash] = useState(false);
  const lastTick = useRef(tickKey);
  useEffect(() => {
    if (!tickKey || lastTick.current === tickKey) return undefined;
    lastTick.current = tickKey;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 700);
    if (!reduced) {
      pop.value = withSequence(withTiming(1.28, { duration: 110, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 7, stiffness: 240 }));
    }
    return () => clearTimeout(timer);
  }, [tickKey, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fill = useSharedValue(rate);
  useEffect(() => {
    fill.value = reduced ? rate : withTiming(rate, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [rate, reduced, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));

  const goal = nextRideName ? {
    eyebrow: goalStale ? 'LAST CONFIRMED GOAL' : goalReportedDown ? 'YOUR GOAL IS REPORTED DOWN'
      : nextRideOwned ? 'COIN MASTERY GOAL' : nextCoinEyebrow(nextCoinKind),
    name: nextRideName,
    hint: goalReportedDown
      ? alternateRideName ? `${alternateRideName} nearby is reported open.` : 'Pick another coin below while you wait.'
      : nextRideOwned ? ownedGoalHint ?? 'On your shelf. Keep earning its Ride Parts.'
      : rescuePassAvailable ? 'Shark Rescue Pass ready at this ride.'
      : ticketsNeeded > 0 ? `${ticketsNeeded} more ${ticketsNeeded === 1 ? 'Ticket' : 'Tickets'} to play.`
      : ticketsReadyHint(nextCoinKind),
  } : nearbyRideName ? {
    eyebrow: nearbyReportedOpen ? 'NEARBY AND REPORTED OPEN' : 'NEAREST MISSING COIN',
    name: nearbyRideName,
    hint: 'Tap its coin below to make it your goal.',
  } : isOwnPark ? {
    eyebrow: 'PICK YOUR NEXT ADVENTURE', name: 'Choose a missing coin', hint: 'Tap an empty slot on the shelf.',
  } : null;

  return <View style={styles.frame}>
    <LinearGradient colors={['#0a8fe3', '#0768b9']} style={styles.hero}>
      <Image source={require('../../assets/images/screens/pin-collections/shark.png')}
        contentFit="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      <Text style={styles.eyebrow} numberOfLines={1}>{parkName.toUpperCase()}</Text>
      <View style={styles.countRow} accessible
        accessibilityLabel={available > 0 ? `${shownCollected} of ${available} Ride Coins collected` : 'Ride Coins coming soon'}>
        <Animated.Text style={[styles.count, flash && styles.countFlash, popStyle]}>
          {available > 0 ? `${shownCollected}/${available}` : 'NEW'}
        </Animated.Text>
        <Text style={styles.countLabel}>RIDE COINS</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      <View style={styles.chips}>
        {typeof ridePassportAvailable === 'number' && ridePassportAvailable > 0 &&
          <Pressable style={styles.chip} disabled={!onOpenRidePassport}
            accessibilityRole={onOpenRidePassport ? 'button' : undefined}
            accessibilityLabel={`Ride Passport, ${ridePassportCollected ?? 0} of ${ridePassportAvailable}${onOpenRidePassport ? ', show rides only' : ''}`}
            onPress={onOpenRidePassport}>
            <GameIcon name="ride" size={20} />
            <Text style={styles.chipText}>PASSPORT {ridePassportCollected ?? 0}/{ridePassportAvailable}</Text>
          </Pressable>}
        {!!onBrowseSecrets && <Pressable style={styles.chip} onPress={onBrowseSecrets} hitSlop={6}
          accessibilityRole="button" accessibilityLabel={`${secretMilestones} secret coins found. View secret shelf.`}>
          <GameIcon name="lock" size={18} />
          <Text style={styles.chipText}>SECRETS {secretMilestones}</Text>
        </Pressable>}
      </View>
    </LinearGradient>
    {(passportComplete || goal) && <View style={styles.lower}>
      {passportComplete ? <Pressable onPress={onOpenStampBook} disabled={!onOpenStampBook}
        accessibilityRole={onOpenStampBook ? 'button' : undefined}
        accessibilityLabel="Ride Passport complete. Open Stamp Book."
        style={styles.goal}>
        <Image source={require('../../assets/images/stamps/ride-passport-complete-v1.png')}
          contentFit="contain" style={styles.completeStamp} />
        <View style={{ flex: 1 }}>
          <Text style={styles.goalEyebrow}>RIDE PASSPORT COMPLETE</Text>
          <Text style={styles.goalName}>Claim it in your Stamp Book</Text>
        </View>
        {onOpenStampBook && <GameIcon name="arrow" size={26} />}
      </Pressable> : goal && <View style={styles.goal}>
        <View style={styles.goalIcon}><GameIcon name={nextRideOwned ? 'parts' : 'coin'} size={30} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalEyebrow}>{goal.eyebrow}</Text>
          <Text numberOfLines={1} style={styles.goalName}>{goal.name}</Text>
          <Text style={styles.goalHint} numberOfLines={2}>{goal.hint}</Text>
        </View>
      </View>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { borderRadius: 20, borderWidth: 3, borderColor: '#fff', backgroundColor: '#fff8e4',
    overflow: 'hidden', shadowColor: '#05346e', shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 5 },
  hero: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, overflow: 'hidden' },
  shark: { position: 'absolute', right: -6, top: -4, width: 96, height: 96 },
  eyebrow: { fontFamily: 'Knockout', color: '#dff4ff', fontSize: 14, letterSpacing: 1.2, maxWidth: '72%' },
  countRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2 },
  count: { fontFamily: 'Shark', fontSize: 36, lineHeight: 40, color: '#ffcf3b',
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  countFlash: { color: '#fff3b0' },
  countLabel: { fontFamily: 'Shark', color: '#fff', fontSize: 18, marginBottom: 5,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  track: { height: 12, backgroundColor: '#bfe5ff', borderWidth: 2, borderColor: '#fff',
    borderRadius: 7, overflow: 'hidden', marginTop: 6, marginRight: 78 },
  fill: { height: '100%', backgroundColor: '#ffcf3b', borderRadius: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4,
    backgroundColor: '#fff8e4', borderWidth: 2, borderColor: '#ffcf3b', borderRadius: 12 },
  chipText: { fontFamily: 'Shark', color: '#05346e', fontSize: 14 },
  lower: { padding: 10 },
  completeStamp: { width: 48, height: 48 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff4cc',
    borderColor: '#ffcf3b', borderWidth: 2, borderRadius: 14, padding: 9 },
  goalIcon: { width: 42, height: 42, backgroundColor: '#fff', borderRadius: 21,
    borderWidth: 2, borderColor: '#ffcf3b', alignItems: 'center', justifyContent: 'center' },
  goalEyebrow: { fontFamily: 'Knockout', color: '#8a5a00', fontSize: 12, letterSpacing: 0.8 },
  goalName: { fontFamily: 'Shark', color: '#05346e', fontSize: 18 },
  goalHint: { fontFamily: 'Knockout', color: '#3d5f8c', fontSize: 14, lineHeight: 17, marginTop: 1 },
});
