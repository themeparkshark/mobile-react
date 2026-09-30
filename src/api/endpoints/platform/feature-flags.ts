import client from '../../client';
import { appVersionHeaders } from '../../platform';

/**
 * GET /api/feature-flags (public, cached 60s by the server). Switches the app
 * and backend flip together, plus the forced-update floor.
 */
export type FeatureFlagName =
  | 'adventure_ticket'
  | 'game_proof'
  | 'park_projects'
  | 'queue_tickets'
  | 'ride_coin_editions'
  | 'ride_rescue_pass'
  | 'vip_sync';

export type FeatureFlagsPayload = {
  readonly flags: Partial<Record<FeatureFlagName, boolean>> & Record<string, boolean>;
  readonly min_app_version: string;
  readonly update_required: boolean;
  readonly app_store_url: string;
};

export default async function getFeatureFlags(): Promise<FeatureFlagsPayload> {
  // Sent here as well as by the shared client: update_required depends on it.
  const { data } = await client.get<{ data: FeatureFlagsPayload }>('/feature-flags', {
    timeout: 8000,
    headers: appVersionHeaders(),
  });
  const payload = data?.data;
  if (!payload || typeof payload.flags !== 'object' || payload.flags === null) {
    throw new Error('Feature flags response was malformed.');
  }
  return payload;
}
