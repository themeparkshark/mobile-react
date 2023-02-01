import { ApiResponseType } from '../../../models/api-response-type';
import { PinCollectionType } from '../../../models/pin-collection-type';
import client from '../../client';

export default async function all(page: number): Promise<PinCollectionType[]> {
  const { data } = await client.get<ApiResponseType<PinCollectionType[]>>(
    `/pin-collections`,
    {
      params: {
        page,
      },
    }
  );

  return data.data;
}
