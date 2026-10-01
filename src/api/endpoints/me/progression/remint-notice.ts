import api from '../../../api';
import type { RemintNotice } from '../../../../components/coin/progressionModel';

/**
 * The one-time re-mint card (progression v2, S2): coins that grew onto the
 * Level 10 curve and the Parts and Energy given back. Null when there is
 * nothing to show (or the server is not on the v2 curve for this build).
 */
export async function getRemintNotice(): Promise<RemintNotice | null> {
  const { data } = await api.get<{ data: RemintNotice | null }>('/me/progression/remint-notice');
  const notice = data?.data ?? null;
  return notice && Array.isArray(notice.coins) && notice.coins.length ? notice : null;
}

export async function markRemintNoticeSeen(): Promise<void> {
  await api.post('/me/progression/remint-notice/seen');
}
