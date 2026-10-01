/**
 * Trivia Duel rev 7 audio candidates (design 13.3): every pitched cue baked at
 * major pentatonic offsets 0/+2/+4/+7/+9 (+12 top step for sparks) over the
 * loop root, E for duel_loop and F for duel_loop_final; Fin's babble pitched
 * by rank in key; E and F major tile notes; crowd riser cut to 1/2/4 beats.
 * Derived offline from Chris's sounds and the existing studio one-shots (0
 * ElevenLabs credits). Not approved by ear yet, so this module is required
 * only in __DEV__; release builds play the Chris fallbacks (audio.ts).
 */
import type { BedDef, CueDef } from '../../gamekit/audio/chrisBank';

export const DEV_CUES: Record<string, CueDef> = {
  tv_correct_e: { ladder: [require('../../assets/games/sfx/trivia/e_tv_correct_0.m4a'), require('../../assets/games/sfx/trivia/e_tv_correct_1.m4a'), require('../../assets/games/sfx/trivia/e_tv_correct_2.m4a'), require('../../assets/games/sfx/trivia/e_tv_correct_3.m4a'), require('../../assets/games/sfx/trivia/e_tv_correct_4.m4a')], priority: 2, durationMs: 692 },
  spark_tick_e: { ladder: [require('../../assets/games/sfx/trivia/e_spark_tick_0.m4a'), require('../../assets/games/sfx/trivia/e_spark_tick_1.m4a'), require('../../assets/games/sfx/trivia/e_spark_tick_2.m4a'), require('../../assets/games/sfx/trivia/e_spark_tick_3.m4a'), require('../../assets/games/sfx/trivia/e_spark_tick_4.m4a'), require('../../assets/games/sfx/trivia/e_spark_tick_5.m4a')], maxVoices: 3, group: 'ticks', durationMs: 311 },
  coin_tick_e: { ladder: [require('../../assets/games/sfx/trivia/e_coin_tick_0.m4a'), require('../../assets/games/sfx/trivia/e_coin_tick_1.m4a'), require('../../assets/games/sfx/trivia/e_coin_tick_2.m4a')], maxVoices: 3, group: 'ticks', durationMs: 311 },
  streak_step_e: { ladder: [require('../../assets/games/sfx/trivia/e_streak_step_0.m4a'), require('../../assets/games/sfx/trivia/e_streak_step_1.m4a'), require('../../assets/games/sfx/trivia/e_streak_step_2.m4a'), require('../../assets/games/sfx/trivia/e_streak_step_3.m4a'), require('../../assets/games/sfx/trivia/e_streak_step_4.m4a')], durationMs: 600 },
  tv_correct_f: { ladder: [require('../../assets/games/sfx/trivia/f_tv_correct_0.m4a'), require('../../assets/games/sfx/trivia/f_tv_correct_1.m4a'), require('../../assets/games/sfx/trivia/f_tv_correct_2.m4a'), require('../../assets/games/sfx/trivia/f_tv_correct_3.m4a'), require('../../assets/games/sfx/trivia/f_tv_correct_4.m4a')], priority: 2, durationMs: 692 },
  spark_tick_f: { ladder: [require('../../assets/games/sfx/trivia/f_spark_tick_0.m4a'), require('../../assets/games/sfx/trivia/f_spark_tick_1.m4a'), require('../../assets/games/sfx/trivia/f_spark_tick_2.m4a'), require('../../assets/games/sfx/trivia/f_spark_tick_3.m4a'), require('../../assets/games/sfx/trivia/f_spark_tick_4.m4a'), require('../../assets/games/sfx/trivia/f_spark_tick_5.m4a')], maxVoices: 3, group: 'ticks', durationMs: 311 },
  coin_tick_f: { ladder: [require('../../assets/games/sfx/trivia/f_coin_tick_0.m4a'), require('../../assets/games/sfx/trivia/f_coin_tick_1.m4a'), require('../../assets/games/sfx/trivia/f_coin_tick_2.m4a')], maxVoices: 3, group: 'ticks', durationMs: 311 },
  streak_step_f: { ladder: [require('../../assets/games/sfx/trivia/f_streak_step_0.m4a'), require('../../assets/games/sfx/trivia/f_streak_step_1.m4a'), require('../../assets/games/sfx/trivia/f_streak_step_2.m4a'), require('../../assets/games/sfx/trivia/f_streak_step_3.m4a'), require('../../assets/games/sfx/trivia/f_streak_step_4.m4a')], durationMs: 600 },
  tile_e: { ladder: [require('../../assets/games/sfx/trivia/tv_tile_E4.m4a'), require('../../assets/games/sfx/trivia/tv_tile_Gs4.m4a'), require('../../assets/games/sfx/trivia/tv_tile_B4.m4a'), require('../../assets/games/sfx/trivia/tv_tile_E5.m4a')], durationMs: 480 },
  tile_f: { ladder: [require('../../assets/games/sfx/trivia/tv_tile_F4.m4a'), require('../../assets/games/sfx/trivia/tv_tile_A4.m4a'), require('../../assets/games/sfx/trivia/tv_tile_C5.m4a'), require('../../assets/games/sfx/trivia/tv_tile_F5.m4a')], durationMs: 480 },
  babble_deckhand: { ladder: [require('../../assets/games/sfx/trivia/fin_babble_1_deckhand.m4a'), require('../../assets/games/sfx/trivia/fin_babble_2_deckhand.m4a'), require('../../assets/games/sfx/trivia/fin_babble_3_deckhand.m4a'), require('../../assets/games/sfx/trivia/fin_babble_4_deckhand.m4a'), require('../../assets/games/sfx/trivia/fin_babble_5_deckhand.m4a'), require('../../assets/games/sfx/trivia/fin_babble_6_deckhand.m4a'), require('../../assets/games/sfx/trivia/fin_babble_7_deckhand.m4a'), require('../../assets/games/sfx/trivia/fin_babble_8_deckhand.m4a')], maxVoices: 1, group: 'babble', priority: 0, durationMs: 140 },
  babble_first_mate: { ladder: [require('../../assets/games/sfx/trivia/fin_babble_1_first_mate.m4a'), require('../../assets/games/sfx/trivia/fin_babble_2_first_mate.m4a'), require('../../assets/games/sfx/trivia/fin_babble_3_first_mate.m4a'), require('../../assets/games/sfx/trivia/fin_babble_4_first_mate.m4a'), require('../../assets/games/sfx/trivia/fin_babble_5_first_mate.m4a'), require('../../assets/games/sfx/trivia/fin_babble_6_first_mate.m4a'), require('../../assets/games/sfx/trivia/fin_babble_7_first_mate.m4a'), require('../../assets/games/sfx/trivia/fin_babble_8_first_mate.m4a')], maxVoices: 1, group: 'babble', priority: 0, durationMs: 140 },
  babble_captain: { ladder: [require('../../assets/games/sfx/trivia/fin_babble_1_captain.m4a'), require('../../assets/games/sfx/trivia/fin_babble_2_captain.m4a'), require('../../assets/games/sfx/trivia/fin_babble_3_captain.m4a'), require('../../assets/games/sfx/trivia/fin_babble_4_captain.m4a'), require('../../assets/games/sfx/trivia/fin_babble_5_captain.m4a'), require('../../assets/games/sfx/trivia/fin_babble_6_captain.m4a'), require('../../assets/games/sfx/trivia/fin_babble_7_captain.m4a'), require('../../assets/games/sfx/trivia/fin_babble_8_captain.m4a')], maxVoices: 1, group: 'babble', priority: 0, durationMs: 140 },
  babble_admiral: { ladder: [require('../../assets/games/sfx/trivia/fin_babble_1_admiral.m4a'), require('../../assets/games/sfx/trivia/fin_babble_2_admiral.m4a'), require('../../assets/games/sfx/trivia/fin_babble_3_admiral.m4a'), require('../../assets/games/sfx/trivia/fin_babble_4_admiral.m4a'), require('../../assets/games/sfx/trivia/fin_babble_5_admiral.m4a'), require('../../assets/games/sfx/trivia/fin_babble_6_admiral.m4a'), require('../../assets/games/sfx/trivia/fin_babble_7_admiral.m4a'), require('../../assets/games/sfx/trivia/fin_babble_8_admiral.m4a')], maxVoices: 1, group: 'babble', priority: 0, durationMs: 140 },
  crowd_ooh_441: { src: require('../../assets/games/sfx/trivia/tv_crowd_ooh_riser_441ms.m4a'), maxVoices: 1, group: 'crowd', durationMs: 441 },
  crowd_ooh_833: { src: require('../../assets/games/sfx/trivia/tv_crowd_ooh_riser_833ms.m4a'), maxVoices: 1, group: 'crowd', durationMs: 833 },
  crowd_ooh_1764: { src: require('../../assets/games/sfx/trivia/tv_crowd_ooh_riser_1764ms.m4a'), maxVoices: 1, group: 'crowd', durationMs: 1764 },
  crowd_gasp: { src: require('../../assets/games/sfx/trivia/tv_crowd_gasp.m4a'), maxVoices: 1, group: 'crowd', durationMs: 600 },
};

export const DEV_BEDS: Record<string, BedDef> = {
  duel_loop_rev7: {
    src: require('../../assets/games/audio/trivia/music/duel_loop.m4a'),
    lowpassSrc: require('../../assets/games/music/trivia/duel_loop_lp.m4a'),
    bpm: 135.999, beatsPerBar: 4, offsetMs: 0, loopEndMs: 31748,
  },
  duel_loop_final: {
    src: require('../../assets/games/music/trivia/duel_loop_final.m4a'),
    lowpassSrc: require('../../assets/games/music/trivia/duel_loop_final_lp.m4a'),
    bpm: 144.08, beatsPerBar: 4, offsetMs: 0, loopEndMs: 29966,
  },
};
