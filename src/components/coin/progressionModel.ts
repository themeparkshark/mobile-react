/**
 * Coin progression v2, app side (S2, progression.md 9): every timing, copy and
 * safety rule the level-up FX, perk track, proc chips, Crowning and re-mint
 * card follow. Pure (no React or native imports) so tools/tests can drive it.
 *
 * House rules: bright water cards, blue, white and gold, no emoji, no em
 * dashes, no dark or neon surfaces. The server decides every perk; the app
 * only shows chips the server returned.
 */
import { coinTier, LEGENDARY_COIN_LEVEL, MAX_COIN_LEVEL } from '../../constants/coinTiers';

// ── Server shapes ──────────────────────────────────────────────────

export type PerkKind = 'perk' | 'milestone' | 'boss';

export interface PerkTrackRow {
  readonly level: number;
  readonly key: string;
  readonly name: string;
  readonly short: string;
  readonly kind: PerkKind;
  readonly unlocked: boolean;
  readonly proc_today: boolean;
  readonly boss_glimpse?: boolean;
  readonly coins?: number;
}

export interface PerkChipData {
  readonly key: string;
  readonly label: string;
  readonly parts?: number;
  readonly energy?: number;
  readonly xp?: number;
  readonly tickets?: number;
}

export interface LevelUpUnlocks {
  readonly level: number;
  readonly kind: PerkKind;
  readonly key: string | null;
  readonly name: string | null;
  readonly short: string | null;
  readonly tier: string;
  readonly boss_unlocked: boolean;
  readonly glimpse_unlocked: boolean;
  readonly coins: number;
}

export type BossState = 'locked' | 'glimpse' | 'soon' | 'ready' | 'cleared';

export interface CoinBossBlock {
  readonly family: string | null;
  readonly name: string | null;
  readonly signature: string | null;
  readonly state: BossState;
  readonly groggy: boolean;
  readonly cleared: { readonly normal: boolean; readonly hard: boolean; readonly shark: boolean };
  readonly stars: number;
  readonly gilded_progress: { readonly done: number; readonly needed: number } | null;
  readonly twist_this_week: string | null;
}

export interface RemintCoin {
  readonly asset_id: number;
  readonly ride_name: string;
  readonly coin_url: string;
  readonly from_level: number;
  readonly to_level: number;
  readonly from_tier: string;
  readonly to_tier: string;
  readonly parts_refunded: number;
  readonly energy_refunded: number;
}

export interface RemintNotice {
  readonly id: string;
  readonly coins: readonly RemintCoin[];
  readonly total_parts: number;
  readonly total_energy: number;
}

// ── Level-up: three acts (9.3) ────────────────────────────────────

export const LEVEL_UP_ACTS = {
  charge: { start: 0, end: 900 },
  burst: { start: 900, end: 1500 },
  reveal: { start: 1500, end: 2600 },
} as const;

/** The charge holds for a slow server up to this long, then loops a hum. */
export const CHARGE_HOLD_MAX_MS = 2500;
/** Hit-stop at the burst. */
export const HIT_STOP_MS = 60;
/** Lv6+ flash: never brighter or longer than this (photosensitivity cap). */
export const FLASH_CAP = { opacity: 0.4, ms: 80 } as const;
export const SHATTER_SHARDS = 16;
export const CHARGE_SPARKS = 8;
export const MAX_PART_COGS = 12;

export interface LevelUpFx {
  readonly target: number;
  /** 'glow' Lv2-5, 'shatter' Lv6+, 'crossfade' under Reduce Motion. */
  readonly burst: 'glow' | 'shatter' | 'crossfade';
  /** The capped white flash, or null (Lv2-5, Reduce Motion, Dim Flashing Lights). */
  readonly flash: { readonly opacity: number; readonly ms: number } | null;
  readonly shards: number;
  readonly sparks: number;
  readonly cogs: number;
  readonly standRise: boolean;
  readonly cameraPush: number;
  /** Level 10 plays the Crowning instead of the plain reveal. */
  readonly crowning: boolean;
  /** Haptics on the same frame as audio: Light 300, Medium 600, Heavy 900, then Success. */
  readonly haptics: readonly { readonly at: number; readonly intent: 'tapLight' | 'hitMedium' | 'comboHeavy' | 'success' }[];
  readonly totalMs: number;
}

export function levelUpFx(target: number, partsSpent: number, options: { reducedMotion: boolean; dimFlashingLights?: boolean }): LevelUpFx {
  const level = Math.max(2, Math.min(MAX_COIN_LEVEL, Math.round(target)));
  const tier = coinTier(level);
  const reduced = options.reducedMotion;
  const flashAllowed = tier.burst === 'shatter' && !reduced && !options.dimFlashingLights;
  return {
    target: level,
    burst: reduced ? 'crossfade' : tier.burst === 'shatter' && flashAllowed ? 'shatter' : 'glow',
    flash: flashAllowed ? FLASH_CAP : null,
    shards: flashAllowed ? SHATTER_SHARDS : 0,
    sparks: reduced ? 0 : CHARGE_SPARKS,
    cogs: reduced ? 0 : Math.max(1, Math.min(MAX_PART_COGS, Math.round(partsSpent))),
    standRise: !reduced && tier.stand !== 'none' && level < MAX_COIN_LEVEL,
    cameraPush: !reduced && level >= 6 && level < MAX_COIN_LEVEL ? 1.08 : 1,
    crowning: level === MAX_COIN_LEVEL,
    haptics: reduced ? [{ at: 0, intent: 'success' }] : [
      { at: 300, intent: 'tapLight' }, { at: 600, intent: 'hitMedium' }, { at: 900, intent: 'comboHeavy' },
      { at: LEVEL_UP_ACTS.burst.start + HIT_STOP_MS + 120, intent: 'success' },
    ],
    totalMs: reduced ? 250 : LEVEL_UP_ACTS.reveal.end,
  };
}

/** "LEVEL 7 · TIDAL" */
export function levelRibbon(level: number): string {
  return `LEVEL ${level} · ${coinTier(level).name.toUpperCase()}`;
}

/** The reveal card under the ribbon ("NEW BONUS: Ride Regular"). */
export function revealCard(unlocks: LevelUpUnlocks | null, xp: number): { title: string; line: string; chips: string[] } | null {
  if (!unlocks) return null;
  const title = unlocks.kind === 'perk' ? `NEW BONUS: ${unlocks.name ?? ''}`
    : unlocks.kind === 'boss' ? 'BOSS SHARK AWAKE'
      : `NEW LOOK: ${unlocks.name ?? unlocks.tier}`;
  const chips = [xp > 0 ? `+${xp} XP` : null, unlocks.coins > 0 ? `+${unlocks.coins} coins` : null,
    unlocks.glimpse_unlocked ? 'Boss Glimpse unlocked' : null].filter((chip): chip is string => chip !== null);
  return { title, line: unlocks.short ?? coinTier(unlocks.level).look, chips };
}

// ── Perk track (9.3) ───────────────────────────────────────────────

export type PerkNodeShape = 'round' | 'diamond' | 'boss';

export interface PerkNode extends PerkTrackRow {
  readonly shape: PerkNodeShape;
  readonly isNext: boolean;
  /** The Lv5 node carries a tiny boss eye. */
  readonly bossEye: boolean;
}

export function perkNodes(track: readonly PerkTrackRow[] | null | undefined, currentLevel: number): PerkNode[] {
  const rows = [...(track ?? [])].sort((a, b) => a.level - b.level);
  const next = rows.find(row => row.level > currentLevel)?.level ?? null;
  return rows.map(row => ({
    ...row,
    shape: row.kind === 'boss' ? 'boss' : row.kind === 'milestone' ? 'diamond' : 'round',
    isNext: row.level === next,
    bossEye: !!row.boss_glimpse,
  }));
}

/** Only the next reward is prominent: "LEVEL 4 · Double Day: First win here pays double". */
export function nextReward(track: readonly PerkTrackRow[] | null | undefined, currentLevel: number): string | null {
  const next = perkNodes(track, currentLevel).find(node => node.isNext);
  return next ? `LEVEL ${next.level} · ${next.name}: ${next.short}` : null;
}

// ── Proc chips (9.4) ───────────────────────────────────────────────

/** Chip copy from a server chip only: "DOUBLE DAY +2 Parts +20 E". */
export function perkChipText(chip: PerkChipData): string {
  const parts = [chip.label];
  if ((chip.parts ?? 0) > 0) parts.push(`+${chip.parts} Part${chip.parts === 1 ? '' : 's'}`);
  if ((chip.energy ?? 0) > 0) parts.push(`+${chip.energy} E`);
  if ((chip.xp ?? 0) > 0) parts.push(`+${chip.xp} XP`);
  return parts.join(' ');
}

/** Chips stamp in 150 ms apart, after the Parts count-up. */
export const PERK_CHIP_STAGGER_MS = 150;

/** Only well-formed chips the server returned, in order, never invented. */
export function serverPerkChips(perks: unknown): PerkChipData[] {
  if (!Array.isArray(perks)) return [];
  return perks.filter((chip): chip is PerkChipData => !!chip && typeof chip === 'object'
    && typeof (chip as PerkChipData).key === 'string' && typeof (chip as PerkChipData).label === 'string');
}

// ── The Crowning (9.5) ────────────────────────────────────────────

export const CROWNING = {
  totalMs: 5500,
  skippableAfterMs: 1500,
  phases: {
    charge: { start: 0, end: 900 },
    burst: { start: 900, end: 1700 },
    awaken: { start: 1700, end: 3200 },
    ribbon: { start: 3200, end: 4500 },
    button: { start: 4500, end: 5500 },
  },
  /** The background lightens, never darkens. */
  background: { from: '#5fd0ff', to: '#d8efff' },
  /** The boss is a figure, not a surface: navy at 70% with a 2pt white rim light. */
  silhouette: { fill: '#164f82', opacity: 0.7, rimColor: '#ffffff', rimWidth: 2 },
  crownSquash: [0.8, 1.05, 1.0],
} as const;

/**
 * Crowning card copy. `fightAvailable` is false until the Ride Boss lobby ships
 * in this build (or while RIDE_BOSS_ENABLED is off): the crown still pays off
 * with the "arrives soon" silhouette and one button back to the shelf.
 */
export function crowningCopy(rideName: string, boss: CoinBossBlock | null, inPerson: boolean, distanceText?: string | null,
  fightAvailable = true) {
  const live = fightAvailable && !!boss && (boss.state === 'ready' || boss.state === 'cleared');
  return {
    ribbon: `BOSS OF ${rideName.toUpperCase()} IS AWAKE`,
    bossName: live ? boss!.name : 'Boss Shark arrives soon',
    hint: live && boss!.signature ? `Watch for the ${boss!.signature}` : null,
    groggy: live && boss!.groggy ? 'Free if you lose' : null,
    primary: live ? (inPerson ? 'FIGHT NOW' : `Fight at ${rideName}${distanceText ? ` · ${distanceText}` : ''}`) : 'SEE MY SHELF',
    secondary: live ? 'Later' : null,
  };
}

// ── Re-mint card (8) ──────────────────────────────────────────────

export const REMINT_FLIP_GAP_MS = 300;

export function remintCard(notice: RemintNotice | null | undefined) {
  if (!notice || !notice.coins.length) return null;
  const rows = notice.coins.map((coin, index) => ({
    ...coin,
    flipAtMs: index * REMINT_FLIP_GAP_MS,
    line: coin.to_level > coin.from_level
      ? `Your ${coin.from_tier} coin grew into ${coin.to_tier}`
      : coin.parts_refunded > 0
        ? `${coin.parts_refunded} Part${coin.parts_refunded === 1 ? '' : 's'} returned`
        : `${coin.energy_refunded} Energy returned`,
  }));
  const totals = [notice.total_parts > 0 ? `${notice.total_parts} Ride Part${notice.total_parts === 1 ? '' : 's'}` : null,
    notice.total_energy > 0 ? `${notice.total_energy} Energy` : null].filter(Boolean).join(' and ');
  return {
    title: 'YOUR RIDE COINS GREW',
    subtitle: totals ? `Ride coins now go up to Level 10. You got ${totals} back for levels you already paid for.` : 'Ride coins now go up to Level 10.',
    rows,
    button: 'See my shelf',
  };
}

/** Old builds and v2 switched off stop at Level 5. */
export function clientMaxLevel(serverMax: number | null | undefined): number {
  const max = Math.round(Number(serverMax) || LEGENDARY_COIN_LEVEL);
  return Math.max(1, Math.min(MAX_COIN_LEVEL, max));
}
