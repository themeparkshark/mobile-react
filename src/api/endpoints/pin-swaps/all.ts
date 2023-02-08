import { ApiResponseType } from '../../../models/api-response-type';
import { PinSwapType } from '../../../models/pin-swap-type';
import client from '../../client';

export default async function getPinSwaps(): Promise<PinSwapType[]> {
  const { data } = await client.get<ApiResponseType<PinSwapType[]>>(
    '/pin-swaps',
  );

  return data.data;
}
