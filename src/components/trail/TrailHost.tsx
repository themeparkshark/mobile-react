import { memo, useCallback, useMemo, useState } from 'react';
import { playSfx } from '../../gamekit/SFX';
import { useTrail } from '../../services/trail/TrailProvider';
import { boxName, formatSteps, headlineBox, stepsToGo, type TrailBox, type TrailReward } from '../../services/trail/trailModel';
import { gameAlert } from '../../ui';
import TrailPill from './TrailPill';
import TrailReveal from './TrailReveal';
import TrailSheet from './TrailSheet';

/**
 * Trail Boxes on the park map: the pill (over the Energy pill), its sheet and
 * the opening reveal. Renders nothing while the server flag is off or before
 * the first state arrives. `active` pauses every idle animation when the map
 * is covered or not focused.
 */
function TrailHost({ active, inPark = true, preview }: {
  readonly active: boolean;
  readonly inPark?: boolean;
  /** Dev previews only: start with the sheet, its odds page, or the reveal open. */
  readonly preview?: 'sheet' | 'inside' | 'reveal';
}) {
  const trail = useTrail();
  const [open, setOpen] = useState(preview === 'sheet' || preview === 'inside');
  const [opening, setOpening] = useState<readonly TrailBox[] | null>(preview === 'reveal' ? trail.state?.ready ?? null : null);

  const show = useCallback(() => {
    // Ready boxes: the pill goes straight to the opening (one tap, not three).
    if (trail.state?.ready.length) { setOpening(trail.state.ready); return; }
    playSfx('ui.modalOpen');
    setOpen(true);
    void trail.flush();
  }, [trail]);
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

  if (!trail.enabled || !trail.state) return null;
  // At home the pill shows only when you already have boxes (they wait for the next park day).
  const any = trail.state.walking.length + trail.state.waiting.length + trail.state.ready.length;
  if (!inPark && any === 0) return null;
  return (
    <>
      <TrailPill state={trail.state} active={active && !open && !opening} onPress={show} inPark={inPark} />
      <TrailSheet visible={open && !opening} state={trail.state} motion={trail.motion} inPark={inPark} parkName={trail.state.today.park_name ?? null}
        onClose={() => { playSfx('ui.modalClose'); setOpen(false); }}
        onOpen={boxes => setOpening(boxes)}
        onFront={id => act(() => trail.front(id))}
        onGoal={g => act(() => trail.setGoal(g))}
        onWheels={on => act(() => trail.setWheels(on))}
        onAskMotion={() => void trail.askMotion()} initialView={preview === 'inside' ? 'inside' : 'boxes'} />
      {opening && <TrailReveal boxes={opening} onOpen={openBox} nextHint={nextHint} goldIn={trail.state && ![...trail.state.walking, ...trail.state.waiting].some(b => b.tier === 'gold') ? trail.state.gold_in : null}
        onClose={() => { setOpening(null); void trail.refresh(); }} />}
    </>
  );
}

export default memo(TrailHost);
