import { ApiResponseType } from '../../../../models/api-response-type';
import { KeyType } from '../../../../models/key-type';
import client from '../../../client';

export default async function redeemKey(
  key: KeyType,
  doubleXP: boolean
): Promise<KeyType> {
  const { data } = await client.post<ApiResponseType<KeyType>>(
    `/keys/${key.id}/redeem`,
    {
      double_xp: doubleXP,
    }
  );

  return data.data;
}
