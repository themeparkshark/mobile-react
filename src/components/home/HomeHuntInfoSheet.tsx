import { useEffect, useState } from 'react';
import { getHomeHuntInfo, type HomeHuntInfo } from '../../api/endpoints/me/homeHunt';
import HelpSheet, { type HelpSheetContent } from '../help/HelpSheet';

// The rules are the same for everyone, so one read serves every sheet in the session.
let cachedInfo: HomeHuntInfo | null = null;

/** The server's info lines. Loads once per session while a sheet is open. */
export function useHomeHuntInfo(active: boolean): { info: HomeHuntInfo | null; error: boolean; retry: () => void } {
  const [info, setInfo] = useState<HomeHuntInfo | null>(cachedInfo);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || cachedInfo) return;
    let live = true;
    setError(false);
    getHomeHuntInfo().then(data => {
      cachedInfo = data ?? null;
      if (live) setInfo(cachedInfo);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [active, attempt]);
  return { info, error, retry: () => setAttempt(value => value + 1) };
}

/** Home Hunt rules and drop odds in the shared "?" sheet. Lines come from the server verbatim. */
export default function HomeHuntInfoSheet({ visible, sheet, loading, error, onRetry, onClose }: {
  readonly visible: boolean;
  readonly sheet: HelpSheetContent;
  readonly loading?: boolean;
  readonly error?: boolean;
  readonly onRetry?: () => void;
  readonly onClose: () => void;
}) {
  const state = error ? 'error' : loading && sheet.pages.length === 0 ? 'loading' : 'ready';
  return <HelpSheet visible={visible} sheet={sheet} state={state} onRetry={onRetry} onClose={onClose} />;
}
