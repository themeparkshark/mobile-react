import client from '../../client';

/**
 * Spend tickets for a task attempt.
 * Called BEFORE the mini-game starts - tickets are deducted regardless of win/lose.
 * 
 * @param taskId - The task being attempted
 * @param amount - Number of tickets to spend
 * @returns Updated ticket count, or throws on error
 */
export default async function spendTickets(
  taskId: number,
  amount: number
): Promise<{ tickets: number }> {
  try {
    const { data } = await client.post<{ data: { tickets: number } }>(
      '/me/spend-tickets',
      {
        task_id: taskId,
        amount,
      }
    );
    return data.data;
  } catch (error: any) {
    console.error('🎫 spendTickets error:', error?.response?.data || error.message);
    throw error;
  }
}
