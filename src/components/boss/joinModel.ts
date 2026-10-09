/**
 * Boss fight join rules, shown before a player pays (pure, tested).
 * Mirrors config/boss.php: 10 Energy per attack, 1 Ticket once per raid when
 * joining from home, home damage and rewards at the remote rate, no Ride Parts
 * and no MVP Ticket from home. Rewards come from the raid payload when the
 * server sends them (`raid.rewards`), else from the config defaults.
 */
import type { BossRaid } from '../../api/endpoints/parks/raid';

export interface RewardPreview { readonly coins: number; readonly xp: number; readonly energy: number; readonly parts: number }
export interface JoinCost {
  readonly energy: number;
  readonly ticket: number;
  readonly energyAfter: number;
  readonly ticketsAfter: number;
  readonly short: null | { readonly kind: 'energy' | 'ticket'; readonly need: number; readonly have: number };
}

/** config('boss.rewards.defeated') defaults, used when the raid does not send its own. */
export const DEFAULT_WIN_REWARDS: RewardPreview = { coins: 50, xp: 100, energy: 20, parts: 2 };

export function joinCost(raid: Pick<BossRaid, 'energy_cost' | 'remote'>, remote: boolean, energy: number, tickets: number): JoinCost {
  const ticket = remote && !raid.remote.joined ? Math.max(0, raid.remote.ticket_cost) : 0;
  const cost = Math.max(0, raid.energy_cost);
  const short = energy < cost ? { kind: 'energy' as const, need: cost, have: energy }
    : tickets < ticket ? { kind: 'ticket' as const, need: ticket, have: tickets } : null;
  return { energy: cost, ticket, energyAfter: Math.max(0, energy - cost), ticketsAfter: Math.max(0, tickets - ticket), short };
}

/** What this player gets if the team wins: home-only fighters get the remote rate and no Ride Parts. */
export function rewardPreview(raid: Pick<BossRaid, 'remote' | 'you'> & { rewards?: Partial<RewardPreview> | null }, remote: boolean): RewardPreview {
  const base = { ...DEFAULT_WIN_REWARDS, ...(raid.rewards ?? {}) };
  const foughtInPerson = (raid.you.log ?? []).some(a => !a.remote);
  if (!remote || foughtInPerson) return base;
  const rate = raid.remote.reward_rate ?? raid.remote.damage_rate ?? 0.6;
  return { coins: Math.floor(base.coins * rate), xp: Math.floor(base.xp * rate), energy: base.energy, parts: 0 };
}

/** Plain words for a shortfall, with where to get more. */
export function shortfallCopy(short: JoinCost['short']): string | null {
  if (!short) return null;
  if (short.kind === 'energy') {
    return `Need ${short.need - short.have} more Energy. Get it from home finds, rides and your daily chest.`;
  }
  return 'Joining from home needs 1 Ticket. Grab home finds to get more.';
}

/** The join button's verb: repeat attackers skip straight to ATTACK AGAIN. */
export function joinLabel(raid: Pick<BossRaid, 'you'>, remote: boolean): string {
  return raid.you.attacks > 0 ? 'ATTACK AGAIN' : remote ? 'JOIN FROM HOME' : 'FIGHT!';
}
