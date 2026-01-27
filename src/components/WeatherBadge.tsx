import { useContext, useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View, Platform } from 'react-native';
import * as Haptics from '../helpers/haptics';
import { WeatherContext, getWeatherEmoji, getWeatherDescription } from '../context/WeatherProvider';
import { WeatherCondition } from '../models/prep-item-set-type';
import config from '../config';

interface Props {
  onPress?: () => void;
  showDetails?: boolean;
  highlightCondition?: WeatherCondition;
  compact?: boolean;
}

/**
 * Weather badge showing current conditions.
 * Highlights when weather-gated items are available!
 */
export default function WeatherBadge({
  onPress,
  showDetails = false,
  highlightCondition,
  compact = false,
}: Props) {
  const { weather, isLoading, hasCondition, getActiveConditions } = useContext(WeatherContext);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Pulse animation when highlighted condition is active
  useEffect(() => {
    if (highlightCondition && hasCondition(highlightCondition)) {
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
  }, [highlightCondition, hasCondition]);

  const handlePress = () => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  if (!weather && !isLoading) {
    return null;
  }

  const conditions = getActiveConditions();
  const emoji = getWeatherEmoji(conditions);
  const isHighlighted = highlightCondition && hasCondition(highlightCondition);

  // Get condition-specific color
  const getConditionColor = (): string => {
    if (conditions.includes('rain')) return '#2196F3';
    if (conditions.includes('snow')) return '#90CAF9';
    if (conditions.includes('hot')) return '#FF9800';
    if (conditions.includes('cold')) return '#00BCD4';
    if (conditions.includes('windy')) return '#9E9E9E';
    return config.tertiary;
  };

  const conditionColor = getConditionColor();

  // Compact version - just emoji
  if (compact) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7} disabled={!onPress}>
        <Animated.View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: conditionColor,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: 'white',
            transform: [{ scale: pulseAnim }],
          }}
        >
          <Text style={{ fontSize: 18 }}>{emoji}</Text>
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
              backgroundColor: conditionColor,
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
            borderColor: isHighlighted ? conditionColor : 'rgba(255, 255, 255, 0.2)',
            transform: [{ scale: pulseAnim }],
          }}
        >
          {/* Weather icon */}
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: conditionColor,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
            }}
          >
            <Text style={{ fontSize: 18 }}>{isLoading ? '🔄' : emoji}</Text>
          </View>

          {/* Temperature */}
          {weather && (
            <View>
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 18,
                  color: 'white',
                }}
              >
                {Math.round(weather.temperature)}°F
              </Text>
              
              {showDetails && (
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.6)',
                    marginTop: -2,
                  }}
                >
                  Feels {Math.round(weather.apparentTemperature)}°
                </Text>
              )}
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
 * Weather condition badges (for set item display)
 */
export function WeatherConditionBadge({ condition }: { condition: WeatherCondition }) {
  const { hasCondition } = useContext(WeatherContext);
  const isActive = hasCondition(condition);

  const conditionConfig: Record<WeatherCondition, { emoji: string; label: string; color: string }> = {
    clear: { emoji: '☀️', label: 'Clear', color: '#FFD700' },
    cloudy: { emoji: '☁️', label: 'Cloudy', color: '#9E9E9E' },
    rain: { emoji: '🌧️', label: 'Rain', color: '#2196F3' },
    snow: { emoji: '❄️', label: 'Snow', color: '#90CAF9' },
    hot: { emoji: '🔥', label: 'Hot', color: '#FF9800' },
    cold: { emoji: '🥶', label: 'Cold', color: '#00BCD4' },
    windy: { emoji: '💨', label: 'Windy', color: '#78909C' },
  };

  const config = conditionConfig[condition];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isActive ? config.color : 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: isActive ? config.color : 'rgba(255, 255, 255, 0.2)',
        opacity: isActive ? 1 : 0.5,
      }}
    >
      <Text style={{ fontSize: 14, marginRight: 4 }}>{config.emoji}</Text>
      <Text
        style={{
          fontFamily: 'Knockout',
          fontSize: 12,
          color: isActive ? 'white' : 'rgba(255, 255, 255, 0.7)',
        }}
      >
        {config.label}
      </Text>
      {isActive && (
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
