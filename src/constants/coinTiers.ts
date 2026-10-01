/**
 * Ride coin tiers: one source for names and colours on every coin surface
 * (shelf ring, detail sheet, All Parks index, rewards). Blue, white and gold
 * from the brand palette only: no neon, no pink, no purple. Level 1 is the
 * coin as Alex drew it, so it is "Classic", never "Basic".
 *
 * Progression v2 (progression.md 9.1) runs to Level 10. Names match the
 * server (config/progression.php tiers). The server still decides the max a
 * client may reach (max_level), so an old build or v2 switched off shows 5.
 */
export type CoinStand = 'none' | 'wave' | 'wave_foam' | 'gold_trim' | 'pennant' | 'crown_dais';
export type CoinShelfFx = 'none' | 'shimmer' | 'rays' | 'starburst' | 'enamel' | 'wave' | 'glints' | 'inlay' | 'crown_flip';

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
  /** Idle shelf effect on the shared clock. */
  readonly fx: CoinShelfFx;
  /** Stand under the coin (Lv6+). */
  readonly stand: CoinStand;
  /** The crown sits on top (Lv10). */
  readonly crown: boolean;
  /** Level-up burst: a soft rim glow (Lv2-5) or the capped flash and shatter (Lv6+). */
  readonly burst: 'glow' | 'shatter';
}

export const COIN_TIERS: readonly CoinTier[] = [
  { level: 1, name: 'Classic', ring: '#ffffff', ringDeep: '#ffcf3b', halo: 'rgba(255,255,255,0.85)', ringWidth: 3, shimmer: false,
    look: 'The coin as it was first drawn', fx: 'none', stand: 'none', crown: false, burst: 'glow' },
  { level: 2, name: 'Silver', ring: '#e3eef8', ringDeep: '#8fa9c2', halo: 'rgba(227,238,248,0.7)', ringWidth: 3, shimmer: true,
    look: 'A polished silver rim with a shimmer', fx: 'shimmer', stand: 'none', crown: false, burst: 'glow' },
  { level: 3, name: 'Gold', ring: '#ffcf3b', ringDeep: '#d99a00', halo: 'rgba(255,207,59,0.45)', ringWidth: 3, shimmer: true,
    look: 'A gold rim that catches the light', fx: 'shimmer', stand: 'none', crown: false, burst: 'glow' },
  { level: 4, name: 'Prismatic', ring: '#5fd0ff', ringDeep: '#0879ca', halo: 'rgba(95,208,255,0.45)', ringWidth: 4, shimmer: true,
    look: 'A bright water-blue rim with light rays', fx: 'rays', stand: 'none', crown: false, burst: 'glow' },
  { level: 5, name: 'Legendary', ring: '#ffb400', ringDeep: '#c26a00', halo: 'rgba(255,180,0,0.5)', ringWidth: 4, shimmer: true,
    look: 'A blazing gold rim with a sunburst', fx: 'starburst', stand: 'none', crown: false, burst: 'glow' },
  { level: 6, name: 'Sapphire', ring: '#2f7fe0', ringDeep: '#0b3d91', halo: 'rgba(47,127,224,0.4)', ringWidth: 4, shimmer: true,
    look: 'A sapphire enamel rim on a white wave stand', fx: 'enamel', stand: 'wave', crown: false, burst: 'shatter' },
  { level: 7, name: 'Tidal', ring: '#5fd0ff', ringDeep: '#0b5fa8', halo: 'rgba(95,208,255,0.5)', ringWidth: 5, shimmer: true,
    look: 'A rolling wave around the rim and foam bubbles', fx: 'wave', stand: 'wave_foam', crown: false, burst: 'shatter' },
  { level: 8, name: 'Starlight', ring: '#fff4d6', ringDeep: '#d99a00', halo: 'rgba(255,244,214,0.75)', ringWidth: 5, shimmer: true,
    look: 'Three stars orbit a gold-trim stand', fx: 'glints', stand: 'gold_trim', crown: false, burst: 'shatter' },
  { level: 9, name: 'Royal', ring: '#ffcf3b', ringDeep: '#1f5fbf', halo: 'rgba(31,95,191,0.35)', ringWidth: 5, shimmer: true,
    look: 'A gold rim with blue enamel and a pennant', fx: 'inlay', stand: 'pennant', crown: false, burst: 'shatter' },
  { level: 10, name: 'Shark Crown', ring: '#ffcf3b', ringDeep: '#0b3d91', halo: 'rgba(255,207,59,0.55)', ringWidth: 6, shimmer: true,
    look: 'A double rim, the crown and a Boss Trophy socket', fx: 'crown_flip', stand: 'crown_dais', crown: true, burst: 'shatter' },
];

export const MAX_COIN_LEVEL = COIN_TIERS.length;
/** Level 5: Legendary on both curves, and the top for old builds. */
export const LEGENDARY_COIN_LEVEL = 5;

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

/**
 * Collection rarity (Set Collection items, Stamp Book stamps): the same blue,
 * white and gold ramp as the coin tiers. Common is silver-white, uncommon and
 * rare are water blues, epic and legendary are golds. No purple, no pink.
 */
export interface RarityTone {
  readonly name: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  readonly label: string;
  /** Border, badge and progress fill. */
  readonly color: string;
  /** Soft card fill. */
  readonly bgColor: string;
  /** Glow behind a collected item. */
  readonly glowColor: string;
}

export const RARITY_TONES: Readonly<Record<1 | 2 | 3 | 4 | 5, RarityTone>> = {
  1: { name: 'common', label: 'Common', color: '#8fa9c2', bgColor: 'rgba(143,169,194,0.10)', glowColor: 'rgba(143,169,194,0.25)' },
  2: { name: 'uncommon', label: 'Uncommon', color: '#1d9bf0', bgColor: 'rgba(29,155,240,0.08)', glowColor: 'rgba(29,155,240,0.22)' },
  3: { name: 'rare', label: 'Rare', color: '#0a5fb0', bgColor: 'rgba(10,95,176,0.08)', glowColor: 'rgba(10,95,176,0.22)' },
  4: { name: 'epic', label: 'Epic', color: '#e0a100', bgColor: 'rgba(224,161,0,0.09)', glowColor: 'rgba(224,161,0,0.25)' },
  5: { name: 'legendary', label: 'Legendary', color: '#ff8a00', bgColor: 'rgba(255,138,0,0.10)', glowColor: 'rgba(255,138,0,0.3)' },
};

/** Rarity tone by name (Stamp Book uses names, sets use numbers). Unknown is common. */
export function rarityToneByName(name: string | null | undefined): RarityTone {
  return Object.values(RARITY_TONES).find(tone => tone.name === name) ?? RARITY_TONES[1];
}

/** Border colour of the "Your challenge" card, per assigned game. Blue and gold only. */
export const CHALLENGE_GAME_COLORS = {
  tap: '#1d9bf0',
  timing: '#0a5fb0',
  memory: '#ffb400',
  trivia: '#e0a100',
  photo: '#5fd0ff',
} as const;
