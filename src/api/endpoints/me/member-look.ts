import { ApiResponseType } from '../../../models/api-response-type';
import { SlotKey } from '../../../models/look-type';
import client from '../../client';

/** GET /me/member-look (config/members.php on the server, secret-shop/DESIGN.md 4.3). */
export type MemberLookState = {
  /** Member pieces are worn only while a member. */
  readonly wear_lock: boolean;
  readonly member: boolean;
  /** One-time note after a lapse ("safe in your closet"), or null. */
  readonly note: string | null;
  /** The member look waiting to go back on after a rejoin (slot => item id), or null. */
  readonly restore: Partial<Record<SlotKey, number>> | null;
};

/** null on a server without the route (older backend): the lock is treated as off. */
export async function getMemberLook(): Promise<MemberLookState | null> {
  try {
    const { data } = await client.get<ApiResponseType<MemberLookState>>('/me/member-look');
    return data.data ?? null;
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 405) return null;
    throw error;
  }
}

export async function memberLookNoteSeen(): Promise<void> {
  await client.post('/me/member-look/note-seen');
}

export async function restoreMemberLook(): Promise<void> {
  await client.post('/me/member-look/restore');
}

export async function dismissMemberLook(): Promise<void> {
  await client.post('/me/member-look/dismiss');
}
