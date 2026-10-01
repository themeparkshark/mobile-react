import { useEffect, useRef, useState } from 'react';

/** Long enough to catch a tap already on its way, short enough not to feel stuck. */
export const SWAP_TAP_GUARD_MS = 700;

/**
 * True for a moment after a map suggestion slot swaps one chip for another
 * (the Adventure Ticket turning into "In line at X?"), so a tap aimed at the
 * old chip cannot open the new one. Appearing in an empty slot is not a swap.
 */
export default function useSwapTapGuard(slotKey: string | null, ms = SWAP_TAP_GUARD_MS): boolean {
  const previous = useRef(slotKey);
  const [guarded, setGuarded] = useState(false);
  useEffect(() => {
    const before = previous.current;
    previous.current = slotKey;
    if (!before || !slotKey || before === slotKey) return;
    setGuarded(true);
    const timer = setTimeout(() => setGuarded(false), ms);
    return () => clearTimeout(timer);
  }, [slotKey, ms]);
  return guarded;
}
