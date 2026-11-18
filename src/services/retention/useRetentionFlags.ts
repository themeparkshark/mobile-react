import { useEffect, useState } from 'react';
import { loadRetentionFlags, onRetentionFlags, retentionFlagsNow, type RetentionFlags } from './flags';

/** The server switches (null until the first read answers). A failed read is retried by the shared store; every new answer lands here. */
export default function useRetentionFlags(): RetentionFlags | null {
  const [flags, setFlags] = useState<RetentionFlags | null>(() => retentionFlagsNow());
  useEffect(() => onRetentionFlags?.(setFlags), []);
  useEffect(() => {
    if (flags) return undefined;
    let live = true;
    void loadRetentionFlags().then(f => { if (live && f) setFlags(f); });
    return () => { live = false; };
  }, [flags]);
  return flags;
}
