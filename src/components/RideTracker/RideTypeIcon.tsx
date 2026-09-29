import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

const RIDE_TYPE_ICONS: Record<string, number> = {
  coaster: 0,
  dark_ride: 1,
  flat_ride: 2,
  water_ride: 3,
  show: 4,
  walk_through: 5,
  transport: 6,
  other: 7,
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
  const icon = RIDE_TYPE_ICONS[type] ?? RIDE_TYPE_ICONS.other;
  const label = RIDE_TYPE_LABELS[type] || 'Attraction';

  return (
    <>
      <View accessible={false} pointerEvents="none"
        style={{ width: size, height: size, overflow: 'hidden' }}>
        <Image source={require('../../../assets/images/screens/profile/ride-types-polished-v1.png')}
          contentFit="fill" style={{ position: 'absolute', width: size * 4, height: size * 2,
            left: -(icon % 4) * size, top: -Math.floor(icon / 4) * size }} />
      </View>
      {showLabel && <Text style={styles.label}>{label}</Text>}
    </>
  );
});

RideTypeIcon.displayName = 'RideTypeIcon';

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontFamily: 'Knockout',
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 4,
  },
});

export { RIDE_TYPE_ICONS, RIDE_TYPE_LABELS };
export default RideTypeIcon;
