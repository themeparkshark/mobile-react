import React, { useContext, useRef, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { shadows } from '../../design-system';
import { getPlayerRides, PlayerRideType } from '../../api/endpoints/player-rides';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';
import SharkReactionIcon, { reactionLabel } from './SharkReactionIcon';
import { GameIcon, gameAlert } from '../../ui';
import { ShareFace } from '../../share/FlexShareButton';
import { captureFlex, openShareSheet } from '../../share/capture';
import { campaignUrl, shareMessage } from '../../share/link';
import { OFFSCREEN, StoryShareFrame } from '../../share/StoryShareFrame';
import { LocationStatusContext } from '../../context/LocationProvider';

/** While the player is inside a park, the ride card waits: a shared ride and park would say where a kid is right now. */
export const RIDE_SHARE_HELD_LABEL = 'Share it after you leave the park';

interface ShareableRideCardProps {
  ride: PlayerRideType;
  rideCount?: number;
  /** The share sheet came up and closed (shared or cancelled). The card stays open either way. */
  onShare?: () => void;
  /** Kept on the phone, not in the journal yet: no count to fetch and nothing to share yet. */
  queued?: boolean;
}

/** How long the "Shared!" check stays on the button. */
export const SHARED_STAMP_MS = 2000;

/** "Ridden 1 time", "Ridden 12 times". Exported for tests. */
export function riddenLine(count: number): string {
  return `Ridden ${count.toLocaleString('en-US')} ${count === 1 ? 'time' : 'times'}`;
}

/**
 * The card itself, exactly as it is shared (the in-sheet preview is the same card): no date, no
 * wait, no typed note, no player name, and no brand marks of its own (the story frame carries
 * the one logo, link and QR), sized to its content. There is no other variant, so a date or a
 * typed note can never reach a picture.
 */
const CardContent: React.FC<{ ride: PlayerRideType; rideCount?: number }> = React.memo(({ ride, rideCount }) => {
  const parkName = PARK_DISPLAY_ORDER.find(park => park.id === ride.park_id)?.name ?? 'Theme Park';
  const rating = Math.max(0, Math.min(5, Math.trunc(ride.rating ?? 0)));
  const count = rideCount != null && rideCount > 0 ? rideCount : null;

  return (
    <View style={cardStyles.wrapper}>
      <LinearGradient colors={['#20AAE8', '#0B83C9', '#07569D']} style={[cardStyles.card, cardStyles.cardShared]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={cardStyles.bubbleOne} />
        <View style={cardStyles.bubbleTwo} />
        <View style={cardStyles.bubbleThree} />
        <View style={cardStyles.heroRow}>
          <View style={cardStyles.heroCopy}>
            <Text style={cardStyles.parkName} numberOfLines={2}>{parkName}</Text>
            <Text style={cardStyles.rideName} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.8}>{ride.ride_name}</Text>
            {rating > 0 && (
              <View style={cardStyles.ratingRow}>
                {Array.from({ length: rating }, (_, index) => (
                  <Image key={index} source={require('../../../assets/images/screens/pin-collections/star.png')}
                    style={cardStyles.ratingStar} contentFit="contain" />
                ))}
                <Text style={cardStyles.ratingText}>{rating}/5</Text>
              </View>
            )}
          </View>
          <Image source={require('../../../assets/images/screens/lineplay/queue-recap-shark.png')}
            style={cardStyles.heroShark} contentFit="contain" />
        </View>

        {/* One hero stat, sized to its content like a trophy plate: the big ride count and the
            shark's reaction side by side (no wide panel with one small line in it). */}
        {(!!ride.reaction || !!count) && (
            <View style={cardStyles.heroStat} accessible
              accessibilityLabel={[count ? (count === 1 ? 'First ride' : riddenLine(count)) : null, ride.reaction ? reactionLabel(ride.reaction) : null].filter(Boolean).join('. ')}>
              {count && (
                <View style={cardStyles.heroStatCount}>
                  {/* A first ride leads with the brag, not a lonely "1". */}
                  <Text style={[cardStyles.heroStatNumber, count === 1 && cardStyles.heroStatFirst]} numberOfLines={1} adjustsFontSizeToFit>
                    {count === 1 ? 'FIRST RIDE!' : count.toLocaleString('en-US')}</Text>
                  {count > 1 && <Text style={cardStyles.heroStatLabel}>TIMES RIDDEN</Text>}
                </View>
              )}
              {count && ride.reaction && <View style={cardStyles.heroStatRule} />}
              {ride.reaction && (
                <View style={cardStyles.heroStatReaction}>
                  <SharkReactionIcon reaction={ride.reaction} size={46} />
                  <Text style={cardStyles.heroStatLabel} numberOfLines={1}>{(reactionLabel(ride.reaction) ?? 'My reaction').toUpperCase()}</Text>
                </View>
              )}
            </View>
          )}
      </LinearGradient>
    </View>
  );
});
CardContent.displayName = 'CardContent';

/** A small turning arrow beside the share pill while the ride total loads. Still with Reduce Motion. */
const ButtonSpinner: React.FC<{ still: boolean }> = ({ still }) => {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [still, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <GameIcon name="retry" size={18} />
    </Animated.View>
  );
};

const ShareableRideCard: React.FC<ShareableRideCardProps> = ({ ride, rideCount, onShare, queued = false }) => {
  const storyRef = useRef<View>(null);
  const busy = useRef(false);
  const [sharing, setSharing] = useState(false);
  // A gold check and "Shared!" for a moment after the sheet closes; the card stays open.
  const [shared, setShared] = useState(false);
  useEffect(() => {
    if (!shared) return undefined;
    const t = setTimeout(() => setShared(false), SHARED_STAMP_MS);
    return () => clearTimeout(t);
  }, [shared]);
  const [loadingCount, setLoadingCount] = useState(rideCount == null);
  const [confirmedCount, setConfirmedCount] = useState(rideCount);
  const reducedMotion = useReducedGameMotion();
  const { park } = useContext(LocationStatusContext);
  const inPark = !!park;

  useEffect(() => {
    let current = true;
    setConfirmedCount(rideCount);
    setLoadingCount(rideCount == null && !queued);
    if (rideCount == null && !queued) {
      void getPlayerRides({ ride_id: ride.ride_id, per_page: 1 }).then(result => {
        if (current) setConfirmedCount(result.meta.total);
      }).catch(() => undefined).finally(() => { if (current) setLoadingCount(false); });
    }
    return () => { current = false; };
  }, [ride.ride_id, rideCount, queued]);

  const handleShare = useCallback(async () => {
    if (busy.current || loadingCount || inPark) return;
    if (queued) return;
    busy.current = true;
    setSharing(true);
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        gameAlert('Can’t share right now', 'This phone can’t share right now. Try again later.');
        return;
      }

      const uri = await captureFlex(storyRef, 'story');

      // The same share path as the Share Studio cards (grown-up gate first, then the share sheet).
      // The gate shows above this card's sheet (GrownUpGateSlot). Back on the card after the sheet
      // (even a cancel), with a Shared! check: a kid who backs out lands on their card.
      const outcome = await openShareSheet(uri, shareMessage(campaignUrl('ride_log')), `${ride.ride_name} Ride Card`);
      if (outcome.opened) {
        setShared(true);
        onShare?.();
      }
    } catch {
      gameAlert('Could not make your card', 'Your ride is saved. Try sharing it again.');
    } finally {
      busy.current = false;
      setSharing(false);
    }
  }, [ride, onShare, loadingCount, inPark, queued]);

  return (
    <View>
      {/* The preview is exactly the card that gets shared (no date, no note, no extra marks). */}
      <View style={cardStyles.shotContainer}>
        <CardContent ride={ride} rideCount={confirmedCount} />
      </View>
      {inPark ? (
        // Held in the park: a park icon with the line, so a kid who can't read yet still gets "later".
        <View style={cardStyles.heldRow} accessible accessibilityLabel={RIDE_SHARE_HELD_LABEL}>
          <GameIcon name="map" size={28} />
          <Text style={cardStyles.heldText}>{RIDE_SHARE_HELD_LABEL}</Text>
        </View>
      ) : queued ? (
        // The ride is not in the journal yet, so its total is not known: a calm line, not a button.
        <Text style={cardStyles.shareLater} accessibilityRole="text">Share once it joins your journal</Text>
      ) : (
        // The one share button, the same gold-rimmed pill as every reveal.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share Ride Card"
          accessibilityHint={sharing ? 'Making your card' : loadingCount ? 'Getting your ride total' : undefined}
          accessibilityState={{ disabled: sharing || loadingCount, busy: sharing || loadingCount }}
          disabled={sharing || loadingCount}
          onPress={handleShare}
          style={({ pressed }) => [cardStyles.shareRow, pressed && { transform: [{ scale: reducedMotion ? 1 : 0.96 }] }]}
        >
          {/* While the ride total loads, a small spinner sits beside the same pill. */}
          <View style={cardStyles.sharePillRow}>
            {loadingCount && <ButtonSpinner still={reducedMotion} />}
            {shared && !sharing ? (
              <View style={cardStyles.sharedStamp} accessibilityLiveRegion="polite">
                <GameIcon name="check" size={20} />
                <Text style={cardStyles.sharedText}>Shared!</Text>
              </View>
            ) : <ShareFace size="reveal" dim={sharing || loadingCount} />}
          </View>
        </Pressable>
      )}
      {/* Off screen: the story-size picture that gets shared. */}
      <View style={OFFSCREEN} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {/* Story size with the link and QR. Kid safety: no typed note, no player name, no date. */}
        {!inPark && (
          <StoryShareFrame ref={storyRef} ribbon="MY RIDE!" cta="Track your rides with me!" campaign="ride_log">
            <View style={cardStyles.sharedWidth}><CardContent ride={ride} rideCount={confirmedCount} /></View>
          </StoryShareFrame>
        )}
      </View>
    </View>
  );
};

const cardStyles = StyleSheet.create({
  wrapper: {
    borderRadius: 22,
    overflow: 'hidden',
    ...shadows.xl,
  },
  shotContainer: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  cardShared: { minHeight: 0, paddingBottom: 16 },
  sharedWidth: { width: 320 },
  // The share variant's hero stat: a white plate with a gold rim, as wide as what is on it.
  heroStat: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, minWidth: '62%', backgroundColor: '#FFFFFF',
    borderRadius: 18, paddingVertical: 8, paddingHorizontal: 18, borderWidth: 3, borderBottomWidth: 6,
    borderColor: '#FFCF3B', borderBottomColor: '#D99A00' },
  heroStatCount: { alignItems: 'center', minWidth: 70 },
  heroStatNumber: { color: '#05346E', fontSize: 44, lineHeight: 48, fontFamily: 'Shark' },
  heroStatFirst: { fontSize: 34, lineHeight: 40, paddingHorizontal: 6 },
  heroStatLabel: { color: '#39759C', fontSize: 12, fontFamily: 'Knockout', letterSpacing: 0.8 },
  heroStatRule: { width: 2, alignSelf: 'stretch', backgroundColor: '#D7EEFB', marginVertical: 4 },
  heroStatReaction: { alignItems: 'center', gap: 2, maxWidth: 120 },
  shareRow: { alignItems: 'center', marginTop: 12, marginBottom: 4 },
  heldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, marginBottom: 4,
    backgroundColor: '#DCEFFB', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 2, borderColor: '#B8E5F8' },
  sharePillRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  // The Shared! check takes the pill's place for a moment (about the same size, so nothing jumps).
  sharedStamp: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 52, paddingHorizontal: 22, borderRadius: 26,
    backgroundColor: '#fff6d8', borderWidth: 3, borderColor: '#ffcf3b' },
  sharedText: { fontFamily: 'Shark', fontSize: 20, color: '#05346e' },
  shareLater: { color: '#315C7C', fontSize: 15, fontFamily: 'Knockout', textAlign: 'center', marginTop: 12, marginBottom: 4 },
  heldText: { color: '#0B4B83', fontSize: 16, fontFamily: 'Knockout', flexShrink: 1 },
  card: {
    padding: 18,
    paddingBottom: 14,
    minHeight: 330,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E1F6FF',
  },
  bubbleOne: { position: 'absolute', top: 45, left: -15, width: 64, height: 64,
    borderRadius: 32, borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)' },
  bubbleTwo: { position: 'absolute', top: 124, right: 8, width: 35, height: 35,
    borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.26)' },
  bubbleThree: { position: 'absolute', top: 192, left: 44, width: 17, height: 17,
    borderRadius: 9, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  heroRow: { flexDirection: 'row', alignItems: 'center', minHeight: 137, marginBottom: 11 },
  heroCopy: { flex: 1, justifyContent: 'center', paddingRight: 2 },
  heroShark: { width: 112, height: 137, marginRight: -9 },
  parkName: { color: '#FFF0A6', fontSize: 13, fontFamily: 'Knockout', marginBottom: 5 },
  rideName: {
    color: '#ffffff',
    fontSize: 29,
    fontFamily: 'Shark',
    marginBottom: 8,
    textShadowColor: 'rgba(0,45,100,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingStar: { width: 22, height: 22 },
  ratingText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Knockout', marginLeft: 5 },
});

export default ShareableRideCard;
