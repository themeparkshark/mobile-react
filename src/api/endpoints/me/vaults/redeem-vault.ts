import { Alert } from 'react-native';
import { ApiResponseType } from '../../../../models/api-response-type';
import { VaultType } from '../../../../models/vault-type';
import client from '../../../client';

export default async function redeemVault(
  vault: VaultType
): Promise<VaultType | null> {
  try {
    const { data } = await client.post<ApiResponseType<VaultType>>(
      `/vaults/${vault.id}/redeem`
    );

    return data.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { message?: string } } };
    Alert.alert(axiosError.response?.data?.message ?? 'Error redeeming vault', '', [
      {
        text: 'Ok',
      },
    ]);
    return null;
  }
}
