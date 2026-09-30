/**
 * Ride coin tiers: one source for names and colours on every coin surface
 * (shelf ring, detail sheet, All Parks index, rewards). Blue, white and gold
 * from the brand palette only: no neon, no pink, no purple. Level 1 is the
 * coin as Alex drew it, so it is "Classic", never "Basic".
 *
 * Names match the server (PlayerCoinLevel::TIER_NAMES).
 */
export interface CoinTier {
  readonly level: number;
  readonly name: string;
  /** Ring around the coin on the shelf and in lists. */
  readonly ring: string;
  /** Darker partner for the ring's lower edge and small text on light cards. */
  readonly ringDeep: string;
  /** Soft fill behind the coin (glow, halo, chip background). */
  readonly halo: string;
  /** Ring stroke width at a 60pt coin. */
  readonly ringWidth: number;
  /** Tier has an idle shimmer on the shelf (shared clock). */
  readonly shimmer: boolean;
  /** Short line for "next level unlocks". */
  readonly look: string;
}

export const COIN_TIERS: readonly CoinTier[] = [
  { level: 1, name: 'Classic', ring: '#ffffff', ringDeep: '#9cc8ea', halo: 'rgba(255,255,255,0.55)', ringWidth: 2, shimmer: false,
    look: 'The coin as it was first drawn' },
  { level: 2, name: 'Silver', ring: '#e3eef8', ringDeep: '#8fa9c2', halo: 'rgba(227,238,248,0.7)', ringWidth: 3, shimmer: true,
    look: 'A polished silver rim with a shimmer' },
  { level: 3, name: 'Gold', ring: '#ffcf3b', ringDeep: '#d99a00', halo: 'rgba(255,207,59,0.45)', ringWidth: 3, shimmer: true,
    look: 'A gold rim that catches the light' },
  { level: 4, name: 'Prismatic', ring: '#5fd0ff', ringDeep: '#0879ca', halo: 'rgba(95,208,255,0.45)', ringWidth: 4, shimmer: true,
    look: 'A bright water-blue rim with light rays' },
  { level: 5, name: 'Legendary', ring: '#ffb400', ringDeep: '#c26a00', halo: 'rgba(255,180,0,0.5)', ringWidth: 4, shimmer: true,
    look: 'A blazing gold rim with a sunburst' },
];

export const MAX_COIN_LEVEL = COIN_TIERS.length;

/** Clamp any level (including unknown or 0) into the tier table. */
export function coinTier(level: number | null | undefined): CoinTier {
  const safe = Math.max(1, Math.min(MAX_COIN_LEVEL, Math.round(Number(level) || 1)));
  return COIN_TIERS[safe - 1];
}

export function coinTierName(level: number | null | undefined): string {
  return coinTier(level).name;
}

/** "Level 3 · Gold" */
export function coinLevelLabel(level: number | null | undefined): string {
  const tier = coinTier(level);
  return `Level ${tier.level} · ${tier.name}`;
}
