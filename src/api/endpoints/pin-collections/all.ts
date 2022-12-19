import client from '../../client';
import { PinCollectionType } from '../../../models/pin-collection-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function all(): Promise<PinCollectionType[]> {
  const { data } = await client.get<ApiResponseType<PinCollectionType[]>>(
    `/pin-collections`
  );

  return data.data;
}
