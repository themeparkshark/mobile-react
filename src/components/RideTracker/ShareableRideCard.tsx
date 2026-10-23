import { shareFileExternal } from '../../services/external';
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { colors, shadows, borderRadius } from '../../design-system';
import { getPlayerRides, PlayerRideType } from '../../api/endpoints/player-rides';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';
import SharkReactionIcon, { reactionLabel } from './SharkReactionIcon';
import { gameAlert } from '../../ui';
import { captureFlex } from '../../share/capture';
import { FLEX_SIZE } from '../../share/formats';
import { SHARE_LINK_DISPLAY } from '../../share/link';
import { QR_BY_CAMPAIGN } from '../../share/campaignQr';

interface ShareableRideCardProps {
  ride: PlayerRideType;
  rideCount?: number;
  onShare?: () => void;
}

// The card itself (shown in place, and inside the shared story picture)
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
          {/* The player's typed note never goes on a shared picture (kid safety): it stays in the log. */}
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

/**
 * The picture that gets shared: story size (9:16, saved at 1080x1920), the same card,
 * and the TPS link with a QR that opens the app's download page. Kid safety: no typed
 * note and no player name, only the ride, the stars and the shark's reaction.
 */
const StoryFrame = React.memo(React.forwardRef<View, { ride: PlayerRideType; rideCount?: number }>(({ ride, rideCount }, ref) => (
  <View ref={ref} collapsable={false} style={storyStyles.frame}>
    <LinearGradient colors={['#20AAE8', '#0B83C9', '#05346E']} style={StyleSheet.absoluteFill} />
    <Text style={storyStyles.kicker}>MY RIDE MEMORY</Text>
    <View style={storyStyles.cardSlot}><CardContent ride={ride} rideCount={rideCount} /></View>
    <View style={storyStyles.footer}>
      <View style={storyStyles.footerCopy}>
        <Text style={storyStyles.cta}>Track your rides with me!</Text>
        <Text style={storyStyles.link}>{SHARE_LINK_DISPLAY}</Text>
      </View>
      <Image source={QR_BY_CAMPAIGN.ride_log} style={storyStyles.qr} contentFit="contain" />
    </View>
  </View>
)));
StoryFrame.displayName = 'StoryFrame';

const ShareableRideCard: React.FC<ShareableRideCardProps> = ({ ride, rideCount, onShare }) => {
  const storyRef = useRef<View>(null);
  const busy = useRef(false);
  const [sharing, setSharing] = useState(false);
  const [loadingCount, setLoadingCount] = useState(rideCount == null);
  const [confirmedCount, setConfirmedCount] = useState(rideCount);
  const reducedMotion = useReducedGameMotion();

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

      const uri = await captureFlex(storyRef, 'story');

      await shareFileExternal(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: `My ${ride.ride_name} experience on Theme Park Shark!`,
      });
      onShare?.();
    } catch {
      gameAlert('Could not make your card', 'Your ride is saved. Try sharing it again.');
    } finally {
      busy.current = false;
      setSharing(false);
    }
  }, [ride, onShare, loadingCount]);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share Ride Card"
        accessibilityState={{ disabled: sharing || loadingCount, busy: sharing || loadingCount }}
        disabled={sharing || loadingCount}
        onPress={handleShare}
        style={({ pressed }) => [cardStyles.shareBtn, pressed && { opacity: 0.85,
          transform: [{ scale: reducedMotion ? 1 : 0.97 }] }]}
      >
        <Text style={cardStyles.shareBtnText}>{sharing ? 'Making your card…'
          : loadingCount ? 'Loading your ride total…' : 'Share Ride Card'}</Text>
      </Pressable>
      <View style={cardStyles.shotContainer}>
        <CardContent ride={ride} rideCount={confirmedCount} />
      </View>
      {/* Off screen: the story-size picture that gets shared. */}
      <View style={storyStyles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <StoryFrame ref={storyRef} ride={ride} rideCount={confirmedCount} />
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
  shareBtn: {
    backgroundColor: colors.tertiary,
    borderRadius: borderRadius.lg,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 10,
    ...shadows.md,
  },
  shareBtnText: {
    color: '#000',
    fontSize: 16,
    fontFamily: 'Knockout',
  },
});

const storyStyles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -4000, top: 0 },
  frame: { ...FLEX_SIZE.story, overflow: 'hidden', paddingHorizontal: 20, paddingTop: 70, paddingBottom: 56, justifyContent: 'space-between' },
  kicker: { color: '#FFF0A6', fontSize: 22, fontFamily: 'Shark', textAlign: 'center', letterSpacing: 1,
    textShadowColor: 'rgba(0,45,100,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  cardSlot: { width: '100%' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(3,40,92,0.55)', borderRadius: 16, padding: 12 },
  footerCopy: { flex: 1 },
  cta: { color: '#FFCF3B', fontSize: 19, fontFamily: 'Shark' },
  link: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Knockout', marginTop: 3 },
  qr: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#FFFFFF' },
});

export default ShareableRideCard;
