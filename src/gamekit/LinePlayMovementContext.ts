import { createContext } from 'react';

/** Only LinePlay supplies this; other GameKit callers keep their own pause controls. */
export const LinePlayMovementContext = createContext<{
  readonly moving: boolean;
  readonly onResume: () => void;
} | null>(null);
