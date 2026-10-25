import client from '../../client';
import { appVersionHeaders } from '../../platform';

/**
 * GET /api/feature-flags (public, cached 60s by the server). Switches the app
 * and backend flip together, plus the forced-update floor.
 */
export type FeatureFlagName =
  | 'adventure_ticket'
  | 'game_proof'
  | 'map_gym_swords'
  | 'park_projects'
  | 'progression_v2'
  | 'queue_tickets'
  | 'ride_coin_editions'
  | 'ride_boss'
  | 'ride_rescue_pass'
  /** Studio sound (wow-sound lane): off until Dustin approves the listening pack. See gamekit/audio/studioSwitch.ts. */
  | 'studio_sound'
  | 'vip_sync';

export type FeatureFlagsPayload = {
  readonly flags: Partial<Record<FeatureFlagName, boolean>> & Record<string, boolean>;
  readonly min_app_version: string;
  readonly update_required: boolean;
  readonly app_store_url: string;
};

/**
 * `viewer` (the signed-in player id) makes the URL per player: the signed-out answer is
 * public for 60 s and varies only on App-Version, so the phone's URL cache could otherwise
 * hand a signed-out "off" to a preview player for a minute after launch.
 */
export default async function getFeatureFlags(viewer?: string | number): Promise<FeatureFlagsPayload> {
  // Sent here as well as by the shared client: update_required depends on it.
  const { data } = await client.get<{ data: FeatureFlagsPayload }>('/feature-flags', {
    timeout: 8000,
    headers: appVersionHeaders(),
    ...(viewer !== undefined && viewer !== '' ? { params: { viewer: String(viewer) } } : {}),
  });
  const payload = data?.data;
  if (!payload || typeof payload.flags !== 'object' || payload.flags === null) {
    throw new Error('Feature flags response was malformed.');
  }
  return payload;
}
