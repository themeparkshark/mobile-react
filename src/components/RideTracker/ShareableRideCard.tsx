import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { colors, shadows, borderRadius } from '../../design-system';
import { PlayerRideType } from '../../api/endpoints/player-rides';

// Park gradient themes
const PARK_GRADIENTS: Record<number, [string, string, string]> = {
  // WDW
  2: ['#1a237e', '#283593', '#3949ab'],  // Magic Kingdom - Royal Blue
  4: ['#0d47a1', '#1565c0', '#42a5f5'],  // EPCOT - Spaceship Blue
  5: ['#b71c1c', '#c62828', '#e53935'],  // Hollywood Studios - Red
  6: ['#1b5e20', '#2e7d32', '#43a047'],  // Animal Kingdom - Green
  // DLR
  8: ['#4a148c', '#6a1b9a', '#8e24aa'],  // Disneyland - Purple
  13: ['#e65100', '#ef6c00', '#f57c00'], // California Adventure - Orange
  // Universal
  3: ['#311b92', '#4527a0', '#5e35b1'],  // Universal Studios FL - Deep Purple
  7: ['#006064', '#00838f', '#0097a7'],  // Islands of Adventure - Teal
  10: ['#004d40', '#00695c', '#00897b'], // Epic Universe - Epic Teal
  9: ['#01579b', '#0277bd', '#0288d1'],  // Volcano Bay - Water Blue
  1: ['#263238', '#37474f', '#455a64'],  // Universal Hollywood - Slate
};

const DEFAULT_GRADIENT: [string, string, string] = ['#0a1628', '#142040', '#1a2a50'];

interface ShareableRideCardProps {
  ride: PlayerRideType;
  rideCount?: number;
  onShare?: () => void;
}

// The card itself (captured by ViewShot)
const CardContent: React.FC<{ ride: PlayerRideType; rideCount?: number }> = React.memo(({ ride, rideCount }) => {
  const gradient = PARK_GRADIENTS[ride.park_id] || DEFAULT_GRADIENT;
  const date = new Date(ride.rode_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const sharks = ride.rating
    ? Array.from({ length: 5 }, (_, i) => i < ride.rating! ? '🦈' : '').join('')
    : '';

  return (
    <View style={cardStyles.wrapper}>
      <LinearGradient colors={gradient} style={cardStyles.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {/* Top branding */}
        <View style={cardStyles.topBar}>
          <Text style={cardStyles.brandText}>THEME PARK SHARK</Text>
          <Text style={cardStyles.brandShark}>🦈</Text>
        </View>

        {/* Ride name */}
        <Text style={cardStyles.rideName} numberOfLines={2}>{ride.ride_name}</Text>

        {/* Rating */}
        {sharks ? (
          <View style={cardStyles.ratingRow}>
            <Text style={cardStyles.sharks}>{sharks}</Text>
          </View>
        ) : null}

        {/* Reaction */}
        {ride.reaction && (
          <Text style={cardStyles.reaction}>{ride.reaction}</Text>
        )}

        {/* Stats row */}
        <View style={cardStyles.statsRow}>
          <View style={cardStyles.stat}>
            <Text style={cardStyles.statValue}>{dateStr}</Text>
            <Text style={cardStyles.statLabel}>DATE</Text>
          </View>
          {rideCount && rideCount > 1 && (
            <View style={cardStyles.stat}>
              <Text style={cardStyles.statValue}>{rideCount}x</Text>
              <Text style={cardStyles.statLabel}>TOTAL RIDES</Text>
            </View>
          )}
          {ride.wait_time_minutes != null && (
            <View style={cardStyles.stat}>
              <Text style={cardStyles.statValue}>{ride.wait_time_minutes}m</Text>
              <Text style={cardStyles.statLabel}>WAITED</Text>
            </View>
          )}
        </View>

        {/* Note */}
        {ride.note && (
          <Text style={cardStyles.note} numberOfLines={2}>"{ride.note}"</Text>
        )}

        {/* Bottom watermark */}
        <View style={cardStyles.watermark}>
          <Text style={cardStyles.watermarkText}>Track your rides at themeparkshark.com</Text>
        </View>

        {/* Decorative shark watermark */}
        <Text style={cardStyles.bgShark}>🦈</Text>
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
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile' }}
        style={cardStyles.shotContainer}
      >
        <CardContent ride={ride} rideCount={rideCount} />
      </ViewShot>

      <Pressable
        onPress={handleShare}
        style={({ pressed }) => [cardStyles.shareBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
      >
        <Text style={cardStyles.shareBtnText}>📤 Share Ride Card</Text>
      </Pressable>
    </View>
  );
};

const cardStyles = StyleSheet.create({
  wrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    ...shadows.xl,
  },
  shotContainer: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  card: {
    padding: 24,
    paddingBottom: 16,
    minHeight: 320,
    position: 'relative',
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  brandText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    fontFamily: 'Knockout',
  },
  brandShark: {
    fontSize: 20,
  },
  rideName: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    fontFamily: 'Knockout',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  ratingRow: {
    marginBottom: 8,
  },
  sharks: {
    fontSize: 28,
  },
  reaction: {
    fontSize: 48,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 16,
    marginBottom: 12,
  },
  stat: {},
  statValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 2,
  },
  note: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
  },
  watermark: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  watermarkText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
  },
  bgShark: {
    position: 'absolute',
    right: -20,
    bottom: 40,
    fontSize: 120,
    opacity: 0.06,
    transform: [{ rotate: '-20deg' }],
  },
  shareBtn: {
    backgroundColor: colors.tertiary,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
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
export { PARK_GRADIENTS };
