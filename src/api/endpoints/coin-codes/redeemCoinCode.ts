import { Alert } from 'react-native';
import { ApiResponseType } from '../../../models/api-response-type';
import { CoinCodeType } from '../../../models/coin-code-type';
import client from '../../client';

export default async function redeemCoinCode(
  code: string
): Promise<CoinCodeType | null> {
  try {
    const response = await client.post<ApiResponseType<CoinCodeType>>(
      '/coin-codes/redeem',
      {
        code,
      }
    );

    return response.data.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { message?: string } } };
    Alert.alert(axiosError.response?.data?.message ?? 'Error redeeming code', '', [
      {
        text: 'Ok',
      },
    ]);
    return null;
  }
}
