import { ApiResponseType } from '../../../models/api-response-type';
import { PinSwapType } from '../../../models/pin-swap-type';
import client from '../../client';

export default async function getPinSwaps(
  page: number
): Promise<PinSwapType[]> {
  const { data } = await client.get<ApiResponseType<PinSwapType[]>>(
    '/pin-swaps',
    {
      params: {
        page,
      },
    }
  );

  return data.data;
}
