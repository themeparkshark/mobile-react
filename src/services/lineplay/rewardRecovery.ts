import completeInLineTimer from '../../api/endpoints/me/inline-timer/complete';
import type { LineSessionResponse } from '../../api/endpoints/me/inline-timer/types';
import type { CurrentQuestProof } from '../../api/endpoints/me/inline-timer/currentQuest';
import type { QueueStoryMemento } from '../../api/endpoints/me/inline-timer/complete';
import { RedeemRetryQueue } from './RedeemRetryQueue';

type RewardListener = (sessionId: string, response: LineSessionResponse) => void;
const listeners = new Set<RewardListener>();
let signedIn = false;

/** One app-wide queue keeps pending server-owned rewards alive after LinePlay closes. */
export const linePlayRewardQueue = new RedeemRetryQueue<{
  sessionId: string; currentQuestProof?: CurrentQuestProof | null;
  storyMemento?: QueueStoryMemento | null;
}>({
  storageKey: 'lineplay_complete_retry_queue',
  // Network outages and account switches must never erase a pending receipt.
  maxAttempts: Number.POSITIVE_INFINITY,
  executor: async ({ sessionId, currentQuestProof, storyMemento }) => {
    if (!signedIn) return false;
    const response = await completeInLineTimer(sessionId, undefined, undefined,
      currentQuestProof ?? undefined, storyMemento ?? undefined);
    if (!response?.success) return false;
    listeners.forEach(listener => {
      try { listener(sessionId, response); }
      catch (error) { console.warn('[LinePlay] reward observer failed:', error); }
    });
    return true;
  },
});

export function setLinePlayRecoverySignedIn(value: boolean): void {
  signedIn = value;
  if (value) void linePlayRewardQueue.drain();
}

export function subscribeLinePlayRewardRecovery(listener: RewardListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
