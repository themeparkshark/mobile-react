/**
 * assets.ts: bundled Sharky Swim art (literal requires for Metro).
 *
 * Characters, hazards and pickups are Alex's originals or gate-passed GPT
 * Image 2.5 pipeline art from /Users/dustinsparage/apps/tps-mg/art (see
 * art/shared/manifest.json and art/sharky/manifest.json). The old blue caped
 * shark-swim-1..3 frames were not Alex's shark and are no longer used.
 */

export const SHARKY_ART = {
  // Player poses (gate-passed, Alex's classic shark).
  swim: require('../../assets/games/sharky/tide/shark_swim_side.png'),
  dash: require('../../assets/games/sharky/tide/shark_dash_chomp.png'),
  dizzy: require('../../assets/games/sharky/tide/shark_dizzy.png'),
  bonked: require('../../assets/games/sharky/tide/shark_bonked.png'),
  cheer: require('../../assets/games/sharky/tide/shark_cheer.png'),
  // Hazards (gate-passed).
  puffer: require('../../assets/games/sharky/tide/pufferfish.png'),
  pufferPuffed: require('../../assets/games/sharky/tide/pufferfish_puffed.png'),
  jelly: require('../../assets/games/sharky/tide/jellyfish.png'),
  boat: require('../../assets/games/sharky/tide/bumper_boat.png'),
  // Coaster pylon and Tide Gate props (gate-passed, pipeline 2026-09-30).
  pylonSegment: require('../../assets/games/sharky/tide/pylon_segment.png'),
  pylonCap: require('../../assets/games/sharky/tide/pylon_cap.png'),
  gatePole: require('../../assets/games/sharky/tide/gate_pole.png'),
  // Pickups (Alex originals: coin slice87, gift slice41, token rims slice88-90).
  coin: require('../../assets/games/sharky/tide/coin.png'),
  prizeBox: require('../../assets/games/sharky/tide/prize_box.png'),
  tokenGold: require('../../assets/games/sharky/tide/token_gold.png'),
  tokenOrange: require('../../assets/games/sharky/tide/token_orange.png'),
  tokenBlue: require('../../assets/games/sharky/tide/token_blue.png'),
  ring: require('../../assets/games/sharky/tide/ring.png'),
  bubble: require('../../assets/games/sharky/tide/fx_small_bubble.png'),
  // Backgrounds: lagoon sky band (pilot bg_lagoon, needs Dustin's OK), reef strips.
  sky: require('../../assets/games/sharky/tide/sky_lagoon.jpg'),
  reefMid: require('../../assets/games/sharky/ocean-layer-mid.png'),
  reefNear: require('../../assets/games/sharky/ocean-layer-front.png'),
  font: require('../../../assets/fonts/knockout.otf'),
};
