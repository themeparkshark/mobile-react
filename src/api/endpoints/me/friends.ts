import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export default async function getFriends(
  page: number,
  perPage?: number
): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>(
    '/me/friends',
    {
      params: {
        page: page,
        perPage: perPage ?? 15,
      },
    }
  );

  return data.data;
}

/** Search friends by username (server-side) — returns all matches */
export async function searchFriends(query: string): Promise<PlayerType[]> {
  const { data } = await client.get<ApiResponseType<PlayerType[]>>(
    '/me/friends',
    {
      params: {
        search: query,
        perPage: 50,
      },
    }
  );

  return data.data;
}

/** One page of friends plus whether another exists. */
export async function getFriendsPage(page: number, perPage = 20): Promise<{ items: PlayerType[]; hasMore: boolean }> {
  const { data } = await client.get<ApiResponseType<PlayerType[]> & { readonly links?: { readonly next?: string | null } }>(
    '/me/friends',
    { params: { page, perPage } }
  );
  const items = data.data ?? [];
  return { items, hasMore: data.links ? Boolean(data.links.next) : items.length >= perPage };
}
