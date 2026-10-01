import completeInLineTimer from '../../api/endpoints/me/inline-timer/complete';
import startInLineTimer from '../../api/endpoints/me/inline-timer/start';
import type { LineSessionResponse } from '../../api/endpoints/me/inline-timer/types';
import type { CurrentQuestProof } from '../../api/endpoints/me/inline-timer/currentQuest';
import type { QueueStoryMemento } from '../../api/endpoints/me/inline-timer/complete';
import type { CheckpointFix, CheckpointPayload } from './checkpointCredit';
import { RedeemRetryQueue } from './RedeemRetryQueue';

type RewardListener = (sessionId: string, response: LineSessionResponse, startRequestId?: string) => void;
const listeners = new Set<RewardListener>();
let signedIn = false;

/**
 * A wait that never reached the server (airplane mode, a dead zone at the
 * entrance): its saved entry checkpoint starts the session late (L1).
 */
export interface OfflineStart {
  readonly rideId: number;
  readonly startRequestId: string;
  readonly entry: CheckpointFix;
}

export interface LinePlayRewardItem {
  /** Empty for an offline wait until its late start returns a session id. */
  sessionId: string;
  currentQuestProof?: CurrentQuestProof | null;
  storyMemento?: QueueStoryMemento | null;
  checkpoint?: CheckpointPayload | null;
  offlineStart?: OfflineStart | null;
}

function refusedStart(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })?.response;
  return response?.status === 404 || response?.status === 409 || (response?.status === 422 &&
    ['NOT_NEAR_RIDE', 'LINE_REWARDS_UNAVAILABLE'].includes(response?.data?.code ?? ''));
}

/** One app-wide queue keeps pending server-owned rewards alive after LinePlay closes. */
export const linePlayRewardQueue = new RedeemRetryQueue<LinePlayRewardItem>({
  storageKey: 'lineplay_complete_retry_queue',
  // Network outages and account switches must never erase a pending receipt.
  maxAttempts: Number.POSITIVE_INFINITY,
  executor: async ({ sessionId, currentQuestProof, storyMemento, checkpoint, offlineStart }) => {
    if (!signedIn) return false;
    let id = sessionId;
    if (!id && offlineStart) {
      try {
        // Idempotent by the original start request id.
        const started = await startInLineTimer(offlineStart.rideId, offlineStart.startRequestId,
          offlineStart.entry.latitude, offlineStart.entry.longitude,
          { clientStartedAt: offlineStart.entry.at, accuracyMeters: offlineStart.entry.accuracyMeters });
        if (!started?.success || !started.session_id) return false;
        id = started.session_id;
      } catch (error) {
        // The server will never take this entry (not near, unmapped): drop it.
        if (refusedStart(error)) return true;
        throw error;
      }
    }
    if (!id) return true;
    const response = await completeInLineTimer(id, undefined, undefined,
      currentQuestProof ?? undefined, storyMemento ?? undefined, checkpoint ?? undefined);
    if (!response?.success) return false;
    listeners.forEach(listener => {
      try { listener(id, response, offlineStart?.startRequestId); }
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
