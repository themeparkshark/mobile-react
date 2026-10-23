import React, { useContext, useRef, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
import { OFFSCREEN, StoryShareFrame } from '../../share/StoryShareFrame';
import { LocationStatusContext } from '../../context/LocationProvider';

/** While the player is inside a park, the ride card waits: a shared ride and park would say where a kid is right now. */
export const RIDE_SHARE_HELD_LABEL = 'Share it after you leave the park';

interface ShareableRideCardProps {
  ride: PlayerRideType;
  rideCount?: number;
  onShare?: () => void;
  /** The card sits in an RN <Modal>: close it (useModalHandoff) before the grown-up gate. */
  beforeShare?: () => Promise<void>;
}

/** "Ridden 1 time", "Ridden 12 times". Exported for tests. */
export function riddenLine(count: number): string {
  return `Ridden ${count.toLocaleString('en-US')} ${count === 1 ? 'time' : 'times'}`;
}

/**
 * The card itself. 'app' is the full log shown in place (date and all). 'share' is the copy on
 * the shared story picture: no date, no typed note, no player name, and no brand marks of its
 * own (the story frame carries the one logo, link and QR), sized to its content.
 */
const CardContent: React.FC<{ ride: PlayerRideType; rideCount?: number; variant?: 'app' | 'share' }> = React.memo(({ ride, rideCount, variant = 'app' }) => {
  const shared = variant === 'share';
  const date = new Date(ride.rode_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const parkName = PARK_DISPLAY_ORDER.find(park => park.id === ride.park_id)?.name ?? 'Theme Park';
  const rating = Math.max(0, Math.min(5, Math.trunc(ride.rating ?? 0)));
  const count = rideCount != null && rideCount > 0 ? rideCount : null;

  return (
    <View style={cardStyles.wrapper}>
      <LinearGradient colors={['#20AAE8', '#0B83C9', '#07569D']} style={[cardStyles.card, shared && cardStyles.cardShared]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={cardStyles.bubbleOne} />
        <View style={cardStyles.bubbleTwo} />
        <View style={cardStyles.bubbleThree} />
        {!shared && (
          <View style={cardStyles.topBar}>
            <Text style={cardStyles.brandText}>THEME PARK SHARK</Text>
            <View style={cardStyles.memoryBadge}><Text style={cardStyles.memoryBadgeText}>RIDE MEMORY</Text></View>
          </View>
        )}

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

        {shared ? (
          // One hero stat, sized to its content like a trophy plate: the big ride count and the
          // shark's reaction side by side (no wide panel with one small line in it).
          (!!ride.reaction || !!count) && (
            <View style={cardStyles.heroStat} accessible
              accessibilityLabel={[count ? riddenLine(count) : null, ride.reaction ? reactionLabel(ride.reaction) : null].filter(Boolean).join('. ')}>
              {count && (
                <View style={cardStyles.heroStatCount}>
                  <Text style={cardStyles.heroStatNumber} numberOfLines={1} adjustsFontSizeToFit>{count.toLocaleString('en-US')}</Text>
                  <Text style={cardStyles.heroStatLabel}>{count === 1 ? 'TIME RIDDEN' : 'TIMES RIDDEN'}</Text>
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
          )
        ) : (
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
              {count && (
                <View style={cardStyles.stat}>
                  <Text style={cardStyles.statLabel}>TIMES RIDDEN</Text>
                  <Text style={cardStyles.statValue}>{count.toLocaleString('en-US')}</Text>
                </View>
              )}
              {ride.wait_time_minutes != null && (
                <View style={cardStyles.stat}>
                  <Text style={cardStyles.statLabel}>WAITED</Text>
                  <Text style={cardStyles.statValue}>{ride.wait_time_minutes} min</Text>
                </View>
              )}
            </View>
            {/* The player's typed note never goes on a shared picture (kid safety): it stays in the log. */}
          </View>
        )}
        {!shared && (
          <View style={cardStyles.watermark}>
            <Text style={cardStyles.watermarkText}>MY SHARK STORY</Text>
            <Text style={cardStyles.watermarkUrl}>themeparkshark.com</Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
});
CardContent.displayName = 'CardContent';


const ShareableRideCard: React.FC<ShareableRideCardProps> = ({ ride, rideCount, onShare, beforeShare }) => {
  const storyRef = useRef<View>(null);
  const busy = useRef(false);
  const [sharing, setSharing] = useState(false);
  const [loadingCount, setLoadingCount] = useState(rideCount == null);
  const [confirmedCount, setConfirmedCount] = useState(rideCount);
  const reducedMotion = useReducedGameMotion();
  const { park } = useContext(LocationStatusContext);
  const inPark = !!park;

  useEffect(() => {
    let current = true;
    setConfirmedCount(rideCount);
    setLoadingCount(rideCount == null);
    if (rideCount == null) {
      void getPlayerRides({ ride_id: ride.ride_id, per_page: 1 }).then(result => {
        if (current) setConfirmedCount(result.meta.total);
      }).catch(() => undefined).finally(() => { if (current) setLoadingCount(false); });
    }
    return () => { current = false; };
  }, [ride.ride_id, rideCount]);

  const handleShare = useCallback(async () => {
    if (busy.current || loadingCount || inPark) return;
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
      // The picture is made: step out of the modal so the grown-up gate can show.
      await beforeShare?.();

      // The same share path as the Share Studio cards (grown-up gate first, then the iOS share sheet).
      await openShareSheet(uri);
      onShare?.();
    } catch {
      gameAlert('Could not make your card', 'Your ride is saved. Try sharing it again.');
    } finally {
      busy.current = false;
      setSharing(false);
    }
  }, [ride, onShare, beforeShare, loadingCount, inPark]);

  return (
    <View>
      {/* The preview is exactly the card that gets shared (no date, no note, no extra marks). */}
      <View style={cardStyles.shotContainer}>
        <CardContent ride={ride} rideCount={confirmedCount} variant="share" />
      </View>
      {inPark ? (
        // Held in the park: a park icon with the line, so a kid who can't read yet still gets "later".
        <View style={cardStyles.heldRow} accessible accessibilityLabel={RIDE_SHARE_HELD_LABEL}>
          <GameIcon name="map" size={28} />
          <Text style={cardStyles.heldText}>{RIDE_SHARE_HELD_LABEL}</Text>
        </View>
      ) : (
        // The one share button, the same gold-rimmed pill as every reveal.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share Ride Card"
          accessibilityHint={sharing ? 'Making your card' : loadingCount ? 'Loading your ride total' : undefined}
          accessibilityState={{ disabled: sharing || loadingCount, busy: sharing || loadingCount }}
          disabled={sharing || loadingCount}
          onPress={handleShare}
          style={({ pressed }) => [cardStyles.shareRow, pressed && { transform: [{ scale: reducedMotion ? 1 : 0.96 }] }]}
        >
          <ShareFace size="reveal" dim={sharing || loadingCount} />
        </Pressable>
      )}
      {/* Off screen: the story-size picture that gets shared. */}
      <View style={OFFSCREEN} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {/* Story size with the link and QR. Kid safety: no typed note, no player name, no date. */}
        {!inPark && (
          <StoryShareFrame ref={storyRef} ribbon="MY RIDE!" cta="Track your rides with me!" campaign="ride_log">
            <View style={cardStyles.sharedWidth}><CardContent ride={ride} rideCount={confirmedCount} variant="share" /></View>
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
  heroStat: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFFFFF',
    borderRadius: 18, paddingVertical: 8, paddingHorizontal: 18, borderWidth: 3, borderBottomWidth: 6,
    borderColor: '#FFCF3B', borderBottomColor: '#D99A00' },
  heroStatCount: { alignItems: 'center', minWidth: 70 },
  heroStatNumber: { color: '#05346E', fontSize: 44, lineHeight: 48, fontFamily: 'Shark' },
  heroStatLabel: { color: '#39759C', fontSize: 12, fontFamily: 'Knockout', letterSpacing: 0.8 },
  heroStatRule: { width: 2, alignSelf: 'stretch', backgroundColor: '#D7EEFB', marginVertical: 4 },
  heroStatReaction: { alignItems: 'center', gap: 2, maxWidth: 120 },
  shareRow: { alignItems: 'center', marginTop: 12, marginBottom: 4 },
  heldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, marginBottom: 4,
    backgroundColor: '#DCEFFB', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 2, borderColor: '#B8E5F8' },
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
  watermark: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  watermarkText: { color: '#D6F3FF', fontSize: 9, fontFamily: 'Knockout', letterSpacing: 1.4 },
  watermarkUrl: { color: '#FFFFFF', fontSize: 10, fontFamily: 'Knockout' },
});

export default ShareableRideCard;
