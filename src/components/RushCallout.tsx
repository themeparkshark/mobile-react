/**
 * The old stand-alone Rush pill was retired: Rush now lives in LiveEventsPill.
 * This file only re-exports the type so existing imports keep compiling.
 * Request to WS2: import RushPick from '../services/live/rush' in ExploreScreen,
 * then delete this file.
 */
export type { RushPick } from '../services/live/rush';
