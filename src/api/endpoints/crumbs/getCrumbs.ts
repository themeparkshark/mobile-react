import { ApiResponseType } from '../../../models/api-response-type';
import client from '../../client';

export default async function getCrumbs(): Promise<any> {
  console.log('🦈 Fetching crumbs...');
  try {
    // Splash waits for this request; do not strand sign-in on a slow API.
    const response = await client.get('/crumbs', { timeout: 10000 });
    let data = response.data;
    
    // Parse if string
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* already parsed */ }
    }
    
    console.log('🦈 Crumbs fetched successfully');
    return data?.data ?? {};
  } catch (error: any) {
    console.error('🦈 Failed to fetch crumbs:', error?.message || error);
    return { labels: {}, errors: {}, messages: {}, prompts: {}, urls: {}, warnings: {} };
  }
}
