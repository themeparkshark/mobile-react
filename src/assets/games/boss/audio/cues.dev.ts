/**
 * Boss Brawl v7 audio candidates (dev only until Dustin approves by ear):
 * Kraken lane tells re-pitched into the loop's G minor (G4 / Bb4 / D5 x L / C / R)
 * and the POP ladder on G minor pentatonic degrees. Required only under __DEV__;
 * release builds play the Chris fallback (bossAudio.ts).
 */
/* eslint-disable @typescript-eslint/no-var-requires */
export const BOSS_V7_DEV_CUES = {
  tell_kraken_gm: { ladder: [require('./tell_kraken_G4_L.wav'), require('./tell_kraken_G4_C.wav'), require('./tell_kraken_G4_R.wav'), require('./tell_kraken_Bb4_L.wav'), require('./tell_kraken_Bb4_C.wav'), require('./tell_kraken_Bb4_R.wav'), require('./tell_kraken_D5_L.wav'), require('./tell_kraken_D5_C.wav'), require('./tell_kraken_D5_R.wav'), ], bus: 'tell', approved: false, fallback: 'ui.select' },
  bo_hit_deg: { ladder: [require('./bo_hit_deg_00.wav'), require('./bo_hit_deg_01.wav'), require('./bo_hit_deg_02.wav'), require('./bo_hit_deg_03.wav'), require('./bo_hit_deg_04.wav'), require('./bo_hit_deg_05.wav'), require('./bo_hit_deg_06.wav'), require('./bo_hit_deg_07.wav'), ], bus: 'sfx', approved: false, fallback: 'fx.hit', maxVoices: 3 },
};
