/**
 * A reward feature's NEW tag (core loop BLUEPRINT 4.3 rule 8 and 4.4): the
 * first time a rung's feature shows, its own surface wears one gold NEW pill.
 * The unlock ladder (guide-map's contract) picks the one rung per app open; this
 * hook only draws it and retires it.
 *
 * A NEW that was on screen is marked seen when the surface goes away (the sheet
 * closes, the screen loses focus or unmounts) or the app goes to the background, so a shown tag
 * never holds the ladder's one NEW slot into the next app open. A tap clears it
 * at once through `seen()`.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { markRungSeen, useRung, type Rung } from '../reveal/revealLadder';

export function useShownNewTag(rung: Rung, shown = true): { readonly isNew: boolean; readonly seen: () => void } {
  const r = useRung(rung);
  const isNew = r.open && r.isNew && shown;
  const wasShown = useRef(false);
  // Shown, then hidden (the screen lost focus, the sheet closed while still mounted): it was seen, so it retires.
  useEffect(() => {
    if (isNew) { wasShown.current = true; return; }
    if (wasShown.current) { wasShown.current = false; markRungSeen(rung); }
  }, [isNew, rung]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'background' && wasShown.current) { wasShown.current = false; markRungSeen(rung); }
    });
    return () => {
      sub.remove();
      if (wasShown.current) { wasShown.current = false; markRungSeen(rung); }
    };
  }, [rung]);
  return { isNew, seen: r.markSeen };
}

/** Which rung a Rewards sheet row belongs to (the daily chest is rung 0: it never wears NEW). */
export function rowRung(key: string): Rung | null {
  switch (key) {
    case 'daily3': case 'level_chest': case 'weekly_box': return 'daily';
    case 'trail': return 'trail';
    case 'events': return 'events';
    default: return null;
  }
}

/** The row each rung's NEW prefers: the feature itself (Daily 3 for rung 4), else the rung's first row. */
const LEAD_ROW: Partial<Record<Rung, string>> = { daily: 'daily3' };

/** The one row that wears the NEW pill: the rung's lead row when it shows, else its first row. Pure. */
export function newRowKey(rows: readonly { readonly key: string }[], newRung: Rung | null): string | null {
  if (!newRung) return null;
  const lead = LEAD_ROW[newRung];
  if (lead && rows.some(r => r.key === lead)) return lead;
  return rows.find(r => rowRung(r.key) === newRung)?.key ?? null;
}
