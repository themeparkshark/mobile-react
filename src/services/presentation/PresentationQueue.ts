/**
 * One queue for full-screen moments (economy review K15).
 *
 * Crowning, Home Hunt results, the re-mint notice and reward sheets all ask
 * this queue before they cover the screen. One shows at a time, never
 * interrupted. Priority: Crowning > Home Hunt results > re-mint > reward
 * sheets, oldest first within a kind. At most 2 full-screen moments per app
 * open (Home Hunt's rule, now for everything); the rest become badge dots on
 * their tab or card instead of stacking modals.
 *
 * In-line level-ups and 2 s perk proc chips are not full-screen and never
 * enter this queue.
 *
 * Pure state machine with no React or native imports, so it is unit tested
 * in tools/tests. usePresentationQueue binds it to the app and AppState.
 */

export type PresentationKind = 'crowning' | 'home_hunt_results' | 'remint' | 'reward_sheet';

/** Where a moment that missed its slot waits as a badge dot. */
export type BadgeTarget = 'standings' | 'collection' | 'inventory' | 'coin_shelf' | 'profile';

export interface PresentationRequest {
  /** Stable id (for example a server receipt), so a re-sent moment is never queued twice. */
  readonly id: string;
  readonly kind: PresentationKind;
  readonly badge: BadgeTarget;
}

export interface PresentationState {
  readonly current: PresentationRequest | null;
  readonly pending: readonly PresentationRequest[];
  readonly badges: readonly PresentationRequest[];
  readonly shownThisOpen: number;
}

export const PRESENTATION_PRIORITY: Readonly<Record<PresentationKind, number>> = {
  crowning: 4,
  home_hunt_results: 3,
  remint: 2,
  reward_sheet: 1,
};

export const FULL_SCREEN_PER_APP_OPEN = 2;

export interface PresentationQueue {
  getState(): PresentationState;
  subscribe(listener: () => void): () => void;
  /** Ask to show a moment. Returns 'showing', 'queued' or 'badge'. */
  enqueue(request: PresentationRequest): 'showing' | 'queued' | 'badge';
  /** The moment on screen closed; the next one (if the cap allows) takes over. */
  dismiss(id: string): void;
  /** The player opened the badge (or claimed it elsewhere): drop it. */
  clearBadge(id: string): void;
  /** Badge dots for one tab or card. */
  badgesFor(target: BadgeTarget): readonly PresentationRequest[];
  /** A new app open: the 2-moment allowance resets. Badges stay badges. */
  startAppOpen(): void;
}

function byPriority(a: PresentationRequest, b: PresentationRequest): number {
  return PRESENTATION_PRIORITY[b.kind] - PRESENTATION_PRIORITY[a.kind];
}

export function createPresentationQueue(perOpen: number = FULL_SCREEN_PER_APP_OPEN): PresentationQueue {
  let state: PresentationState = { current: null, pending: [], badges: [], shownThisOpen: 0 };
  const listeners = new Set<() => void>();

  const commit = (next: PresentationState) => {
    state = next;
    listeners.forEach(listener => listener());
  };

  /** Fill the screen from pending, or turn pending into badges once the cap is spent. */
  const advance = (draft: PresentationState): PresentationState => {
    if (draft.current) return draft;
    if (draft.pending.length === 0) return draft;
    if (draft.shownThisOpen >= perOpen) {
      return { ...draft, pending: [], badges: [...draft.badges, ...draft.pending] };
    }
    // A stable sort keeps arrival order within a kind.
    const [first, ...rest] = [...draft.pending].sort(byPriority);
    return { ...draft, current: first, pending: rest, shownThisOpen: draft.shownThisOpen + 1 };
  };

  const known = (id: string) =>
    state.current?.id === id || state.pending.some(item => item.id === id);

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enqueue(request) {
      if (state.current?.id === request.id) return 'showing';
      if (known(request.id)) return 'queued';
      // A badge re-sent (for example unclaimed results on a later open) gets another chance.
      const badges = state.badges.filter(item => item.id !== request.id);
      const next = advance({ ...state, badges, pending: [...state.pending, request] });
      commit(next);
      if (next.current?.id === request.id) return 'showing';
      return next.badges.some(item => item.id === request.id) ? 'badge' : 'queued';
    },
    dismiss(id) {
      if (state.current?.id !== id) return;
      commit(advance({ ...state, current: null }));
    },
    clearBadge(id) {
      if (!state.badges.some(item => item.id === id)) return;
      commit({ ...state, badges: state.badges.filter(item => item.id !== id) });
    },
    badgesFor(target) {
      return state.badges.filter(item => item.badge === target);
    },
    startAppOpen() {
      commit(advance({ ...state, shownThisOpen: state.current ? 1 : 0 }));
    },
  };
}

/** The app-wide queue. */
export const presentationQueue = createPresentationQueue();
