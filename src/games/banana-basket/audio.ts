/**
 * Banana Basket audio: the cue map and the event -> sound + haptic grammar.
 *
 * Sonic identity is Chris's library (coin + reward only on a Ride win) plus
 * the studio's mastered ElevenLabs one-shots in G major (the key of the
 * track-1 loop edits). Every studio cue is a candidate until Dustin approves
 * it by ear; release builds fall back to Chris's closest sound.
 *
 * Ladder (8.3, rev 8): one octave of G major in 4 timbres, max 2 layers per
 * note: x1 glock; x2 glock + chime; x3 chime + bell; x4 bell + stab. At x3+
 * an on-beat catch swaps its top layer for the bright bb_ladp note. PERFECT
 * adds the sparkle. The ladder loops the 8 degrees, resets on a chain break
 * and resolves to the tonic at each tier-up and at the finale.
 */

import { GameAudio } from '../../gamekit/audio/GameAudio';
import { registerStudioAudio } from '../../gamekit/audio/studioLibrary';
import type { CueDef } from '../../gamekit/audio/chrisBank';

const A = {
  ladp: [
    require('./assets/audio/bb_ladp_00.wav'), require('./assets/audio/bb_ladp_01.wav'), require('./assets/audio/bb_ladp_02.wav'),
    require('./assets/audio/bb_ladp_03.wav'), require('./assets/audio/bb_ladp_04.wav'), require('./assets/audio/bb_ladp_05.wav'),
    require('./assets/audio/bb_ladp_06.wav'), require('./assets/audio/bb_ladp_07.wav'), require('./assets/audio/bb_ladp_08.wav'),
    require('./assets/audio/bb_ladp_09.wav'), require('./assets/audio/bb_ladp_10.wav'), require('./assets/audio/bb_ladp_11.wav'),
    require('./assets/audio/bb_ladp_12.wav'), require('./assets/audio/bb_ladp_13.wav'), require('./assets/audio/bb_ladp_14.wav'),
    require('./assets/audio/bb_ladp_15.wav'),
  ],
  chime: require('./assets/audio/bb_chime.wav'),
  clack: require('./assets/audio/bb_clack.wav'),
  rim: [require('./assets/audio/bb_rimtick_1.wav'), require('./assets/audio/bb_rimtick_2.wav'), require('./assets/audio/bb_rimtick_3.wav')],
  meter: [require('./assets/audio/bb_meter_1.wav'), require('./assets/audio/bb_meter_2.wav'), require('./assets/audio/bb_meter_3.wav')],
  creak: require('./assets/audio/bb_creak.wav'),
  // Rev 8 ladder (8.3): one octave of G major in 4 pre-rendered timbres.
  glock: [
    require('./assets/audio/bb_glock_00.wav'), require('./assets/audio/bb_glock_01.wav'), require('./assets/audio/bb_glock_02.wav'), require('./assets/audio/bb_glock_03.wav'),
    require('./assets/audio/bb_glock_04.wav'), require('./assets/audio/bb_glock_05.wav'), require('./assets/audio/bb_glock_06.wav'), require('./assets/audio/bb_glock_07.wav'),
  ],
  chimeL: [
    require('./assets/audio/bb_chime_00.wav'), require('./assets/audio/bb_chime_01.wav'), require('./assets/audio/bb_chime_02.wav'), require('./assets/audio/bb_chime_03.wav'),
    require('./assets/audio/bb_chime_04.wav'), require('./assets/audio/bb_chime_05.wav'), require('./assets/audio/bb_chime_06.wav'), require('./assets/audio/bb_chime_07.wav'),
  ],
  bellL: [
    require('./assets/audio/bb_bell_00.wav'), require('./assets/audio/bb_bell_01.wav'), require('./assets/audio/bb_bell_02.wav'), require('./assets/audio/bb_bell_03.wav'),
    require('./assets/audio/bb_bell_04.wav'), require('./assets/audio/bb_bell_05.wav'), require('./assets/audio/bb_bell_06.wav'), require('./assets/audio/bb_bell_07.wav'),
  ],
  stabL: [
    require('./assets/audio/bb_stab_00.wav'), require('./assets/audio/bb_stab_01.wav'), require('./assets/audio/bb_stab_02.wav'), require('./assets/audio/bb_stab_03.wav'),
    require('./assets/audio/bb_stab_04.wav'), require('./assets/audio/bb_stab_05.wav'), require('./assets/audio/bb_stab_06.wav'), require('./assets/audio/bb_stab_07.wav'),
  ],
};

/** Banana-local candidates (not in the synced studio library yet). */
export const BANANA_LOCAL_CUES: Record<string, CueDef> = {
  bb_ladp: { ladder: A.ladp, bus: 'sfx', maxVoices: 4, priority: 2, approved: false, fallback: 'fx.reveal', note: 'PERFECT bell ladder, G major, octave up' },
  bb_chime: { src: A.chime, bus: 'sfx', gainDb: -3, maxVoices: 2, approved: false, fallback: 'fx.reveal' },
  bb_clack: { src: A.clack, bus: 'sfx', maxVoices: 2, approved: false, fallback: 'fx.hit' },
  bb_rimtick: { ladder: A.rim, bus: 'sfx', gainDb: -4, maxVoices: 2, approved: false, fallback: 'ui.select' },
  bb_meter: { ladder: A.meter, bus: 'sfx', maxVoices: 2, priority: 2, approved: false, fallback: 'fx.coin' },
  bb_lad_glock: { ladder: A.glock, bus: 'sfx', maxVoices: 2, priority: 2, approved: false, fallback: 'fx.reveal', note: 'x1 timbre (8.3)' },
  bb_lad_chime: { ladder: A.chimeL, bus: 'sfx', maxVoices: 2, priority: 2, approved: false, fallback: 'fx.reveal', note: 'x2 timbre' },
  bb_lad_bell: { ladder: A.bellL, bus: 'sfx', maxVoices: 2, priority: 2, approved: false, fallback: 'fx.reveal', note: 'x3 timbre' },
  bb_lad_stab: { ladder: A.stabL, bus: 'sfx', maxVoices: 2, priority: 2, approved: false, fallback: 'fx.reveal', note: 'x4 timbre' },
  bb_creak_alt: { src: A.creak, bus: 'tell', maxVoices: 2, approved: false, fallback: 'ui.select', note: 'ElevenLabs creak failed the gate; kept for the ear check' },
};

let registered = false;

export function registerBananaAudio(): void {
  if (registered) return;
  registered = true;
  registerStudioAudio(['banana', 'trivia']);
  GameAudio.registerCues(BANANA_LOCAL_CUES);
}

function pick(...names: string[]): string {
  for (const n of names) if (GameAudio.hasCue(n)) return n;
  return names[names.length - 1];
}

/** Resolved cue names (studio cue if registered, else the Chris fallback). */
export function bananaCues() {
  return {
    plop: pick('bb_plop', 'fx.hit'),
    note: pick('bb_note', 'fx.reveal'),
    glock: pick('bb_lad_glock', 'bb_note', 'fx.reveal'),
    chimeL: pick('bb_lad_chime', 'bb_chime', 'fx.reveal'),
    bellL: pick('bb_lad_bell', 'bb_ladp', 'fx.reveal'),
    stabL: pick('bb_lad_stab', 'bb_stab', 'fx.reveal'),
    tick5: pick('chris_pip', 'sh_pip', 'ui.select'),
    tamb: pick('bb_tamb', 'ui.select'),
    riser: pick('bb_gh_riser', 'sh_fever_start', 'fx.reveal'),
    ding: pick('sh_ding', 'fx.reveal'),
    pluck: pick('sh_pluck', 'ui.select'),
    impact: pick('sh_impact', 'fx.hit'),
    whoosh: pick('sh_slide_up', 'fx.whoosh'),
    bell: pick('bb_ladp', 'fx.reveal'),
    bright: pick('bb_ladp', 'fx.reveal'),
    chime: pick('bb_chime', 'fx.reveal'),
    sparkle: pick('sh_sparkle', 'fx.reveal'),
    bunch: pick('bb_bunch', 'fx.hit'),
    meter: pick('bb_meter', 'fx.coin'),
    tierUp: pick('sh_tier_up', 'fx.reveal'),
    splat: pick('bb_splat', 'fx.nopeShort'),
    clack: pick('bb_clack', 'fx.hit'),
    rimTick: pick('bb_rimtick', 'ui.select'),
    boing: pick('bb_boing', 'fx.hit'),
    pop: pick('sh_bubble_pop', 'fx.hit'),
    deflate: pick('bb_deflate', 'fx.nopeShort'),
    creak: pick('sh_puff_inflate', 'bb_creak_alt', 'ui.select'),
    bonk: pick('tv_head_bonk', 'sh_impact', 'fx.hit'),
    heart: pick('bb_heart', 'fx.nopeShort'),
    power: pick('sh_powerup', 'fx.reveal'),
    rushBell: pick('sh_ding', 'fx.reveal'),
    whistle: pick('sh_whistle', 'ui.confirm'),
    tally: pick('sh_tally', 'fx.coin'),
    roll: pick('bb_roll', 'sh_drumroll', 'ui.select'),
    wah: pick('sh_combo_break', 'fx.nopeShort'),
    splashTell: pick('bb_gurgle', 'ui.select'),
    splash: pick('sh_splash_l', 'fx.whoosh'),
    close: pick('bb_close_call', 'fx.whoosh'),
    resume: pick('resume_tick', 'sh_unfreeze', 'fx.whoosh'),
    tick: pick('ui.select'),
    feverStart: pick('sh_fever_start', 'fx.reveal'),
    feverEnd: pick('sh_fever_end', 'fx.whoosh'),
    finale: pick('bb_finale_tail', 'fx.reveal'),
    stamp: pick('sh_stamp', 'ui.confirm'),
    stab: pick('bb_stab', 'fx.reveal'),
    combo: pick('bb_combo', 'ui.confirm'),
    squawk: pick('sh_seagull', 'ui.select'),
    flap: pick('bb_flap', 'fx.whoosh'),
    slam: pick('bb_slam', 'sh_star_slam', 'fx.hit'),
    coinReward: 'fx.coin',
    reward: 'fx.reward',
  };
}

export type BananaCues = ReturnType<typeof bananaCues>;

export const MUSIC = {
  calm: 'bb_loop_calm',
  rush: 'bb_loop_rush',
  fever: 'bb_loop_fever',
  fallback: 'chris.track1',
};

export function bananaBed(kind: 'calm' | 'rush' | 'fever'): string {
  const id = MUSIC[kind];
  if (GameAudio.bed(id)) return id;
  if (GameAudio.bed(MUSIC.calm)) return MUSIC.calm;
  return MUSIC.fallback;
}

export { ladderLayers, ladderNext, ladderNote, ladderReset, type Ladder } from './ladder';
