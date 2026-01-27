import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import config from '../config';

interface Props {
  currentLevel: number;
  currentXP: number;
  xpToNextLevel: number;
  title?: string;
  compact?: boolean;
}

/**
 * XP Level progress bar with level badge.
 * Shows current level and progress to next level.
 */
export default function XPLevelBar({
  currentLevel,
  currentXP,
  xpToNextLevel,
  title,
  compact = false,
}: Props) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const percentage = xpToNextLevel > 0 ? (currentXP / xpToNextLevel) * 100 : 0;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: percentage,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  const getLevelColor = (level: number): string => {
    if (level >= 50) return '#FFD700'; // Gold - legendary
    if (level >= 30) return '#9C27B0'; // Purple - epic
    if (level >= 20) return '#FF9800'; // Orange - rare
    if (level >= 10) return '#2196F3'; // Blue - uncommon
    return '#4CAF50'; // Green - common
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  if (compact) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {/* Level Badge */}
        <View
          style={{
            backgroundColor: getLevelColor(currentLevel),
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: 'rgba(255, 255, 255, 0.3)',
            marginRight: 8,
          }}
        >
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: 14,
              color: 'white',
            }}
          >
            {currentLevel}
          </Text>
        </View>

        {/* Progress bar */}
        <View
          style={{
            flex: 1,
            height: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={{
              height: '100%',
              width: progressWidth,
              backgroundColor: getLevelColor(currentLevel),
              borderRadius: 4,
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        width: '100%',
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      {/* Level Badge and Title Row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        {/* Level Badge */}
        <View
          style={{
            backgroundColor: getLevelColor(currentLevel),
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 16,
            borderWidth: 3,
            borderColor: 'rgba(255, 255, 255, 0.3)',
            shadowColor: getLevelColor(currentLevel),
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 10,
            shadowOpacity: 0.5,
          }}
        >
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: 20,
              color: 'white',
              textShadowColor: 'rgba(0, 0, 0, 0.5)',
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 0,
            }}
          >
            LV.{currentLevel}
          </Text>
        </View>

        {/* Title (if any) */}
        {title && (
          <View
            style={{
              marginLeft: 10,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 12,
            }}
          >
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 14,
                color: config.tertiary,
              }}
            >
              {title}
            </Text>
          </View>
        )}

        {/* XP Display */}
        <View style={{ marginLeft: 'auto' }}>
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 14,
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            {currentXP.toLocaleString()} / {xpToNextLevel.toLocaleString()} XP
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View
        style={{
          position: 'relative',
          width: '100%',
          height: 16,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.3)',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            height: '100%',
            width: progressWidth,
            backgroundColor: getLevelColor(currentLevel),
            borderRadius: 6,
          }}
        />

        {/* Shimmer effect */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
          }}
        />
      </View>

      {/* XP to next level */}
      <Text
        style={{
          fontFamily: 'Knockout',
          fontSize: 12,
          color: 'rgba(255, 255, 255, 0.5)',
          textAlign: 'right',
          marginTop: 4,
        }}
      >
        {(xpToNextLevel - currentXP).toLocaleString()} XP to Level {currentLevel + 1}
      </Text>
    </View>
  );
}
