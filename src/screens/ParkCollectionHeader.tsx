import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  readonly parkName: string;
  readonly isOwnPark?: boolean;
  readonly collected: number;
  readonly available: number;
  readonly completionRate: number;
  readonly ridePassportCollected?: number;
  readonly ridePassportAvailable?: number;
  readonly onOpenRidePassport?: () => void;
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
  readonly parkCoins: number;
  readonly taskMilestones: number;
  readonly secretMilestones: number;
}

/** The park checklist's first-screen collection goal, using the app's shark art. */
export default function ParkCollectionHeader({ parkName, isOwnPark = true, collected, available, completionRate,
  ridePassportCollected, ridePassportAvailable, onOpenRidePassport, onOpenStampBook,
  nextRideName, nextRideOwned, ownedGoalHint, nearbyRideName, ticketsNeeded = 0,
  rescuePassAvailable = false, goalStale = false,
  goalReportedDown = false, alternateRideName, nearbyReportedOpen = false,
  parkCoins, taskMilestones, secretMilestones }: Props) {
  const rate = Math.max(0, Math.min(100, Number.isFinite(completionRate) ? completionRate : 0));
  const passportComplete = typeof ridePassportAvailable === 'number' && ridePassportAvailable > 0 &&
    (ridePassportCollected ?? 0) >= ridePassportAvailable;
  return <View style={styles.frame}>
    <LinearGradient colors={['#0789de', '#0569b4', '#063f82']} style={styles.hero}>
      <View style={styles.topline}>
        <Text style={styles.eyebrow}>THE PARK COLLECTION</Text>
        <Text style={styles.parkName} numberOfLines={1}>{parkName.toUpperCase()}</Text>
      </View>
      <Image source={require('../../assets/images/screens/pin-collections/shark.png')}
        contentFit="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      <View style={styles.countRow}>
        <Text style={styles.count}>{available > 0 ? `${collected}/${available}` : 'NEW'}</Text>
        <View style={styles.countCopy}>
        <Text style={styles.countLabel}>COLLECTIBLE COINS</Text>
          <Text style={styles.countHint}>{available > 0
            ? `${Math.round(rate)}% of the current collection`
            : 'Coin designs are coming to this park'}</Text>
        </View>
      </View>
      <View style={styles.track} accessibilityLabel={`${Math.round(rate)} percent of collectible coins found`}>
        <View style={[styles.fill, { width: `${rate}%` }]} />
      </View>
      {typeof ridePassportAvailable === 'number' && ridePassportAvailable > 0 &&
        <Pressable style={styles.passportBadge} disabled={!onOpenRidePassport}
          accessibilityRole={onOpenRidePassport ? 'button' : undefined}
          accessibilityLabel={`Ride Passport, ${ridePassportCollected ?? 0} of ${ridePassportAvailable} ride coins found${onOpenRidePassport ? ', view rides' : ''}`}
          onPress={onOpenRidePassport}>
          <Text style={styles.passportLabel}>RIDE PASSPORT</Text>
          <Text style={styles.passportCount}>{ridePassportCollected ?? 0}/{ridePassportAvailable}</Text>
          {onOpenRidePassport && <Text style={styles.passportArrow}>›</Text>}
        </Pressable>}
    </LinearGradient>
    <View style={styles.lower}>
      {passportComplete && <Pressable onPress={onOpenStampBook} disabled={!onOpenStampBook}
        accessibilityRole={onOpenStampBook ? 'button' : undefined}
        accessibilityLabel="Ride Passport complete. Open Stamp Book."
        style={styles.passportComplete}>
        <Image source={require('../../assets/images/stamps/ride-passport-complete-v1.png')}
          contentFit="contain" style={styles.completeStamp} />
        <View style={{ flex: 1 }}>
          <Text style={styles.completeTitle}>RIDE PASSPORT COMPLETE!</Text>
          <Text style={styles.completeHint}>{onOpenStampBook
            ? 'Open the Stamp Book for your stamp, rewards, and title.'
            : 'Every reviewed ride coin is on this shelf.'}</Text>
        </View>
        {onOpenStampBook && <Text style={styles.completeArrow}>›</Text>}
      </Pressable>}
      {nextRideName ? <View style={styles.goal}>
        <View style={styles.goalIcon}><Image source={require('../../assets/images/coingold.png')}
          contentFit="contain" style={{ width: 35, height: 35 }} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalEyebrow}>{goalStale ? 'LAST CONFIRMED GOAL' : goalReportedDown
            ? 'YOUR GOAL IS REPORTED DOWN' : nextRideOwned ? 'COIN MASTERY GOAL' : 'YOUR NEXT PARK COIN'}</Text>
          <Text numberOfLines={1} style={styles.goalName}>{nextRideName}</Text>
          <Text style={styles.goalHint}>{goalReportedDown
            ? `Check the official park app. ${alternateRideName
              ? `${alternateRideName} is another nearby ride reported open.`
              : 'Choose another coin in the Coin Guide while you wait.'}`
            : nextRideOwned ? ownedGoalHint ?? 'This coin is on your shelf. Keep earning its Ride Parts.'
            : rescuePassAvailable ? 'Shark Rescue Pass ready. Visit this ride to play without a Ticket.'
            : ticketsNeeded > 0 ? `${ticketsNeeded} more ${ticketsNeeded === 1 ? 'Ticket' : 'Tickets'} for a standard attempt. Prepare at home or keep exploring.`
              : 'Tickets ready. Visit its park location and play the challenge.'}</Text>
        </View>
      </View> : nearbyRideName ? <View style={styles.goal}>
        <View style={styles.goalIcon}><Image source={require('../../assets/images/coingold.png')}
          contentFit="contain" style={{ width: 35, height: 35 }} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalEyebrow}>{nearbyReportedOpen
            ? 'NEARBY RIDE REPORTED OPEN' : 'NEAREST UNCOLLECTED COIN AREA'}</Text>
          <Text numberOfLines={1} style={styles.goalName}>{nearbyRideName}</Text>
          <Text style={styles.goalHint}>{nearbyReportedOpen
            ? 'Wait feed reports this ride operating. Check the official park app before heading over.'
            : 'Map proximity is approximate. Open its coin in the guide to choose your goal.'}</Text>
        </View>
      </View> : <View style={styles.goal}>
        <View style={styles.goalIcon}><Text style={styles.question}>?</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalEyebrow}>{isOwnPark ? 'PICK YOUR NEXT ADVENTURE' : 'FAN COLLECTION'}</Text>
          <Text style={styles.goalName}>{isOwnPark ? 'Choose a missing park coin' : 'See their park coin shelf'}</Text>
          <Text style={styles.goalHint}>{isOwnPark
            ? 'Tap a mystery coin on the checklist to set your goal.'
            : 'Open a collected coin to see its level and collection history.'}</Text>
        </View>
      </View>}
      <View style={styles.stats}>
        <Text style={styles.stat}><Text style={styles.statValue}>{parkCoins}</Text> PARK COINS EARNED</Text>
        <Text style={styles.statDot}>✦</Text>
        <Text style={styles.stat}><Text style={styles.statValue}>{taskMilestones}</Text> TASKS</Text>
        <Text style={styles.statDot}>✦</Text>
        <Text style={styles.stat}><Text style={styles.statValue}>{secretMilestones}</Text> SECRETS</Text>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { borderRadius: 22, borderWidth: 3, borderColor: '#fff', backgroundColor: '#f4fcff',
    overflow: 'hidden', shadowColor: '#064b82', shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 5 }, shadowRadius: 8, elevation: 5 },
  hero: { minHeight: 190, padding: 16, overflow: 'hidden' },
  topline: { zIndex: 1, maxWidth: '67%' },
  eyebrow: { fontFamily: 'Knockout', color: '#c7edff', fontSize: 13, letterSpacing: 1.3 },
  parkName: { fontFamily: 'Shark', color: '#fff', fontSize: 23, marginTop: 1,
    textShadowColor: '#07376b', textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1 },
  shark: { position: 'absolute', right: -8, top: -5, width: 155, height: 155 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 17, zIndex: 1 },
  count: { fontFamily: 'Shark', fontSize: 38, color: '#ffcf34',
    textShadowColor: '#07376b', textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 1 },
  countCopy: { justifyContent: 'center' },
  countLabel: { fontFamily: 'Knockout', color: '#fff', fontSize: 18 },
  countHint: { fontFamily: 'Knockout', color: '#c7ebff', fontSize: 13 },
  track: { height: 12, backgroundColor: '#d4eefe', borderWidth: 2, borderColor: '#fff',
    borderRadius: 7, overflow: 'hidden', marginTop: 12, marginRight: 52 },
  fill: { height: '100%', backgroundColor: '#ffcb28', borderRadius: 7 },
  passportBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
    gap: 8, marginTop: 10, paddingHorizontal: 11, paddingVertical: 5,
    backgroundColor: '#fff3c6', borderWidth: 2, borderColor: '#ffcf39', borderRadius: 12 },
  passportLabel: { fontFamily: 'Knockout', color: '#07518a', fontSize: 14, letterSpacing: 0.5 },
  passportCount: { fontFamily: 'Shark', color: '#07518a', fontSize: 17 },
  passportArrow: { fontFamily: 'Knockout', color: '#07518a', fontSize: 23, lineHeight: 23 },
  lower: { paddingHorizontal: 12, paddingTop: 12 },
  passportComplete: { flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: '#fff6d3', borderWidth: 2, borderColor: '#e8b335',
    borderRadius: 14, padding: 8, marginBottom: 11 },
  completeStamp: { width: 53, height: 53 },
  completeTitle: { fontFamily: 'Shark', color: '#074b82', fontSize: 16 },
  completeHint: { fontFamily: 'Knockout', color: '#53627a', fontSize: 12, lineHeight: 15 },
  completeArrow: { fontFamily: 'Knockout', color: '#074b82', fontSize: 26 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff4cc',
    borderColor: '#f9c547', borderWidth: 2, borderRadius: 14, padding: 10 },
  goalIcon: { width: 44, height: 44, backgroundColor: '#fff', borderRadius: 22,
    borderWidth: 2, borderColor: '#f8c340', alignItems: 'center', justifyContent: 'center' },
  question: { fontFamily: 'Shark', fontSize: 29, color: '#075b9b' },
  goalEyebrow: { fontFamily: 'Knockout', color: '#956000', fontSize: 12, letterSpacing: 0.8 },
  goalName: { fontFamily: 'Shark', color: '#073e79', fontSize: 18 },
  goalHint: { fontFamily: 'Knockout', color: '#245677', fontSize: 13, lineHeight: 17, marginTop: 2 },
  stats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, flexWrap: 'wrap' },
  stat: { fontFamily: 'Knockout', color: '#22618c', fontSize: 12 },
  statValue: { fontFamily: 'Shark', color: '#075b9b', fontSize: 15 },
  statDot: { color: '#e8b232', fontSize: 12 },
});
