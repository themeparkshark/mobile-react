import client from '../../client';
import type { NightShow } from '../../../components/map/alive/nightShow';

/** Tonight's next night show at the park (real showtimes), or null. Never throws: no data means no show. */
export async function getNightShow(parkId: number): Promise<NightShow | null> {
  try {
    const { data } = await client.get<{ data: NightShow | null }>(`/parks/${parkId}/night-show`);
    const show = data?.data;
    return show && show.anchor && Array.isArray(show.curve) && typeof show.starts_at === 'string' ? show : null;
  } catch {
    return null;
  }
}
