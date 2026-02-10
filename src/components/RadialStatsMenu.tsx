import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, StyleSheet } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import Avatar from './Avatar';
import Button from './Button';
import * as RootNavigation from '../RootNavigation';

interface StatItemProps {
  icon: string;
  label: string;
  value: string | number;
  index: number;
  visible: boolean;
  onPress?: () => void;
}

function StatItem({ icon, label, value, index, visible, onPress }: StatItemProps) {
  const animValue = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.spring(animValue, {
      toValue: visible ? 1 : 0,
      delay: visible ? index * 60 : 0,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  }, [visible, index]);

  return (
    <Animated.View
      style={[
        styles.statItem,
        {
          transform: [
            { translateY: animValue.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            })},
            { scale: animValue },
          ],
          opacity: animValue,
        },
      ]}
    >
      <Pressable 
        onPress={onPress}
        style={({ pressed }) => [
          styles.statItemInner,
          pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }
        ]}
      >
        <Text style={styles.statIcon}>{icon}</Text>
        <View style={styles.statTextContainer}>
          <Text style={styles.statValue}>{value}</Text>
          <Text style={styles.statLabel}>{label}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function RadialStatsMenu() {
  const { player } = useContext(AuthContext);
  const [isOpen, setIsOpen] = useState(false);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const showTooltip = (text: string) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltip(text);
    tooltipTimer.current = setTimeout(() => setTooltip(null), 2500);
  };

  // Pulse animation for avatar when menu is closed (subtle attention getter)
  useEffect(() => {
    if (!isOpen) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isOpen]);

  if (!player) return null;

  const energy = player.energy ?? 0;
  const tickets = player.tickets ?? 0;
  const streak = player.current_streak ?? 0;
  
  // Format large numbers with commas (like Stardust in Pokemon GO)
  const formatNumber = (n: number) => n.toLocaleString();

  const toggleMenu = () => {
    const opening = !isOpen;
    setIsOpen(opening);
    
    Animated.timing(backdropAnim, {
      toValue: opening ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const closeMenu = () => {
    setIsOpen(false);
    setTooltip(null);
    Animated.timing(backdropAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const items = [
    { icon: '⚡', label: 'Energy', value: formatNumber(energy), onPress: () => showTooltip('Use this to upgrade your coins!') },
    { icon: '🎟️', label: 'Tickets', value: formatNumber(tickets), onPress: () => showTooltip('Use these for rides at the park!') },
    { icon: '🔥', label: 'Streak', value: streak > 0 ? `${streak}d` : '0', onPress: undefined },
  ];

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Backdrop */}
      {isOpen && (
        <Pressable style={styles.backdropTouchable} onPress={closeMenu}>
          <Animated.View 
            style={[
              styles.backdrop,
              { opacity: backdropAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.4],
              })}
            ]} 
          />
        </Pressable>
      )}

      {/* Tooltip bubble */}
      {tooltip && (
        <View style={styles.tooltipContainer}>
          <View style={styles.tooltipBubble}>
            <Text style={styles.tooltipText}>{tooltip}</Text>
          </View>
          <View style={styles.tooltipArrow} />
        </View>
      )}

      {/* Stats popup - vertical stack above avatar */}
      <View style={styles.statsContainer} pointerEvents={isOpen ? 'auto' : 'none'}>
        {items.map((item, index) => (
          <StatItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            value={item.value}
            index={index}
            visible={isOpen}
            onPress={item.onPress}
          />
        ))}
      </View>

      {/* Avatar button */}
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <Button onPress={toggleMenu}>
          <View style={[styles.avatarWrapper, isOpen && styles.avatarWrapperActive]}>
            <Avatar player={player} size="lg" />
          </View>
        </Button>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    zIndex: 20,
    alignItems: 'flex-end',
  },
  backdropTouchable: {
    position: 'absolute',
    top: -800,
    left: -400,
    right: -100,
    bottom: -200,
    zIndex: -1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
  },
  statsContainer: {
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  statItem: {
    marginBottom: 8,
  },
  statItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 34, 42, 0.95)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  statTextContainer: {
    alignItems: 'flex-start',
  },
  statValue: {
    fontSize: 16,
    fontFamily: 'Shark',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
  avatarWrapper: {
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    position: 'relative',
  },
  avatarWrapperActive: {
    borderColor: '#4CAF50',
  },
  tooltipContainer: {
    position: 'absolute',
    bottom: 80,
    right: 70,
    alignItems: 'flex-end',
    zIndex: 30,
  },
  tooltipBubble: {
    backgroundColor: 'rgba(30, 34, 42, 0.95)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: 200,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  tooltipText: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#fff',
    textAlign: 'center',
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(30, 34, 42, 0.95)',
    alignSelf: 'flex-end',
    marginRight: 12,
  },
});
