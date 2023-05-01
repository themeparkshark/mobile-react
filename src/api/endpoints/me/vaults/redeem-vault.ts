import { Alert } from 'react-native';
import { ApiResponseType } from '../../../../models/api-response-type';
import { VaultType } from '../../../../models/vault-type';
import client from '../../../client';

export default async function redeemVault(
  vault: VaultType
): Promise<VaultType> {
  try {
    const { data } = await client.post<ApiResponseType<VaultType>>(
      `/vaults/${vault.id}/redeem`
    );

    return data.data;
  } catch (error) {
    Alert.alert('', error.response.data.message, [
      {
        text: 'Ok',
      },
    ]);

    throw error;
  }
}
