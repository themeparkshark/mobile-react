import { EntryType } from '../../../models/entry-type';
import client from '../../client';

/**
 * The latest articles, cached by the game server (refreshed every 10 minutes).
 * WordPress itself takes 2 to 26 seconds to answer the same feed.
 */
export default async function getNews(): Promise<EntryType[]> {
  const { data } = await client.get<{ data: EntryType[] }>('/news');
  return data.data;
}
