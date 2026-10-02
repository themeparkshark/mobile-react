/**
 * chrisBank.ts: Chris's original TPS sounds and music, wired as engine cues.
 *
 * Chris's sounds are the sonic identity: every game reuses these first, and
 * nothing replaces one without Dustin's OK. Originals stay untouched; the
 * engine only trims (start/end) and attenuates to a common loudness.
 *
 * Loudness was measured with ffmpeg ebur128 (integrated LUFS, true peak).
 * gainDb attenuates the loud files toward about -18 LUFS so a coin and a
 * reward sit together (expo-av cannot boost above unity, so quiet files like
 * coin.mp3 at -25.4 LUFS stay at 0 dB and louder ones come down to meet them).
 *
 *   file                       LUFS    peak   dur    gainDb
 *   reward.mp3                -13.8   -2.3   1.97s   -4
 *   nope.mp3                  -14.2   -2.3   1.53s   -4
 *   wrapper_button_press.mp3  -12.8   -0.5   0.50s   -5
 *   reveal.mp3                -19.5   -0.3   1.10s   -1
 *   redeem_modal_open.mp3     -17.8   -5.5   2.76s   -1
 *   in_redeem_zone.mp3        -19.6   -7.8   1.55s    0
 *   purchase_item_success.mp3 -22.2   -7.0   2.11s    0
 *   coin.mp3                  -25.4   -6.9   5.50s    0 (trimmed to 0.7s for hits)
 *   whoosh.mp3                -29.4  -16.8   0.66s    0
 *   tap.mp3                   short  -6.0   0.20s   -1
 *   pin_swap_select_pin.mp3   short  -3.9   0.16s   -2
 *   button_press.mp3          short   0.0   0.09s   -6
 *   inventory_item_tap.mp3    short -14.9   0.37s    0
 *   success.mp3               BROKEN (111-byte S3 error page): never used.
 */

import type { Bus } from '../core/audioMix';

export interface CueDef {
  /** Metro asset id (require). */
  src?: number;
  /** Alternatives picked without immediate repeats (3-variant cues). */
  variants?: number[];
  /** Pre-rendered pitch ladder files (combo climbs, coin ticks). */
  ladder?: number[];
  gainDb?: number;
  bus?: Bus;
  /** Overlapping voices of this cue (default 3). */
  maxVoices?: number;
  /** Merge repeats inside this window (default 0). */
  cooldownMs?: number;
  /** Voice group shared with other cues (caps set with GameAudio.setGroupCaps). */
  group?: string;
  /** 0 ambient, 1 normal, 2 impact, 3 critical (default 1). */
  priority?: number;
  /** Random pitch variance in semitones (+/-). Runtime rate change. */
  pitchJitter?: number;
  /** Duck the music while this plays. */
  duck?: { db: number; attackMs?: number; holdMs?: number; releaseMs?: number };
  /** Play a slice of a longer file. */
  startMs?: number;
  endMs?: number;
  /** Known length (ms) for voice accounting. */
  durationMs?: number;
  /** Studio library cues need Dustin's ear approval before shipping. */
  approved?: boolean;
  /** Cue to play instead when this one is unapproved in a release build. */
  fallback?: string;
  /** Human note (source, prompt, reuse reason). */
  note?: string;
}

export interface BedDef {
  src: number;
  /** Pre-rendered low-pass variant for backends without a filter node. */
  lowpassSrc?: number;
  bpm?: number;
  beatsPerBar?: number;
  /** Track ms of the first downbeat. */
  offsetMs?: number;
  loopStartMs?: number;
  loopEndMs?: number;
  /** Measured beat onsets (ms, file time) for live-feel edits; see core/beatMap. */
  beats?: number[];
  /** Index into `beats` of the first downbeat. */
  downbeat?: number;
  gainDb?: number;
  approved?: boolean;
  note?: string;
}

const S = {
  tap: require('../../../assets/sounds/tap.mp3'),
  button: require('../../../assets/sounds/button_press.mp3'),
  wrapper: require('../../../assets/sounds/wrapper_button_press.mp3'),
  explore: require('../../../assets/sounds/explore_button_press.mp3'),
  coin: require('../../../assets/sounds/coin.mp3'),
  reveal: require('../../../assets/sounds/reveal.mp3'),
  reward: require('../../../assets/sounds/reward.mp3'),
  nope: require('../../../assets/sounds/nope.mp3'),
  whoosh: require('../../../assets/sounds/whoosh.mp3'),
  itemTap: require('../../../assets/sounds/inventory_item_tap.mp3'),
  itemTypeTap: require('../../../assets/sounds/inventory_item_type_tap.mp3'),
  inZone: require('../../../assets/sounds/in_redeem_zone.mp3'),
  modalOpen: require('../../../assets/sounds/modal_open.mp3'),
  modalClose: require('../../../assets/sounds/modal_close.mp3'),
  select: require('../../../assets/sounds/pin_swap_select_pin.mp3'),
  confirm: require('../../../assets/sounds/pin_swap_confirm.mp3'),
  complete: require('../../../assets/sounds/pin_swap_complete.mp3'),
  purchase: require('../../../assets/sounds/purchase_item_success.mp3'),
  purchasePrompt: require('../../../assets/sounds/purchase_item_prompt.mp3'),
  purchaseCancel: require('../../../assets/sounds/purchase_item_cancel.mp3'),
  redeemOpen: require('../../../assets/sounds/redeem_modal_open.mp3'),
  redeemClose: require('../../../assets/sounds/redeem_modal_close.mp3'),
  jingle: require('../../../assets/sounds/redeem_modal_jingle.mp3'),
  firework: require('../../../assets/sounds/firework_pop.mp3'),
  /** Offline edit of whoosh.mp3: reversed, 590 ms, -20 LUFS (riser / Fever swell). */
  whooshRev: require('../../../assets/sounds/edits/whoosh_rev_630.wav'),
};

/** Chris's one-shots, by semantic name. */
export const CHRIS_CUES = {
  'ui.tap': { src: S.tap, gainDb: -1, bus: 'ui', maxVoices: 4, cooldownMs: 30, durationMs: 200 },
  'ui.button': { src: S.button, gainDb: -6, bus: 'ui', maxVoices: 3, cooldownMs: 30, durationMs: 90 },
  'ui.press': { src: S.wrapper, gainDb: -5, bus: 'ui', maxVoices: 2, durationMs: 500 },
  'ui.explore': { src: S.explore, bus: 'ui', maxVoices: 1, durationMs: 1355 },
  'ui.select': { src: S.select, gainDb: -2, bus: 'ui', maxVoices: 3, cooldownMs: 40, durationMs: 163, note: 'READY pips, countdown ticks, resume 3-2-1' },
  'ui.confirm': { src: S.confirm, bus: 'ui', maxVoices: 3, durationMs: 411, note: 'node lock (boss), rail confirm' },
  'ui.complete': { src: S.complete, bus: 'ui', maxVoices: 1, durationMs: 1976 },
  'ui.modalOpen': { src: S.modalOpen, bus: 'ui', maxVoices: 1, durationMs: 1411 },
  'ui.modalClose': { src: S.modalClose, bus: 'ui', maxVoices: 1, durationMs: 642 },
  'fx.whoosh': { src: S.whoosh, bus: 'sfx', maxVoices: 3, cooldownMs: 40, durationMs: 657, pitchJitter: 0.5 },
  'fx.coin': { src: S.coin, bus: 'sfx', maxVoices: 4, cooldownMs: 35, startMs: 0, endMs: 700, durationMs: 700, pitchJitter: 0.3, priority: 2, note: 'coin.mp3 0-700ms: golden layer, pickups' },
  'fx.coinFull': { src: S.coin, bus: 'stinger', maxVoices: 1, durationMs: 5500 },
  'fx.reveal': { src: S.reveal, gainDb: -1, bus: 'sfx', maxVoices: 2, durationMs: 1102, priority: 2, note: 'tier-up, milestones, star stamps' },
  'fx.reward': { src: S.reward, gainDb: -4, bus: 'stinger', maxVoices: 1, durationMs: 1971, priority: 3, duck: { db: 6, attackMs: 60, holdMs: 900, releaseMs: 300 }, note: 'win / ride coin earned' },
  'fx.nope': { src: S.nope, gainDb: -4, bus: 'sfx', maxVoices: 1, cooldownMs: 150, durationMs: 1534, priority: 2 },
  'fx.nopeShort': { src: S.nope, gainDb: -10, bus: 'sfx', maxVoices: 2, cooldownMs: 80, startMs: 0, endMs: 350, durationMs: 350, priority: 2, note: 'angler / decoy layer' },
  'fx.hit': { src: S.itemTap, bus: 'sfx', maxVoices: 4, cooldownMs: 25, durationMs: 375, pitchJitter: 0.4, priority: 2 },
  'fx.itemType': { src: S.itemTypeTap, gainDb: -2, bus: 'sfx', maxVoices: 2, durationMs: 1734 },
  'fx.inZone': { src: S.inZone, bus: 'sfx', maxVoices: 1, durationMs: 1550 },
  'fx.purchase': { src: S.purchase, bus: 'stinger', maxVoices: 1, durationMs: 2110, priority: 3, duck: { db: 6, attackMs: 60, holdMs: 1200, releaseMs: 300 }, note: 'personal best' },
  'fx.purchasePrompt': { src: S.purchasePrompt, bus: 'ui', maxVoices: 1, durationMs: 1398 },
  'fx.purchaseCancel': { src: S.purchaseCancel, bus: 'ui', maxVoices: 1, durationMs: 1500 },
  'fx.redeemOpen': { src: S.redeemOpen, gainDb: -1, bus: 'stinger', maxVoices: 1, durationMs: 2756, note: 'match found, break bed' },
  'fx.redeemClose': { src: S.redeemClose, bus: 'ui', maxVoices: 1, durationMs: 171 },
  'fx.firework': { src: S.firework, gainDb: 0, bus: 'sfx', maxVoices: 2, durationMs: 1600, priority: 1, note: 'firework_pop.mp3 (-25.2 LUFS, 77% under 200 Hz): Fever bursts, BIG low end, Whack x2 clap layer' },
  'fx.coinTick': { src: S.coin, bus: 'sfx', maxVoices: 3, startMs: 0, endMs: 90, durationMs: 90, priority: 0, note: 'coin.mp3 0-90 ms slice: shaker layer, tallies' },
  'fx.whooshRev': { src: S.whooshRev, bus: 'sfx', maxVoices: 1, durationMs: 590, priority: 1, note: 'reversed whoosh.mp3, peaks at its end: Final Pair riser, Fever swell every 4 bars' },
  'fx.jingle': { src: S.jingle, bus: 'stinger', maxVoices: 1, durationMs: 8642, duck: { db: 6, attackMs: 100, holdMs: 7000, releaseMs: 500 }, note: 'unused jingle: tally bed if Dustin approves' },
} satisfies Record<string, CueDef>;

export type ChrisCueName = keyof typeof CHRIS_CUES;

/**
 * Chris's music beds. BPMs are from the studio analysis notes (the audio
 * lead's loop edits carry exact beat maps in their manifest and override
 * these when present).
 */
export const CHRIS_BEDS = {
  'chris.track1': { src: require('../../../assets/music/track-1.mp3'), bpm: 129, beatsPerBar: 4, gainDb: -3, note: 'Opening energy, G major' },
  'chris.track2': { src: require('../../../assets/music/track-2.mp3'), bpm: 135.56, beatsPerBar: 4, gainDb: -3, note: 'Waiting Room, C major' },
  'chris.track3': { src: require('../../../assets/music/track-3.mp3'), bpm: 120, beatsPerBar: 4, gainDb: -3, note: 'Shark Shop, E major (BPM approx.)' },
  'chris.login': { src: require('../../../assets/music/login.m4a'), bpm: 89, beatsPerBar: 4, gainDb: -3, note: 'least exposed bed' },
  'chris.inventory': { src: require('../../../assets/music/inventory.mp3'), bpm: 117, beatsPerBar: 4, gainDb: -3, note: 'C minor, tension beds' },
} satisfies Record<string, BedDef>;

export type ChrisBedName = keyof typeof CHRIS_BEDS;

/** Legacy gamekit SfxName -> engine cue (keeps every existing game working). */
export const LEGACY_SFX_TO_CUE: Record<string, string> = {
  tap: 'ui.tap',
  hit: 'fx.hit',
  combo: 'fx.reveal',
  fail: 'fx.nope',
  tick: 'ui.button',
  win: 'fx.reward',
  lose: 'fx.nope',
  star: 'fx.reveal',
  countdown: 'ui.select',
  go: 'fx.whoosh',
  whoosh: 'fx.whoosh',
  // WS4 finding: coin now maps to Chris's coin.mp3 (was inventory_item_tap).
  coin: 'fx.coin',
};
