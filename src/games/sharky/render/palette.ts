/**
 * One colour per meaning (design 7.8), enforced by a test: these are the only
 * places the coral and gold hexes may appear in src/games/sharky/**.
 *
 *   DANGER   coral: telegraphs, hazard rims and reactions, the low-clock bar
 *   REWARD   gold: rewards, Overdrive and Frenzy
 *   BOOST    sky: the Boost fin glow, chain tiers below gold
 *   NEUTRAL  white: halos, sticker rims, neutral stamps
 *   INK      Alex's line colour
 */

export const DANGER = '#ff6b57';
export const REWARD = '#ffc233';
export const REWARD_LIGHT = '#ffe27a';
export const REWARD_PALE = '#fff1b8';
export const BOOST = '#5fd0ff';
export const BOOST_DEEP = '#3aa7f0';
export const NEUTRAL = '#ffffff';
export const INK = '#23384f';
/** Warm gold water the background grades toward in Frenzy (design 7.5). */
export const FRENZY_WATER = '#ffd86b';
/** Blue haze the background layers mix toward (design 7.8). */
export const HAZE = '#cfeaff';
/** Hearts keep their own pink (not a meaning colour). */
export const HEART = '#ff5aa5';

/** Chain badge colours by tier: hidden at x1, sky, gold, white-gold (no purple, no coral). */
export const TIER_COLORS = [BOOST_DEEP, BOOST, REWARD, REWARD_PALE];

/** 0xAARRGGBB packers for Skia colour math in worklets. */
export function hexToRgb(hex: string): [number, number, number] {
  'worklet';
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
