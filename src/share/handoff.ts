/**
 * A share button inside an RN <Modal>: the grown-up gate (mounted in Root) can't present
 * over that modal on iOS. useModalHandoff closes the modal and resolves once iOS has
 * finished dismissing it (onDismiss), so the gate can show. HANDOFF_MS covers Android
 * (no onDismiss) and an onDismiss that never fires.
 */
import { useCallback, useRef } from 'react';

export const MODAL_HANDOFF_MS = 600;

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
