import { ApiResponseType } from '../../../models/api-response-type';
import { SharkLook, SlotKey } from '../../../models/look-type';
import client from '../../client';

export async function getLook(): Promise<SharkLook> {
  const { data } = await client.get<ApiResponseType<SharkLook>>('/me/look');
  return data.data;
}

export type SaveLookResult =
  | { readonly kind: 'saved'; readonly look: SharkLook }
  | { readonly kind: 'conflict'; readonly look: SharkLook }
  | { readonly kind: 'rejected'; readonly slots: SlotKey[]; readonly memberLocked?: boolean }
  | { readonly kind: 'unsupported' };

/**
 * PUT /me/look with only the slots that changed. A 409 carries the look
 * another device saved; a 404 means an older backend without /me/look.
 * Network failures throw so the caller can retry.
 */
export async function putLook(version: number, slots: Partial<Record<SlotKey, number | null>>): Promise<SaveLookResult> {
  try {
    const { data } = await client.put<ApiResponseType<SharkLook>>('/me/look', { version, slots });
    return { kind: 'saved', look: data.data };
  } catch (error) {
    const response = (error as { response?: { status: number; data?: { code?: string; data?: SharkLook; errors?: Record<string, unknown> } } })?.response;
    if (!response) throw error;
    const { status, data } = response;
    if (status === 409 && data?.data) return { kind: 'conflict', look: data.data };
    if (status === 404 || status === 405) return { kind: 'unsupported' };
    if (status === 422) {
      const rejected = Object.keys(data?.errors ?? {})
        .map((key) => key.replace(/^slots\./, ''))
        .filter((key): key is SlotKey => key.endsWith('_item'));
      return { kind: 'rejected', slots: rejected.length ? rejected : (Object.keys(slots) as SlotKey[]),
        // A member piece on a lapsed member (secret-shop/DESIGN.md 4.3): still owned, just not wearable now.
        ...(data?.code === 'member_wear_locked' ? { memberLocked: true } : {}) };
    }
    throw error;
  }
}
