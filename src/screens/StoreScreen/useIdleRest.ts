import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ambient shop loops (bubbles, twinkles, rays, idle rigs) rest after `ms` with no touch, so a phone
 * left open on the shop in a hot park can drop its refresh rate. Any touch or scroll wakes them.
 */
export default function useIdleRest(ms = 8000): { idle: boolean; wake: () => void } {
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setIdle(false);
    timer.current = setTimeout(() => setIdle(true), ms);
  }, [ms]);
  useEffect(() => { wake(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [wake]);
  return { idle, wake };
}
