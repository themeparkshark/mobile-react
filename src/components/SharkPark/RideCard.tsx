import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { RideDefinition, RideState, FloatingText, BuyMultiplier } from '../../models/idle-game-types';
import {
  rideCost,
  rideCostBulk,
  rideIncome,
  rideIncomePerSecond,
  resolveBuyCount,
  effectiveSpeedMs,
  speedHalvingMultiplier,
  globalSpeedHalvingMultiplier,
  formatCash,
} from '../../helpers/idle-game';
import { ParkState } from '../../models/idle-game-types';
import RideIcon from './RideIcon';
import ProgressBar from './ProgressBar';
import FloatingCashText from './FloatingCashText';
import SparkleBurst from './SparkleBurst';

// ── Collect Button ──
function CollectButton({
  ready,
  onPress,
  color,
}: {
  ready: boolean;
  onPress: () => void;
  color: string;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (ready) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => pulseLoop.current?.stop();
  }, [ready]);

  const scalePress = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.timing(scalePress, { toValue: 0.92, duration: 60, useNativeDriver: true }).start();
  }, []);

  const handlePressOut = useCallback(() => {
    Animated.spring(scalePress, { toValue: 1, friction: 3, tension: 300, useNativeDriver: true }).start();
  }, []);

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} disabled={!ready}>
      <Animated.View
        style={[
          styles.collectBtn,
          {
            backgroundColor: ready ? color : '#ccc',
            transform: [{ scale: Animated.multiply(pulseAnim, scalePress) }],
          },
        ]}
      >
        <Text style={styles.collectBtnText}>{ready ? 'COLLECT' : 'Running...'}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Buy Button ──
function BuyButton({
  cost,
  count,
  canAfford,
  onPress,
}: {
  cost: number;
  count: number;
  canAfford: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.15, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 300, useNativeDriver: true }),
    ]).start();
    onPress();
  }, [onPress]);

  return (
    <Pressable onPress={handlePress} disabled={!canAfford || count === 0}>
      <Animated.View
        style={[styles.buyBtn, { opacity: canAfford && count > 0 ? 1 : 0.4, transform: [{ scale: scaleAnim }] }]}
      >
        <Text style={styles.buyBtnLabel}>{count > 1 ? `BUY ${count}` : 'BUY'}</Text>
        <Text style={styles.buyBtnCost}>${formatCash(cost)}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Manager Button ──
function ManagerButton({
  cost,
  canAfford,
  onPress,
}: {
  cost: number;
  canAfford: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!canAfford}>
      <LinearGradient
        colors={canAfford ? (['#7c3aed', '#4a00e0'] as any) : (['#999', '#777'] as any)}
        style={styles.managerBtn}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={styles.managerBtnLabel}>HIRE MANAGER</Text>
        <Text style={styles.managerBtnCost}>${formatCash(cost)}</Text>
      </LinearGradient>
    </Pressable>
  );
}

// ── Active Ride Card ──
interface ActiveRideCardProps {
  def: RideDefinition;
  rideState: RideState;
  cash: number;
  buyMultiplier: BuyMultiplier;
  purchasedUpgrades: string[];
  parkState: ParkState;
  onCollect: (defId: string) => void;
  onBuy: (defId: string, count: number) => void;
  onHireManager: (defId: string) => void;
  index: number;
}

export function ActiveRideCard({
  def,
  rideState,
  cash,
  buyMultiplier,
  purchasedUpgrades,
  parkState,
  onCollect,
  onBuy,
  onHireManager,
  index,
}: ActiveRideCardProps) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const badgeScaleAnim = useRef(new Animated.Value(1)).current;
  const prevOwned = useRef(rideState.owned);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0, duration: 400, delay: index * 80,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1, duration: 400, delay: index * 80, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Badge pop on buy
  useEffect(() => {
    if (rideState.owned > prevOwned.current) {
      Animated.sequence([
        Animated.spring(badgeScaleAnim, { toValue: 1.4, friction: 3, tension: 300, useNativeDriver: true }),
        Animated.spring(badgeScaleAnim, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }),
      ]).start();
    }
    prevOwned.current = rideState.owned;
  }, [rideState.owned]);

  const speed = useMemo(
    () => effectiveSpeedMs(def, rideState, purchasedUpgrades, parkState),
    [def, rideState, purchasedUpgrades, parkState]
  );

  // Speed halving display
  const totalSpeedMult = useMemo(() => {
    const individual = speedHalvingMultiplier(rideState.owned);
    const global = globalSpeedHalvingMultiplier(parkState);
    return individual * global;
  }, [rideState.owned, parkState]);

  useEffect(() => {
    if (rideState.cycleStartedAt > 0) {
      const tick = () => {
        const elapsed = Date.now() - rideState.cycleStartedAt;
        const p = Math.min(elapsed / speed, 1);
        setProgress(p);
        setReady(p >= 1);
      };
      tick();
      timerRef.current = setInterval(tick, 50);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else {
      setProgress(0);
      setReady(false);
    }
  }, [rideState.cycleStartedAt, speed]);

  const income = useMemo(() => rideIncome(def, rideState.owned, parkState), [def, rideState.owned, parkState]);
  const ips = useMemo(
    () => rideIncomePerSecond(def, rideState.owned, rideState, purchasedUpgrades, parkState),
    [def, rideState.owned, rideState, purchasedUpgrades, parkState]
  );

  const buyCount = useMemo(
    () => resolveBuyCount(buyMultiplier, def, rideState.owned, cash),
    [buyMultiplier, def, rideState.owned, cash]
  );
  const bulkCost = useMemo(
    () => rideCostBulk(def, rideState.owned, buyCount || 1),
    [def, rideState.owned, buyCount]
  );

  const handleCollect = useCallback(() => {
    if (!ready) {
      if (rideState.cycleStartedAt === 0) onCollect(def.id);
      return;
    }
    const id = Date.now().toString();
    setFloatingTexts((prev) => [...prev, { id, text: `+$${formatCash(income)}`, x: 0, y: 0 }]);
    setShowSparkles(true);
    setTimeout(() => setShowSparkles(false), 700);
    onCollect(def.id);
  }, [ready, def.id, income, onCollect, rideState.cycleStartedAt]);

  const handleBuy = useCallback(() => {
    if (buyCount > 0) onBuy(def.id, buyCount);
  }, [def.id, buyCount, onBuy]);

  const handleHireManager = useCallback(() => {
    onHireManager(def.id);
  }, [def.id, onHireManager]);

  const removeFloating = useCallback((id: string) => {
    setFloatingTexts((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const isIdle = rideState.cycleStartedAt === 0 && rideState.owned > 0;
  const shadowOpacity = 0.08 + index * 0.012;

  return (
    <Animated.View
      style={[
        styles.card,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
        { shadowOpacity },
      ]}
    >
      <View style={styles.floatingContainer}>
        {floatingTexts.map((ft) => (
          <FloatingCashText key={ft.id} text={ft.text} onDone={() => removeFloating(ft.id)} />
        ))}
      </View>
      {showSparkles && <SparkleBurst />}

      <View style={styles.inner}>
        <Pressable onPress={handleCollect}>
          <RideIcon def={def} locked={false} hasManager={rideState.hasManager} />
        </Pressable>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{def.name}</Text>
            <Animated.View
              style={[
                styles.levelBadge,
                { backgroundColor: def.colors[0], transform: [{ scale: badgeScaleAnim }] },
              ]}
            >
              <Text style={styles.levelBadgeText}>{rideState.owned}</Text>
            </Animated.View>
          </View>
          <Text style={styles.ips}>${formatCash(ips)}/sec</Text>

          {rideState.owned > 0 && <ProgressBar progress={progress} color={def.colors[0]} />}
          {rideState.owned > 0 && totalSpeedMult > 1 && (
            <Text style={styles.speedLabel}>Speed: x{totalSpeedMult}</Text>
          )}

          {rideState.owned > 0 && (
            <View style={styles.collectRow}>
              {isIdle && !rideState.hasManager ? (
                <Pressable onPress={handleCollect}>
                  <LinearGradient
                    colors={def.colors as any}
                    style={styles.startBtn}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.startBtnText}>TAP TO START</Text>
                  </LinearGradient>
                </Pressable>
              ) : rideState.owned > 0 && !rideState.hasManager ? (
                <CollectButton ready={ready} onPress={handleCollect} color={def.colors[0]} />
              ) : null}
            </View>
          )}

          {/* Manager button */}
          {rideState.owned > 0 && !rideState.hasManager && (
            <View style={styles.managerRow}>
              <ManagerButton
                cost={def.managerCost}
                canAfford={cash >= def.managerCost}
                onPress={handleHireManager}
              />
            </View>
          )}
        </View>

        <View style={styles.buyCol}>
          <BuyButton
            cost={bulkCost}
            count={buyCount}
            canAfford={cash >= bulkCost && buyCount > 0}
            onPress={handleBuy}
          />
        </View>
      </View>
    </Animated.View>
  );
}

// ── Locked Ride Card ──
interface LockedRideCardProps {
  def: RideDefinition;
  currentLevel: number;
  index: number;
}

export function LockedRideCard({ def, currentLevel, index }: LockedRideCardProps) {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0, duration: 400, delay: index * 80,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1, duration: 400, delay: index * 80, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const progressToUnlock = Math.min(currentLevel / def.unlockLevel, 1);

  return (
    <Animated.View
      style={[styles.card, styles.lockedCard, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}
    >
      <RideIcon def={def} locked />
      <View style={styles.info}>
        <Text style={styles.name}>{def.name}</Text>
        <Text style={styles.lockedText}>
          Level {currentLevel}/{def.unlockLevel}
        </Text>
        <View style={styles.unlockProgress}>
          <View style={[styles.unlockProgressFill, { flex: progressToUnlock }]} />
          <View style={{ flex: 1 - progressToUnlock }} />
        </View>
      </View>
      <View style={styles.lockBadge}>
        <Text style={styles.lockIcon}>Level {def.unlockLevel}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'visible',
  },
  lockedCard: {
    opacity: 0.5,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  floatingContainer: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    pointerEvents: 'none',
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: '#1a1a1a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  levelBadgeText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#fff',
  },
  ips: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#38ef7d',
  },
  speedLabel: {
    fontFamily: 'Knockout',
    fontSize: 11,
    color: '#00a5f5',
    marginTop: 2,
  },
  collectRow: {
    marginTop: 6,
  },
  collectBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  collectBtnText: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  startBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  startBtnText: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  buyCol: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyBtn: {
    backgroundColor: '#fec90e',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 70,
    shadowColor: '#fec90e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  buyBtnLabel: {
    fontFamily: 'Shark',
    fontSize: 11,
    color: '#1a1a1a',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  buyBtnCost: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: '#1a1a1a',
    marginTop: 2,
  },
  managerRow: {
    marginTop: 6,
  },
  managerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  managerBtnLabel: {
    fontFamily: 'Shark',
    fontSize: 11,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  managerBtnCost: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#fff',
  },
  lockedText: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#999',
  },
  lockBadge: {
    backgroundColor: '#e8ecf0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  lockIcon: {
    fontFamily: 'Shark',
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
  },
  unlockProgress: {
    height: 4,
    backgroundColor: '#e8ecf0',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
    flexDirection: 'row',
  },
  unlockProgressFill: {
    height: '100%',
    backgroundColor: '#00a5f5',
    borderRadius: 2,
  },
});
