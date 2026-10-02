import { useEffect, useState } from 'react';

/**
 * Whether a catch moment owns the screen. Chrome that would compete with it
 * (the offline banner, the home menu buttons) steps back while it is open.
 */
let open = false;
const listeners = new Set<(value: boolean) => void>();

export function setCatchOpen(value: boolean): void {
  if (open === value) return;
  open = value;
  listeners.forEach(listener => listener(value));
}

export function isCatchOpen(): boolean {
  return open;
}

export function useCatchOpen(): boolean {
  const [value, setValue] = useState(open);
  useEffect(() => {
    setValue(open);
    listeners.add(setValue);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}
