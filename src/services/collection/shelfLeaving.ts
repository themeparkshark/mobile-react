/**
 * GET RIDE PARTS leaves the shelf for the map at once. The shelf's last frame stays on screen
 * while the map pops in, and a React update cannot reach a screen that is being popped, so the
 * next-coin card would still name the old coin. This UI-thread value (no React render) fades
 * that card out the moment the button is pressed: every frame shows the right coin or none.
 * The header sets it back to 0 when it mounts, and the press clears it after 1.5 s in case
 * the shelf stays (for example, the map was not below it).
 */
import { makeMutable } from 'react-native-reanimated';

export const shelfLeaving = makeMutable(0);
