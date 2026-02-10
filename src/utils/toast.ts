/**
 * Global toast event emitter.
 * Bridges non-React code (axios interceptors) into the ToastProvider.
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'reward';

export interface ToastEvent {
  type: ToastType;
  message: string;
  icon?: string;
  duration?: number;
}

type Listener = (event: ToastEvent) => void;

const listeners: Set<Listener> = new Set();

/**
 * Show a toast from anywhere — including outside React components.
 * The ToastProvider subscribes to these events and renders them.
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  durationMs?: number
): void {
  const event: ToastEvent = { message, type, duration: durationMs };
  listeners.forEach((fn) => fn(event));
}

/** Subscribe to toast events. Returns unsubscribe function. */
export function onToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
