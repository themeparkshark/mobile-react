import { ApiResponseType } from '../../../models/api-response-type';
import { PinSwapType } from '../../../models/pin-swap-type';
import client from '../../client';
import { ipHeld } from '../../../constants/ipHold';

export default async function getPinSwaps(): Promise<PinSwapType[]> {
  const { data } = await client.get<ApiResponseType<PinSwapType[]>>(
    '/pin-swaps'
  );

  // Look-alike pins never show on the board (constants/ipHold.ts).
  return (data.data ?? []).filter(swap => !ipHeld(swap.pin?.item));
}
