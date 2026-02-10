import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AnimatedCounter from '../AnimatedCounter';
import {
  formatCash,
  formatCashFull,
  MILESTONES,
  SPEED_UPGRADES,
  PROFIT_UPGRADES,
  STAR_POINT_UPGRADES,
  SYNERGY_BONUSES,
  activeSynergies,
  prestigeMultiplier,
} from '../../helpers/idle-game';
import { ParkState, SpeedUpgrade, ProfitUpgrade, StarPointUpgrade } from '../../models/idle-game-types';

// ── Welcome Back Modal ──
export function WelcomeBackModal({
  visible,
  earnings,
  onDismiss,
}: {
  visible: boolean;
  earnings: number;
  onDismiss: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          <Text style={styles.title}>Welcome Back!</Text>
          <Text style={styles.subtitle}>Your park earned while you were away</Text>
          <View style={styles.earningsRow}>
            <AnimatedCounter
              value={earnings}
              duration={2000}
              prefix="$"
              style={styles.earningsText}
              formatNumber
            />
          </View>
          <Pressable onPress={onDismiss} style={styles.button}>
            <LinearGradient
              colors={['#fec90e', '#f7971e'] as any}
              style={styles.buttonGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.buttonText}>COLLECT</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Income Breakdown Modal ──
export function IncomeBreakdownModal({
  visible,
  breakdown,
  totalIps,
  state,
  onDismiss,
}: {
  visible: boolean;
  breakdown: { id: string; name: string; ips: number }[];
  totalIps: number;
  state: ParkState;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  const synergies = activeSynergies(state);

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View style={styles.card}>
          <Text style={styles.title}>Income Breakdown</Text>
          <Text style={styles.subtitle}>Total: ${formatCashFull(totalIps)}/sec</Text>
          <ScrollView style={styles.breakdownScroll}>
            {breakdown.map((r) => {
              const pct = totalIps > 0 ? ((r.ips / totalIps) * 100).toFixed(1) : '0';
              return (
                <View key={r.id} style={styles.breakdownRow}>
                  <Text style={styles.breakdownName}>{r.name}</Text>
                  <View style={styles.breakdownRight}>
                    <Text style={styles.breakdownIps}>${formatCash(r.ips)}/s</Text>
                    <Text style={styles.breakdownPct}>{pct}%</Text>
                  </View>
                </View>
              );
            })}
            {synergies.length > 0 && (
              <View style={styles.synergySection}>
                <Text style={styles.synergySectionTitle}>ACTIVE SYNERGIES</Text>
                {synergies.map((syn, i) => (
                  <Text key={i} style={styles.synergyText}>{syn.label}</Text>
                ))}
              </View>
            )}
          </ScrollView>
          <Pressable onPress={onDismiss} style={styles.button}>
            <View style={[styles.buttonGrad, { backgroundColor: '#09268f' }]}>
              <Text style={styles.buttonText}>CLOSE</Text>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Prestige Confirm Modal ──
export function PrestigeModal({
  visible,
  currentStarPoints,
  earnedStarPoints,
  spentStarPoints,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  currentStarPoints: number;
  earnedStarPoints: number;
  spentStarPoints: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;

  const newTotal = currentStarPoints + earnedStarPoints;
  const activeAfter = newTotal - spentStarPoints;
  const passiveBonus = (Math.max(0, activeAfter) * 2).toFixed(0);
  const newMult = prestigeMultiplier(newTotal, spentStarPoints).toFixed(2);

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Prestige</Text>
          <Text style={styles.subtitle}>
            Reset rides, cash, and cash upgrades for Star Points
          </Text>
          <View style={styles.prestigeInfo}>
            <Text style={styles.prestigeLabel}>Star Points Earned</Text>
            <Text style={styles.prestigeValue}>+{earnedStarPoints}</Text>
            <Text style={styles.prestigeLabel}>New Total</Text>
            <Text style={styles.prestigeValue}>{newTotal}</Text>
            <Text style={styles.prestigeLabel}>Active (unspent)</Text>
            <Text style={styles.prestigeValue}>{Math.max(0, activeAfter)}</Text>
            <Text style={styles.prestigeLabel}>Passive Bonus</Text>
            <Text style={styles.prestigeValue}>+{passiveBonus}%</Text>
            <Text style={styles.prestigeLabel}>Income Multiplier</Text>
            <Text style={styles.prestigeValue}>{newMult}x</Text>
          </View>
          {spentStarPoints > 0 && (
            <Text style={styles.spWarning}>
              {spentStarPoints} SP spent on upgrades (reduces passive bonus but upgrade multipliers persist)
            </Text>
          )}
          <View style={styles.prestigeButtons}>
            <Pressable onPress={onCancel} style={[styles.button, { flex: 1 }]}>
              <View style={[styles.buttonGrad, { backgroundColor: '#999' }]}>
                <Text style={styles.buttonText}>CANCEL</Text>
              </View>
            </Pressable>
            <View style={{ width: 12 }} />
            <Pressable onPress={onConfirm} style={[styles.button, { flex: 1 }]}>
              <LinearGradient
                colors={['#8e2de2', '#4a00e0'] as any}
                style={styles.buttonGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.buttonText}>PRESTIGE</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Reset Confirm Modal ──
export function ResetModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Reset Park</Text>
          <Text style={styles.subtitle}>
            This will erase ALL progress including Star Points. Are you sure?
          </Text>
          <View style={styles.prestigeButtons}>
            <Pressable onPress={onCancel} style={[styles.button, { flex: 1 }]}>
              <View style={[styles.buttonGrad, { backgroundColor: '#09268f' }]}>
                <Text style={styles.buttonText}>KEEP</Text>
              </View>
            </Pressable>
            <View style={{ width: 12 }} />
            <Pressable onPress={onConfirm} style={[styles.button, { flex: 1 }]}>
              <View style={[styles.buttonGrad, { backgroundColor: '#e53e3e' }]}>
                <Text style={styles.buttonText}>RESET</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Milestones Modal ──
export function MilestonesModal({
  visible,
  state,
  onDismiss,
}: {
  visible: boolean;
  state: ParkState;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View style={[styles.card, { maxHeight: 500 }]}>
          <Text style={styles.title}>Milestones</Text>
          <Text style={styles.subtitle}>{state.unlockedMilestones.length}/{MILESTONES.length} completed</Text>
          <ScrollView style={styles.breakdownScroll} showsVerticalScrollIndicator={false}>
            {MILESTONES.map((m) => {
              const completed = state.unlockedMilestones.includes(m.id);
              return (
                <View
                  key={m.id}
                  style={[
                    styles.milestoneRow,
                    completed && styles.milestoneRowCompleted,
                  ]}
                >
                  <View style={styles.milestoneLeft}>
                    <View style={[styles.milestoneCheck, completed && styles.milestoneCheckDone]}>
                      {completed && <Text style={styles.milestoneCheckText}>OK</Text>}
                    </View>
                    <View style={styles.milestoneInfo}>
                      <Text style={[styles.milestoneName, completed && styles.milestoneNameDone]}>
                        {m.label}
                      </Text>
                      <Text style={styles.milestoneDesc}>{m.description}</Text>
                    </View>
                  </View>
                  <View style={styles.milestoneReward}>
                    <Text style={styles.milestoneTickets}>+{m.ticketReward}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <Pressable onPress={onDismiss} style={styles.button}>
            <View style={[styles.buttonGrad, { backgroundColor: '#09268f' }]}>
              <Text style={styles.buttonText}>CLOSE</Text>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Tab Pill ──
function TabPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tabPill, active && styles.tabPillActive]}>
      <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Upgrades Modal (Tabbed: Cash Upgrades + Star Point Upgrades) ──
export function UpgradesModal({
  visible,
  state,
  onPurchaseSpeed,
  onPurchaseProfit,
  onPurchaseStarUpgrade,
  onDismiss,
}: {
  visible: boolean;
  state: ParkState;
  onPurchaseSpeed: (upgrade: SpeedUpgrade) => void;
  onPurchaseProfit: (upgrade: ProfitUpgrade) => void;
  onPurchaseStarUpgrade: (upgrade: StarPointUpgrade) => void;
  onDismiss: () => void;
}) {
  const [tab, setTab] = useState<'cash' | 'star'>('cash');

  if (!visible) return null;

  const purchasedSpeed = state.purchasedUpgrades || [];
  const purchasedProfit = state.purchasedProfitUpgrades || [];
  const purchasedStar = state.purchasedStarUpgrades || [];
  const availableSP = state.starPoints - (state.spentStarPoints || 0);

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={[styles.card, { maxHeight: 560 }]} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Upgrades</Text>

          {/* Tab selector */}
          <View style={styles.tabRow}>
            <TabPill label="CASH" active={tab === 'cash'} onPress={() => setTab('cash')} />
            <TabPill label="STAR POINTS" active={tab === 'star'} onPress={() => setTab('star')} />
          </View>

          {tab === 'cash' && (
            <ScrollView style={styles.breakdownScroll} showsVerticalScrollIndicator={false}>
              {/* Speed Upgrades */}
              <Text style={styles.sectionLabel}>SPEED UPGRADES</Text>
              {SPEED_UPGRADES.map((upg) => {
                const owned = purchasedSpeed.includes(upg.id);
                const canAfford = state.cash >= upg.cost && !owned;
                return (
                  <View key={upg.id} style={styles.upgradeRow}>
                    <View style={styles.upgradeLeft}>
                      <Text style={styles.upgradeName}>{upg.label}</Text>
                      <Text style={styles.upgradeCost}>
                        {owned ? 'Purchased' : `$${formatCash(upg.cost)}`}
                      </Text>
                    </View>
                    {!owned && (
                      <Pressable onPress={() => onPurchaseSpeed(upg)} disabled={!canAfford}>
                        <View style={[styles.upgradeBuyBtn, !canAfford && { opacity: 0.4 }]}>
                          <Text style={styles.upgradeBuyText}>BUY</Text>
                        </View>
                      </Pressable>
                    )}
                    {owned && (
                      <View style={styles.upgradeOwnedBadge}>
                        <Text style={styles.upgradeOwnedText}>OK</Text>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Profit Upgrades */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>PROFIT UPGRADES</Text>
              {PROFIT_UPGRADES.map((upg) => {
                const owned = purchasedProfit.includes(upg.id);
                const canAfford = state.cash >= upg.cost && !owned;
                return (
                  <View key={upg.id} style={styles.upgradeRow}>
                    <View style={styles.upgradeLeft}>
                      <Text style={styles.upgradeName}>{upg.label}</Text>
                      <Text style={styles.upgradeCost}>
                        {owned ? 'Purchased' : `$${formatCash(upg.cost)}`}
                      </Text>
                    </View>
                    {!owned && (
                      <Pressable onPress={() => onPurchaseProfit(upg)} disabled={!canAfford}>
                        <View style={[styles.upgradeBuyBtn, !canAfford && { opacity: 0.4 }]}>
                          <Text style={styles.upgradeBuyText}>BUY</Text>
                        </View>
                      </Pressable>
                    )}
                    {owned && (
                      <View style={styles.upgradeOwnedBadge}>
                        <Text style={styles.upgradeOwnedText}>OK</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {tab === 'star' && (
            <ScrollView style={styles.breakdownScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.spHeader}>
                <Text style={styles.spHeaderLabel}>Available SP</Text>
                <Text style={styles.spHeaderValue}>{Math.max(0, availableSP)}</Text>
                <Text style={styles.spHeaderSub}>
                  Passive bonus: +{(Math.max(0, availableSP) * 2)}% | Spent: {state.spentStarPoints || 0}
                </Text>
              </View>
              {STAR_POINT_UPGRADES.map((upg) => {
                const owned = purchasedStar.includes(upg.id);
                const canAfford = availableSP >= upg.cost && !owned;
                return (
                  <View key={upg.id} style={styles.upgradeRow}>
                    <View style={styles.upgradeLeft}>
                      <Text style={styles.upgradeName}>{upg.label}</Text>
                      <Text style={[styles.upgradeCost, { color: '#8e2de2' }]}>
                        {owned ? 'Purchased' : `${upg.cost} SP`}
                      </Text>
                    </View>
                    {!owned && (
                      <Pressable onPress={() => onPurchaseStarUpgrade(upg)} disabled={!canAfford}>
                        <View style={[styles.spBuyBtn, !canAfford && { opacity: 0.4 }]}>
                          <Text style={styles.spBuyText}>BUY</Text>
                        </View>
                      </Pressable>
                    )}
                    {owned && (
                      <View style={styles.upgradeOwnedBadge}>
                        <Text style={styles.upgradeOwnedText}>OK</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          <Pressable onPress={onDismiss} style={styles.button}>
            <View style={[styles.buttonGrad, { backgroundColor: '#09268f' }]}>
              <Text style={styles.buttonText}>CLOSE</Text>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontFamily: 'Shark',
    fontSize: 28,
    color: '#09268f',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  earningsRow: {
    marginBottom: 24,
  },
  earningsText: {
    fontFamily: 'Knockout',
    fontSize: 42,
    color: '#fec90e',
  },
  button: {
    width: '100%',
  },
  buttonGrad: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  breakdownScroll: {
    maxHeight: 340,
    width: '100%',
    marginBottom: 20,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  breakdownName: {
    fontFamily: 'Shark',
    fontSize: 14,
    color: '#1a1a1a',
    textTransform: 'uppercase',
  },
  breakdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  breakdownIps: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#38ef7d',
  },
  breakdownPct: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#999',
    width: 48,
    textAlign: 'right',
  },
  synergySection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  synergySectionTitle: {
    fontFamily: 'Shark',
    fontSize: 12,
    color: '#8e2de2',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  synergyText: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: '#666',
    paddingVertical: 3,
  },
  prestigeInfo: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 2,
  },
  prestigeLabel: {
    fontFamily: 'Shark',
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    marginTop: 6,
  },
  prestigeValue: {
    fontFamily: 'Knockout',
    fontSize: 28,
    color: '#8e2de2',
  },
  prestigeButtons: {
    flexDirection: 'row',
    width: '100%',
  },
  spWarning: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#f7971e',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  // Milestones
  milestoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    borderRadius: 8,
  },
  milestoneRowCompleted: {
    backgroundColor: '#fffbeb',
  },
  milestoneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  milestoneCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  milestoneCheckDone: {
    backgroundColor: '#fec90e',
    borderColor: '#fec90e',
  },
  milestoneCheckText: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: '#fff',
  },
  milestoneInfo: {
    flex: 1,
  },
  milestoneName: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#666',
    textTransform: 'uppercase',
  },
  milestoneNameDone: {
    color: '#1a1a1a',
  },
  milestoneDesc: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  milestoneReward: {
    backgroundColor: '#f0f4f8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  milestoneTickets: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#f7971e',
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#e8ecf0',
  },
  tabPillActive: {
    backgroundColor: '#09268f',
  },
  tabPillText: {
    fontFamily: 'Shark',
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
  },
  tabPillTextActive: {
    color: '#fff',
  },
  // Section labels
  sectionLabel: {
    fontFamily: 'Shark',
    fontSize: 12,
    color: '#09268f',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  // SP Header
  spHeader: {
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecf0',
  },
  spHeaderLabel: {
    fontFamily: 'Shark',
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
  },
  spHeaderValue: {
    fontFamily: 'Knockout',
    fontSize: 36,
    color: '#8e2de2',
  },
  spHeaderSub: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  // Upgrades
  upgradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  upgradeLeft: {
    flex: 1,
  },
  upgradeName: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#1a1a1a',
    textTransform: 'uppercase',
  },
  upgradeCost: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  upgradeBuyBtn: {
    backgroundColor: '#fec90e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  upgradeBuyText: {
    fontFamily: 'Shark',
    fontSize: 12,
    color: '#1a1a1a',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  spBuyBtn: {
    backgroundColor: '#8e2de2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  spBuyText: {
    fontFamily: 'Shark',
    fontSize: 12,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  upgradeOwnedBadge: {
    backgroundColor: '#38ef7d',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upgradeOwnedText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#fff',
  },
});
