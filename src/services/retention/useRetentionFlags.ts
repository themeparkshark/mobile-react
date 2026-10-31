import { useEffect, useState } from 'react';
import { loadRetentionFlags, retentionFlagsNow, type RetentionFlags } from './flags';

/** The server switches for this app run (null until the first read answers). A failed read retries on the next mount. */
export default function useRetentionFlags(): RetentionFlags | null {
  const [flags, setFlags] = useState<RetentionFlags | null>(() => retentionFlagsNow());
  useEffect(() => {
    if (flags) return undefined;
    let live = true;
    void loadRetentionFlags().then(f => { if (live && f) setFlags(f); });
    return () => { live = false; };
  }, [flags]);
  return flags;
}
