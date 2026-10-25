import { shareFileExternal } from '../../services/external';
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { colors, shadows, borderRadius } from '../../design-system';
import { getPlayerRides, PlayerRideType } from '../../api/endpoints/player-rides';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';
import SharkReactionIcon, { reactionLabel } from './SharkReactionIcon';
import { GameIcon, gameAlert } from '../../ui';

interface ShareableRideCardProps {
  ride: PlayerRideType;
  rideCount?: number;
  /** The share sheet came up and closed (shared or cancelled). The card stays open either way. */
  onShare?: () => void;
  /** Kept on the phone, not in the journal yet: no count to fetch and nothing to share yet. */
  queued?: boolean;
}

/** How long the "Shared!" check stays on the button. Shown only when iOS says it really went. */
export const SHARED_STAMP_MS = 2000;

// The card itself (captured by ViewShot)
const CardContent: React.FC<{ ride: PlayerRideType; rideCount?: number }> = React.memo(({ ride, rideCount }) => {
  const date = new Date(ride.rode_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const parkName = PARK_DISPLAY_ORDER.find(park => park.id === ride.park_id)?.name ?? 'Theme Park';
  const rating = Math.max(0, Math.min(5, Math.trunc(ride.rating ?? 0)));

  return (
    <View style={cardStyles.wrapper}>
      <LinearGradient colors={['#20AAE8', '#0B83C9', '#07569D']} style={cardStyles.card}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={cardStyles.bubbleOne} />
        <View style={cardStyles.bubbleTwo} />
        <View style={cardStyles.bubbleThree} />
        <View style={cardStyles.topBar}>
          <Text style={cardStyles.brandText}>THEME PARK SHARK</Text>
          <View style={cardStyles.memoryBadge}><Text style={cardStyles.memoryBadgeText}>RIDE MEMORY</Text></View>
        </View>

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

        <View style={cardStyles.detailsPanel}>
          {ride.reaction && (
            <View style={cardStyles.reactionRow}>
              <SharkReactionIcon reaction={ride.reaction} size={28} />
              <Text style={cardStyles.reactionLabel}>{reactionLabel(ride.reaction) ?? 'My reaction'}</Text>
            </View>
          )}
          <View style={cardStyles.statsRow}>
            <View style={cardStyles.stat}>
              <Text style={cardStyles.statLabel}>RIDE DATE</Text>
              <Text style={cardStyles.statValue}>{dateStr}</Text>
            </View>
            {rideCount != null && rideCount > 0 && (
              <View style={cardStyles.stat}>
                <Text style={cardStyles.statLabel}>TIMES RIDDEN</Text>
                <Text style={cardStyles.statValue}>{rideCount.toLocaleString()}×</Text>
              </View>
            )}
            {ride.wait_time_minutes != null && (
              <View style={cardStyles.stat}>
                <Text style={cardStyles.statLabel}>WAITED</Text>
                <Text style={cardStyles.statValue}>{ride.wait_time_minutes} min</Text>
              </View>
            )}
          </View>
          {ride.note && <Text style={cardStyles.note} numberOfLines={2}>“{ride.note}”</Text>}
        </View>
        <View style={cardStyles.watermark}>
          <Text style={cardStyles.watermarkText}>MY SHARK STORY</Text>
          <Text style={cardStyles.watermarkUrl}>themeparkshark.com</Text>
        </View>
      </LinearGradient>
    </View>
  );
});
CardContent.displayName = 'CardContent';

/** A small turning arrow inside the share button while the ride total loads. Still with Reduce Motion. */
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
  const viewShotRef = useRef<ViewShot>(null);
  const busy = useRef(false);
  const [sharing, setSharing] = useState(false);
  // A gold check and "Shared!" for a moment, only when the share really went (never after a cancel).
  const [shared, setShared] = useState(false);
  useEffect(() => {
    if (!shared) return undefined;
    const t = setTimeout(() => setShared(false), SHARED_STAMP_MS);
    return () => clearTimeout(t);
  }, [shared]);
  const [loadingCount, setLoadingCount] = useState(rideCount == null);
  const [confirmedCount, setConfirmedCount] = useState(rideCount);
  const reducedMotion = useReducedGameMotion();

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
    if (busy.current || loadingCount) return;
    busy.current = true;
    setSharing(true);
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        gameAlert('Can’t share right now', 'This phone can’t share right now. Try again later.');
        return;
      }

      const uri = await viewShotRef.current?.capture?.();
      if (!uri) throw new Error('Card capture unavailable');

      const outcome = await shareFileExternal(uri, {
        mimeType: 'image/png',
        dialogTitle: `My ${ride.ride_name} experience on Theme Park Shark!`,
      }, `${ride.ride_name} Ride Card`);
      // Back on the card after the sheet (even a cancel): a kid who backs out lands on their card,
      // with the plain Share Ride Card button again. The check is only for a share that went.
      if (outcome === 'shared') setShared(true);
      if (outcome === 'shared' || outcome === 'closed') onShare?.();
    } catch {
      gameAlert('Could not make your card', 'Your ride is saved. Try sharing it again.');
    } finally {
      busy.current = false;
      setSharing(false);
    }
  }, [ride, onShare, loadingCount]);

  return (
    <View>
      {queued ? (
        // The ride is not in the journal yet, so its total is not known: a calm line, not a button.
        <Text style={cardStyles.shareLater} accessibilityRole="text">Share once it joins your journal</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share Ride Card"
          accessibilityState={{ disabled: sharing || loadingCount, busy: sharing || loadingCount }}
          disabled={sharing || loadingCount}
          onPress={handleShare}
          style={({ pressed }) => [cardStyles.shareBtn, pressed && { opacity: 0.85,
            transform: [{ scale: reducedMotion ? 1 : 0.97 }] }]}
        >
          {/* While the ride total loads, a small spinner sits inside the same button shape. */}
          <View style={cardStyles.shareBtnRow}>
            {loadingCount && <ButtonSpinner still={reducedMotion} />}
            {shared && !sharing && <GameIcon name="check" size={20} />}
            <Text style={[cardStyles.shareBtnText, loadingCount && { opacity: 0.6 }]}>
              {sharing ? 'Making your card…' : shared ? 'Shared!' : 'Share Ride Card'}</Text>
          </View>
        </Pressable>
      )}
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile' }}
        style={cardStyles.shotContainer}
      >
        <CardContent ride={ride} rideCount={confirmedCount} />
      </ViewShot>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: 'Knockout',
  },
  memoryBadge: { backgroundColor: '#FFD655', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#E6A830' },
  memoryBadgeText: { color: '#664009', fontSize: 9, fontFamily: 'Knockout', letterSpacing: 1 },
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
  detailsPanel: { backgroundColor: '#F3FBFF', borderRadius: 14, padding: 13,
    borderWidth: 1, borderColor: '#B8E5F8' },
  reactionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  reactionLabel: { color: '#0B4B83', fontSize: 14, fontFamily: 'Knockout' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  stat: { flex: 1 },
  statValue: { color: '#0B4B83', fontSize: 13, fontFamily: 'Knockout', marginTop: 3 },
  statLabel: { color: '#39759C', fontSize: 9, fontFamily: 'Knockout', letterSpacing: 0.5 },
  note: { color: '#315C7C', fontSize: 12, fontFamily: 'Knockout', fontStyle: 'italic', marginTop: 10 },
  watermark: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  watermarkText: { color: '#D6F3FF', fontSize: 9, fontFamily: 'Knockout', letterSpacing: 1.4 },
  watermarkUrl: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Knockout' },
  shareBtn: {
    backgroundColor: colors.tertiary,
    borderRadius: borderRadius.lg,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 10,
    ...shadows.md,
  },
  shareBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareLater: { color: '#315C7C', fontSize: 15, fontFamily: 'Knockout', textAlign: 'center', marginBottom: 10 },
  shareBtnText: {
    color: '#000',
    fontSize: 16,
    fontFamily: 'Knockout',
  },
});

export default ShareableRideCard;
