import { createContext } from 'react';

/**
 * Set while a mini-game is a paid ride-coin challenge. A win skips the results
 * card and hands straight to the Coin Catch; the ride flow owns the native
 * presentation and what's next. The game shell renders inside that presentation.
 */
export const RideChallengeContext = createContext<boolean>(false);
