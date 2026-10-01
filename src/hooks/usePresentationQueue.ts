import { useEffect, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  presentationQueue,
  type BadgeTarget,
  type PresentationKind,
  type PresentationRequest,
  type PresentationState,
} from '../services/presentation/PresentationQueue';

let appStateBound = false;

/**
 * Coming back from the background is a new app open: the 2-moment allowance
 * resets. Bound once, the first time any screen uses the queue.
 */
function bindAppOpen(): void {
  if (appStateBound) return;
  appStateBound = true;
  let last: AppStateStatus = AppState.currentState;
  AppState.addEventListener('change', next => {
    if (last === 'background' && next === 'active') presentationQueue.startAppOpen();
    last = next;
  });
}

/** The whole queue (current moment, pending, badges). */
export function usePresentationQueue(): PresentationState {
  useEffect(bindAppOpen, []);
  return useSyncExternalStore(presentationQueue.subscribe, presentationQueue.getState);
}

/**
 * A full-screen moment asks for its turn. `visible` is true only while this
 * moment owns the screen; call `done` when it closes. Pass id null until the
 * moment has something to show.
 */
export function usePresentationSlot(id: string | null, kind: PresentationKind, badge: BadgeTarget): {
  visible: boolean;
  done: () => void;
} {
  const state = usePresentationQueue();
  useEffect(() => {
    if (id) presentationQueue.enqueue({ id, kind, badge } satisfies PresentationRequest);
  }, [id, kind, badge]);
  return {
    visible: id !== null && state.current?.id === id,
    done: () => {
      if (id) presentationQueue.dismiss(id);
    },
  };
}

/** Badge dots waiting on one tab or card. */
export function usePresentationBadges(target: BadgeTarget): readonly PresentationRequest[] {
  const state = usePresentationQueue();
  return state.badges.filter(item => item.badge === target);
}
