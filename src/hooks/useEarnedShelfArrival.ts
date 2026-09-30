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
  useEffect(() => {
    // A consumed scene must not reuse old window coordinates after leaving it.
    if (!requestKey || !enabled) { setState(null); return; }
    if (seen.current.has(requestKey)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const fail = () => { if (active) setState({ key: requestKey, target: null, failed: true }); };
    const measureVisible = () => {
      if (!active) return;
      if (!slotRef.current || !frameRef.current) { fail(); return; }
      frameRef.current.measureInWindow((fx, fy, fw, fh) => {
        if (!active) return;
        slotRef.current?.measureInWindow((sx, sy, sw, sh) => {
          if (!active) return;
          const values = [fx, fy, fw, fh, sx, sy, sw, sh];
          if (values.every(Number.isFinite) && sw > 0 && sh > 0 && fw > 0 && fh > 0 &&
              sx >= fx && sx + sw <= fx + fw + 1 && sy >= fy + 8 && sy + sh <= fy + fh - 8) {
            seen.current.add(requestKey);
            setState({ key: requestKey, failed: false, target: {
              x: sx - fx, y: sy - fy, width: sw, height: sh, frameWidth: fw, frameHeight: fh,
            } });
          } else if (++attempts < 8) timer = setTimeout(measureVisible, 80);
          else fail();
        });
      });
    };
    if (slotRef.current && contentRef.current) {
      slotRef.current.measureLayout(contentRef.current, (_x, y) => {
        if (!active || !Number.isFinite(y)) return;
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 170), animated: false });
        // Visibility is verified on every retry; a delay alone never accepts a target.
        timer = setTimeout(measureVisible, 80);
      }, fail);
    }
    return () => { active = false; if (timer !== undefined) clearTimeout(timer); };
  }, [requestKey, enabled, layoutVersion, slotRef, contentRef, frameRef, scrollRef]);
  return {
    target: enabled && state?.key === requestKey ? state.target : null,
    failed: enabled && state?.key === requestKey ? state.failed : false,
    notifyLayout: () => setLayoutVersion(value => value + 1),
  };
}
