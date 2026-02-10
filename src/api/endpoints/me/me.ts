import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function me(): Promise<PlayerType | null> {
  try {
    console.log('🦈 Me API: calling /me with auth header:', client.defaults.headers.common.Authorization?.toString().substring(0, 40) + '...');
    const response = await client.get('/me');
    console.log('🦈 Me API: status:', response.status);
    console.log('🦈 Me API: raw data:', JSON.stringify(response.data).substring(0, 500));
    let data = response.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* already parsed */ }
    }
    console.log('🦈 Me API: data.data:', JSON.stringify(data?.data || 'null').substring(0, 200));
    const player = data?.data ?? null;
    // DEV: V2 fields — DB has these, production Forge backend just needs PlayerResource updated
    if (__DEV__ && player) {
      if (player.tickets == null) player.tickets = 10;
      if (player.energy == null) player.energy = 0; // Unlimited currency, starts at 0
    }
    return player;
  } catch (error: any) {
    // 401 is expected during logout — don't spam error console
    if (error?.response?.status === 401) {
      console.log('🦈 Me API: 401 (not authenticated)');
    } else {
      console.error('🦈 Me API ERROR:', error?.response?.status, error?.message || error);
      console.error('🦈 Me API error response:', JSON.stringify(error?.response?.data).substring(0, 300));
    }
    return null;
  }
}
