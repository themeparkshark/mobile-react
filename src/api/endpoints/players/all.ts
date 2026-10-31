import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function all(page: number): Promise<PlayerType[]> {
  return (await allWithMeta(page)).players;
}

/** The XP standings page plus the list's meta (for example whether the XP includes the VIP bonus). */
export async function allWithMeta(page: number): Promise<{ players: PlayerType[]; meta: unknown }> {
  const { data } = await client.get<ApiResponseType<PlayerType[]> & { meta?: unknown }>('/players', {
    params: {
      page: page,
    },
  });

  return { players: data.data, meta: data.meta ?? null };
}
