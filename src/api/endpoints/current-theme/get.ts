import { ApiResponseType } from '../../../models/api-response-type';
import { ThemeType } from '../../../models/theme-type';
import client from '../../client';

export default async function getCurrentTheme(): Promise<ThemeType | undefined> {
  console.log('🦈 Fetching theme...');
  try {
    const response = await client.get('/current-theme');
    let data = response.data;
    
    // Parse if string
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* already parsed */ }
    }
    
    console.log('🦈 Theme fetched:', data?.data?.id ? 'yes' : 'no');
    return data?.data;
  } catch (error: any) {
    console.error('🦈 Failed to fetch theme:', error?.message || error);
    return undefined;
  }
}
