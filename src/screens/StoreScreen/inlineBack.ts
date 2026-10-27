import { createContext, type MutableRefObject } from 'react';

/**
 * Android back for a reveal shown inline inside another modal (the try-on hands off its Set Complete
 * reveal into its own modal). That host modal owns onRequestClose, so the inline reveal registers its
 * close here and the host routes back to it while the reveal is up.
 */
export const InlineBackContext = createContext<MutableRefObject<(() => void) | null> | null>(null);
