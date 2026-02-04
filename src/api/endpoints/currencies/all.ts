import { ApiResponseType } from '../../../models/api-response-type';
import { CurrencyType } from '../../../models/currency-type';
import client from '../../client';

export default async function getCurrencies(): Promise<CurrencyType[]> {
  console.log('🦈 Fetching currencies...');
  try {
    const response = await client.get('/currencies');
    let data = response.data;
    
    // Parse if string
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* already parsed */ }
    }
    
    console.log('🦈 Currencies fetched:', data?.data?.length || 0, 'items');
    return data?.data ?? [];
  } catch (error: any) {
    console.error('🦈 Failed to fetch currencies:', error?.message || error);
    return [];
  }
}
