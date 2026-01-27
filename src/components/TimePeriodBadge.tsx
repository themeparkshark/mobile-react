import { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, View, Platform } from 'react-native';
import * as Haptics from '../helpers/haptics';
import {
  TimePeriod,
  TIME_PERIOD_CONFIG,
  getCurrentTimePeriod,
  getTimeRemainingInPeriod,
  formatTimePeriod,
  isWeekend,
  isGoldenHour,
} from '../utils/timeGating';
import config from '../config';

interface Props {
  onPress?: () => void;
  showCountdown?: boolean;
  highlightPeriod?: TimePeriod;
  compact?: boolean;
}

/**
 * Time period badge showing current time of day.
 * Highlights when time-gated items are available!
 */
export default function TimePeriodBadge({
  onPress,
  showCountdown = false,
  highlightPeriod,
  compact = false,
}: Props) {
  const [currentPeriod, setCurrentPeriod] = useState<TimePeriod>(getCurrentTimePeriod());
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemainingInPeriod());
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPeriod(getCurrentTimePeriod());
      setTimeRemaining(getTimeRemainingInPeriod());
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, []);

  // Pulse animation when highlighted period matches
  useEffect(() => {
    if (highlightPeriod && highlightPeriod === currentPeriod) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.2,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      glowOpacity.setValue(0);
    }
  }, [highlightPeriod, currentPeriod]);

  const handlePress = () => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  const periodConfig = TIME_PERIOD_CONFIG[currentPeriod];
  const isHighlighted = highlightPeriod === currentPeriod;
  const isGolden = isGoldenHour();

  // Format countdown
  const formatCountdown = () => {
    if (!timeRemaining) return '';
    const { hours, minutes } = timeRemaining;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Compact version
  if (compact) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7} disabled={!onPress}>
        <Animated.View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: periodConfig.color,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: isGolden ? '#FFD700' : 'white',
            transform: [{ scale: pulseAnim }],
          }}
        >
          <Text style={{ fontSize: 18 }}>{periodConfig.emoji}</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} disabled={!onPress}>
      <View style={{ position: 'relative' }}>
        {/* Glow effect when highlighted */}
        {isHighlighted && (
          <Animated.View
            style={{
              position: 'absolute',
              top: -4,
              left: -4,
              right: -4,
              bottom: -4,
              borderRadius: 16,
              backgroundColor: periodConfig.color,
              opacity: glowOpacity,
            }}
          />
        )}

        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: isHighlighted ? periodConfig.color : 'rgba(255, 255, 255, 0.2)',
            transform: [{ scale: pulseAnim }],
          }}
        >
          {/* Time icon */}
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: periodConfig.color,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
            }}
          >
            <Text style={{ fontSize: 18 }}>{periodConfig.emoji}</Text>
          </View>

          {/* Period info */}
          <View>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 16,
                color: 'white',
              }}
            >
              {periodConfig.label}
            </Text>
            
            {showCountdown && timeRemaining && (
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 11,
                  color: timeRemaining.totalMinutes < 30 
                    ? config.red 
                    : 'rgba(255, 255, 255, 0.6)',
                  marginTop: -2,
                }}
              >
                {formatCountdown()} left
              </Text>
            )}
          </View>

          {/* Golden hour indicator */}
          {isGolden && (
            <View
              style={{
                marginLeft: 8,
                backgroundColor: '#FFD700',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 10,
                  color: config.primary,
                  textTransform: 'uppercase',
                }}
              >
                GOLDEN!
              </Text>
            </View>
          )}

          {/* Weekend indicator */}
          {isWeekend() && !isGolden && (
            <View
              style={{
                marginLeft: 8,
                backgroundColor: '#9C27B0',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 10,
                  color: 'white',
                  textTransform: 'uppercase',
                }}
              >
                WEEKEND
              </Text>
            </View>
          )}

          {/* Special items indicator */}
          {isHighlighted && (
            <View
              style={{
                marginLeft: 8,
                backgroundColor: '#4CAF50',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 10,
                  color: 'white',
                  textTransform: 'uppercase',
                }}
              >
                NEW!
              </Text>
            </View>
          )}
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Time period requirement badge (for set item display)
 */
export function TimePeriodRequirementBadge({ period }: { period: TimePeriod }) {
  const currentPeriod = getCurrentTimePeriod();
  const isActive = period === 'any' || period === currentPeriod;
  const periodConfig = TIME_PERIOD_CONFIG[period];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isActive ? periodConfig.color : 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: isActive ? periodConfig.color : 'rgba(255, 255, 255, 0.2)',
        opacity: isActive ? 1 : 0.5,
      }}
    >
      <Text style={{ fontSize: 14, marginRight: 4 }}>{periodConfig.emoji}</Text>
      <Text
        style={{
          fontFamily: 'Knockout',
          fontSize: 12,
          color: isActive ? 'white' : 'rgba(255, 255, 255, 0.7)',
        }}
      >
        {periodConfig.label}
      </Text>
      {isActive && period !== 'any' && (
        <View
          style={{
            marginLeft: 4,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#4CAF50',
          }}
        />
      )}
    </View>
  );
}

/**
 * Countdown timer for next period
 */
export function NextPeriodCountdown({ targetPeriod }: { targetPeriod: TimePeriod }) {
  const [currentPeriod, setCurrentPeriod] = useState<TimePeriod>(getCurrentTimePeriod());
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemainingInPeriod());
  const periodConfig = TIME_PERIOD_CONFIG[targetPeriod];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPeriod(getCurrentTimePeriod());
      setTimeRemaining(getTimeRemainingInPeriod());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  if (targetPeriod === currentPeriod || targetPeriod === 'any') {
    return (
      <View
        style={{
          backgroundColor: periodConfig.color,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
        }}
      >
        <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: 'white' }}>
          {periodConfig.emoji} Available Now!
        </Text>
      </View>
    );
  }

  // Calculate time until target period
  // This is a simplified version - would need more logic for accurate countdown
  const hoursUntil = TIME_PERIOD_CONFIG[targetPeriod].startHour - new Date().getHours();
  const adjustedHours = hoursUntil < 0 ? hoursUntil + 24 : hoursUntil;

  return (
    <View
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
      }}
    >
      <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
        {periodConfig.emoji} In ~{adjustedHours}h
      </Text>
    </View>
  );
}
