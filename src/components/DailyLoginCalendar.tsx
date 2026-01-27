import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import config from '../config';

interface DayReward {
  day: number;
  claimed: boolean;
  reward: {
    type: 'energy' | 'tickets' | 'coins' | 'special';
    amount: number;
    icon: string;
    label: string;
  };
  isToday: boolean;
  isMilestone: boolean;
}

interface Props {
  currentStreak: number;
  rewards?: DayReward[];
}

/**
 * Daily Login Calendar showing 7 days of rewards.
 * Milestones at day 7, 14, 30, etc. for bigger rewards!
 * 
 * This is KEY for retention - players see what they'll miss if they don't come back.
 */
export default function DailyLoginCalendar({ currentStreak, rewards }: Props) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const pulseAnims = useRef<{ [key: number]: Animated.Value }>({}).current;

  // Default rewards structure (7-day cycle)
  const defaultRewards: DayReward[] = [
    { day: 1, claimed: false, reward: { type: 'energy', amount: 10, icon: '⚡', label: '+10 Energy' }, isToday: false, isMilestone: false },
    { day: 2, claimed: false, reward: { type: 'tickets', amount: 2, icon: '🎟️', label: '+2 Tickets' }, isToday: false, isMilestone: false },
    { day: 3, claimed: false, reward: { type: 'energy', amount: 15, icon: '⚡', label: '+15 Energy' }, isToday: false, isMilestone: false },
    { day: 4, claimed: false, reward: { type: 'tickets', amount: 3, icon: '🎟️', label: '+3 Tickets' }, isToday: false, isMilestone: false },
    { day: 5, claimed: false, reward: { type: 'coins', amount: 100, icon: '🪙', label: '+100 Coins' }, isToday: false, isMilestone: false },
    { day: 6, claimed: false, reward: { type: 'energy', amount: 25, icon: '⚡', label: '+25 Energy' }, isToday: false, isMilestone: false },
    { day: 7, claimed: false, reward: { type: 'special', amount: 1, icon: '🎁', label: 'Mystery Box!' }, isToday: false, isMilestone: true },
  ];

  // Calculate which days are claimed based on streak
  const calculateRewards = (): DayReward[] => {
    const weekDay = currentStreak % 7 || 7;
    
    return defaultRewards.map((r, index) => ({
      ...r,
      claimed: index < weekDay - 1,
      isToday: index === weekDay - 1,
    }));
  };

  const displayRewards = rewards || calculateRewards();

  // Pulse animation for today's reward
  useEffect(() => {
    displayRewards.forEach((reward, index) => {
      if (!pulseAnims[index]) {
        pulseAnims[index] = new Animated.Value(1);
      }

      if (reward.isToday && !reward.claimed) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnims[index], {
              toValue: 1.1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnims[index], {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        ).start();
      }
    });
  }, [displayRewards]);

  // Get reward styling
  const getRewardStyle = (reward: DayReward) => {
    if (reward.claimed) {
      return {
        backgroundColor: 'rgba(76, 175, 80, 0.3)',
        borderColor: '#4CAF50',
        opacity: 0.7,
      };
    }
    if (reward.isToday) {
      return {
        backgroundColor: config.tertiary,
        borderColor: '#FFD700',
        opacity: 1,
      };
    }
    if (reward.isMilestone) {
      return {
        backgroundColor: 'rgba(156, 39, 176, 0.3)',
        borderColor: '#9C27B0',
        opacity: 1,
      };
    }
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      opacity: 0.8,
    };
  };

  const dayWidth = (Dimensions.get('window').width - 64) / 7;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: 'Shark',
            fontSize: 18,
            color: 'white',
            textTransform: 'uppercase',
            textShadowColor: 'rgba(0, 0, 0, 0.5)',
            textShadowOffset: { width: 1, height: 1 },
            textShadowRadius: 0,
          }}
        >
          Daily Rewards
        </Text>
        <View
          style={{
            backgroundColor: currentStreak > 0 ? '#FF9800' : 'rgba(255, 255, 255, 0.2)',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 14,
              color: 'white',
            }}
          >
            🔥 {currentStreak} day streak
          </Text>
        </View>
      </View>

      {/* Calendar Row */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        {displayRewards.map((reward, index) => {
          const style = getRewardStyle(reward);
          const scale = pulseAnims[index] || new Animated.Value(1);

          return (
            <Animated.View
              key={reward.day}
              style={{
                width: dayWidth - 4,
                alignItems: 'center',
                transform: [{ scale }],
              }}
            >
              {/* Day number */}
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 12,
                  color: reward.isToday ? config.tertiary : 'rgba(255, 255, 255, 0.6)',
                  marginBottom: 4,
                }}
              >
                Day {reward.day}
              </Text>

              {/* Reward box */}
              <View
                style={{
                  width: dayWidth - 8,
                  height: dayWidth - 8,
                  borderRadius: 8,
                  backgroundColor: style.backgroundColor,
                  borderWidth: 2,
                  borderColor: style.borderColor,
                  opacity: style.opacity,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: reward.isToday ? '#FFD700' : '#000',
                  shadowOffset: { width: 0, height: reward.isToday ? 0 : 2 },
                  shadowRadius: reward.isToday ? 8 : 2,
                  shadowOpacity: reward.isToday ? 0.5 : 0.3,
                }}
              >
                {/* Claimed checkmark */}
                {reward.claimed ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: '#4CAF50',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 10, color: 'white' }}>✓</Text>
                  </View>
                ) : null}

                {/* Reward icon */}
                <Text style={{ fontSize: reward.isMilestone ? 24 : 20 }}>
                  {reward.reward.icon}
                </Text>
              </View>

              {/* Reward label */}
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 9,
                  color: reward.isToday ? 'white' : 'rgba(255, 255, 255, 0.5)',
                  marginTop: 4,
                  textAlign: 'center',
                }}
                numberOfLines={1}
              >
                {reward.claimed ? 'Claimed' : reward.reward.label}
              </Text>

              {/* Today indicator */}
              {reward.isToday && !reward.claimed && (
                <View
                  style={{
                    backgroundColor: config.tertiary,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    borderRadius: 4,
                    marginTop: 2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 8,
                      color: config.primary,
                      textTransform: 'uppercase',
                    }}
                  >
                    Today!
                  </Text>
                </View>
              )}
            </Animated.View>
          );
        })}
      </View>

      {/* Milestone preview */}
      <View
        style={{
          marginTop: 12,
          backgroundColor: 'rgba(156, 39, 176, 0.2)',
          borderRadius: 8,
          padding: 10,
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'rgba(156, 39, 176, 0.5)',
        }}
      >
        <Text style={{ fontSize: 24, marginRight: 10 }}>🎁</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 14,
              color: 'white',
            }}
          >
            Day 7 Milestone: Mystery Box
          </Text>
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.6)',
            }}
          >
            Rare items, bonus tickets, and exclusive rewards!
          </Text>
        </View>
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 12,
            color: '#9C27B0',
          }}
        >
          {7 - (currentStreak % 7 || 7)} days
        </Text>
      </View>
    </View>
  );
}

/**
 * Compact streak display for toolbar
 */
export function StreakIndicator({ streak }: { streak: number }) {
  const isHot = streak >= 7;
  const isOnFire = streak >= 30;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isOnFire ? '#FF5722' : isHot ? '#FF9800' : 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
      }}
    >
      <Text style={{ fontSize: 14, marginRight: 4 }}>
        {isOnFire ? '🔥🔥' : isHot ? '🔥' : '📅'}
      </Text>
      <Text
        style={{
          fontFamily: 'Knockout',
          fontSize: 14,
          color: 'white',
          fontWeight: 'bold',
        }}
      >
        {streak}
      </Text>
    </View>
  );
}
