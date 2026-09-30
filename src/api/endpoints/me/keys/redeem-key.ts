import { ApiResponseType } from '../../../../models/api-response-type';
import { KeyType } from '../../../../models/key-type';
import client from '../../../client';

/** The server decides every reward; there is no client multiplier. */
export default async function redeemKey(key: KeyType): Promise<KeyType> {
  const { data } = await client.post<ApiResponseType<KeyType>>(
    `/keys/${key.id}/redeem`
  );

  return data.data;
}
