import { CurrencyType } from '../../../models/currency-type';
import client from '../../client';
import { getWithLastGood } from '../../lastGood';
import bundledCurrencies from '../../defaults/currencies.json';

function unwrapCurrencies(body: unknown): CurrencyType[] | undefined {
  const data = (body as { data?: unknown } | undefined)?.data;
  return Array.isArray(data) && data.length > 0 ? (data as CurrencyType[]) : undefined;
}

export default async function getCurrencies(): Promise<CurrencyType[]> {
  const { data } = await getWithLastGood<CurrencyType[]>({
    key: 'currencies',
    request: () => client.get('/currencies', { timeout: 10000 }),
    unwrap: unwrapCurrencies,
    bundled: bundledCurrencies as unknown as CurrencyType[],
  });
  return data;
}
