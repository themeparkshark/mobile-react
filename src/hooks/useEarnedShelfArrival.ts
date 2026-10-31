import { useEffect, useRef, useState, type RefObject } from 'react';
import { type ScrollView, type View } from 'react-native';

export interface ShelfArrivalTarget { x: number; y: number; width: number; height: number; frameWidth: number; frameHeight: number; }

/** Scroll to and measure the real owned slot before starting its arrival scene. */
export default function useEarnedShelfArrival({ requestKey, enabled, slotRef, contentRef, frameRef, scrollRef }: {
  requestKey: string | null; enabled: boolean;
  slotRef: RefObject<View | null>; contentRef: RefObject<View | null>;
  frameRef: RefObject<View | null>; scrollRef: RefObject<ScrollView | null>;
}) {
  const seen = useRef(new Set<string>());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [state, setState] = useState<{ key: string; target: ShelfArrivalTarget | null; failed: boolean } | null>(null);
  // The measurement in progress. A layout bump while it runs (shelf art, the coin guide filling in)
  // never restarts it: each restart used to push the coin's flight back by another 80 ms or more,
  // about 1.2 s on a fresh shelf. It still re-checks visibility on every try.
  const job = useRef<{ key: string; cancelled: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => {
    if (job.current) { job.current.cancelled = true; clearTimeout(job.current.timer); job.current = null; }
  }, [requestKey, enabled]);
  useEffect(() => {
    // A consumed scene must not reuse old window coordinates after leaving it.
    if (!requestKey || !enabled) { setState(null); return; }
    if (seen.current.has(requestKey)) return;
    if (job.current?.key === requestKey) return;
    const run: { key: string; cancelled: boolean; timer?: ReturnType<typeof setTimeout> } = { key: requestKey, cancelled: false };
    job.current = run;
    let attempts = 0;
    const done = () => { if (job.current === run) job.current = null; };
    const fail = () => { if (!run.cancelled) { done(); setState({ key: requestKey, target: null, failed: true }); } };
    const measureVisible = () => {
      if (run.cancelled) return;
      if (!slotRef.current || !frameRef.current) { fail(); return; }
      frameRef.current.measureInWindow((fx, fy, fw, fh) => {
        if (run.cancelled) return;
        slotRef.current?.measureInWindow((sx, sy, sw, sh) => {
          if (run.cancelled) return;
          const values = [fx, fy, fw, fh, sx, sy, sw, sh];
          if (values.every(Number.isFinite) && sw > 0 && sh > 0 && fw > 0 && fh > 0 &&
              sx >= fx && sx + sw <= fx + fw + 1 && sy >= fy + 8 && sy + sh <= fy + fh - 8) {
            seen.current.add(requestKey);
            done();
            setState({ key: requestKey, failed: false, target: {
              x: sx - fx, y: sy - fy, width: sw, height: sh, frameWidth: fw, frameHeight: fh,
            } });
          } else if (++attempts < 8) {
            // Not in view yet: scroll to the slot again (content above it may have grown) and re-check.
            scrollToSlot();
            run.timer = setTimeout(measureVisible, 80);
          } else fail();
        });
      });
    };
    const scrollToSlot = () => {
      if (!slotRef.current || !contentRef.current) return;
      slotRef.current.measureLayout(contentRef.current, (_x, y) => {
        if (!run.cancelled && Number.isFinite(y)) scrollRef.current?.scrollTo({ y: Math.max(0, y - 170), animated: false });
      }, () => undefined);
    };
    if (slotRef.current && contentRef.current) {
      slotRef.current.measureLayout(contentRef.current, (_x, y) => {
        if (run.cancelled) return;
        if (!Number.isFinite(y)) { done(); return; }
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 170), animated: false });
        // Visibility is verified on every retry; a delay alone never accepts a target. One frame lets the scroll land.
        run.timer = setTimeout(measureVisible, 34);
      }, fail);
    } else done();
  }, [requestKey, enabled, layoutVersion, slotRef, contentRef, frameRef, scrollRef]);
  return {
    target: enabled && state?.key === requestKey ? state.target : null,
    failed: enabled && state?.key === requestKey ? state.failed : false,
    /** Still finding the slot: the coin waits off its shelf, so it lands there instead of sitting there first. */
    pending: !!requestKey && enabled && !seen.current.has(requestKey) && state?.key !== requestKey,
    notifyLayout: () => setLayoutVersion(value => value + 1),
  };
}
