import type { WikiLiveEntry } from '../../api/endpoints/parks/queue-times/getWikiTimes';

/** Feed status controls entry and conservative reward intent; the server still verifies proximity. */
export function queuePlayPolicy(status: WikiLiveEntry['status']): {
  canPlay: boolean;
  canRequestParts: boolean;
} {
  return {
    canPlay: status === 'OPERATING' || status === 'DOWN',
    canRequestParts: status === 'OPERATING',
  };
}
