/**
 * Fin-ister Nights wire types (CONTRACT.md in tps-prime-time-audit/next-wave/fright-nights).
 * Every name in these payloads is a parody codename: the server never sends a
 * real event, house or icon name.
 */

export type FrightPhase = 'off' | 'early' | 'live' | 'last_call' | 'after';
export type FrightSpotKind = 'haunt' | 'reef' | 'show' | 'store';
export type FrightSide = 'chaos' | 'control';
export type FrightReaction = 'giggled' | 'jumped' | 'screamed';

/** Map FX placement for a spot (art/map-fx/MAP_FX_SPEC.md). Unknown keys are ignored. */
export interface FrightFx {
  /** Scare-critter sprite family at a reef ("chum-jester", "kelp-keeper"...). */
  readonly critter?: string | null;
  /** How many critters lurk in this reef (clamped by the tier budget). */
  readonly critters?: number | null;
  /** Haunt lantern window-flicker profile ("candle", "neon", "strobe-soft"). */
  readonly flicker?: string | null;
  /** Lit windows on the haunt lantern facade. */
  readonly windows?: number | null;
  /** Extra ambient props near the spot ("bats", "eyes", "pumpkin", "skid-fins", "fog-thick"). */
  readonly props?: readonly string[] | null;
  /** Offset of the facade from the entrance point in metres (east, north). */
  readonly offset?: readonly [number, number] | null;
}

export interface FrightArt {
  readonly icon: string | null;    // map lantern / reef glyph
  readonly badge: string | null;   // Deep Lantern bead art
  readonly pin: string | null;     // pin item art
}

export interface FrightSpot {
  readonly key: string;
  readonly kind: FrightSpotKind;
  readonly name: string;
  readonly blurb: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Entry or find radius in metres. */
  readonly radius: number;
  readonly walk_minutes: number;
  /** Live feed status for haunts and shows (null when unknown). */
  readonly status: 'OPERATING' | 'CLOSED' | 'DOWN' | 'REFURBISHMENT' | null;
  readonly posted_minutes: number | null;
  /** The server would accept an entry right now (phase and live status). */
  readonly accepting: boolean;
  readonly fan_rank: number | null;
  readonly sort: number;
  readonly fx: FrightFx | null;
  readonly art: FrightArt | null;
  /** Show times tonight (shows only), ISO with offset. */
  readonly times?: readonly string[] | null;
}

export interface FrightEncounter {
  readonly key: string;
  readonly critter: 'chuckles' | 'riptide';
  readonly name: string;
  readonly line: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radius: number;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly caught: boolean;
}

export interface FrightRun {
  readonly key: string;
  readonly entered_at: string | null;
  readonly done_at: string | null;
  /** Earliest moment the server accepts "done" (entered_at + walk + 2 min). */
  readonly min_done_at: string | null;
  readonly wait_minutes: number | null;
  readonly posted_minutes: number | null;
  readonly score: number | null;
  readonly reaction: FrightReaction | null;
  readonly re_swim: boolean;
}

export interface FrightLantern {
  readonly level: number;
  readonly parts: number;
  /** Parts total for the next level (null at Lv10). */
  readonly next_at: number | null;
}

export interface FrightEventInfo {
  readonly slug: string;
  readonly title: string;
  readonly card_title: string;
  readonly lantern_star: string;
  readonly park_id: number;
  readonly timezone: string;
  readonly year: number;
  /** This night's index in the season (1-based): the 19th night glows. */
  readonly night_index: number;
  readonly nights_total: number;
  /** Optional "what's new this season" lines for returning players (kid-safe, parody only). */
  readonly whats_new?: readonly string[] | null;
}

export interface FrightNightWindow {
  readonly night_on: string;
  readonly opens_at: string;
  readonly closes_at: string;
  readonly early_opens_at: string | null;
  readonly last_call_at: string;
  readonly after_until: string;
  readonly teaser_from: string;
}

export interface FrightMe {
  readonly runs: readonly FrightRun[];
  readonly open_run: FrightRun | null;
  readonly haunts_tonight: number;
  readonly haunts_season: number;
  readonly haunts_total: number;
  readonly side: FrightSide | null;
  readonly lantern: FrightLantern;
  /** Spot keys found tonight (reefs, encounter). */
  readonly found_tonight: readonly string[];
  readonly recap_seen: boolean;
  /** Tutorial and coach-mark keys this player has seen this season (key -> ISO time). */
  readonly seen?: Readonly<Record<string, string>> | null;
  /** The player has marks in a previous season: Welcome back instead of the full tutorial. */
  readonly returning?: boolean | null;
}

export interface FrightConfig {
  readonly min_dwell_extra_minutes: number;
  readonly enter_accuracy_m: number;
  readonly reef_dwell_seconds: number;
  readonly poll_seconds: number;
  readonly fan_min_raters: number;
}

/** GET /parks/{id}/fright */
export interface FrightTonight {
  readonly enabled: boolean;
  readonly server_now: string;
  readonly phase: FrightPhase;
  readonly event: FrightEventInfo | null;
  readonly night: FrightNightWindow | null;
  readonly spots: readonly FrightSpot[];
  readonly encounter: FrightEncounter | null;
  readonly me: FrightMe | null;
  readonly config: FrightConfig | null;
}

export interface FrightReward {
  readonly kind: 'pin' | 'cosmetic' | 'xp' | 'coins' | 'case_file' | 'stamp';
  readonly name: string;
  readonly image: string | null;
  readonly item_id?: number | null;
  readonly amount?: number | null;
}

export interface FrightCaseFileDrop {
  readonly key: string;
  readonly number: number;
  readonly year_label: string;
  readonly title: string;
  readonly body: string;
  readonly rarity: 'common' | 'rare' | 'icon';
  readonly new: boolean;
}

/** Result of enter / done / found / score. `error` codes are stable strings. */
export interface FrightActionResult {
  readonly ok: boolean;
  readonly error?: 'not_in_park' | 'not_open' | 'too_far' | 'poor_accuracy' | 'stale_fix' | 'not_accepting' | 'no_run'
    | 'too_soon' | 'too_late' | 'not_finished' | 'throttled' | 'disabled' | 'unknown_spot';
  readonly run?: FrightRun | null;
  readonly rewards?: readonly FrightReward[];
  readonly case_file?: FrightCaseFileDrop | null;
  readonly lantern?: FrightLantern | null;
  readonly needs_side?: boolean;
  readonly fan?: { readonly rank: number | null; readonly score: number | null } | null;
  readonly server_now?: string;
}

/* ---- Card (CONTRACT.md sections 1-3) ---- */

export interface FrightCardSummary {
  readonly event_slug: string;
  readonly year: number;
  readonly park_id: number;
  readonly park_name: string;
  readonly title: string;
  readonly card_title: string;
  readonly lantern_star: string;
  readonly art: { readonly card: string | null; readonly chip: string | null };
  readonly haunts_done: number;
  readonly haunts_total: number;
  readonly pins_earned: number;
  readonly pins_total: number;
  readonly case_files_found: number;
  readonly case_files_total: number;
  readonly nights: number;
  readonly completed: boolean;
  readonly ten_in_one: boolean;
  readonly lantern: FrightLantern;
  readonly last_night_on: string | null;
}

export interface FrightLifetime {
  readonly haunts_survived: number;
  readonly re_swims: number;
  readonly nights: number;
  readonly events: number;
}

export interface FrightSlot {
  readonly key: string;
  readonly kind: 'haunt' | 'reef' | 'show' | 'event';
  readonly name: string;
  readonly blurb: string;
  readonly badge: string | null;
  readonly pin: { readonly item_id: number; readonly name: string; readonly image: string | null;
    readonly earned_on: string | null; readonly night_on: string | null } | null;
  readonly earned: boolean;
  readonly first_on: string | null;
  readonly runs: number;
  readonly best_wait_minutes: number | null;
  readonly my_score: number | null;
  readonly fan_score: number | null;
  readonly scream_share: number | null;
  readonly fan_rank: number | null;
}

export interface FrightCaseFile {
  readonly key: string;
  readonly number: number;
  readonly year_label: string;
  readonly title: string;
  readonly body: string;
  readonly rarity: 'common' | 'rare' | 'icon';
  readonly found: boolean;
  readonly found_on: string | null;
  readonly cold_case: boolean;
}

export interface FrightCard extends FrightCardSummary {
  readonly status: 'upcoming' | 'running' | 'ended';
  readonly season: { readonly starts_on: string; readonly ends_on: string };
  readonly slots: readonly FrightSlot[];
  readonly case_files: readonly FrightCaseFile[];
  readonly tally: { readonly chaos: number; readonly control: number; readonly my_side: FrightSide | null };
  readonly rank_history: readonly { readonly night_on: string; readonly ranking: readonly string[] }[];
  readonly recaps: readonly { readonly night_on: string; readonly haunts: number; readonly minutes_in_line: number }[];
}

export interface FrightRecap {
  readonly event_slug: string;
  readonly card_title: string;
  readonly park_name: string;
  readonly night_on: string;
  readonly night_number: number;
  readonly haunts: readonly { readonly key: string; readonly name: string; readonly badge: string | null;
    readonly wait_minutes: number | null; readonly posted_minutes: number | null; readonly score: number | null;
    readonly reaction: FrightReaction | null; readonly re_swim: boolean; readonly at: string }[];
  readonly reefs: readonly { readonly key: string; readonly name: string }[];
  readonly case_files: readonly { readonly key: string; readonly title: string }[];
  readonly pins: readonly { readonly item_id: number; readonly name: string; readonly image: string | null }[];
  readonly encounter: { readonly key: string; readonly name: string } | null;
  readonly totals: { readonly haunts: number; readonly minutes_in_line: number; readonly lantern_parts: number };
  readonly ten_in_one: boolean;
  readonly headline: string;
  readonly share: { readonly title: string; readonly subtitle: string; readonly stat_lines: readonly string[] };
}
