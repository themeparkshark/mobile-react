/**
 * Simple event bus so gym actions (checkin, placeCoin, attack, defend)
 * can tell BattleHUD to refresh scores immediately.
 *
 * Usage:
 *   import { battleHUDEvents } from './battleHUDEvents';
 *   // After a successful action:
 *   battleHUDEvents.emit();
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export const battleHUDEvents = {
  /** Fire after any gym action that changes scores */
  emit() {
    listeners.forEach((fn) => fn());
  },

  /** Subscribe; returns unsubscribe function */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
