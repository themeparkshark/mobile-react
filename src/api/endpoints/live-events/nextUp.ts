import client from '../../client';

/** GET /me/next-up: the one next thing to do, ranked on the server (director stream). */
export type NextUpAction =
  | { readonly type: 'open_event'; readonly event_id: number }
  | { readonly type: 'daily_chest' }
  | { readonly type: 'level_chest'; readonly level: number }
  | { readonly type: 'daily_three' }
  | { readonly type: 'trail' }
  | { readonly type: 'show_ride'; readonly task_id: number }
  | { readonly type: 'ride' }
  | { readonly type: 'home_find' };

export interface NextUpItem {
  readonly kind: string;
  readonly icon: 'chest' | 'gift' | 'star' | 'coin' | string;
  readonly title: string;
  readonly action: NextUpAction;
}

export async function getNextUp(parkId: number | null, timezone?: string): Promise<{ item: NextUpItem | null; more: number }> {
  const { data } = await client.get<{ data: { item: NextUpItem | null; more: number } }>('/me/next-up', {
    params: { ...(parkId ? { park_id: parkId } : {}), ...(timezone ? { timezone } : {}) },
    timeout: 8000,
  });
  return { item: data?.data?.item ?? null, more: Number(data?.data?.more ?? 0) };
}
