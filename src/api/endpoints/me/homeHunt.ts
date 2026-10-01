import { ApiResponseType } from '../../../models/api-response-type';
import type { InventoryType } from '../../../models/inventory-type';
import client from '../../client';

/**
 * Home Hunt weekly Standings (Wave 1). Everything here is behind the server
 * flag HOME_HUNT_BOARD_ENABLED: the week call answers enabled=false and the
 * rest answer 404 when it is off. Every field is read defensively by the
 * models, because an older server may send fewer fields.
 */

export type HuntBoardLevel = 'zone' | 'region' | 'global';

export interface HuntTier { readonly key: string; readonly label: string }

export interface HomeHuntWeek {
  readonly enabled: boolean;
  readonly week_key?: string;
  readonly starts_at?: string;
  readonly ends_at?: string;
  readonly points?: number;
  readonly finds?: number;
  readonly daily_points?: number;
  readonly daily_cap?: number;
  readonly unranked?: boolean;
  readonly rank?: number | null;
  readonly eligible_count?: number;
  readonly board?: { readonly level: HuntBoardLevel; readonly label: string };
  readonly tier?: HuntTier | null;
  readonly next_tier?: { readonly label: string; readonly points_needed: number } | null;
  readonly rank_line?: string | null;
  readonly hunter_name?: string;
  readonly near_me_visible?: boolean;
  readonly can_toggle_visibility?: boolean;
  readonly needs_age?: boolean;
  readonly rerolls_left?: number;
  readonly friend_nudge_enabled?: boolean;
}

export interface HuntBoardRow {
  readonly rank: number;
  readonly name: string;
  readonly points: number;
  readonly finds: number;
  readonly is_me?: boolean;
  /** Friends boards only. Near Me rows never carry a user id. */
  readonly user_id?: number;
  readonly avatar_url?: string | null;
  readonly inventory?: InventoryType | null;
  readonly rank_change?: number;
}

export interface HuntBoardMe {
  readonly rank: number | null;
  readonly name: string;
  readonly points: number;
  readonly finds: number;
  readonly avatar_url?: string | null;
  readonly inventory?: InventoryType | null;
}

export type HuntBoardKind = 'zone' | 'friends';

export interface HomeHuntBoard {
  readonly kind: HuntBoardKind;
  readonly enabled: boolean;
  readonly week_key?: string;
  readonly ends_at?: string;
  readonly label?: string;
  readonly level?: HuntBoardLevel | 'friends';
  readonly eligible?: number;
  readonly rows?: readonly HuntBoardRow[];
  readonly me?: HuntBoardMe | null;
  readonly empty?: boolean;
}

export interface HomeHuntInfo {
  readonly odds_lines?: readonly string[];
  readonly point_lines?: readonly string[];
  readonly tiebreak_lines?: readonly string[];
  readonly tier_lines?: readonly string[];
  readonly fairness_line?: string;
  readonly odds?: {
    readonly common: number; readonly uncommon: number; readonly rare: number; readonly epic: number;
    readonly legendary: number; readonly focus: number; readonly missing_multiplier: number;
    readonly shimmer_before: number; readonly shimmer_after: number;
  };
}

export interface HomeHuntSettingsBody {
  readonly birth_year?: number;
  readonly age_skipped?: boolean;
  readonly home_hunt_visible?: boolean;
  readonly friend_nudge_enabled?: boolean;
  readonly reroll_name?: boolean;
}

export interface HomeHuntSettings {
  readonly hunter_name: string;
  readonly near_me_visible: boolean;
  readonly can_toggle_visibility: boolean;
  readonly needs_age: boolean;
  readonly rerolls_left: number;
  readonly friend_nudge_enabled: boolean;
}

export type HuntResultStatus = 'claimable' | 'held' | 'claimed';

export interface HomeHuntResult {
  readonly week_key: string;
  readonly week_label?: string;
  readonly status: HuntResultStatus;
  readonly rank?: number | null;
  readonly percentile?: number | null;
  readonly tier_key?: string;
  readonly tier_label?: string;
  readonly board_label?: string;
  readonly points?: number;
  readonly finds?: number;
  readonly rewards?: { readonly energy?: number; readonly tickets?: number; readonly experience?: number };
  readonly cosmetic?: { readonly key: string; readonly label: string } | null;
  readonly ticket_note?: string | null;
  readonly perfect_week_count?: number;
  readonly expires_at?: string;
}

export interface HomeHuntResults {
  readonly pending_count: number;
  readonly results: readonly HomeHuntResult[];
}

export interface HomeHuntClaim {
  readonly result: HomeHuntResult;
  readonly new_totals?: { readonly energy: number; readonly tickets: number; readonly experience: number };
  readonly ticket_note?: string | null;
}

export type HuntReportReason = 'unsafe' | 'private' | 'other';

export async function getHomeHuntWeek(): Promise<HomeHuntWeek> {
  const { data } = await client.get<ApiResponseType<HomeHuntWeek>>('/me/home-hunt/week');
  return data.data;
}

export async function getHomeHuntBoard(kind: HuntBoardKind): Promise<HomeHuntBoard> {
  const { data } = await client.get<ApiResponseType<HomeHuntBoard>>(`/home-hunt/boards/${kind}`);
  return data.data;
}

export async function getHomeHuntInfo(): Promise<HomeHuntInfo> {
  const { data } = await client.get<ApiResponseType<HomeHuntInfo>>('/home-hunt/info');
  return data.data;
}

export async function saveHomeHuntSettings(body: HomeHuntSettingsBody): Promise<HomeHuntSettings> {
  const { data } = await client.put<ApiResponseType<HomeHuntSettings>>('/me/settings/home-hunt', body);
  return data.data;
}

export async function getHomeHuntResults(): Promise<HomeHuntResults> {
  const { data } = await client.get<ApiResponseType<HomeHuntResults>>('/me/home-hunt/results');
  return data.data;
}

export async function claimHomeHuntResult(weekKey: string): Promise<HomeHuntClaim> {
  const { data } = await client.post<ApiResponseType<HomeHuntClaim>>(
    `/me/home-hunt/results/${encodeURIComponent(weekKey)}/claim`);
  return data.data;
}

export async function reportHomeSpot(pivotId: number, reason: HuntReportReason): Promise<void> {
  await client.post(`/me/prep-items/${pivotId}/report`, { reason });
}
