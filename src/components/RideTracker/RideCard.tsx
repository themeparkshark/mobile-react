import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PlayerRideType } from '../../api/endpoints/player-rides';
import SharkRating from './SharkRating';
import RideTypeIcon from './RideTypeIcon';
import { colors } from '../../design-system';

interface RideCardProps {
  ride: PlayerRideType;
  onPress?: () => void;
  onShare?: (ride: PlayerRideType) => void;
}

const RideCard: React.FC<RideCardProps> = React.memo(({ ride, onPress, onShare }) => {
  const date = new Date(ride.rode_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={styles.typeRow}>
          <RideTypeIcon type={ride.ride_type} size={18} />
          <Text style={styles.rideName} numberOfLines={1}>{ride.ride_name}</Text>
        </View>
        <View style={styles.headerRight}>
          {onShare && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onShare(ride);
              }}
              hitSlop={8}
              style={styles.shareIcon}
            >
              <Text style={{ fontSize: 16 }}>📤</Text>
            </Pressable>
          )}
          {ride.reaction && <Text style={styles.reaction}>{ride.reaction}</Text>}
        </View>
      </View>

      <View style={styles.body}>
        {ride.rating != null && ride.rating > 0 && (
          <SharkRating rating={ride.rating} size={18} readonly />
        )}
        <View style={styles.meta}>
          <Text style={styles.dateText}>{dateStr} • {timeStr}</Text>
          {ride.wait_time_minutes != null && (
            <Text style={styles.waitText}>{ride.wait_time_minutes} min wait</Text>
          )}
        </View>
      </View>

      {ride.note ? (
        <Text style={styles.note} numberOfLines={2}>"{ride.note}"</Text>
      ) : null}
    </Pressable>
  );
});

RideCard.displayName = 'RideCard';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgMedium,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  reaction: {
    fontSize: 22,
  },
  body: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    alignItems: 'flex-end',
  },
  dateText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  waitText: {
    fontSize: 11,
    color: colors.tertiary,
    marginTop: 2,
  },
  note: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
  },
});

export default RideCard;
