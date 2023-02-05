import { ApiResponseType } from '../../../models/api-response-type';
import { PinSwapType } from '../../../models/pin-swap-type';
import client from '../../client';

export default async function holdPinSwap(
  pinSwap: number
): Promise<PinSwapType> {
  const { data } = await client.post<ApiResponseType<PinSwapType>>(
    `/pin-swaps/${pinSwap}/hold`
  );

  return data.data;
}
