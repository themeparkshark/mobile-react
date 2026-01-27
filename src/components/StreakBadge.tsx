import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import config from '../config';

interface Props {
  streak: number;
  multiplier: number;
  atRisk?: boolean;
}

/**
 * Badge showing current streak and bonus multiplier.
 * Styled to match app's AAA quality standards.
 */
export default function StreakBadge({ streak, multiplier, atRisk }: Props) {
  if (streak <= 0) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 14,
            color: 'rgba(255, 255, 255, 0.5)',
            textTransform: 'uppercase',
          }}
        >
          Start your streak!
        </Text>
      </View>
    );
  }

  // Determine badge color based on streak length
  const getBadgeColor = () => {
    if (streak >= 100) return '#FFD700'; // Gold for 100+
    if (streak >= 30) return '#9C27B0'; // Purple for 30+
    if (streak >= 7) return config.secondary; // Blue for 7+
    return '#4CAF50'; // Green for 1-6
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        opacity: atRisk ? 0.85 : 1,
      }}
    >
      {/* Streak Badge */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: getBadgeColor(),
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.3)',
          shadowColor: '#000',
          shadowOffset: { width: 2, height: 2 },
          shadowRadius: 0,
          shadowOpacity: 0.3,
        }}
      >
        {/* Fire emoji or custom icon */}
        <Text
          style={{
            fontSize: 16,
            marginRight: 4,
          }}
        >
          🔥
        </Text>
        
        {/* Streak Count */}
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 18,
            color: 'white',
            textShadowColor: 'rgba(0, 0, 0, 0.5)',
            textShadowOffset: { width: 1, height: 1 },
            textShadowRadius: 0,
          }}
        >
          {streak}
        </Text>
      </View>

      {/* Multiplier Badge */}
      {multiplier > 1 && (
        <View
          style={{
            marginLeft: 6,
            backgroundColor: config.tertiary,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: 'rgba(0, 0, 0, 0.2)',
            shadowColor: '#000',
            shadowOffset: { width: 1, height: 1 },
            shadowRadius: 0,
            shadowOpacity: 0.3,
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 14,
              color: config.primary,
              fontWeight: 'bold',
            }}
          >
            {multiplier}x
          </Text>
        </View>
      )}

      {/* At Risk Warning */}
      {atRisk && (
        <View
          style={{
            marginLeft: 6,
            backgroundColor: config.red,
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: 'white',
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 14,
              color: 'white',
              fontWeight: 'bold',
            }}
          >
            !
          </Text>
        </View>
      )}
    </View>
  );
}
