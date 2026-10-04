export interface PrepItemType {
  readonly id: number;
  readonly name: string;
  readonly variant_slug?: string | null;
  readonly description: string | null;
  readonly icon_url: string | null;
  readonly energy_reward: number;
  readonly ticket_reward: number;
  readonly experience_reward: number;
  readonly rarity: number;
  /** Server ownership check for this exact variant in the player's set book. */
  readonly is_new_variant?: boolean;
  readonly set_name?: string | null;
  readonly set_slug?: string | null;
  // Home Hunt v3 (CONTRACT.md 3.3; optional, older servers omit them)
  readonly rarity_key?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | string | null;
  readonly rarity_label?: string | null;
  /** Hex colour of the item's set. */
  readonly set_color?: string | null;
  readonly set_badge_url?: string | null;
  /** One-line flavor text. */
  readonly flavor?: string | null;
  readonly is_daily_rare?: boolean;
  /** App request: the server's shiny-style Golden Hour flag, decided at spawn. */
  readonly golden_hour?: boolean;
  // Pivot data (when spawned for player)
  readonly latitude?: number;
  readonly longitude?: number;
  readonly active_from?: string;
  readonly active_to?: string;
  readonly pivot_id?: number;
}
