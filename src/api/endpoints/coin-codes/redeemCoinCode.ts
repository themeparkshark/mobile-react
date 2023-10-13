import { Alert } from 'react-native';
import { ApiResponseType } from '../../../models/api-response-type';
import { CoinCodeType } from '../../../models/coin-code-type';
import client from '../../client';

export default async function redeemCoinCode(
  code: string
): Promise<CoinCodeType> {
  try {
    const response = await client.post<ApiResponseType<CoinCodeType>>(
      `/coin-codes/${code}/redeem`
    );

    return response.data.data;
  } catch (error) {
    Alert.alert('', error.response.data.message, [
      {
        text: 'Ok',
      },
    ]);

    throw error;
  }
}
