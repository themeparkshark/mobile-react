/**
 * A reward card that asks "Wear it now" or "Keep my look" before it offers Share, so a kid who
 * taps Share first never loses the wear. Used by the Shark Pass reward card and its dev preview.
 * The order and words come from wearFirstButtons and wearFirstCaption (unit tested).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GotIt } from './moneyUi';
import { wearFirstButtons, wearFirstCaption, withWearTimeout, type WearChoice } from '../../services/money/sharkPassModel';

export type WearAction = { readonly label: string; readonly run: () => Promise<unknown> };

export default function WearFirstReward({ title, picture, footer, caption, wear, frame = false, share, onDone, resetOn }: {
  readonly title: string;
  readonly picture: ReactNode;
  readonly footer?: ReactNode;
  /** The first line under the title (what the reward is). */
  readonly caption: string;
  readonly wear: WearAction;
  /** A profile frame says "Your frame shows on your profile now." when worn. */
  readonly frame?: boolean;
  /** The Share pill. It shows only after the choice. */
  readonly share?: ReactNode;
  /** Closes the card after the choice. */
  readonly onDone: () => void;
  /** A new reward on the same card starts the choice again. */
  readonly resetOn?: unknown;
}) {
  const [chosen, setChosen] = useState<WearChoice>(null);
  const live = useRef(true);
  const run = useRef(0);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { run.current += 1; setChosen(null); }, [resetOn]);

  const putOn = useCallback(() => {
    const mine = ++run.current;
    setChosen('saving');
    // Wait for the fresh look, so the share picture shows the shark wearing it.
    void withWearTimeout(wear.run())
      .then(() => { if (live.current && run.current === mine) setChosen('worn'); })
      .catch(() => { if (live.current && run.current === mine) setChosen('failed'); });
  }, [wear]);

  const b = wearFirstButtons(chosen);
  return (
    <GotIt grants={{}} art="gift" title={title} picture={picture} footer={chosen ? undefined : footer}
      caption={wearFirstCaption(chosen, caption, frame)}
      busyLabel={b.busy ? 'Putting it on...' : undefined}
      action={b.action ? { label: b.action === 'retry' ? 'Try again' : wear.label, icon: b.action === 'retry' ? 'retry' : 'pin', onPress: putOn } : undefined}
      doneLabel={b.doneLabel}
      onDone={b.doneKeeps ? () => setChosen('kept') : onDone}
      share={b.share ? share : undefined} />
  );
}
