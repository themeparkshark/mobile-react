import { Image } from 'expo-image';
import { nextCoinEyebrow, ticketsReadyHint } from '../services/collection/nextCoinCopy';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import GameIcon from '../ui/GameIcon';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { limitedDayLabel } from '../services/collection/limitedCoins';
import { parkCoinParts } from './parkCoinParts';
import { playSfx } from '../gamekit/SFX';
import { haptic } from '../gamekit/Haptics';
import { nextTrophyLine, type ShelfTab } from '../services/collection/shelfModel';

interface Props {
  readonly parkName: string;
  readonly isOwnPark?: boolean;
  readonly collected: number;
  readonly available: number;
  readonly completionRate: number;
  readonly ridePassportCollected?: number;
  readonly ridePassportAvailable?: number;
  readonly onOpenRidePassport?: () => void;
  /** The limited rotation in play, counted apart from the permanent coins above. */
  readonly limitedCollected?: number;
  readonly limitedAvailable?: number;
  /** Last park-local day of the rotation, YYYY-MM-DD. */
  readonly limitedEndsOn?: string | null;
  readonly onBrowseLimited?: () => void;
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
  /** The shelf tab on screen; the RIDES, SIGHTS and LIMITED chips are the tabs. */
  readonly tab?: ShelfTab;
  readonly onTab?: (tab: ShelfTab) => void;
  /** Tabs this park shows (shelfModel.visibleTabs). */
  readonly tabs?: readonly ShelfTab[];
  /** Coin wins here (the trophies count every win): names the next trophy under the bar. */
  readonly trophyWins?: number;
  /** GO on the next coin: points the guide at it (and opens the map at this park). */
  readonly onGo?: () => void;
  /** 'GO' at this park, 'PLAN' away (saves it as the next park day's coin). */
  readonly goLabel?: 'GO' | 'PLAN';
  /** The coin is the guide's plan already. */
  readonly planned?: boolean;
  /** Energy for growing coins, shown once coin levels open (rung 3). */
  readonly energy?: number | null;
}

/** The slim park header: one shelf count ("9 of 35 coins"), the next trophy, the Rides, Sights and Limited tabs, and the next coin with GO. */
export default function ParkCollectionHeader({ parkName, isOwnPark = true, collected, available, completionRate,
  ridePassportCollected, ridePassportAvailable, onOpenRidePassport, limitedCollected = 0, limitedAvailable = 0,
  limitedEndsOn, onBrowseLimited, onBrowseSecrets, onOpenStampBook,
  nextRideName, nextRideOwned, ownedGoalHint, nearbyRideName, ticketsNeeded = 0,
  rescuePassAvailable = false, goalStale = false,
  goalReportedDown = false, alternateRideName, nearbyReportedOpen = false,
  secretMilestones, holdCount = false, tickKey, nextCoinKind, tab, onTab, tabs, trophyWins, onGo, goLabel = 'GO',
  planned = false, energy = null }: Props) {
  const reduced = useReducedGameMotion();
  const shownCollected = holdCount ? Math.max(0, collected - 1) : collected;
  const rate = available > 0 ? Math.max(0, Math.min(100, shownCollected / available * 100))
    : Math.max(0, Math.min(100, Number.isFinite(completionRate) ? completionRate : 0));
  // Parts use the real count: while a landing coin is held back on the big
  // number we don't know its kind, and the wrong chip must never tick.
  const parts = parkCoinParts(collected, available, ridePassportCollected, ridePassportAvailable);
  const passportComplete = typeof ridePassportAvailable === 'number' && ridePassportAvailable > 0 &&
    (ridePassportCollected ?? 0) >= ridePassportAvailable;
  const limitedLeaves = limitedDayLabel(limitedEndsOn);
  // Above 1 the plain label; the last coin and a full shelf get called out.
  const coinsLeft = available > 0 ? Math.max(0, available - shownCollected) : 99;

  // Count tick: a quick pop and a gold flash when a landed coin adds to the shelf.
  const pop = useSharedValue(1);
  const [flash, setFlash] = useState(false);
  const lastTick = useRef(tickKey);
  useEffect(() => {
    if (!tickKey || lastTick.current === tickKey) return undefined;
    lastTick.current = tickKey;
    setFlash(true);
    // The coin that finishes the park gets its own cheer on top of the landing clink.
    if (available > 0 && collected >= available) { playSfx('fx.reward', 0.8); haptic('success'); }
    const timer = setTimeout(() => setFlash(false), 700);
    if (!reduced) {
      pop.value = withSequence(withTiming(1.28, { duration: 110, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 7, stiffness: 240 }));
    }
    return () => clearTimeout(timer);
  }, [tickKey, reduced, pop, available, collected]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fill = useSharedValue(rate);
  useEffect(() => {
    fill.value = reduced ? rate : withTiming(rate, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [rate, reduced, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));

  const goal = nextRideName ? {
    eyebrow: goalStale ? 'YOUR LAST SAVED GOAL' : goalReportedDown ? 'YOUR GOAL RIDE IS DOWN'
      : nextRideOwned ? 'LEVEL UP GOAL' : nextCoinEyebrow(nextCoinKind),
    name: nextRideName,
    hint: goalReportedDown
      ? alternateRideName ? `${alternateRideName} nearby is reported open.` : 'Pick another coin below while you wait.'
      : nextRideOwned ? ownedGoalHint ?? 'On your shelf. Keep earning its Ride Parts.'
      : rescuePassAvailable ? "Today's free try is ready here."

      : ticketsNeeded > 0 ? `${ticketsNeeded} more ${ticketsNeeded === 1 ? 'Ticket' : 'Tickets'} to play.`
      : ticketsReadyHint(nextCoinKind),
  } : nearbyRideName ? {
    eyebrow: nearbyReportedOpen ? 'NEARBY AND REPORTED OPEN' : 'NEAREST MISSING COIN',
    name: nearbyRideName,
    hint: 'The nearest coin you can win next.',
  } : isOwnPark ? {
    eyebrow: 'NEXT COIN', name: 'Pick a missing coin', hint: 'Tap an empty slot on the shelf.',
  } : null;
  const canGo = !!onGo && !!goal && (!!nextRideName || !!nearbyRideName) && !goalReportedDown && !nextRideOwned;

  return <View style={styles.frame}>
    <LinearGradient colors={['#0a8fe3', '#0768b9']} style={styles.hero}>
      <Image source={require('../../assets/images/screens/pin-collections/shark.png')}
        contentFit="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      {/* The title bar already names the park, so the header starts with the count. */}
      <View style={styles.countRow} accessible
        accessibilityLabel={available > 0 ? `${parkName} shelf: ${shownCollected} of ${available} coins` : 'Coins coming soon'}>
        <Animated.Text style={[styles.count, flash && styles.countFlash, popStyle]}>
          {available > 0 ? `${shownCollected} of ${available}` : 'NEW'}
        </Animated.Text>
        <Text style={[styles.countLabel, coinsLeft <= 1 && styles.countLabelHot]}>
          {coinsLeft === 0 ? 'PARK COMPLETE!' : coinsLeft === 1 ? 'ONE COIN TO GO!' : <>{available === 1 ? 'COIN' : 'COINS'}</>}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, parts?.sights && styles.fillSplit, fillStyle]}>
          {/* Two-tone bar keyed to the chips: gold = rides, orange = sights. */}
          {parts?.sights && parts.rides.collected + parts.sights.collected > 0 && <>
            <View style={[styles.fillRides, { flex: parts.rides.collected }]} />
            <View style={[styles.fillSights, { flex: parts.sights.collected }]} />
          </>}
        </Animated.View>
      </View>
      {typeof trophyWins === 'number' && isOwnPark && <View style={styles.trophyLine} accessible
        accessibilityLabel={nextTrophyLine(trophyWins)}>
        <GameIcon name="trophyBronze" size={16} />
        <Text style={styles.trophyText} numberOfLines={1}>{nextTrophyLine(trophyWins)}</Text>
      </View>}
      <View style={styles.chips} accessibilityRole={onTab ? 'tablist' : undefined}>
        {/* The chips are the shelf's tabs: Rides, Sights and Limited, each with its own part of the count. */}
        {(parts || onTab) && <Pressable style={[styles.chip, tab === 'rides' && styles.chipOn]}
          disabled={!onTab && !onOpenRidePassport}
          accessibilityRole={onTab ? 'tab' : onOpenRidePassport ? 'button' : undefined}
          accessibilityState={onTab ? { selected: tab === 'rides' } : undefined}
          accessibilityLabel={parts ? `Rides: ${parts.rides.collected} of ${parts.rides.available}` : `Coins: ${collected} of ${available}`}
          onPress={onTab ? () => onTab('rides') : onOpenRidePassport}>
          <GameIcon name="ride" size={18} />
          <Text style={styles.chipText}>{parts ? `RIDES ${parts.rides.collected}/${parts.rides.available}` : `COINS ${collected}/${available}`}</Text>
        </Pressable>}
        {parts?.sights && (!tabs || tabs.includes('sights')) && <Pressable style={[styles.chip, styles.chipSights, tab === 'sights' && styles.chipOn]}
          disabled={!onTab} accessibilityRole={onTab ? 'tab' : undefined}
          accessibilityState={onTab ? { selected: tab === 'sights' } : undefined}
          accessibilityLabel={`Shows and sights: ${parts.sights.collected} of ${parts.sights.available}`}
          onPress={() => onTab?.('sights')}>
          <GameIcon name="star" size={18} />
          <Text style={styles.chipText}>SIGHTS {parts.sights.collected}/{parts.sights.available}</Text>
        </Pressable>}
        {(limitedAvailable > 0 || tabs?.includes('limited')) && <Pressable style={[styles.chip, tab === 'limited' && styles.chipOn]}
          onPress={onTab ? () => onTab('limited') : onBrowseLimited} disabled={!onTab && !onBrowseLimited}
          hitSlop={6} accessibilityRole={onTab ? 'tab' : onBrowseLimited ? 'button' : undefined}
          accessibilityState={onTab ? { selected: tab === 'limited' } : undefined}
          accessibilityLabel={limitedAvailable > 0
            ? `Limited coins here now, ${limitedCollected} of ${limitedAvailable}${limitedLeaves ? `, leaving ${limitedLeaves}` : ''}`
            : 'Limited coins and past events'}>
          <GameIcon name="timer" size={18} />
          <Text style={styles.chipText}>{limitedAvailable > 0 ? `LIMITED ${limitedCollected}/${limitedAvailable}` : 'LIMITED'}</Text>
        </Pressable>}
        {typeof energy === 'number' && <View style={[styles.chip, styles.chipEnergy]} accessible
          accessibilityLabel={`${energy} Energy for leveling up coins`}>
          <GameIcon name="energy" size={18} />
          <Text style={styles.chipText}>{energy}</Text>
        </View>}
        {!onTab && !!onBrowseSecrets && <Pressable style={styles.chip} onPress={onBrowseSecrets} hitSlop={6}
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
        <View style={styles.goalIcon}><GameIcon name={nextRideOwned ? 'parts' : 'coin'} size={24} /></View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.goalLine}>
            <Text style={styles.goalEyebrow}>{goal.eyebrow}  </Text>
            <Text style={styles.goalName}>{goal.name}</Text>
          </Text>
          <Text style={styles.goalHint} numberOfLines={1}>{planned && goLabel === 'PLAN' ? 'Planned for your next park day.' : goal.hint}</Text>
        </View>
        {canGo && <Pressable onPress={onGo} hitSlop={8} accessibilityRole="button"
          accessibilityLabel={goLabel === 'GO' ? `Go to ${goal.name}. Shows the path on the map.` : `Plan ${goal.name} for your next park day`}
          style={({ pressed }) => [styles.go, pressed && styles.goPressed, planned && goLabel === 'PLAN' && styles.goDone]}>
          {planned && goLabel === 'PLAN' ? <GameIcon name="check" size={20} /> : <Text style={styles.goText}>{goLabel}</Text>}
        </Pressable>}
      </View>}
    </View>}
  </View>;
}

/** Sights color: the bar segment and its chip border match. */
const SIGHTS_ORANGE = '#ff9b2f';

const styles = StyleSheet.create({
  frame: { borderRadius: 20, borderWidth: 3, borderColor: '#fff', backgroundColor: '#fff8e4',
    overflow: 'hidden', shadowColor: '#05346e', shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 5 },
  hero: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, overflow: 'hidden' },
  shark: { position: 'absolute', right: -4, top: -2, width: 84, height: 84 },
  countRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  count: { fontFamily: 'Shark', fontSize: 36, lineHeight: 40, color: '#ffcf3b',
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  countFlash: { color: '#fff3b0' },
  countLabel: { fontFamily: 'Shark', color: '#fff', fontSize: 18, marginBottom: 5,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  countLabelHot: { color: '#ffd23f' },
  track: { height: 12, backgroundColor: '#bfe5ff', borderWidth: 2, borderColor: '#fff',
    borderRadius: 7, overflow: 'hidden', marginTop: 5, marginRight: 70 },
  fill: { height: '100%', backgroundColor: '#ffcf3b', borderRadius: 7 },
  fillSplit: { flexDirection: 'row', overflow: 'hidden', backgroundColor: 'transparent' },
  fillRides: { height: '100%', backgroundColor: '#ffcf3b' },
  fillSights: { height: '100%', backgroundColor: SIGHTS_ORANGE },
  chipSights: { borderColor: SIGHTS_ORANGE },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4,
    backgroundColor: '#fff8e4', borderWidth: 2, borderColor: '#ffcf3b', borderRadius: 12 },
  chipText: { fontFamily: 'Shark', color: '#05346e', fontSize: 14 },
  chipOn: { backgroundColor: '#ffcf3b', borderColor: '#ffffff' },
  chipEnergy: { marginLeft: 'auto', borderColor: '#7fd3ff' },
  trophyLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, marginRight: 70 },
  trophyText: { fontFamily: 'Knockout', color: '#e9f7ff', fontSize: 14 },
  go: { minWidth: 58, minHeight: 40, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#ffcf3b',
    borderWidth: 2, borderColor: '#ffffff', borderBottomWidth: 4, borderBottomColor: '#d99a00',
    alignItems: 'center', justifyContent: 'center' },
  goPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  goDone: { backgroundColor: '#dff5d8', borderBottomColor: '#7cbf6a' },
  goText: { fontFamily: 'Shark', color: '#05346e', fontSize: 18 },
  lower: { paddingHorizontal: 8, paddingVertical: 7 },
  completeStamp: { width: 48, height: 48 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff4cc',
    borderColor: '#ffcf3b', borderWidth: 2, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 8 },
  goalIcon: { width: 34, height: 34, backgroundColor: '#fff', borderRadius: 17,
    borderWidth: 2, borderColor: '#ffcf3b', alignItems: 'center', justifyContent: 'center' },
  goalLine: { fontFamily: 'Shark', color: '#05346e', fontSize: 17 },
  goalEyebrow: { fontFamily: 'Knockout', color: '#8a5a00', fontSize: 13, letterSpacing: 0.8 },
  goalName: { fontFamily: 'Shark', color: '#05346e', fontSize: 17 },
  goalHint: { fontFamily: 'Knockout', color: '#3d5f8c', fontSize: 14, lineHeight: 17 },
});
