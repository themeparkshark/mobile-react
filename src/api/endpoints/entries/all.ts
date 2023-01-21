import client from '../../client-cms';
import { ApiResponseType } from '../../../models/api-response-type';
import { EntryType } from '../../../models/entry-type';

export default async function current(): Promise<EntryType[]> {
  const { data } = await client.get<ApiResponseType<EntryType[]>>('/entries');

  return data.data;
}
