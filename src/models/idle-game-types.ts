// ─── Shark Park Idle Game Types ───

export interface RideDefinition {
  id: string;
  name: string;
  baseCost: number;
  baseIncome: number;
  speedMs: number;
  unlockLevel: number;
  colors: [string, string]; // gradient pair
  initial: string;
  managerCost: number;
  coefficient: number; // per-ride cost scaling factor
}

export interface SpeedUpgrade {
  id: string;
  rideId: string; // which ride it applies to, or 'all' for global
  label: string;
  multiplier: number; // e.g., 2 = twice as fast (half the speedMs)
  cost: number;
}

export interface ProfitUpgrade {
  id: string;
  rideId: string; // specific ride, or 'all' for global
  label: string;
  multiplier: number; // typically 3
  cost: number;
}

export interface StarPointUpgrade {
  id: string;
  label: string;
  cost: number; // star points to spend
  rideId: string; // 'all' for global
  profitMultiplier: number;
}

export interface SynergyBonus {
  sourceRideId: string;
  sourceCount: number;
  targetRideId: string; // 'all' for global
  profitMultiplier: number;
  label: string;
}

export interface RideState {
  id: string;
  owned: number;
  /** Timestamp (ms) when the current cycle started, or 0 if idle */
  cycleStartedAt: number;
  hasManager: boolean;
  speedMultiplier: number;
}

export interface MilestoneDefinition {
  id: string;
  label: string;
  description: string;
  ticketReward: number;
  check: (state: ParkState) => boolean;
}

export type BuyMultiplier = 1 | 10 | 100 | 'max';

export interface ParkState {
  cash: number;
  tickets: number;
  rides: Record<string, RideState>;
  unlockedMilestones: string[];
  lastSavedAt: number; // epoch ms
  starPoints: number;
  lifetimeEarnings: number;
  prestigeCount: number;
  purchasedUpgrades: string[];
  purchasedProfitUpgrades: string[];
  spentStarPoints: number;
  purchasedStarUpgrades: string[];
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
}
