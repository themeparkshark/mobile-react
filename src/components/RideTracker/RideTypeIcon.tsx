import React from 'react';
import { Text, StyleSheet } from 'react-native';

const RIDE_TYPE_ICONS: Record<string, string> = {
  coaster: '🎢',
  dark_ride: '🌑',
  flat_ride: '🎠',
  water_ride: '💦',
  show: '🎭',
  walk_through: '🚶',
  transport: '🚂',
  other: '⭐',
};

const RIDE_TYPE_LABELS: Record<string, string> = {
  coaster: 'Coaster',
  dark_ride: 'Dark Ride',
  flat_ride: 'Flat Ride',
  water_ride: 'Water Ride',
  show: 'Show',
  walk_through: 'Walk-Through',
  transport: 'Transport',
  other: 'Attraction',
};

interface RideTypeIconProps {
  type: string;
  size?: number;
  showLabel?: boolean;
}

const RideTypeIcon: React.FC<RideTypeIconProps> = React.memo(({ type, size = 20, showLabel = false }) => {
  const icon = RIDE_TYPE_ICONS[type] || '⭐';
  const label = RIDE_TYPE_LABELS[type] || 'Attraction';

  return (
    <>
      <Text style={{ fontSize: size }}>{icon}</Text>
      {showLabel && <Text style={styles.label}>{label}</Text>}
    </>
  );
});

RideTypeIcon.displayName = 'RideTypeIcon';

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 4,
  },
});

export { RIDE_TYPE_ICONS, RIDE_TYPE_LABELS };
export default RideTypeIcon;
