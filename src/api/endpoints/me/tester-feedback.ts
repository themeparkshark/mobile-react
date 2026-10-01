import client from '../../client';
import type { FeedbackRequest } from '../../../services/feedback/model';

/** POST /me/feedback: a tester report. Resolves with the stored report id. */
export default async function sendTesterFeedback(body: FeedbackRequest): Promise<number> {
  // A screenshot upload on park Wi-Fi can take longer than the default 12 s.
  const response = await client.post('/me/feedback', body, { timeout: 30000 });
  return Number(response.data?.data?.id);
}
