/**
 * A share button inside an RN <Modal>: the grown-up gate and the Share Studio sheet (both
 * mounted in Root) can't present over that modal on iOS. useModalHandoff closes the modal and
 * resolves once iOS has finished dismissing it (onDismiss), so the next sheet can show.
 * MODAL_HANDOFF_MS covers Android (no onDismiss), a modal that unmounts instead of hiding, and an
 * onDismiss that never fires.
 */
import { useCallback, useRef } from 'react';
import { shareFlex } from './store';
import type { FlexKind, FlexOptions, FlexPayload } from './types';

export const MODAL_HANDOFF_MS = 600;
/** After the host modal says it is gone, one more beat so UIKit has finished the dismissal. */
export const MODAL_SETTLE_MS = 250;

export function useModalHandoff(close: () => void): { readonly handoff: () => Promise<void>; readonly onDismiss: () => void } {
  const pending = useRef<(() => void) | null>(null);
  const onDismiss = useCallback(() => {
    const done = pending.current;
    pending.current = null;
    done?.();
  }, []);
  const handoff = useCallback(() => new Promise<void>(resolve => {
    pending.current = resolve;
    close();
    setTimeout(onDismiss, MODAL_HANDOFF_MS);
  }), [close, onDismiss]);
  return { handoff, onDismiss };
}

/**
 * Share from inside a modal: close it (handoff), wait for iOS to let go, then open the Share
 * Studio sheet from Root. The sheet asks the grown-up gate, so the same gate rules apply.
 */
export async function shareFlexAfterHandoff<K extends FlexKind>(handoff: () => Promise<void>, kind: K, payload: FlexPayload<K>, options: FlexOptions): Promise<void> {
  await handoff();
  await new Promise<void>(resolve => setTimeout(resolve, MODAL_SETTLE_MS));
  shareFlex(kind, payload, options);
}
