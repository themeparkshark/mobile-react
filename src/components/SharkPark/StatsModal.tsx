import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ParkState } from '../../models/idle-game-types';
import {
  formatCash,
  formatCashFull,
  totalIncomePerSecond,
  parkLevel,
  prestigeMultiplier,
  RIDES,
  MILESTONES,
} from '../../helpers/idle-game';

interface Props {
  visible: boolean;
  state: ParkState;
  onDismiss: () => void;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function StatsModal({ visible, state, onDismiss }: Props) {
  if (!visible) return null;

  const level = parkLevel(state);
  const ips = totalIncomePerSecond(state);
  const mult = prestigeMultiplier(state.starPoints, state.spentStarPoints || 0);
  const totalManagers = RIDES.filter((d) => state.rides[d.id]?.hasManager).length;
  const ownedRideTypes = RIDES.filter((d) => (state.rides[d.id]?.owned ?? 0) > 0).length;
  const totalUpgrades =
    (state.purchasedUpgrades?.length ?? 0) +
    (state.purchasedProfitUpgrades?.length ?? 0) +
    (state.purchasedStarUpgrades?.length ?? 0);
  const completedMilestones = state.unlockedMilestones.length;
  const totalTicketsEarned = MILESTONES.filter((m) =>
    state.unlockedMilestones.includes(m.id)
  ).reduce((sum, m) => sum + m.ticketReward, 0);

  // Find highest owned ride
  let highestRide = '';
  let highestCount = 0;
  for (const def of RIDES) {
    const owned = state.rides[def.id]?.owned ?? 0;
    if (owned > highestCount) {
      highestCount = owned;
      highestRide = def.name;
    }
  }

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <View style={[styles.card, { maxHeight: 520 }]}>
          <Text style={styles.title}>Park Stats</Text>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.section}>ECONOMY</Text>
            <StatRow label="Cash" value={`$${formatCash(state.cash)}`} />
            <StatRow label="Income/sec" value={`$${formatCash(ips)}`} />
            <StatRow label="Lifetime Earnings" value={`$${formatCash(state.lifetimeEarnings)}`} />
            <StatRow label="Tickets Earned" value={`${totalTicketsEarned}`} />
            <StatRow label="Current Tickets" value={`${state.tickets}`} />

            <Text style={[styles.section, { marginTop: 16 }]}>PARK</Text>
            <StatRow label="Park Level" value={`${level}`} />
            <StatRow label="Ride Types Owned" value={`${ownedRideTypes}/${RIDES.length}`} />
            <StatRow label="Total Managers" value={`${totalManagers}/${RIDES.length}`} />
            <StatRow label="Upgrades Purchased" value={`${totalUpgrades}`} />
            {highestRide && (
              <StatRow label="Most Owned Ride" value={`${highestRide} (${highestCount})`} />
            )}

            <Text style={[styles.section, { marginTop: 16 }]}>PRESTIGE</Text>
            <StatRow label="Total Prestiges" value={`${state.prestigeCount}`} />
            <StatRow label="Star Points" value={`${state.starPoints}`} />
            <StatRow label="Spent Star Points" value={`${state.spentStarPoints || 0}`} />
            <StatRow label="Income Multiplier" value={`${mult.toFixed(2)}x`} />

            <Text style={[styles.section, { marginTop: 16 }]}>ACHIEVEMENTS</Text>
            <StatRow
              label="Milestones"
              value={`${completedMilestones}/${MILESTONES.length}`}
            />
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
    padding: 28,
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
    fontSize: 24,
    color: '#09268f',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  scroll: {
    width: '100%',
    maxHeight: 360,
    marginBottom: 16,
  },
  section: {
    fontFamily: 'Shark',
    fontSize: 11,
    color: '#00a5f5',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecf0',
    paddingBottom: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statLabel: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#666',
  },
  statValue: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: '#1a1a1a',
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
    fontSize: 16,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
});
