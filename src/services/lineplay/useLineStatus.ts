/** The wait's line status for a screen (lineStatus.ts). Previews and benches that run no wait read the calm default. */
import { useSyncExternalStore } from 'react';
import { readLineStatus, subscribeLineStatus, type LineStatus } from './lineStatus';

export function useLineStatus(): LineStatus {
  return useSyncExternalStore(subscribeLineStatus, readLineStatus, readLineStatus);
}
