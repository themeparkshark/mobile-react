import { createContext } from 'react';

/**
 * Set while a mini-game is a paid ride-coin challenge. A win skips the results
 * card and hands straight to the Coin Catch; the ride flow owns what's next.
 */
export const RideChallengeContext = createContext<boolean>(false);
