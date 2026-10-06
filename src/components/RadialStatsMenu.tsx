import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, StyleSheet } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { useCurrencyFly } from '../context/CurrencyFlyProvider';
import Avatar from './Avatar';
import Button from './Button';
import * as RootNavigation from '../RootNavigation';
import { BRAND, GameIcon, type GameIconName } from '../ui';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { ws7Preview } from '../dev/ws7Preview';
import { useHelp } from './help/HelpProvider';
import type { GlossaryKey } from '../services/help/glossary';

/** The one Energy sentence (docs/economy-glossary.md, GET /api/economy). */
export const ENERGY_RULE = 'Energy powers boss raids and coin upgrades. It never runs out on a timer.';
export const TICKET_RULE = 'One Ticket plays one ride challenge at the park.';

interface StatItemProps {
  icon: GameIconName;
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
        <GameIcon name={icon} size={28} style={styles.statIcon} />
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
  const { explain } = useHelp();
  const [isOpen, setIsOpen] = useState(false);
  // Dev visual QA only.
  useEffect(() => {
    if (ws7Preview() !== 'hud') return;
    const timer = setTimeout(() => { setIsOpen(true); backdropAnim.setValue(1); }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tooltip, setTooltip] = useState<string | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedGameMotion();
  // Energy lives in this menu on the home map, so rewards (the daily chest)
  // fly their Energy into the avatar that opens it.
  const { registerTarget } = useCurrencyFly();
  const avatarRef = useRef<View>(null);
  const registerEnergyTarget = useCallback(() => {
    avatarRef.current?.measureInWindow((x, y, w, h) => {
      if (Number.isFinite(x) && Number.isFinite(y) && w > 0) registerTarget('energy', x + w / 2, y + h / 2);
    });
  }, [registerTarget]);

  const showTooltip = (text: string) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltip(text);
    tooltipTimer.current = setTimeout(() => setTooltip(null), 2500);
  };

  // Pulse animation for avatar when menu is closed (subtle attention getter)
  useEffect(() => {
    if (!isOpen && !reducedMotion) {
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
  }, [isOpen, reducedMotion]);

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

  // Each stat opens its "What's this?" sheet with the balance.
  const explainStat = (key: GlossaryKey, count: number) => { closeMenu(); explain(key, { count }); };
  const items = [
    { icon: 'energy' as const, label: 'Energy', value: formatNumber(energy), onPress: () => explainStat('energy', energy) },
    { icon: 'ticket' as const, label: 'Tickets', value: formatNumber(tickets), onPress: () => explainStat('tickets', tickets) },
    { icon: 'streak' as const, label: 'Day streak', value: String(streak), onPress: () => explainStat('day_streak', streak) },
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
          <View ref={avatarRef} onLayout={registerEnergyTarget} collapsable={false}
            style={[styles.avatarWrapper, isOpen && styles.avatarWrapperActive]}>
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
    backgroundColor: BRAND.navy,
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
    backgroundColor: BRAND.blue,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: BRAND.navy,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 0,
    elevation: 8,
    borderWidth: 3,
    borderColor: BRAND.white,
  },
  statIcon: {
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
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#dff3ff',
    marginTop: 1,
  },
  avatarWrapper: {
    borderRadius: 40,
    borderWidth: 3,
    borderColor: BRAND.white,
    position: 'relative',
  },
  avatarWrapperActive: {
    borderColor: BRAND.gold,
  },
  tooltipContainer: {
    position: 'absolute',
    bottom: 80,
    right: 70,
    alignItems: 'flex-end',
    zIndex: 30,
  },
  tooltipBubble: {
    backgroundColor: BRAND.cream,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: 220,
    borderWidth: 3,
    borderColor: BRAND.navy,
    shadowColor: BRAND.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  tooltipText: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: BRAND.navy,
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
    borderTopColor: BRAND.navy,
    alignSelf: 'flex-end',
    marginRight: 12,
  },
});
