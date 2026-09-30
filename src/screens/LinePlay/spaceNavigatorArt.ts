/**
 * The Space chapter's navigator art.
 *
 * The helmeted space shark (space-navigation-shark-v2.png) was made outside
 * the GPT Image 2.5 + Alex-reference pipeline, and Dustin has rejected a
 * helmeted shark before. Until he signs it off, the chapter uses Alex's
 * classic shark. Setting EXPO_PUBLIC_LINEPLAY_SPACE_HELMET_ART=1 restores
 * the helmet art once it is approved.
 */
const CLASSIC_SHARK = require('../../../assets/images/screens/pin-collections/shark.png');
const HELMET_SHARK = require('../../../assets/images/screens/lineplay/space-navigation-shark-v2.png');

export const SPACE_HELMET_ART_APPROVED = process.env.EXPO_PUBLIC_LINEPLAY_SPACE_HELMET_ART === '1';

/** Navigator art for the Space chapter hero, Signal Repair header and Memory banner. */
export const SPACE_NAVIGATOR_ART = SPACE_HELMET_ART_APPROVED ? HELMET_SHARK : CLASSIC_SHARK;
