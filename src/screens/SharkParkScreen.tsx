// ─── Shark Park — Idle Game Screen ───
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import AnimatedCounter from '../components/AnimatedCounter';
import ParkHeader from '../components/SharkPark/ParkHeader';
import BuyMultiplierToggle from '../components/SharkPark/BuyMultiplierToggle';
import { ActiveRideCard, LockedRideCard } from '../components/SharkPark/RideCard';
import MilestoneToast from '../components/SharkPark/MilestoneToast';
import {
  WelcomeBackModal,
  IncomeBreakdownModal,
  PrestigeModal,
  ResetModal,
  MilestonesModal,
  UpgradesModal,
} from '../components/SharkPark/Modals';
import StatsModal from '../components/SharkPark/StatsModal';
import {
  RIDES,
  MILESTONES,
  SPEED_UPGRADES,
  PROFIT_UPGRADES,
  STAR_POINT_UPGRADES,
  rideCost,
  rideCostBulk,
  rideIncome,
  totalIncomePerSecond,
  incomeBreakdown,
  parkLevel,
  calculateOfflineEarnings,
  calculateStarPoints,
  performPrestige,
  prestigeMultiplier,
  effectiveSpeedMs,
  formatCash,
  createDefaultState,
  saveState,
  loadState,
  clearState,
} from '../helpers/idle-game';
import { ParkState, BuyMultiplier, SpeedUpgrade, ProfitUpgrade, StarPointUpgrade } from '../models/idle-game-types';

// ═══════════════════════════════════════════════
// ONBOARDING HINT
// ═══════════════════════════════════════════════

function OnboardingHint() {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[styles.onboardingHint, { transform: [{ scale: pulseAnim }] }]}>
      <LinearGradient
        colors={['#fec90e', '#f7971e'] as any}
        style={styles.onboardingGrad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={styles.onboardingText}>Build your first ride!</Text>
        <Text style={styles.onboardingArrow}>↓</Text>
      </LinearGradient>
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════
// STATS BAR
// ═══════════════════════════════════════════════

function StatsBar({
  cash,
  ips,
  level,
  starPoints,
  onIpsTap,
  onMilestonesTap,
}: {
  cash: number;
  ips: number;
  level: number;
  starPoints: number;
  onIpsTap: () => void;
  onMilestonesTap: () => void;
}) {
  return (
    <View style={styles.statsBar}>
      <View style={styles.statPill}>
        <View style={[styles.statDot, { backgroundColor: '#fec90e' }]} />
        <AnimatedCounter
          value={cash}
          prefix="$"
          style={styles.statValue}
          duration={400}
          formatNumber
        />
      </View>
      <Pressable style={styles.statPill} onPress={onIpsTap}>
        <View style={[styles.statDot, { backgroundColor: '#38ef7d' }]} />
        <Text style={styles.statLabel}>${formatCash(ips)}/s</Text>
      </Pressable>
      <View style={styles.statPill}>
        <View style={[styles.statDot, { backgroundColor: '#00a5f5' }]} />
        <Text style={styles.statLabel}>Lvl {level}</Text>
      </View>
      {starPoints > 0 && (
        <View style={styles.statPill}>
          <View style={[styles.statDot, { backgroundColor: '#8e2de2' }]} />
          <Text style={styles.statLabel}>{starPoints} SP</Text>
        </View>
      )}
      <Pressable style={styles.trophyBtn} onPress={onMilestonesTap}>
        <View style={styles.trophyStar} />
      </Pressable>
    </View>
  );
}

// ═══════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════

export default function SharkParkScreen() {
  const [state, setState] = useState<ParkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineEarnings, setOfflineEarnings] = useState(0);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [showIncomeBreakdown, setShowIncomeBreakdown] = useState(false);
  const [showPrestige, setShowPrestige] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
  const [showUpgrades, setShowUpgrades] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [milestoneQueue, setMilestoneQueue] = useState<{ label: string; tickets: number }[]>([]);
  const [buyMultiplier, setBuyMultiplier] = useState<BuyMultiplier>(1);
  const stateRef = useRef<ParkState | null>(null);
  const lastSaveRef = useRef(0);

  // Keep ref in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ── Load state on mount ──
  useEffect(() => {
    (async () => {
      const saved = await loadState();
      if (saved) {
        const now = Date.now();
        const offline = calculateOfflineEarnings(saved, now);
        if (offline > 0) {
          setOfflineEarnings(offline);
          setShowWelcomeBack(true);
          saved.cash += offline;
          saved.lifetimeEarnings += offline;
        }
        for (const def of RIDES) {
          const rs = saved.rides[def.id];
          if (rs && rs.cycleStartedAt > 0) {
            rs.cycleStartedAt = 0;
          }
        }
        saved.lastSavedAt = now;
        setState(saved);
        await saveState(saved);
      } else {
        const fresh = createDefaultState();
        setState(fresh);
        await saveState(fresh);
      }
      setLoading(false);
    })();
  }, []);

  // ── Debounced save (every 2.5s) ──
  const debouncedSave = useCallback((s: ParkState) => {
    const now = Date.now();
    if (now - lastSaveRef.current > 2500) {
      lastSaveRef.current = now;
      saveState(s);
    }
  }, []);

  // ── Auto-collect for managed rides (100ms tick) ──
  useEffect(() => {
    const interval = setInterval(() => {
      const s = stateRef.current;
      if (!s) return;

      let changed = false;
      const next = { ...s, rides: { ...s.rides } };

      for (const def of RIDES) {
        const rs = next.rides[def.id];
        if (!rs || rs.owned === 0 || !rs.hasManager) continue;

        const speed = effectiveSpeedMs(def, rs, next.purchasedUpgrades || [], next);

        if (rs.cycleStartedAt === 0) {
          // Auto-start
          next.rides[def.id] = { ...rs, cycleStartedAt: Date.now() };
          changed = true;
        } else {
          const elapsed = Date.now() - rs.cycleStartedAt;
          if (elapsed >= speed) {
            // Auto-collect and restart
            const income = rideIncome(def, rs.owned, next) * prestigeMultiplier(next.starPoints, next.spentStarPoints || 0);
            next.cash += income;
            next.lifetimeEarnings += income;
            next.rides[def.id] = { ...rs, cycleStartedAt: Date.now() };
            changed = true;
          }
        }
      }

      if (changed) {
        setState(next);
        debouncedSave(next);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [debouncedSave]);

  // ── Check milestones ──
  const checkMilestones = useCallback((s: ParkState) => {
    const newMilestones: { label: string; tickets: number }[] = [];
    for (const m of MILESTONES) {
      if (!s.unlockedMilestones.includes(m.id) && m.check(s)) {
        s.unlockedMilestones.push(m.id);
        s.tickets += m.ticketReward;
        newMilestones.push({ label: m.label, tickets: m.ticketReward });
      }
    }
    if (newMilestones.length > 0) {
      setMilestoneQueue((prev) => [...prev, ...newMilestones]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  // ── Collect handler ──
  const handleCollect = useCallback((rideId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, rides: { ...prev.rides } };
      const rs = { ...next.rides[rideId] };
      const def = RIDES.find((r) => r.id === rideId)!;
      const speed = effectiveSpeedMs(def, rs, next.purchasedUpgrades || [], next);

      if (rs.owned === 0) return prev;

      if (rs.cycleStartedAt === 0) {
        rs.cycleStartedAt = Date.now();
        next.rides[rideId] = rs;
        debouncedSave(next);
        return next;
      }

      const elapsed = Date.now() - rs.cycleStartedAt;
      if (elapsed >= speed) {
        const income = rideIncome(def, rs.owned, next) * prestigeMultiplier(next.starPoints, next.spentStarPoints || 0);
        next.cash += income;
        next.lifetimeEarnings += income;
        rs.cycleStartedAt = rs.hasManager ? Date.now() : 0;
        next.rides[rideId] = rs;
        checkMilestones(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        debouncedSave(next);
        return next;
      }

      return prev;
    });
  }, [checkMilestones, debouncedSave]);

  // ── Buy handler (supports bulk) ──
  const handleBuy = useCallback((rideId: string, count: number) => {
    setState((prev) => {
      if (!prev || count <= 0) return prev;
      const def = RIDES.find((r) => r.id === rideId)!;
      const rs = prev.rides[rideId];
      const totalCost = rideCostBulk(def, rs.owned, count);
      if (prev.cash < totalCost) return prev;

      const next = { ...prev, rides: { ...prev.rides } };
      next.cash -= totalCost;
      next.rides[rideId] = { ...rs, owned: rs.owned + count };
      checkMilestones(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      debouncedSave(next);
      return next;
    });
  }, [checkMilestones, debouncedSave]);

  // ── Hire manager handler ──
  const handleHireManager = useCallback((rideId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      const def = RIDES.find((r) => r.id === rideId)!;
      const rs = prev.rides[rideId];
      if (rs.hasManager || prev.cash < def.managerCost) return prev;

      const next = { ...prev, rides: { ...prev.rides } };
      next.cash -= def.managerCost;
      next.rides[rideId] = { ...rs, hasManager: true, cycleStartedAt: Date.now() };
      checkMilestones(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      debouncedSave(next);
      return next;
    });
  }, [checkMilestones, debouncedSave]);

  // ── Buy speed upgrade handler ──
  const handleBuyUpgrade = useCallback((upgrade: SpeedUpgrade) => {
    setState((prev) => {
      if (!prev) return prev;
      if (prev.cash < upgrade.cost) return prev;
      if ((prev.purchasedUpgrades || []).includes(upgrade.id)) return prev;

      const next = { ...prev, rides: { ...prev.rides } };
      next.cash -= upgrade.cost;
      next.purchasedUpgrades = [...(prev.purchasedUpgrades || []), upgrade.id];

      // Apply ride-specific speed multiplier
      if (upgrade.rideId !== 'all') {
        const rs = next.rides[upgrade.rideId];
        if (rs) {
          next.rides[upgrade.rideId] = {
            ...rs,
            speedMultiplier: (rs.speedMultiplier || 1) * upgrade.multiplier,
          };
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  // ── Buy profit upgrade handler ──
  const handleBuyProfitUpgrade = useCallback((upgrade: ProfitUpgrade) => {
    setState((prev) => {
      if (!prev) return prev;
      if (prev.cash < upgrade.cost) return prev;
      if ((prev.purchasedProfitUpgrades || []).includes(upgrade.id)) return prev;

      const next = { ...prev };
      next.cash -= upgrade.cost;
      next.purchasedProfitUpgrades = [...(prev.purchasedProfitUpgrades || []), upgrade.id];
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  // ── Buy star point upgrade handler ──
  const handleBuyStarUpgrade = useCallback((upgrade: StarPointUpgrade) => {
    setState((prev) => {
      if (!prev) return prev;
      const availableSP = prev.starPoints - (prev.spentStarPoints || 0);
      if (availableSP < upgrade.cost) return prev;
      if ((prev.purchasedStarUpgrades || []).includes(upgrade.id)) return prev;

      const next = { ...prev };
      next.spentStarPoints = (prev.spentStarPoints || 0) + upgrade.cost;
      next.purchasedStarUpgrades = [...(prev.purchasedStarUpgrades || []), upgrade.id];
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      debouncedSave(next);
      return next;
    });
  }, [debouncedSave]);

  // ── Collect All handler ──
  const handleCollectAll = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, rides: { ...prev.rides } };
      let collected = false;

      for (const def of RIDES) {
        const rs = next.rides[def.id];
        if (!rs || rs.owned === 0 || rs.cycleStartedAt === 0) continue;
        const speed = effectiveSpeedMs(def, rs, next.purchasedUpgrades || [], next);
        const elapsed = Date.now() - rs.cycleStartedAt;
        if (elapsed >= speed) {
          const income = rideIncome(def, rs.owned, next) * prestigeMultiplier(next.starPoints, next.spentStarPoints || 0);
          next.cash += income;
          next.lifetimeEarnings += income;
          next.rides[def.id] = { ...rs, cycleStartedAt: rs.hasManager ? Date.now() : 0 };
          collected = true;
        }
      }

      if (collected) {
        checkMilestones(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        debouncedSave(next);
        return next;
      }
      return prev;
    });
  }, [checkMilestones, debouncedSave]);

  // ── Prestige handler ──
  const handlePrestige = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const next = performPrestige(prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      saveState(next);
      return next;
    });
    setShowPrestige(false);
  }, []);

  // ── Reset handler ──
  const handleReset = useCallback(async () => {
    const fresh = createDefaultState();
    setState(fresh);
    await clearState();
    await saveState(fresh);
    setShowReset(false);
  }, []);

  // ── Computed values ──
  const level = useMemo(() => (state ? parkLevel(state) : 0), [state]);
  const ips = useMemo(() => (state ? totalIncomePerSecond(state) : 0), [state]);
  const breakdown = useMemo(() => (state ? incomeBreakdown(state) : []), [state]);
  const totalRides = level;
  const earnedStarPoints = useMemo(
    () => (state ? calculateStarPoints(state.lifetimeEarnings) : 0),
    [state]
  );
  const isNewPlayer = useMemo(() => state ? level === 0 && state.cash <= 25 : false, [state, level]);

  // Check if any rides have ready collections (for Collect All button)
  const hasReadyRides = useMemo(() => {
    if (!state) return false;
    for (const def of RIDES) {
      const rs = state.rides[def.id];
      if (rs && rs.owned > 0 && rs.cycleStartedAt > 0 && !rs.hasManager) {
        const speed = effectiveSpeedMs(def, rs, state.purchasedUpgrades || [], state);
        const elapsed = Date.now() - rs.cycleStartedAt;
        if (elapsed >= speed) return true;
      }
    }
    return false;
  }, [state]);

  if (loading || !state) {
    return (
      <Wrapper>
        <Topbar>
          <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
          <TopbarColumn><TopbarText>Shark Park</TopbarText></TopbarColumn>
          <TopbarColumn stretch={false} />
        </Topbar>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Building your park...</Text>
        </View>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Shark Park</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>

      {/* Stats Bar */}
      <StatsBar
        cash={state.cash}
        ips={ips}
        level={level}
        starPoints={state.starPoints}
        onIpsTap={() => setShowIncomeBreakdown(true)}
        onMilestonesTap={() => setShowMilestones(true)}
      />

      {/* Ride List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Park Header Banner */}
        <ParkHeader
          totalRides={totalRides}
          ips={ips}
          level={level}
          starPoints={state.starPoints}
        />

        {/* Onboarding hint for new players */}
        {isNewPlayer && <OnboardingHint />}

        {/* Buy Multiplier Toggle */}
        <BuyMultiplierToggle selected={buyMultiplier} onSelect={setBuyMultiplier} />

        {/* Action Buttons Row */}
        <View style={styles.actionRow}>
          {/* Collect All */}
          {hasReadyRides && (
            <Pressable onPress={handleCollectAll} style={styles.actionBtn}>
              <LinearGradient
                colors={['#fec90e', '#f7971e'] as any}
                style={styles.actionGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.actionText}>COLLECT ALL</Text>
              </LinearGradient>
            </Pressable>
          )}

          {/* Upgrades Button */}
          <Pressable onPress={() => setShowUpgrades(true)} style={styles.actionBtn}>
            <LinearGradient
              colors={['#00a5f5', '#09268f'] as any}
              style={styles.actionGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.actionText}>UPGRADES</Text>
            </LinearGradient>
          </Pressable>

          {/* Stats Button */}
          <Pressable onPress={() => setShowStats(true)} style={styles.actionBtn}>
            <LinearGradient
              colors={['#667eea', '#764ba2'] as any}
              style={styles.actionGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.actionText}>STATS</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Rides */}
        {RIDES.map((def, index) => {
          const isLocked = level < def.unlockLevel && (state.rides[def.id]?.owned ?? 0) === 0;
          if (isLocked) {
            return (
              <LockedRideCard key={def.id} def={def} currentLevel={level} index={index} />
            );
          }
          return (
            <ActiveRideCard
              key={def.id}
              def={def}
              rideState={state.rides[def.id]}
              cash={state.cash}
              buyMultiplier={buyMultiplier}
              purchasedUpgrades={state.purchasedUpgrades || []}
              parkState={state}
              onCollect={handleCollect}
              onBuy={handleBuy}
              onHireManager={handleHireManager}
              index={index}
            />
          );
        })}

        {/* Prestige Button */}
        {level >= 100 && (
          <Pressable onPress={() => setShowPrestige(true)} style={styles.prestigeBtn}>
            <LinearGradient
              colors={['#8e2de2', '#4a00e0'] as any}
              style={styles.prestigeGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.prestigeText}>PRESTIGE</Text>
              <Text style={styles.prestigeSubtext}>
                Earn {earnedStarPoints} Star Point{earnedStarPoints !== 1 ? 's' : ''}
              </Text>
            </LinearGradient>
          </Pressable>
        )}

        {/* Reset */}
        <Pressable onPress={() => setShowReset(true)} style={styles.resetBtn}>
          <Text style={styles.resetText}>Reset Park</Text>
        </Pressable>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Modals */}
      <WelcomeBackModal
        visible={showWelcomeBack}
        earnings={offlineEarnings}
        onDismiss={() => setShowWelcomeBack(false)}
      />
      <IncomeBreakdownModal
        visible={showIncomeBreakdown}
        breakdown={breakdown}
        totalIps={ips}
        state={state}
        onDismiss={() => setShowIncomeBreakdown(false)}
      />
      <PrestigeModal
        visible={showPrestige}
        currentStarPoints={state.starPoints}
        earnedStarPoints={earnedStarPoints}
        spentStarPoints={state.spentStarPoints || 0}
        onConfirm={handlePrestige}
        onCancel={() => setShowPrestige(false)}
      />
      <ResetModal
        visible={showReset}
        onConfirm={handleReset}
        onCancel={() => setShowReset(false)}
      />
      <MilestonesModal
        visible={showMilestones}
        state={state}
        onDismiss={() => setShowMilestones(false)}
      />
      <UpgradesModal
        visible={showUpgrades}
        state={state}
        onPurchaseSpeed={handleBuyUpgrade}
        onPurchaseProfit={handleBuyProfitUpgrade}
        onPurchaseStarUpgrade={handleBuyStarUpgrade}
        onDismiss={() => setShowUpgrades(false)}
      />

      <StatsModal
        visible={showStats}
        state={state}
        onDismiss={() => setShowStats(false)}
      />

      {/* Milestone Toasts */}
      {milestoneQueue.length > 0 && (
        <MilestoneToast
          label={milestoneQueue[0].label}
          tickets={milestoneQueue[0].tickets}
          onDone={() => setMilestoneQueue((prev) => prev.slice(1))}
        />
      )}
    </Wrapper>
  );
}

// ═══════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: '#666',
    textTransform: 'uppercase',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    gap: 6,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statValue: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#1a1a1a',
  },
  statLabel: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#1a1a1a',
  },
  trophyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fec90e',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#fec90e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  trophyStar: {
    width: 14,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }],
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 12,
  },
  onboardingHint: {
    marginHorizontal: 0,
  },
  onboardingGrad: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  onboardingText: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  onboardingArrow: {
    fontFamily: 'Knockout',
    fontSize: 20,
    color: '#fff',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
  actionGrad: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionText: {
    fontFamily: 'Shark',
    fontSize: 14,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  prestigeBtn: {
    marginTop: 8,
  },
  prestigeGrad: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#8e2de2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  prestigeText: {
    fontFamily: 'Shark',
    fontSize: 20,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  prestigeSubtext: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  resetBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 12,
  },
  resetText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'underline',
  },
});
