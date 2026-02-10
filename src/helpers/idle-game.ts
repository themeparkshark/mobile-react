// ─── Shark Park Idle Game Logic ───
import {
  RideDefinition,
  RideState,
  MilestoneDefinition,
  ParkState,
  BuyMultiplier,
  SpeedUpgrade,
  ProfitUpgrade,
  StarPointUpgrade,
  SynergyBonus,
} from '../models/idle-game-types';

// ── Ride Definitions ──

export const RIDES: RideDefinition[] = [
  {
    id: 'teacups',
    name: 'Teacups',
    baseCost: 10,
    baseIncome: 1,
    speedMs: 1000,
    unlockLevel: 0,
    colors: ['#00c6ff', '#0072ff'],
    initial: 'T',
    managerCost: 150,
    coefficient: 1.07,
  },
  {
    id: 'bumper_cars',
    name: 'Bumper Cars',
    baseCost: 100,
    baseIncome: 10,
    speedMs: 3000,
    unlockLevel: 5,
    colors: ['#f7971e', '#ffd200'],
    initial: 'B',
    managerCost: 1500,
    coefficient: 1.15,
  },
  {
    id: 'log_flume',
    name: 'Log Flume',
    baseCost: 1000,
    baseIncome: 80,
    speedMs: 6000,
    unlockLevel: 10,
    colors: ['#11998e', '#38ef7d'],
    initial: 'L',
    managerCost: 15000,
    coefficient: 1.14,
  },
  {
    id: 'carousel',
    name: 'Carousel',
    baseCost: 10000,
    baseIncome: 500,
    speedMs: 10000,
    unlockLevel: 18,
    colors: ['#ee0979', '#ff6a00'],
    initial: 'C',
    managerCost: 150000,
    coefficient: 1.13,
  },
  {
    id: 'roller_coaster',
    name: 'Roller Coaster',
    baseCost: 100000,
    baseIncome: 4000,
    speedMs: 20000,
    unlockLevel: 25,
    colors: ['#8e2de2', '#4a00e0'],
    initial: 'R',
    managerCost: 1500000,
    coefficient: 1.12,
  },
  {
    id: 'ferris_wheel',
    name: 'Ferris Wheel',
    baseCost: 500000,
    baseIncome: 20000,
    speedMs: 30000,
    unlockLevel: 35,
    colors: ['#667eea', '#764ba2'],
    initial: 'F',
    managerCost: 7500000,
    coefficient: 1.11,
  },
  {
    id: 'river_rapids',
    name: 'River Rapids',
    baseCost: 2500000,
    baseIncome: 100000,
    speedMs: 45000,
    unlockLevel: 50,
    colors: ['#00b4db', '#0083b0'],
    initial: 'W',
    managerCost: 37500000,
    coefficient: 1.10,
  },
  {
    id: 'mine_train',
    name: 'Mine Train',
    baseCost: 15000000,
    baseIncome: 500000,
    speedMs: 60000,
    unlockLevel: 75,
    colors: ['#b8860b', '#cd853f'],
    initial: 'M',
    managerCost: 225000000,
    coefficient: 1.09,
  },
  {
    id: 'mega_coaster',
    name: 'Mega Coaster',
    baseCost: 100000000,
    baseIncome: 2500000,
    speedMs: 60000,
    unlockLevel: 100,
    colors: ['#ff416c', '#ff4b2b'],
    initial: 'X',
    managerCost: 1500000000,
    coefficient: 1.08,
  },
  {
    id: 'shark_attack',
    name: 'Shark Attack',
    baseCost: 1000000000,
    baseIncome: 15000000,
    speedMs: 60000,
    unlockLevel: 150,
    colors: ['#09268f', '#00a5f5'],
    initial: 'S',
    managerCost: 15000000000,
    coefficient: 1.07,
  },
];

// ── Speed Upgrades ──

export const SPEED_UPGRADES: SpeedUpgrade[] = [
  { id: 'tea_speed1', rideId: 'teacups', label: 'Teacups x2 Speed', multiplier: 2, cost: 5000 },
  { id: 'tea_speed2', rideId: 'teacups', label: 'Teacups x4 Speed', multiplier: 2, cost: 50000 },
  { id: 'bump_speed1', rideId: 'bumper_cars', label: 'Bumper Cars x2 Speed', multiplier: 2, cost: 25000 },
  { id: 'bump_speed2', rideId: 'bumper_cars', label: 'Bumper Cars x4 Speed', multiplier: 2, cost: 250000 },
  { id: 'log_speed1', rideId: 'log_flume', label: 'Log Flume x2 Speed', multiplier: 2, cost: 100000 },
  { id: 'carousel_speed1', rideId: 'carousel', label: 'Carousel x2 Speed', multiplier: 2, cost: 500000 },
  { id: 'coaster_speed1', rideId: 'roller_coaster', label: 'Roller Coaster x2 Speed', multiplier: 2, cost: 2500000 },
  { id: 'global_speed1', rideId: 'all', label: 'All Rides x2 Speed', multiplier: 2, cost: 10000000 },
  { id: 'global_speed2', rideId: 'all', label: 'All Rides x3 Speed', multiplier: 1.5, cost: 100000000 },
];

// ── Profit Upgrades (Cash) ──

export const PROFIT_UPGRADES: ProfitUpgrade[] = [
  // Teacups
  { id: 'tea_profit1', rideId: 'teacups', label: 'Teacups x3 Profit', multiplier: 3, cost: 500 },
  { id: 'tea_profit2', rideId: 'teacups', label: 'Teacups x3 Profit', multiplier: 3, cost: 50000 },
  { id: 'tea_profit3', rideId: 'teacups', label: 'Teacups x3 Profit', multiplier: 3, cost: 5000000 },
  // Bumper Cars
  { id: 'bump_profit1', rideId: 'bumper_cars', label: 'Bumper Cars x3 Profit', multiplier: 3, cost: 5000 },
  { id: 'bump_profit2', rideId: 'bumper_cars', label: 'Bumper Cars x3 Profit', multiplier: 3, cost: 500000 },
  { id: 'bump_profit3', rideId: 'bumper_cars', label: 'Bumper Cars x3 Profit', multiplier: 3, cost: 50000000 },
  // Log Flume
  { id: 'log_profit1', rideId: 'log_flume', label: 'Log Flume x3 Profit', multiplier: 3, cost: 50000 },
  { id: 'log_profit2', rideId: 'log_flume', label: 'Log Flume x3 Profit', multiplier: 3, cost: 5000000 },
  { id: 'log_profit3', rideId: 'log_flume', label: 'Log Flume x3 Profit', multiplier: 3, cost: 500000000 },
  // Carousel
  { id: 'car_profit1', rideId: 'carousel', label: 'Carousel x3 Profit', multiplier: 3, cost: 500000 },
  { id: 'car_profit2', rideId: 'carousel', label: 'Carousel x3 Profit', multiplier: 3, cost: 50000000 },
  { id: 'car_profit3', rideId: 'carousel', label: 'Carousel x3 Profit', multiplier: 3, cost: 5000000000 },
  // Roller Coaster
  { id: 'rc_profit1', rideId: 'roller_coaster', label: 'Roller Coaster x3 Profit', multiplier: 3, cost: 5000000 },
  { id: 'rc_profit2', rideId: 'roller_coaster', label: 'Roller Coaster x3 Profit', multiplier: 3, cost: 500000000 },
  // Ferris Wheel
  { id: 'fw_profit1', rideId: 'ferris_wheel', label: 'Ferris Wheel x3 Profit', multiplier: 3, cost: 25000000 },
  { id: 'fw_profit2', rideId: 'ferris_wheel', label: 'Ferris Wheel x3 Profit', multiplier: 3, cost: 2500000000 },
  // River Rapids
  { id: 'rr_profit1', rideId: 'river_rapids', label: 'River Rapids x3 Profit', multiplier: 3, cost: 125000000 },
  { id: 'rr_profit2', rideId: 'river_rapids', label: 'River Rapids x3 Profit', multiplier: 3, cost: 12500000000 },
  // Mine Train
  { id: 'mt_profit1', rideId: 'mine_train', label: 'Mine Train x3 Profit', multiplier: 3, cost: 750000000 },
  // Mega Coaster
  { id: 'mc_profit1', rideId: 'mega_coaster', label: 'Mega Coaster x3 Profit', multiplier: 3, cost: 5000000000 },
  // Shark Attack
  { id: 'sa_profit1', rideId: 'shark_attack', label: 'Shark Attack x3 Profit', multiplier: 3, cost: 50000000000 },
  // Global
  { id: 'all_profit1', rideId: 'all', label: 'All Rides x3 Profit', multiplier: 3, cost: 100000000000 },
];

// ── Star Point Upgrades (Angel Upgrades) ──

export const STAR_POINT_UPGRADES: StarPointUpgrade[] = [
  { id: 'sp_all_x3', label: 'All Rides x3 Profit', cost: 5, rideId: 'all', profitMultiplier: 3 },
  { id: 'sp_all_x3_2', label: 'All Rides x3 Profit', cost: 25, rideId: 'all', profitMultiplier: 3 },
  { id: 'sp_all_x3_3', label: 'All Rides x3 Profit', cost: 100, rideId: 'all', profitMultiplier: 3 },
  { id: 'sp_all_x7', label: 'All Rides x7 Profit', cost: 500, rideId: 'all', profitMultiplier: 7 },
  { id: 'sp_all_x7_2', label: 'All Rides x7 Profit', cost: 2500, rideId: 'all', profitMultiplier: 7 },
  { id: 'sp_all_x11', label: 'All Rides x11 Profit', cost: 10000, rideId: 'all', profitMultiplier: 11 },
  // Per-ride
  { id: 'sp_tea_x3', label: 'Teacups x3 Profit', cost: 3, rideId: 'teacups', profitMultiplier: 3 },
  { id: 'sp_bump_x3', label: 'Bumper Cars x3 Profit', cost: 10, rideId: 'bumper_cars', profitMultiplier: 3 },
  { id: 'sp_log_x3', label: 'Log Flume x3 Profit', cost: 30, rideId: 'log_flume', profitMultiplier: 3 },
  { id: 'sp_car_x3', label: 'Carousel x3 Profit', cost: 75, rideId: 'carousel', profitMultiplier: 3 },
  { id: 'sp_rc_x3', label: 'Roller Coaster x3 Profit', cost: 200, rideId: 'roller_coaster', profitMultiplier: 3 },
];

// ── Synergy Bonuses ──

export const SYNERGY_BONUSES: SynergyBonus[] = [
  { sourceRideId: 'teacups', sourceCount: 100, targetRideId: 'all', profitMultiplier: 2, label: '100 Teacups: All Rides x2' },
  { sourceRideId: 'teacups', sourceCount: 200, targetRideId: 'all', profitMultiplier: 2, label: '200 Teacups: All Rides x2' },
  { sourceRideId: 'teacups', sourceCount: 300, targetRideId: 'all', profitMultiplier: 2, label: '300 Teacups: All Rides x2' },
  { sourceRideId: 'teacups', sourceCount: 400, targetRideId: 'all', profitMultiplier: 2, label: '400 Teacups: All Rides x2' },
  { sourceRideId: 'bumper_cars', sourceCount: 100, targetRideId: 'log_flume', profitMultiplier: 3, label: '100 Bumper Cars: Log Flume x3' },
  { sourceRideId: 'bumper_cars', sourceCount: 200, targetRideId: 'log_flume', profitMultiplier: 3, label: '200 Bumper Cars: Log Flume x3' },
  { sourceRideId: 'carousel', sourceCount: 100, targetRideId: 'ferris_wheel', profitMultiplier: 3, label: '100 Carousel: Ferris Wheel x3' },
  { sourceRideId: 'roller_coaster', sourceCount: 100, targetRideId: 'mega_coaster', profitMultiplier: 3, label: '100 Roller Coasters: Mega Coaster x3' },
  { sourceRideId: 'shark_attack', sourceCount: 50, targetRideId: 'shark_attack', profitMultiplier: 5, label: '50 Shark Attack: Self x5' },
];

// ── Cost Scaling (per-ride coefficient) ──

export function rideCost(def: RideDefinition, owned: number): number {
  return Math.floor(def.baseCost * Math.pow(def.coefficient, owned));
}

/** Cost to buy `count` rides starting from `owned` */
export function rideCostBulk(def: RideDefinition, owned: number, count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += rideCost(def, owned + i);
  }
  return total;
}

/** Max number of rides affordable given cash, starting from `owned` */
export function maxAffordable(def: RideDefinition, owned: number, cash: number): number {
  let count = 0;
  let total = 0;
  while (true) {
    const next = rideCost(def, owned + count);
    if (total + next > cash) break;
    total += next;
    count++;
    if (count > 10000) break; // safety
  }
  return count;
}

/** Resolve buy multiplier to actual count */
export function resolveBuyCount(
  mult: BuyMultiplier,
  def: RideDefinition,
  owned: number,
  cash: number
): number {
  if (mult === 'max') return maxAffordable(def, owned, cash);
  return mult as number;
}

// ── Speed Halving (replaces old milestoneMultiplier) ──

const SPEED_HALVING_THRESHOLDS = [25, 50, 100, 200, 300, 400];

/** Individual speed halving divisor based on owned count */
export function speedHalvingMultiplier(owned: number): number {
  let divisor = 1;
  for (const t of SPEED_HALVING_THRESHOLDS) {
    if (owned >= t) divisor *= 2;
  }
  return divisor;
}

/** Global speed halving — when ALL rides reach a milestone threshold */
export function globalSpeedHalvingMultiplier(state: ParkState): number {
  let divisor = 1;
  for (const t of SPEED_HALVING_THRESHOLDS) {
    const allReach = RIDES.every((d) => (state.rides[d.id]?.owned ?? 0) >= t);
    if (allReach) divisor *= 2;
  }
  return divisor;
}

// ── Effective Speed ──

/** Calculate effective speed for a ride, accounting for milestone halvings, purchased upgrades, and global halvings */
export function effectiveSpeedMs(
  def: RideDefinition,
  rideState: RideState,
  purchasedUpgrades: string[],
  state?: ParkState
): number {
  // Purchased speed upgrade multiplier (ride-specific)
  const rideSpeedMult = rideState.speedMultiplier || 1;

  // Purchased global speed upgrades
  let globalUpgradeMult = 1;
  for (const upg of SPEED_UPGRADES) {
    if (upg.rideId === 'all' && purchasedUpgrades.includes(upg.id)) {
      globalUpgradeMult *= upg.multiplier;
    }
  }

  // Individual milestone speed halving
  const individualHalving = speedHalvingMultiplier(rideState.owned);

  // Global milestone speed halving
  const globalHalving = state ? globalSpeedHalvingMultiplier(state) : 1;

  const totalDivisor = rideSpeedMult * globalUpgradeMult * individualHalving * globalHalving;
  return Math.max(def.speedMs / totalDivisor, 100); // min 100ms
}

// ── Profit Multipliers ──

/** Cash profit upgrade multiplier for a specific ride */
export function profitUpgradeMultiplier(rideId: string, purchasedProfitUpgrades: string[]): number {
  let mult = 1;
  for (const upg of PROFIT_UPGRADES) {
    if (purchasedProfitUpgrades.includes(upg.id)) {
      if (upg.rideId === rideId || upg.rideId === 'all') {
        mult *= upg.multiplier;
      }
    }
  }
  return mult;
}

/** Star point upgrade multiplier for a specific ride */
export function starPointUpgradeMultiplier(rideId: string, purchasedStarUpgrades: string[]): number {
  let mult = 1;
  for (const upg of STAR_POINT_UPGRADES) {
    if (purchasedStarUpgrades.includes(upg.id)) {
      if (upg.rideId === rideId || upg.rideId === 'all') {
        mult *= upg.profitMultiplier;
      }
    }
  }
  return mult;
}

/** Synergy multiplier for a specific ride based on other rides' ownership */
export function synergyMultiplier(rideId: string, state: ParkState): number {
  let mult = 1;
  for (const syn of SYNERGY_BONUSES) {
    if (syn.targetRideId === rideId || syn.targetRideId === 'all') {
      const sourceOwned = state.rides[syn.sourceRideId]?.owned ?? 0;
      if (sourceOwned >= syn.sourceCount) {
        mult *= syn.profitMultiplier;
      }
    }
  }
  return mult;
}

/** Get active synergy bonuses for display */
export function activeSynergies(state: ParkState): SynergyBonus[] {
  return SYNERGY_BONUSES.filter((syn) => {
    const sourceOwned = state.rides[syn.sourceRideId]?.owned ?? 0;
    return sourceOwned >= syn.sourceCount;
  });
}

// ── Income ──

/** Raw income per cycle for a ride (no prestige) */
export function rideIncome(def: RideDefinition, owned: number, state?: ParkState): number {
  if (owned === 0) return 0;
  const cashProfitMult = state ? profitUpgradeMultiplier(def.id, state.purchasedProfitUpgrades || []) : 1;
  const spUpgradeMult = state ? starPointUpgradeMultiplier(def.id, state.purchasedStarUpgrades || []) : 1;
  const synMult = state ? synergyMultiplier(def.id, state) : 1;
  return def.baseIncome * owned * cashProfitMult * spUpgradeMult * synMult;
}

/** Income per second for a single ride type */
export function rideIncomePerSecond(
  def: RideDefinition,
  owned: number,
  rideState?: RideState,
  purchasedUpgrades?: string[],
  state?: ParkState
): number {
  if (owned === 0) return 0;
  const cycleIncome = rideIncome(def, owned, state);
  const speed = rideState && purchasedUpgrades
    ? effectiveSpeedMs(def, rideState, purchasedUpgrades, state)
    : def.speedMs;
  return cycleIncome / (speed / 1000);
}

/** Total park income per second, including prestige multiplier */
export function totalIncomePerSecond(state: ParkState): number {
  let total = 0;
  for (const def of RIDES) {
    const rs = state.rides[def.id];
    if (rs && rs.owned > 0) {
      total += rideIncomePerSecond(def, rs.owned, rs, state.purchasedUpgrades || [], state);
    }
  }
  return total * prestigeMultiplier(state.starPoints, state.spentStarPoints || 0);
}

/** Income breakdown per ride */
export function incomeBreakdown(state: ParkState): { id: string; name: string; ips: number }[] {
  const mult = prestigeMultiplier(state.starPoints, state.spentStarPoints || 0);
  return RIDES.map((def) => {
    const rs = state.rides[def.id];
    const ips = rs && rs.owned > 0
      ? rideIncomePerSecond(def, rs.owned, rs, state.purchasedUpgrades || [], state) * mult
      : 0;
    return { id: def.id, name: def.name, ips };
  }).filter((r) => r.ips > 0);
}

// ── Prestige ──

/** Prestige passive multiplier: each active (unspent) star point gives +2% */
export function prestigeMultiplier(starPoints: number, spentStarPoints: number = 0): number {
  const active = Math.max(0, starPoints - spentStarPoints);
  return 1 + active * 0.02;
}

/** Calculate star points earned from lifetime earnings (AdCap sqrt formula) */
export function calculateStarPoints(lifetimeEarnings: number): number {
  if (lifetimeEarnings < 10000) return 0;
  return Math.floor(Math.sqrt(lifetimeEarnings / 10000));
}

/** Perform prestige: returns new state */
export function performPrestige(state: ParkState): ParkState {
  const earned = calculateStarPoints(state.lifetimeEarnings);
  const rides: Record<string, RideState> = {};
  for (const def of RIDES) {
    rides[def.id] = { id: def.id, owned: 0, cycleStartedAt: 0, hasManager: false, speedMultiplier: 1 };
  }
  // Keep global speed upgrades, reset ride-specific ones
  const keptUpgrades = (state.purchasedUpgrades || []).filter((id) => {
    const upg = SPEED_UPGRADES.find((u) => u.id === id);
    return upg && upg.rideId === 'all';
  });
  return {
    cash: 25,
    tickets: state.tickets,
    rides,
    unlockedMilestones: state.unlockedMilestones,
    lastSavedAt: Date.now(),
    starPoints: state.starPoints + earned,
    lifetimeEarnings: 0,
    prestigeCount: state.prestigeCount + 1,
    purchasedUpgrades: keptUpgrades,
    purchasedProfitUpgrades: [], // Cash upgrades reset on prestige (like AdCap)
    spentStarPoints: state.spentStarPoints || 0, // Preserve spent count
    purchasedStarUpgrades: state.purchasedStarUpgrades || [], // SP upgrades persist
  };
}

// ── Park Level ──
export function parkLevel(state: ParkState): number {
  let total = 0;
  for (const def of RIDES) {
    const rs = state.rides[def.id];
    if (rs) total += rs.owned;
  }
  return total;
}

// ── Offline Earnings ──

const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000; // 8 hours

export function calculateOfflineEarnings(state: ParkState, now: number): number {
  if (!state.lastSavedAt) return 0;
  const elapsed = Math.min(now - state.lastSavedAt, MAX_OFFLINE_MS);
  if (elapsed < 5000) return 0;
  const ips = totalIncomePerSecond(state);
  return Math.floor(ips * (elapsed / 1000));
}

// ── Milestones (achievement system — separate from speed halvings) ──

export const MILESTONES: MilestoneDefinition[] = [
  {
    id: 'first_ride',
    label: 'First Ride!',
    description: 'Place your first ride',
    ticketReward: 1,
    check: (s) => {
      for (const def of RIDES) {
        if ((s.rides[def.id]?.owned ?? 0) > 0) return true;
      }
      return false;
    },
  },
  {
    id: '10_rides',
    label: 'Getting Started',
    description: 'Own 10 rides total',
    ticketReward: 2,
    check: (s) => parkLevel(s) >= 10,
  },
  {
    id: '1k_income',
    label: 'Cash Machine',
    description: 'Reach $1,000/sec income',
    ticketReward: 3,
    check: (s) => totalIncomePerSecond(s) >= 1000,
  },
  {
    id: '25_any',
    label: 'Ride Tycoon',
    description: 'Own 25 of any single ride',
    ticketReward: 3,
    check: (s) => {
      for (const def of RIDES) {
        if ((s.rides[def.id]?.owned ?? 0) >= 25) return true;
      }
      return false;
    },
  },
  {
    id: '50_any',
    label: 'Mega Park',
    description: 'Own 50 of any single ride',
    ticketReward: 5,
    check: (s) => {
      for (const def of RIDES) {
        if ((s.rides[def.id]?.owned ?? 0) >= 50) return true;
      }
      return false;
    },
  },
  {
    id: 'all_5_original',
    label: 'Full House',
    description: 'Own all 5 original rides',
    ticketReward: 5,
    check: (s) => {
      const originals = ['teacups', 'bumper_cars', 'log_flume', 'carousel', 'roller_coaster'];
      return originals.every((id) => (s.rides[id]?.owned ?? 0) > 0);
    },
  },
  {
    id: 'first_manager',
    label: 'Delegator',
    description: 'Hire your first manager',
    ticketReward: 3,
    check: (s) => {
      for (const def of RIDES) {
        if (s.rides[def.id]?.hasManager) return true;
      }
      return false;
    },
  },
  {
    id: 'all_managers',
    label: 'Fully Staffed',
    description: 'Hire all managers',
    ticketReward: 10,
    check: (s) => {
      for (const def of RIDES) {
        const rs = s.rides[def.id];
        if (rs && rs.owned > 0 && !rs.hasManager) return false;
        if (!rs || rs.owned === 0) return false;
      }
      return true;
    },
  },
  {
    id: '10k_income',
    label: 'Money Printer',
    description: 'Reach $10K/sec income',
    ticketReward: 5,
    check: (s) => totalIncomePerSecond(s) >= 10000,
  },
  {
    id: '100k_income',
    label: 'Gold Rush',
    description: 'Reach $100K/sec income',
    ticketReward: 8,
    check: (s) => totalIncomePerSecond(s) >= 100000,
  },
  {
    id: '1m_income',
    label: 'Shark Mogul',
    description: 'Reach $1M/sec income',
    ticketReward: 15,
    check: (s) => totalIncomePerSecond(s) >= 1000000,
  },
  {
    id: 'first_prestige',
    label: 'Reborn',
    description: 'Prestige for the first time',
    ticketReward: 10,
    check: (s) => s.prestigeCount >= 1,
  },
  {
    id: '100_any',
    label: 'Century Club',
    description: 'Own 100 of any single ride',
    ticketReward: 8,
    check: (s) => {
      for (const def of RIDES) {
        if ((s.rides[def.id]?.owned ?? 0) >= 100) return true;
      }
      return false;
    },
  },
  {
    id: '200_any',
    label: 'Double Century',
    description: 'Own 200 of any single ride',
    ticketReward: 12,
    check: (s) => {
      for (const def of RIDES) {
        if ((s.rides[def.id]?.owned ?? 0) >= 200) return true;
      }
      return false;
    },
  },
  {
    id: 'level_50',
    label: 'Halfway There',
    description: 'Reach level 50',
    ticketReward: 5,
    check: (s) => parkLevel(s) >= 50,
  },
  {
    id: 'level_100',
    label: 'Triple Digits',
    description: 'Reach level 100',
    ticketReward: 10,
    check: (s) => parkLevel(s) >= 100,
  },
  {
    id: 'level_150',
    label: 'Park Legend',
    description: 'Reach level 150',
    ticketReward: 15,
    check: (s) => parkLevel(s) >= 150,
  },
];

// ── Number Formatting ──

const SUFFIXES = [
  { threshold: 1e33, suffix: 'D' },   // Decillion
  { threshold: 1e30, suffix: 'N' },   // Nonillion
  { threshold: 1e27, suffix: 'Oc' },  // Octillion
  { threshold: 1e24, suffix: 'Sp' },  // Septillion
  { threshold: 1e21, suffix: 'Sx' },  // Sextillion
  { threshold: 1e18, suffix: 'Qi' },  // Quintillion
  { threshold: 1e15, suffix: 'Q' },   // Quadrillion
  { threshold: 1e12, suffix: 'T' },   // Trillion
  { threshold: 1e9, suffix: 'B' },    // Billion
  { threshold: 1e6, suffix: 'M' },    // Million
  { threshold: 1e3, suffix: 'K' },    // Thousand
];

export function formatCash(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  for (const { threshold, suffix } of SUFFIXES) {
    if (n >= threshold) {
      const val = n / threshold;
      return (val < 100 ? val.toFixed(1).replace(/\.0$/, '') : Math.floor(val).toString()) + suffix;
    }
  }
  return Math.floor(n).toString();
}

export function formatCashFull(n: number): string {
  return Math.floor(n).toLocaleString();
}

// ── Default State ──

export function createDefaultState(): ParkState {
  const rides: Record<string, RideState> = {};
  for (const def of RIDES) {
    rides[def.id] = { id: def.id, owned: 0, cycleStartedAt: 0, hasManager: false, speedMultiplier: 1 };
  }
  return {
    cash: 25,
    tickets: 0,
    rides,
    unlockedMilestones: [],
    lastSavedAt: Date.now(),
    starPoints: 0,
    lifetimeEarnings: 0,
    prestigeCount: 0,
    purchasedUpgrades: [],
    purchasedProfitUpgrades: [],
    spentStarPoints: 0,
    purchasedStarUpgrades: [],
  };
}

/** Migrate old save data to new format */
export function migrateState(saved: Record<string, unknown>): ParkState {
  const state = saved as unknown as ParkState;
  // Add missing fields
  if (state.starPoints === undefined) state.starPoints = 0;
  if (state.lifetimeEarnings === undefined) state.lifetimeEarnings = 0;
  if (state.prestigeCount === undefined) state.prestigeCount = 0;
  if (!state.purchasedUpgrades) state.purchasedUpgrades = [];
  if (!state.purchasedProfitUpgrades) state.purchasedProfitUpgrades = [];
  if (state.spentStarPoints === undefined) state.spentStarPoints = 0;
  if (!state.purchasedStarUpgrades) state.purchasedStarUpgrades = [];

  // Ensure all rides exist and have all fields
  for (const def of RIDES) {
    if (!state.rides[def.id]) {
      state.rides[def.id] = { id: def.id, owned: 0, cycleStartedAt: 0, hasManager: false, speedMultiplier: 1 };
    } else {
      if (state.rides[def.id].hasManager === undefined) {
        state.rides[def.id].hasManager = false;
      }
      if (state.rides[def.id].speedMultiplier === undefined) {
        state.rides[def.id].speedMultiplier = 1;
      }
    }
  }
  return state;
}

// ── Storage ──

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@shark_park_state';

export async function saveState(state: ParkState): Promise<void> {
  state.lastSavedAt = Date.now();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function loadState(): Promise<ParkState | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  } catch {
    return null;
  }
}

export async function clearState(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
