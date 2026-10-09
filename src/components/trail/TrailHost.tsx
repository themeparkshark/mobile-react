import { useCallback, useState } from 'react';
import { playSfx } from '../../gamekit/SFX';
import { useTrail } from '../../services/trail/TrailProvider';
import type { TrailBox, TrailReward } from '../../services/trail/trailModel';
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
export default function TrailHost({ active, inPark = true }: { readonly active: boolean; readonly inPark?: boolean }) {
  const trail = useTrail();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<readonly TrailBox[] | null>(null);

  const show = useCallback(() => {
    playSfx('ui.modalOpen');
    setOpen(true);
    void trail.flush();
  }, [trail]);

  const openBox = useCallback(async (boxId: number): Promise<readonly TrailReward[]> => {
    const next = await trail.open(boxId);
    return next?.opened?.rewards ?? [];
  }, [trail]);

  const act = useCallback((fn: () => Promise<unknown>) => {
    void fn().catch(() => gameAlert('Trail Boxes', 'That did not go through. Try again in a moment.'));
  }, []);

  if (!trail.enabled || !trail.state) return null;
  return (
    <>
      <TrailPill state={trail.state} active={active && !open && !opening} onPress={show} />
      <TrailSheet visible={open && !opening} state={trail.state} motion={trail.motion} inPark={inPark}
        onClose={() => { playSfx('ui.modalClose'); setOpen(false); }}
        onOpen={boxes => setOpening(boxes)}
        onFront={id => act(() => trail.front(id))}
        onGoal={g => act(() => trail.setGoal(g))}
        onWheels={on => act(() => trail.setWheels(on))}
        onAskMotion={() => void trail.askMotion()} />
      {opening && <TrailReveal boxes={opening} onOpen={openBox}
        onClose={() => { setOpening(null); void trail.refresh(); }} />}
    </>
  );
}
