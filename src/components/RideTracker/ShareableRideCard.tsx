import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { colors, shadows, borderRadius } from '../../design-system';
import { PlayerRideType } from '../../api/endpoints/player-rides';
import { PARK_DISPLAY_ORDER } from '../../constants/parkWaitTimes';

const REACTION_LABELS: Record<string, string> = {
  '🤯': 'Mind blown', '😂': 'Laughing', '😴': 'Sleepy', '🤢': 'Queasy', '🔥': 'Loved it',
};

interface ShareableRideCardProps {
  ride: PlayerRideType;
  rideCount?: number;
  onShare?: () => void;
}

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
            <Text style={cardStyles.parkName} numberOfLines={1}>{parkName}</Text>
            <Text style={cardStyles.rideName} numberOfLines={3}>{ride.ride_name}</Text>
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
              <Text style={cardStyles.reactionEmoji}>{ride.reaction}</Text>
              <Text style={cardStyles.reactionLabel}>{REACTION_LABELS[ride.reaction] ?? 'My reaction'}</Text>
            </View>
          )}
          <View style={cardStyles.statsRow}>
            <View style={cardStyles.stat}>
              <Text style={cardStyles.statLabel}>RIDE DATE</Text>
              <Text style={cardStyles.statValue}>{dateStr}</Text>
            </View>
            {rideCount != null && rideCount > 1 && (
              <View style={cardStyles.stat}>
                <Text style={cardStyles.statLabel}>TIMES RIDDEN</Text>
                <Text style={cardStyles.statValue}>{rideCount}</Text>
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

const ShareableRideCard: React.FC<ShareableRideCardProps> = ({ ride, rideCount, onShare }) => {
  const viewShotRef = useRef<ViewShot>(null);

  const handleShare = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const uri = await viewShotRef.current?.capture?.();
      if (!uri) return;

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `My ${ride.ride_name} experience on Theme Park Shark! 🦈`,
        });
        onShare?.();
      }
    } catch (e) {
      console.error('Share failed:', e);
    }
  }, [ride, onShare]);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share Ride Card"
        onPress={handleShare}
        style={({ pressed }) => [cardStyles.shareBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
      >
        <Text style={cardStyles.shareBtnText}>Share Ride Card</Text>
      </Pressable>
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile' }}
        style={cardStyles.shotContainer}
      >
        <CardContent ride={ride} rideCount={rideCount} />
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
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily: 'Knockout',
  },
  memoryBadge: { backgroundColor: '#FFD655', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#E6A830' },
  memoryBadgeText: { color: '#664009', fontSize: 9, fontFamily: 'Knockout', letterSpacing: 1 },
  heroRow: { flexDirection: 'row', alignItems: 'center', minHeight: 137, marginBottom: 11 },
  heroCopy: { flex: 1, justifyContent: 'center', paddingRight: 2 },
  heroShark: { width: 112, height: 137, marginRight: -9 },
  parkName: { color: '#FFF0A6', fontSize: 13, fontWeight: '800', marginBottom: 5 },
  rideName: {
    color: '#ffffff',
    fontSize: 29,
    fontWeight: '900',
    fontFamily: 'Shark',
    marginBottom: 8,
    textShadowColor: 'rgba(0,45,100,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingStar: { width: 22, height: 22 },
  ratingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginLeft: 5 },
  detailsPanel: { backgroundColor: '#F3FBFF', borderRadius: 14, padding: 13,
    borderWidth: 1, borderColor: '#B8E5F8' },
  reactionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  reactionEmoji: { fontSize: 20 },
  reactionLabel: { color: '#0B4B83', fontSize: 14, fontWeight: '800' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  stat: { flex: 1 },
  statValue: { color: '#0B4B83', fontSize: 13, fontWeight: '800', marginTop: 3 },
  statLabel: { color: '#39759C', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  note: { color: '#315C7C', fontSize: 12, fontStyle: 'italic', marginTop: 10 },
  watermark: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  watermarkText: { color: '#D6F3FF', fontSize: 9, fontFamily: 'Knockout', letterSpacing: 1.4 },
  watermarkUrl: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
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
    fontWeight: '800',
    fontFamily: 'Knockout',
  },
});

export default ShareableRideCard;
