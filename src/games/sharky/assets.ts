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
  // Gate set pieces (gate-passed sk_tide_gate / sk_ride_gate: different art per design 4.3).
  tideGate: require('../../assets/games/sharky/tide/tide_gate.png'),
  rideGate: require('../../assets/games/sharky/tide/ride_gate.png'),
  // Pickups (Alex originals: coin slice87, gift slice41, token rims slice88-90).
  coin: require('../../assets/games/sharky/tide/coin.png'),
  prizeBox: require('../../assets/games/sharky/tide/prize_box.png'),
  tokenGold: require('../../assets/games/sharky/tide/token_gold.png'),
  tokenOrange: require('../../assets/games/sharky/tide/token_orange.png'),
  tokenBlue: require('../../assets/games/sharky/tide/token_blue.png'),
  ring: require('../../assets/games/sharky/tide/ring.png'),
  bubble: require('../../assets/games/sharky/tide/fx_small_bubble.png'),
  // Backgrounds: lagoon sky band (pilot bg_lagoon, needs Dustin's OK), reef strips.
  // Theme-park skyline sky band (gate-passed sk_sky_band, background pilot: needs Dustin's OK).
  sky: require('../../assets/games/sharky/tide/sky_band.png'),
  // Far layer: sunken carnival reef with bunting and a toppled ticket booth (sk_mid_layer).
  farReef: require('../../assets/games/sharky/tide/far_reef.png'),
  // Near strip: kelp and rocks, floor band only (sk_near_layer).
  nearKelp: require('../../assets/games/sharky/tide/near_kelp.png'),
  reefMid: require('../../assets/games/sharky/ocean-layer-mid.png'),
  reefNear: require('../../assets/games/sharky/ocean-layer-front.png'),
  font: require('../../../assets/fonts/knockout.otf'),
  /** The app's display font for numbers and dynamic text (design 7.2). */
  displayFont: require('../../../assets/fonts/shark-random-funnyness-2.ttf'),
  // v7.1 Feel Slice (gate-passed, Codex route, 0 credits; studio/art manifest):
  finBadge: require('../../assets/games/sharky/tide/v71/fin_badge.png'),
  postcard: require('../../assets/games/sharky/tide/v71/postcard_frame.png'),
  sparkleBurst0: require('../../assets/games/sharky/tide/v71/sparkle_burst_f0.png'),
  sparkleBurst1: require('../../assets/games/sharky/tide/v71/sparkle_burst_f1.png'),
  sparkleBurst2: require('../../assets/games/sharky/tide/v71/sparkle_burst_f2.png'),
  streak0: require('../../assets/games/sharky/tide/v71/bubble_streak_f0.png'),
  streak1: require('../../assets/games/sharky/tide/v71/bubble_streak_f1.png'),
  podium: require('../../assets/games/sharky/tide/v71/podium.png'),
  fullClear: require('../../assets/games/sharky/tide/v71/full_clear_badge.png'),
  fanCheer: require('../../assets/games/sharky/tide/v71/fan_fish_cheer.png'),
  fanCalm: require('../../assets/games/sharky/tide/v71/fan_fish_calm.png'),
  rushBunting: require('../../assets/games/sharky/tide/v71/gate_rush_bunting.png'),
  dizzyStar: require('../../assets/games/sharky/tide/v71/dizzy_star.png'),
  sparkle: require('../../assets/games/sharky/tide/v71/sparkle.png'),
};

/** Drawn word stamps (v7.1-2), by render/pres.ts stamp id. */
export const SHARKY_STAMPS = [
  null,
  require('../../assets/games/sharky/tide/v71/stamp_close.png'),
  require('../../assets/games/sharky/tide/v71/stamp_perfect.png'),
  require('../../assets/games/sharky/tide/v71/stamp_chomp.png'),
  require('../../assets/games/sharky/tide/v71/stamp_overdrive.png'),
  require('../../assets/games/sharky/tide/v71/stamp_frenzy.png'),
  require('../../assets/games/sharky/tide/v71/stamp_sprint2.png'),
  require('../../assets/games/sharky/tide/v71/stamp_sprint3.png'),
  require('../../assets/games/sharky/tide/v71/stamp_final_stretch.png'),
  require('../../assets/games/sharky/tide/v71/stamp_time.png'),
  require('../../assets/games/sharky/tide/v71/stamp_wipeout.png'),
  require('../../assets/games/sharky/tide/v71/stamp_gift.png'),
];

/** Placement stamps 1ST to 4TH (Rally results). */
export const SHARKY_PLACE_STAMPS = [
  require('../../assets/games/sharky/tide/v71/stamp_1st.png'),
  require('../../assets/games/sharky/tide/v71/stamp_2nd.png'),
  require('../../assets/games/sharky/tide/v71/stamp_3rd.png'),
  require('../../assets/games/sharky/tide/v71/stamp_4th.png'),
];
