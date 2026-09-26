import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function me({
  token,
  throwOnError = false,
}: { token?: string; throwOnError?: boolean } = {}): Promise<PlayerType | null> {
  try {
    const response = await client.get('/me', {
      timeout: 15000,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    let data = response.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* already parsed */ }
    }
    const player = data?.data ?? null;
    if (throwOnError && (!player || typeof player !== 'object' || !player.id)) {
      throw new Error('Sign-in did not return a player profile.');
    }
    // DEV: V2 fields — DB has these, production Forge backend just needs PlayerResource updated
    if (__DEV__ && player) {
      if (player.tickets == null) player.tickets = 10;
      if (player.energy == null) player.energy = 0; // Unlimited currency, starts at 0
    }
    return player;
  } catch (error: any) {
    if (throwOnError) {
      throw error;
    }
    return null;
  }
}
