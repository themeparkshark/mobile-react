import { useEffect, useState } from 'react';
import { getMemberLook, MemberLookState } from '../api/endpoints/me/member-look';

/**
 * Member items: owned forever, worn only while a member (secret-shop/DESIGN.md 4.3).
 *
 * The server is the authority (it refuses the equip and takes pieces off on lapse);
 * this only decides what to draw: the lock badge on Inventory cards, "Join to wear
 * it" in the try-on, and the copy. Off until the server says wear_lock is on, so
 * nothing changes before launch or against an older backend.
 */
// One copy for the promise everywhere (helpers/shopShelves MEMBER_PROMISE, DESIGN.md 6.7).
export { MEMBER_PROMISE as MEMBER_WEAR_COPY } from '../helpers/shopShelves';

let lockOn = false;
const listeners = new Set<(on: boolean) => void>();

export function memberWearLockOn(): boolean {
  return lockOn;
}

export function setMemberWearLock(on: boolean): void {
  if (on === lockOn) return;
  lockOn = on;
  listeners.forEach(listener => listener(on));
}

/** Read the server state and remember whether the lock is on. Never throws. */
export async function refreshMemberLook(read: typeof getMemberLook = getMemberLook): Promise<MemberLookState | null> {
  try {
    const state = await read();
    setMemberWearLock(state?.wear_lock === true);
    return state;
  } catch {
    return null;
  }
}

export function useMemberWearLock(): boolean {
  const [on, setOn] = useState(lockOn);
  useEffect(() => {
    setOn(lockOn);
    listeners.add(setOn);
    return () => { listeners.delete(setOn); };
  }, []);
  return on;
}

/** The same test as the server: VIP gear (is_member_item) and every Secret Shop piece. */
export function isMemberWearItem(item: { is_member_item?: boolean | number | null; source?: string | null } | null | undefined): boolean {
  return !!item && (!!item.is_member_item || item.source === 'secret');
}

/** True when this player may not put this piece on right now. */
export function memberWearLocked(item: Parameters<typeof isMemberWearItem>[0], member: boolean, on: boolean = lockOn): boolean {
  return on && !member && isMemberWearItem(item);
}
