import { createContext } from 'react';

/**
 * Capture screens only: draw the game shell inside a phone-sized frame (for
 * example 375 x 667, an iPhone SE) on a bigger simulator, so a results card
 * lays out at the real SE width and height. Null (the default) everywhere in
 * the app: the shell fills the screen as always.
 */
export const ShellFrameContext = createContext<{ readonly width: number; readonly height: number } | null>(null);
