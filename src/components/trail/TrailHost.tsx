import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LocationStatusContext } from '../../context/LocationProvider';
import { playSfx } from '../../gamekit/SFX';
import { useRung } from '../../services/reveal/revealLadder';
import { listenRewardsDoor, returnToRewards } from '../../services/retention/rewardsSignals';
import { useTrail } from '../../services/trail/TrailProvider';
import { boxName, formatSteps, goldIn, headlineBox, stepsToGo, type TrailBox, type TrailReward } from '../../services/trail/trailModel';
import { gameAlert } from '../../ui';
import TrailPill from './TrailPill';
import TrailReveal from './TrailReveal';
import TrailSheet from './TrailSheet';

/**
 * Trail Boxes on the map: their sheet and the opening reveal (core loop:
 * rung 6, keyed on the server's box count). The steps pill no longer sits on
 * the map: its progress is the Rewards button's ring, and the Rewards sheet's
 * Trail row opens this host (listenRewardsDoor). Renders nothing while the
 * server flag is off, before the first state arrives, or before rung 6.
 * `active` pauses every idle animation when the map is covered or not focused.
 */
function TrailHost({ active, inPark: inParkProp, preview, openRequest = 0, pill: pillProp }: {
  readonly active: boolean;
  /** At a park (else read from the player's location). Decides "Today at the park" words. */
  readonly inPark?: boolean;
  /** Dev previews only: the old map pill (the map now shows a ring on the Rewards button instead). */
  readonly pill?: boolean;
  /** Dev previews only: start with the sheet, its odds page, or the reveal open. */
  readonly preview?: 'sheet' | 'inside' | 'reveal';
  /** Bump to open the sheet (or the ready boxes) from elsewhere, e.g. the map's Next Up rail. */
  readonly openRequest?: number;
}) {
  const trail = useTrail();
  const parkNow = useContext(LocationStatusContext)?.park ?? null;
  const inPark = inParkProp ?? !!parkNow;
  const pill = pillProp ?? !!preview;
  const rungOpen = useRung('trail').open || !!preview;
  const [open, setOpen] = useState(preview === 'sheet' || preview === 'inside');
  const [opening, setOpening] = useState<readonly TrailBox[] | null>(preview === 'reveal' ? trail.state?.ready ?? null : null);
  /** The opening is up (false while it fades away; it unmounts once UIKit says it is gone). */
  const [revealUp, setRevealUp] = useState(opening !== null);
  /** Opened through the Rewards sheet's Trail row: the last close goes back to that sheet, like every other row. */
  const fromRewards = useRef(false);
  const startOpening = useCallback((boxes: readonly TrailBox[]) => { setOpening(boxes); setRevealUp(true); }, []);
  /** Everything Trail is closed: back to Rewards if that is where it came from (its sheet waits for ours to go). */
  const allClosed = useCallback(() => {
    if (!fromRewards.current) return;
    fromRewards.current = false;
    returnToRewards();
  }, []);

  const show = useCallback(() => {
    // Ready boxes: the pill goes straight to the opening (one tap, not three).
    if (trail.state?.ready.length) { startOpening(trail.state.ready); return; }
    playSfx('ui.modalOpen');
    setOpen(true);
    void trail.flush();
  }, [trail, startOpening]);
  const lastRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest === lastRequest.current) return;
    lastRequest.current = openRequest;
    fromRewards.current = false;
    if (trail.enabled && trail.state && rungOpen) show();
  }, [openRequest, show, trail.enabled, trail.state, rungOpen]);
  // The Rewards sheet's Trail row.
  const showRef = useRef(show);
  showRef.current = show;
  const ready = trail.enabled && !!trail.state && rungOpen;
  useEffect(() => (ready ? listenRewardsDoor('trail', () => { fromRewards.current = true; showRef.current(); }) : undefined), [ready]);
  const nextHint = useMemo(() => {
    const b = trail.state ? headlineBox({ ready: [], walking: trail.state.walking }) : null;
    return b ? `Next up: ${boxName(b)}, ${formatSteps(stepsToGo(b))} steps to go` : null;
  }, [trail.state]);

  const openBox = useCallback(async (boxId: number): Promise<readonly TrailReward[]> => {
    const next = await trail.open(boxId);
    return next?.opened?.rewards ?? [];
  }, [trail]);

  const act = useCallback((fn: () => Promise<unknown>) => {
    void fn().catch(() => gameAlert('Trail Boxes', 'That did not go through. Try again in a moment.'));
  }, []);

  if (!trail.enabled || !trail.state || !rungOpen) return null;
  // At home the pill shows only when you already have boxes (they wait for the next park day).
  const any = trail.state.walking.length + trail.state.waiting.length + trail.state.ready.length;
  const showPill = pill && (inPark || any > 0);
  return (
    <>
      {showPill && <TrailPill state={trail.state} active={active && !open && !opening} onPress={show} inPark={inPark} />}
      <TrailSheet visible={open && !opening} state={trail.state} motion={trail.motion} inPark={inPark} parkName={trail.state.today.park_name ?? null}
        onClose={() => { playSfx('ui.modalClose'); setOpen(false); allClosed(); }}
        onOpen={startOpening}
        onFront={id => act(() => trail.front(id))}
        onGoal={g => act(() => trail.setGoal(g))}
        onWheels={on => act(() => trail.setWheels(on))}
        onAskMotion={() => void trail.askMotion()} initialView={preview === 'inside' ? 'inside' : 'boxes'} />
      {opening && <TrailReveal boxes={opening} visible={revealUp} onOpen={openBox} nextHint={nextHint} goldIn={trail.state && ![...trail.state.walking, ...trail.state.waiting].some(b => b.tier === 'gold') ? goldIn(trail.state) : null}
        onClose={() => { setRevealUp(false); void trail.refresh(); if (!open) allClosed(); }}
        onWorn={() => { fromRewards.current = false; setOpen(false); setRevealUp(false); void trail.refresh(); }}
        onGone={() => setOpening(null)} />}
    </>
  );
}

export default memo(TrailHost);
