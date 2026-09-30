import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PlayerRideType } from '../../api/endpoints/player-rides';
import SharkRating from './SharkRating';
import RideTypeIcon from './RideTypeIcon';
import SharkReactionIcon from './SharkReactionIcon';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

interface RideCardProps {
  ride: PlayerRideType;
  onPress?: () => void;
  onShare?: (ride: PlayerRideType) => void;
}

const RideCard: React.FC<RideCardProps> = React.memo(({ ride, onPress, onShare }) => {
  const date = new Date(ride.rode_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const reducedMotion = useReducedGameMotion();

  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${ride.ride_name}. ${dateStr}. Open ride details.` : undefined}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9,
        transform: [{ scale: reducedMotion ? 1 : 0.98 }] }]}>
      <View style={styles.header}>
        <View style={styles.typeRow}>
          <RideTypeIcon type={ride.ride_type} size={26} />
          <Text style={styles.rideName} numberOfLines={2}>{ride.ride_name}</Text>
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
              accessibilityRole="button" accessibilityLabel={`Share your ${ride.ride_name} memory`}
              style={styles.shareIcon}
            >
              <Text style={{ fontFamily: 'Knockout', color: '#174D76', fontSize: 13 }}>SHARE</Text>
            </Pressable>
          )}
          {ride.reaction && <SharkReactionIcon reaction={ride.reaction} size={32} />}
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C8E3F5',
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
    minWidth: 44,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E5F4FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideName: {
    fontSize: 16,
    fontFamily: 'Shark',
    color: '#174D76',
    flex: 1,
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
    fontFamily: 'Knockout',
    color: '#46617A',
  },
  waitText: {
    fontSize: 11,
    fontFamily: 'Knockout',
    color: '#745012',
    marginTop: 2,
  },
  note: {
    fontSize: 13, fontFamily: 'Knockout',
    color: '#46617A',
    fontStyle: 'italic',
    marginTop: 8,
  },
});

export default RideCard;
