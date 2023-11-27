import { ApiResponseType } from '../../../models/api-response-type';
import { CurrencyType } from '../../../models/currency-type';
import client from '../../client';

export default async function getCurrencies(): Promise<CurrencyType[]> {
  const response = await client.get<ApiResponseType<CurrencyType[]>>(
    '/currencies'
  );

  return response.data.data;
}
