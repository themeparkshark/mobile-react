/**
 * momentMap.ts: one sound vocabulary for the whole app (wow-sound lane, Oct 24 2026).
 *
 * Every moment the director spec names (the catch, reveals, combos, game
 * starts, wins, level-ups, streaks, chests, buttons, park arrival) gets:
 *   - primary: the studio cue Dustin hears first in the listening pack,
 *   - variant: the "try another" cue for the same moment,
 *   - fallback: Chris's closest sound, played whenever the studio switch is
 *     off or the cue is not approved for release yet (never silence),
 * plus its mix (bus, trim, ducking, voice cap, pitch ladder, round-robin) and
 * the haptic that lands on the same frame.
 *
 * The same kind of moment always sounds like the same family, so the ear
 * learns the game (Royal Match / Monopoly GO): gold rewards ring (ding,
 * sparkle, star slam), counts climb the 13-step coin ladder, game hits pop,
 * UI is a dry tick, and big rare moments get a full sting.
 *
 * Pure data: no requires, no React Native. Played through playMoment.ts; the
 * switch is studioSwitch.ts (off until Dustin approves by ear). The listening
 * pack (polish-2026-10-23/wow/wow-sound/listen) is rendered from this file.
 *
 * Refs: 'game/id' is a studio cue from src/assets/games/audio (shared,
 * whack, memory, trivia, ...); 'chris:<cue>' is one of Chris's cues in
 * chrisBank.ts. Ladders ('shared/coin_tick', 'whack/wh_tier', ...) take a
 * step; round-robin lists rotate so the tenth hit never sounds like the ninth.
 *
 * Levels: the studio masters sit at -16 LUFS (impacts, stings) and -19 to
 * -20 (tells, UI). The app's bus anchor is Chris's bank at about -18
 * (chrisBank.ts), and expo-av cannot boost above unity, so each class sits
 * 2 dB under the spec target while keeping its spacing: ui -20, fx -18,
 * sting -16 (spec: -18 / -16 / -14 at full scale). gainDb trims each file to
 * its class (measured with looped ebur128, never by playing it).
 */

import type { Bus } from '../core/audioMix';
import type { HapticPatternName } from '../core/hapticGrammar';
import type { AhapPatternName } from '../core/hapticPattern';

/** A studio cue ('shared/sh_ding') or a Chris cue ('chris:fx.coin'). */
export type SoundRef = string;

export type MomentGroup =
  | 'catch' | 'appear' | 'close' | 'countdown' | 'hit' | 'fever' | 'lastSeconds'
  | 'win' | 'reveal' | 'streak' | 'chest' | 'ui' | 'park';

/** Where in the four beats (gather, hold, burst, settle) the sound lands. */
export type MomentBeat = 'press' | 'anticipation' | 'hit' | 'burst' | 'settle' | 'ambient';

/** Loudness class: ui -20, fx -18, sting -16 LUFS in the app mix. */
export type MixClass = 'ui' | 'fx' | 'sting';

export const CLASS_LUFS: Record<MixClass, number> = { ui: -20, fx: -18, sting: -16 };
export const CLASS_BUS: Record<MixClass, Bus> = { ui: 'ui', fx: 'sfx', sting: 'stinger' };

/** Music dips 6 dB in 60 ms under reveals and stings and recovers over 400 ms. */
export const DUCK_REVEAL = { db: 6, attackMs: 60, holdMs: 400, releaseMs: 400 } as const;
export const DUCK_STING = { db: 6, attackMs: 60, holdMs: 1600, releaseMs: 400 } as const;

/** Most overlapping voices any one moment may hold. */
export const MAX_MOMENT_VOICES = 3;

/** Consecutive gains within this window climb the ladder one rung. */
export const LADDER_CHAIN_MS = 1200;

/** The 13-step coin ladder (shared/coin_tick_00..12). */
export const COIN_LADDER_STEPS = 13;

/** Haptic offset from the cue start (ms). Fired in the same tick, aligned to the backend latency. */
export const HAPTIC_SYNC_MAX_MS = 10;

export interface MomentLayer {
  readonly ref: SoundRef;
  readonly delayMs: number;
  /** dB relative to the moment's trim. */
  readonly db?: number;
  readonly step?: number;
}

export interface MomentDef {
  readonly group: MomentGroup;
  /** Plain words: what the player sees. */
  readonly label: string;
  readonly primary: SoundRef;
  readonly variant: SoundRef;
  /** Chris cue name (chrisBank.ts): plays when the switch is off or the cue is not approved. */
  readonly fallback: string;
  /** Extra layers on the primary (a sparkle on top of the ding). */
  readonly layers?: readonly MomentLayer[];
  /** Rungs when the primary is a pitch ladder (count, combo tier, warmer). */
  readonly ladder?: number;
  /** Ladder rung range this moment uses (default 0..ladder-1). */
  readonly ladderFrom?: number;
  /** Round-robin alternates for the primary (rotated in order). */
  readonly rr?: readonly SoundRef[];
  readonly mix: MixClass;
  /** Trim (dB, never above 0) from the file's measured loudness to its class. */
  readonly gainDb: number;
  /** Measured looped loudness of the primary file (LUFS). */
  readonly measuredLufs: number;
  /** Trim for the variant file (same class target), used when Dustin picks "try another". */
  readonly variantGainDb?: number;
  readonly duck?: typeof DUCK_REVEAL | typeof DUCK_STING;
  readonly maxVoices: number;
  readonly cooldownMs?: number;
  /** Paired haptic (core/hapticGrammar names); null = silent hand (ambient or rival). */
  readonly haptic: HapticPatternName | null;
  /** Haptic start relative to the cue start (ms). */
  readonly hapticOffsetMs: number;
  /** Shaped Core Haptics pattern (hapticPattern.ts AHAP_LIBRARY) once the native player ships. */
  readonly ahap?: AhapPatternName;
  readonly beat: MomentBeat;
  /** What the app plays at this moment today (the switch-off parity record). */
  readonly today: string;
  /** One plain sentence for the listening pack. */
  readonly why: string;
}

const m = (d: MomentDef): MomentDef => d;

export const MOMENTS = {
  // ---------------------------------------------------------------- catch
  'catch.tap': m({
    group: 'catch', label: 'Tap a coin on the map', beat: 'press',
    primary: 'shared/sh_pluck', variant: 'shared/sh_bubble_pop', fallback: 'ui.tap',
    mix: 'ui', gainDb: -0.7, measuredLufs: -19.3, variantGainDb: 0, maxVoices: 2, cooldownMs: 60,
    haptic: 'tap', hapticOffsetMs: 0, ahap: 'momentCatchGather',
    today: 'RedeemRedeemableModal.tsx:248 redeem_modal_open.mp3 as the catch sheet opens (SoundEffectProvider)',
    why: 'A soft pluck says the coin heard you without stealing the big moment.',
  }),
  'catch.wobble': m({
    group: 'catch', label: 'The coin wobbles three times', beat: 'anticipation',
    primary: 'shared/coin_tick', variant: 'shared/ui_tick', fallback: 'ui.select',
    // Rungs 0..9: a quick run starts each catch's three ticks one rung higher (catchHeat, up to 7).
    ladder: 10, mix: 'ui', gainDb: -0.5, measuredLufs: -19.5, variantGainDb: -1.4, maxVoices: 3,
    haptic: 'tick', hapticOffsetMs: 0,
    today: 'nothing yet (the wobble is new in the wow-map lane)',
    why: 'Three rising ticks are the held breath before the burst, and they start a little higher on every quick catch in a row.',
  }),
  'catch.burst': m({
    group: 'catch', label: 'Gold burst: the coin is yours', beat: 'burst',
    primary: 'shared/sh_ding', variant: 'shared/sh_coin_shower', fallback: 'fx.coin',
    layers: [{ ref: 'shared/sh_sparkle', delayMs: 40, db: -4 }],
    mix: 'fx', gainDb: 0, measuredLufs: -18.8, variantGainDb: 0, duck: DUCK_REVEAL, maxVoices: 2,
    haptic: 'golden', hapticOffsetMs: 0, ahap: 'momentCatch',
    today: 'CoinCollectFlight.tsx:71 LAND_SOUND on landing; ride photo catchSound("chime") -> fx.coin',
    why: 'A bright bell plus a sparkle is the sound of gold, so every catch rings the same happy way.',
  }),
  'catch.count': m({
    group: 'catch', label: 'Coins tick into the counter', beat: 'settle',
    primary: 'shared/coin_tick', variant: 'shared/sh_tally', fallback: 'fx.coinTick',
    ladder: COIN_LADDER_STEPS, ladderFrom: 3, mix: 'ui', gainDb: -0.6, measuredLufs: -19.4, variantGainDb: -0.4,
    maxVoices: 3, cooldownMs: 40,
    haptic: 'tick', hapticOffsetMs: 0,
    today: 'CurrencyFlyProvider.tsx:79 purchase_item_success.mp3 (vol 0.6, rate 1.1); StampCard fx.coinTick pitch climb',
    why: 'Each coin climbs one note of the 13-step ladder, so a big haul literally sounds bigger.',
  }),
  'catch.repeat': m({
    group: 'catch', label: 'Another coin (short catch)', beat: 'burst',
    primary: 'shared/sh_sparkle', variant: 'shared/sh_pluck', fallback: 'fx.coin',
    mix: 'fx', gainDb: 0, measuredLufs: -19.6, variantGainDb: 0, maxVoices: 2,
    haptic: 'goodHit', hapticOffsetMs: 0,
    today: 'same as catch.burst today',
    why: 'Repeat catches keep the gold sparkle but skip the bell, so the hundredth catch stays quick.',
  }),
  'catch.firstOfDay': m({
    group: 'catch', label: 'First coin of the day', beat: 'burst',
    primary: 'memory/mm_golden_reveal', variant: 'shared/sh_desk_bell', fallback: 'fx.reward',
    layers: [{ ref: 'shared/sh_ding', delayMs: 0, db: -3 }, { ref: 'shared/sh_sparkle', delayMs: 90, db: -4 }],
    mix: 'fx', gainDb: -1.6, measuredLufs: -16.4, variantGainDb: -2.2, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0, ahap: 'momentCatch',
    today: 'nothing special today (same as any catch)',
    why: 'The first coin of the day gets a bigger golden chord, a small daily gift for opening the app.',
  }),
  'catch.lucky': m({
    group: 'catch', label: 'Every 10th catch: a gold beam lands on the coin', beat: 'hit',
    primary: 'shared/sh_star_slam', variant: 'shared/sh_impact', fallback: 'fx.reveal',
    layers: [{ ref: 'shared/sh_glock', delayMs: 120, db: -4 }, { ref: 'shared/sh_sparkle', delayMs: 200, db: -5 }],
    mix: 'fx', gainDb: -2.6, measuredLufs: -15.4, variantGainDb: -1.9, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0, ahap: 'momentCatch',
    today: 'HomeCatchMoment beam beat: catchSound("chime") -> fx.coin plus the heavy buzz',
    why: 'When the gold beam drops on every 10th catch it lands with a bright slam and a shimmer, so the surprise you see is the surprise you hear.',
  }),
  'catch.milestone': m({
    group: 'catch', label: 'Every 25th catch: the grand burst', beat: 'burst',
    primary: 'shared/sh_powerup', variant: 'shared/sh_tier_up', fallback: 'fx.coin',
    layers: [{ ref: 'shared/sh_ding', delayMs: 0, db: -4 }, { ref: 'shared/sh_coin_shower', delayMs: 120, db: -2 }],
    mix: 'fx', gainDb: -1.7, measuredLufs: -16.3, variantGainDb: 0, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0, ahap: 'momentCatch',
    today: 'same as catch.burst today',
    why: 'The grand burst on every 25th catch (the beam, the biggest ink, every ring and star) rings a rare powered-up shower, still as short as the bell.',
  }),
  'catch.hot': m({
    group: 'catch', label: 'A hot run: the burst rings brighter', beat: 'burst',
    primary: 'shared/sh_glock', variant: 'shared/sh_sparkle', fallback: 'fx.reveal',
    mix: 'fx', gainDb: -4, measuredLufs: -19.0, variantGainDb: -3, maxVoices: 1, cooldownMs: 300,
    haptic: null, hapticOffsetMs: 0,
    today: 'nothing (heat is new in the wow-sound lane)',
    why: 'From the fifth quick catch in a row a bright glockenspiel rides on the burst, so a hot streak sounds hot.',
  }),
  'catch.fly': m({
    group: 'catch', label: 'The coin flies home', beat: 'settle',
    primary: 'shared/sh_slide_up', variant: 'shared/sh_ride_up', fallback: 'fx.whoosh',
    mix: 'fx', gainDb: 0, measuredLufs: -20.1, variantGainDb: -2.5, maxVoices: 2,
    haptic: null, hapticOffsetMs: 0,
    today: 'HomeCatchMoment catchSound("whoosh") -> fx.whoosh',
    why: 'A rising slide follows the coin up to the counter, so your ear knows where it went.',
  }),
  'catch.land': m({
    group: 'catch', label: 'The coin lands in the badge', beat: 'settle',
    primary: 'shared/sh_stamp', variant: 'shared/sh_knock', fallback: 'ui.confirm',
    mix: 'fx', gainDb: -0.5, measuredLufs: -17.5, variantGainDb: 0, maxVoices: 1,
    haptic: 'tap', hapticOffsetMs: 0,
    today: 'HomeCatchMoment catchSound("badge") -> ride-photo badge-land.mp3',
    why: 'A soft stamp says the coin is put away safe.',
  }),

  // ---------------------------------------------------------------- appear
  'coin.appear': m({
    group: 'appear', label: 'A coin pops onto the map', beat: 'ambient',
    primary: 'shared/sh_sparkle', variant: 'shared/sh_pluck', fallback: 'fx.reveal',
    mix: 'ui', gainDb: -0.4, measuredLufs: -19.6, variantGainDb: -0.7, maxVoices: 1, cooldownMs: 1500,
    haptic: null, hapticOffsetMs: 0,
    today: 'nothing (coins appear silently)',
    why: 'A quiet twinkle calls your eye to a new coin without a buzz in your pocket.',
  }),
  'coin.goldenAppear': m({
    group: 'appear', label: 'A golden coin or pin appears', beat: 'ambient',
    primary: 'memory/mm_golden_reveal', variant: 'shared/sh_glock', fallback: 'fx.reveal',
    mix: 'fx', gainDb: -1.6, measuredLufs: -16.4, variantGainDb: 0, maxVoices: 1, cooldownMs: 3000,
    haptic: 'tick', hapticOffsetMs: 0,
    today: 'nothing (golden pins appear silently)',
    why: 'Golden things get their own shimmer so a kid knows this one is special before reading anything.',
  }),

  // ---------------------------------------------------------------- close
  'coin.inRange': m({
    group: 'close', label: 'You are close enough to catch', beat: 'anticipation',
    primary: 'shared/sh_sonar', variant: 'chris:fx.inZone', fallback: 'fx.inZone',
    mix: 'ui', gainDb: -0.8, measuredLufs: -19.2, maxVoices: 1, cooldownMs: 4000,
    haptic: 'tap', hapticOffsetMs: 0,
    today: 'RedeemModal.tsx:70 in_redeem_zone.mp3 (SoundEffectProvider)',
    why: 'A friendly sonar ping means close, the same way glow means close on screen.',
  }),
  'pin.warmer': m({
    group: 'close', label: 'Pin hunt: warmer', beat: 'anticipation',
    primary: 'trivia/spark_tick', variant: 'shared/coin_tick', fallback: 'fx.coinTick',
    ladder: 6, mix: 'ui', gainDb: -0.5, measuredLufs: -19.5, variantGainDb: -0.5, maxVoices: 2, cooldownMs: 120,
    haptic: 'tick', hapticOffsetMs: 0,
    today: 'HuntSheet.tsx:126 fx.coinTick with a rising pitch',
    why: 'Warmer climbs the scale, so you can hunt by ear.',
  }),

  // ---------------------------------------------------------------- countdown
  'game.countTick': m({
    group: 'countdown', label: '3, 2, 1', beat: 'anticipation',
    primary: 'shared/ui_tick', variant: 'line-party/lp_count', fallback: 'ui.select',
    mix: 'ui', gainDb: -1.4, measuredLufs: -18.6, variantGainDb: 0, maxVoices: 2,
    haptic: 'tick', hapticOffsetMs: 0,
    today: 'playSfx("countdown") -> ui.select (LEGACY_SFX_TO_CUE)',
    why: 'Dry, even ticks count you in without rushing.',
  }),
  'game.countLast': m({
    group: 'countdown', label: 'The last count before GO', beat: 'anticipation',
    primary: 'shared/ui_tick_high', variant: 'line-party/lp_count', fallback: 'ui.select',
    mix: 'ui', gainDb: -1.5, measuredLufs: -18.5, variantGainDb: 0, maxVoices: 2,
    haptic: 'tick', hapticOffsetMs: 0,
    today: 'playSfx("countdown") -> ui.select',
    why: 'The last tick is a little higher so your thumb is ready.',
  }),
  'game.go': m({
    group: 'countdown', label: 'GO!', beat: 'hit',
    primary: 'shared/sh_go_horn', variant: 'shared/sh_whistle', fallback: 'fx.whoosh',
    mix: 'fx', gainDb: -2.3, measuredLufs: -15.7, variantGainDb: -2.8, maxVoices: 1,
    haptic: 'goodHit', hapticOffsetMs: 0,
    today: 'playSfx("go") -> fx.whoosh',
    why: 'A cheerful party horn starts every game the same way.',
  }),

  // ---------------------------------------------------------------- hit
  'game.hit': m({
    group: 'hit', label: 'A good hit', beat: 'hit',
    primary: 'shared/sh_bubble_pop', variant: 'shared/sh_impact', fallback: 'fx.hit',
    rr: ['shared/sh_bubble_pop_rr1', 'shared/sh_bubble_pop_rr2', 'shared/sh_bubble_pop_rr3', 'shared/sh_bubble_pop_rr4'],
    mix: 'fx', gainDb: 0, measuredLufs: -21.4, variantGainDb: -2, maxVoices: 3, cooldownMs: 25,
    haptic: 'goodHit', hapticOffsetMs: 0,
    today: 'playSfx("hit") -> fx.hit',
    why: 'Four slightly different pops rotate so the tenth hit never sounds like the ninth.',
  }),
  'game.crit': m({
    group: 'hit', label: 'A perfect hit', beat: 'hit',
    primary: 'boss/bo_crit', variant: 'shared/sh_star_slam', fallback: 'fx.hit',
    rr: ['boss/bo_crit_rr1', 'boss/bo_crit_rr2', 'boss/bo_crit_rr3', 'boss/bo_crit_rr4'],
    mix: 'fx', gainDb: -1.1, measuredLufs: -16.9, variantGainDb: -2.6, maxVoices: 2, cooldownMs: 40,
    haptic: 'crit', hapticOffsetMs: 0,
    today: 'playSfx("hit") -> fx.hit',
    why: 'A perfect hit cracks harder than a good one, so skill sounds different.',
  }),
  'game.comboTier': m({
    group: 'hit', label: 'Combo gets hotter', beat: 'burst',
    primary: 'whack/wh_tier', variant: 'shared/sh_tier_up', fallback: 'fx.reveal',
    ladder: 4, mix: 'fx', gainDb: 0, measuredLufs: -18.9, variantGainDb: 0, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'tierUp', hapticOffsetMs: 0, ahap: 'momentComboTier',
    today: 'playSfx("combo") -> fx.reveal',
    why: 'Each combo tier is one step up the same riff, so hotter sounds hotter.',
  }),
  'game.nearMiss': m({
    group: 'hit', label: 'So close!', beat: 'hit',
    primary: 'sharky/sk_close_glint', variant: 'banana/bb_crowd_ooh', fallback: 'fx.whoosh',
    mix: 'fx', gainDb: 0, measuredLufs: -19.6, variantGainDb: 0, maxVoices: 1, cooldownMs: 300,
    haptic: 'lateHit', hapticOffsetMs: 0,
    today: 'nothing (or fx.whoosh in Sharky)',
    why: 'A glint for a near miss feels like a high five for trying.',
  }),
  'game.miss': m({
    group: 'hit', label: 'A miss (funny, not sad)', beat: 'hit',
    primary: 'shared/sh_boing', variant: 'whack/wh_whiff', fallback: 'fx.nopeShort',
    mix: 'fx', gainDb: -1.8, measuredLufs: -16.2, variantGainDb: 0, maxVoices: 1, cooldownMs: 150,
    haptic: 'lateHit', hapticOffsetMs: 0,
    today: 'playSfx("fail") -> fx.nope',
    why: 'A cartoon boing makes a miss funny instead of a buzzer that scolds.',
  }),
  'game.correct': m({
    group: 'hit', label: 'Right answer', beat: 'burst',
    primary: 'trivia/tv_correct', variant: 'shared/sh_ding', fallback: 'fx.reveal',
    mix: 'fx', gainDb: -2.3, measuredLufs: -15.7, variantGainDb: 0, maxVoices: 1,
    haptic: 'triviaCorrect', hapticOffsetMs: 0,
    today: 'ActivitySlot.tsx:248 success.mp3 (silent before Oct 24: the file was broken)',
    why: 'Right answers get the quiz show ding kids already know.',
  }),

  // ---------------------------------------------------------------- fever
  'game.feverStart': m({
    group: 'fever', label: 'Fever starts', beat: 'burst',
    primary: 'shared/sh_fever_start', variant: 'shared/sh_powerup', fallback: 'fx.whooshRev',
    mix: 'fx', gainDb: -2.2, measuredLufs: -15.8, variantGainDb: -1.9, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'feverStart', hapticOffsetMs: 0, ahap: 'momentFeverStart',
    today: 'game-specific (fx.whooshRev swell, fx.firework)',
    why: 'Fever whooshes up so the whole screen feels like it caught fire (the friendly kind).',
  }),
  'game.feverEnd': m({
    group: 'fever', label: 'Fever cools off', beat: 'settle',
    primary: 'shared/sh_fever_end', variant: 'shared/sh_slide_down', fallback: 'fx.whoosh',
    mix: 'fx', gainDb: 0, measuredLufs: -18.6, variantGainDb: 0, maxVoices: 1,
    haptic: 'tap', hapticOffsetMs: 0,
    today: 'game-specific (fx.whoosh)',
    why: 'A gentle slide down tells you fever ended without sounding like you lost.',
  }),

  // ---------------------------------------------------------------- last seconds
  'game.lastSeconds': m({
    group: 'lastSeconds', label: 'Last 5 seconds', beat: 'anticipation',
    primary: 'memory/mm_clock_tick', variant: 'trivia/tv_heartbeat_soft', fallback: 'ui.select',
    mix: 'ui', gainDb: 0, measuredLufs: -21.7, variantGainDb: -1, maxVoices: 1, cooldownMs: 400,
    haptic: null, hapticOffsetMs: 0,
    today: 'game-specific ticks (ui.select)',
    why: 'A soft clock tick, no alarm and no buzz, so the end feels exciting and never scary.',
  }),

  // ---------------------------------------------------------------- win
  'game.win': m({
    group: 'win', label: 'You win', beat: 'burst',
    primary: 'shared/sting_win', variant: 'line-party/sting_victory', fallback: 'fx.reward',
    mix: 'sting', gainDb: 0, measuredLufs: -16.1, variantGainDb: 0, duck: DUCK_STING, maxVoices: 1,
    haptic: 'winRoll', hapticOffsetMs: 0,
    today: 'playSfx("win") -> fx.reward',
    why: 'Every win ends on the same short fanfare cut from Chris\'s music, so winning sounds like TPS.',
  }),
  'game.newRecord': m({
    group: 'win', label: 'New best score', beat: 'burst',
    primary: 'shared/sting_new_record', variant: 'memory/mm_board_clear', fallback: 'fx.purchase',
    mix: 'sting', gainDb: 0, measuredLufs: -16, variantGainDb: 0, duck: DUCK_STING, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0,
    today: 'fx.purchase (personal best)',
    why: 'A new best gets a brighter fanfare than a normal win.',
  }),
  'game.finish': m({
    group: 'win', label: 'Game over, nice try', beat: 'settle',
    primary: 'shared/sh_clap', variant: 'line-party/sting_runner_up', fallback: 'fx.reveal',
    layers: [{ ref: 'shared/sh_sparkle', delayMs: 120, db: -4 }],
    mix: 'fx', gainDb: -1.6, measuredLufs: -16.4, variantGainDb: -2, maxVoices: 1,
    haptic: 'tap', hapticOffsetMs: 0,
    today: 'playSfx("lose") -> fx.nope',
    why: 'A not-win ends with a little clap so trying always feels good.',
  }),

  // ---------------------------------------------------------------- reveal and level-up
  'reward.reveal': m({
    group: 'reveal', label: 'A coin or pin is revealed', beat: 'burst',
    primary: 'shared/sh_star_slam', variant: 'memory/mm_golden_reveal', fallback: 'fx.reveal',
    layers: [{ ref: 'shared/sh_sparkle', delayMs: 60, db: -3 }],
    mix: 'fx', gainDb: -2.6, measuredLufs: -15.4, variantGainDb: -1.6, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0,
    today: 'BoxReveal play("fx.reveal"); ride photo catchSound("sparkle") -> fx.reveal',
    why: 'Reveals slam down then sparkle, the same gold family as the catch.',
  }),
  'reward.stamp': m({
    group: 'reveal', label: 'A label or badge stamps in', beat: 'settle',
    primary: 'shared/sh_stamp', variant: 'shared/sh_star_slam', fallback: 'ui.confirm',
    mix: 'fx', gainDb: -0.5, measuredLufs: -17.5, variantGainDb: -2.6, maxVoices: 2,
    haptic: 'starSlam', hapticOffsetMs: 0,
    today: 'StampCard.tsx:415 ui.confirm; ride photo catchSound("stamp") -> ui.confirm',
    why: 'A short rubber stamp thunk tells you the reward is official.',
  }),
  'reward.levelUp': m({
    group: 'reveal', label: 'Coin levels up', beat: 'burst',
    primary: 'shared/sh_tier_up', variant: 'shared/sh_powerup', fallback: 'fx.reveal',
    layers: [{ ref: 'shared/sh_sparkle', delayMs: 180, db: -3 }],
    mix: 'fx', gainDb: 0, measuredLufs: -19, variantGainDb: -1.9, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'tierUp', hapticOffsetMs: 0, ahap: 'momentComboTier',
    today: 'motion lane level-up (fx.reveal family)',
    why: 'Level-up rises like the combo tiers, so up always sounds up.',
  }),
  'reward.setComplete': m({
    group: 'reveal', label: 'Set complete', beat: 'burst',
    primary: 'memory/mm_board_clear', variant: 'line-party/sting_victory', fallback: 'fx.reward',
    mix: 'sting', gainDb: 0, measuredLufs: -16.6, variantGainDb: 0, duck: DUCK_STING, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0,
    today: 'SetCollectionScreen.tsx:300 fx.reward; ParkCollectionHeader.tsx:86 fx.reward',
    why: 'Finishing a whole set gets a full board-clear flourish, rarer and bigger than a catch.',
  }),
  'reward.goldenBox': m({
    group: 'reveal', label: 'Golden Box opens', beat: 'burst',
    primary: 'memory/mm_golden_reveal', variant: 'shared/sh_desk_bell', fallback: 'fx.reward',
    layers: [{ ref: 'shared/sh_coin_shower', delayMs: 80, db: -4 }],
    mix: 'fx', gainDb: -1.6, measuredLufs: -16.4, variantGainDb: -2.2, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0, ahap: 'momentChestOpen',
    today: 'BoxReveal play("fx.reward") + fx.firework',
    why: 'The Golden Box shimmers then showers coins, so golden always sounds golden.',
  }),
  'reward.chaserPin': m({
    group: 'reveal', label: 'Rare chaser pin', beat: 'burst',
    primary: 'shared/sh_glock', variant: 'banana/bb_chime', fallback: 'fx.reveal',
    layers: [{ ref: 'shared/sh_sparkle', delayMs: 70, db: -3 }, { ref: 'shared/sh_ding', delayMs: 260, db: -5 }],
    mix: 'fx', gainDb: 0, measuredLufs: -19.9, variantGainDb: 0, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0,
    today: 'BoxReveal fx.reveal',
    why: 'A rare pin gets a music box run so it feels rare without a single word.',
  }),
  'reward.rideLogged': m({
    group: 'reveal', label: 'Ride logged', beat: 'settle',
    primary: 'shared/sh_stamp', variant: 'trivia/tv_correct', fallback: 'fx.reveal',
    layers: [{ ref: 'shared/sh_sparkle', delayMs: 70, db: -4 }],
    mix: 'fx', gainDb: -0.5, measuredLufs: -17.5, variantGainDb: -2.3, maxVoices: 1,
    haptic: 'win', hapticOffsetMs: 0,
    today: 'RideLogSuccess.tsx:62 success.mp3 at 0.65 (silent before Oct 24: the file was broken)',
    why: 'Logging a ride stamps it into your journal with a sparkle.',
  }),

  // ---------------------------------------------------------------- streak and Daily 3
  'loop.flameGrow': m({
    group: 'streak', label: 'Your flame grows', beat: 'burst',
    primary: 'trivia/tv_flame_ignite', variant: 'shared/sh_powerup', fallback: 'fx.reveal',
    mix: 'fx', gainDb: -1.5, measuredLufs: -16.5, variantGainDb: -1.9, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'tierUp', hapticOffsetMs: 0, ahap: 'momentStreakIgnite',
    today: 'wow-loops flame (fx.reveal family)',
    why: 'A warm whoomp makes the flame feel alive and yours.',
  }),
  'loop.flameMilestone': m({
    group: 'streak', label: '7-day flame', beat: 'burst',
    primary: 'trivia/tv_flame_ignite', variant: 'shared/sting_new_record', fallback: 'fx.reward',
    layers: [{ ref: 'shared/sh_tier_up', delayMs: 140, db: -2 }, { ref: 'shared/sh_sparkle', delayMs: 420, db: -4 }],
    mix: 'sting', gainDb: 0, measuredLufs: -16.5, variantGainDb: 0, duck: DUCK_STING, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0, ahap: 'momentStreakIgnite',
    today: 'nothing special today',
    why: 'A week of play is rare and bright: the ignite plus a rising chord.',
  }),
  'loop.freeze': m({
    group: 'streak', label: 'A freeze saves your streak', beat: 'settle',
    primary: 'shared/sh_freeze', variant: 'shared/sh_shield_pop', fallback: 'ui.confirm',
    mix: 'fx', gainDb: -1.4, measuredLufs: -16.6, variantGainDb: 0, maxVoices: 1,
    haptic: 'goodHit', hapticOffsetMs: 0,
    today: 'nothing',
    why: 'An icy shimmer says your streak is safe, never that you lost something.',
  }),
  'loop.daily3Check': m({
    group: 'streak', label: 'A Daily 3 goal checks off', beat: 'burst',
    primary: 'trivia/tv_correct', variant: 'shared/sh_stamp', fallback: 'ui.confirm',
    mix: 'fx', gainDb: -2.3, measuredLufs: -15.7, variantGainDb: -0.5, maxVoices: 1,
    haptic: 'goodHit', hapticOffsetMs: 0,
    today: 'SharkPassScreen.tsx:207 playSfx("coin") -> fx.coin',
    why: 'Checking off a goal gets the right-answer ding: you did it.',
  }),
  'loop.daily3Done': m({
    group: 'streak', label: 'All three done', beat: 'burst',
    primary: 'shared/sh_tier_up', variant: 'memory/mm_board_clear', fallback: 'fx.reward',
    layers: [{ ref: 'shared/sh_coin_shower', delayMs: 160, db: -3 }],
    mix: 'fx', gainDb: 0, measuredLufs: -19, variantGainDb: -1.4, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0,
    today: 'playSfx("coin") -> fx.coin',
    why: 'A full Daily 3 rises and showers coins, the biggest moment of a normal day.',
  }),

  // ---------------------------------------------------------------- chest
  'chest.rattle': m({
    group: 'chest', label: 'The chest shakes', beat: 'anticipation',
    primary: 'current-quest/cq_lock_rattle', variant: 'shared/sh_drumroll_441ms', fallback: 'fx.coinTick',
    mix: 'ui', gainDb: -0.5, measuredLufs: -19.5, variantGainDb: -1.1, maxVoices: 1, cooldownMs: 200,
    haptic: 'tick', hapticOffsetMs: 0,
    today: 'motion lane daily chest (fx.coinTick)',
    why: 'A rattle builds the wait, so opening feels earned.',
  }),
  'chest.open': m({
    group: 'chest', label: 'The chest pops open', beat: 'burst',
    primary: 'current-quest/cq_chest_open', variant: 'shared/sh_popper', fallback: 'fx.reward',
    layers: [{ ref: 'shared/sh_coin_shower', delayMs: 80, db: -3 }],
    mix: 'fx', gainDb: -1.8, measuredLufs: -16.2, variantGainDb: 0, duck: DUCK_REVEAL, maxVoices: 1,
    haptic: 'golden', hapticOffsetMs: 0, ahap: 'momentChestOpen',
    today: 'motion lane daily chest (fx.reward)',
    why: 'The lid creaks open and coins spill out, no slot machine sounds, just treasure.',
  }),

  // ---------------------------------------------------------------- buttons and toasts
  'ui.press': m({
    group: 'ui', label: 'Any button', beat: 'press',
    primary: 'shared/ui_tick', variant: 'shared/sh_pluck', fallback: 'ui.tap',
    mix: 'ui', gainDb: -1.4, measuredLufs: -18.6, variantGainDb: -0.7, maxVoices: 3, cooldownMs: 30,
    haptic: 'tap', hapticOffsetMs: 0,
    today: 'playSfx("tap") / playSfx("ui.tap") -> ui.tap',
    why: 'Buttons get a tiny dry tick that never gets tiring.',
  }),
  'ui.tab': m({
    group: 'ui', label: 'Switch tabs', beat: 'press',
    primary: 'shared/ui_tick_high', variant: 'shared/sh_slide_up', fallback: 'fx.whoosh',
    mix: 'ui', gainDb: -1.5, measuredLufs: -18.5, variantGainDb: 0, maxVoices: 2, cooldownMs: 60,
    haptic: 'tick', hapticOffsetMs: 0,
    today: 'FriendsScreen.tsx:84 / LeaderboardScreen.tsx:202 whoosh (fx.whoosh)',
    why: 'Tabs click like a dial instead of whooshing every time.',
  }),
  'ui.toast': m({
    group: 'ui', label: 'A little message pops up', beat: 'press',
    primary: 'shared/sh_heads_up', variant: 'shared/sh_join', fallback: 'ui.select',
    mix: 'ui', gainDb: -1.4, measuredLufs: -18.6, variantGainDb: -0.9, maxVoices: 1, cooldownMs: 500,
    haptic: 'tick', hapticOffsetMs: 0,
    today: 'mostly silent; NotificationsScreen star -> fx.reveal',
    why: 'A gentle chirp says look up, never an alarm.',
  }),
  'ui.sheetOpen': m({
    group: 'ui', label: 'A card slides up', beat: 'press',
    primary: 'shared/sh_slide_up', variant: 'shared/sh_pluck', fallback: 'ui.modalOpen',
    mix: 'ui', gainDb: 0, measuredLufs: -20, variantGainDb: -0.7, maxVoices: 1, cooldownMs: 200,
    haptic: null, hapticOffsetMs: 0,
    today: 'StampBookScreen.tsx:453 ui.modalOpen',
    why: 'Sheets slide up with a soft swish that matches the motion.',
  }),
  'ui.sheetClose': m({
    group: 'ui', label: 'A card slides away', beat: 'settle',
    primary: 'shared/sh_slide_down', variant: 'shared/ui_tick', fallback: 'ui.modalClose',
    mix: 'ui', gainDb: 0, measuredLufs: -20.7, variantGainDb: -1.4, maxVoices: 1, cooldownMs: 200,
    haptic: null, hapticOffsetMs: 0,
    today: 'StampSheet.tsx:37 ui.modalClose',
    why: 'Closing is the same swish going down, quicker than opening.',
  }),
  'ui.counterTick': m({
    group: 'ui', label: 'A number rolls up', beat: 'settle',
    primary: 'shared/coin_tick', variant: 'shared/ui_tick', fallback: 'fx.coinTick',
    ladder: COIN_LADDER_STEPS, mix: 'ui', gainDb: -0.5, measuredLufs: -19.5, variantGainDb: -1.4, maxVoices: 3, cooldownMs: 45,
    haptic: null, hapticOffsetMs: 0,
    today: 'StampCard.tsx:535 fx.coinTick pitch climb; MysteryCard.tsx:189 fx.coinTick',
    why: 'Rolling numbers climb the coin ladder so counting up sounds like getting more.',
  }),

  // ---------------------------------------------------------------- park
  'park.arrival': m({
    group: 'park', label: 'You walk into a park', beat: 'burst',
    primary: 'line-party/sting_crown', variant: 'line-party/sting_victory', fallback: 'fx.reward',
    mix: 'sting', gainDb: -0.1, measuredLufs: -15.9, variantGainDb: 0, duck: DUCK_STING, maxVoices: 1,
    haptic: 'finisher', hapticOffsetMs: 0, ahap: 'momentParkArrival',
    today: 'ParkArrival moment (fx.reward family)',
    why: 'Walking into a park is the biggest moment in the app, so it gets the crown fanfare.',
  }),
  'park.shelfLand': m({
    group: 'park', label: 'A coin lands on its shelf', beat: 'settle',
    primary: 'memory/mm_shelf_drop', variant: 'shared/sh_stamp', fallback: 'ui.confirm',
    layers: [{ ref: 'shared/sh_sparkle', delayMs: 50, db: -4 }],
    mix: 'fx', gainDb: 0, measuredLufs: -20.8, variantGainDb: -0.5, maxVoices: 1,
    haptic: 'bigStarSlam', hapticOffsetMs: 0,
    today: 'CoinCollectFlight.tsx:71 LAND_SOUND (vol 0.55)',
    why: 'The coin clicks into its slot with a sparkle, so the shelf feels like a trophy case.',
  }),
} satisfies Record<string, MomentDef>;

export type MomentName = keyof typeof MOMENTS;

export const MOMENT_NAMES = Object.keys(MOMENTS) as MomentName[];

export function momentDef(name: MomentName): MomentDef {
  return MOMENTS[name];
}

/**
 * Legacy playSfx names (games and screens) to moments: with the switch on,
 * every existing playSfx('hit') or playSfx('win') speaks the studio
 * vocabulary; with it off nothing changes. Engine cue names ('fx.reward')
 * are left alone because they already name a specific Chris sound.
 */
export const LEGACY_SFX_TO_MOMENT: Readonly<Record<string, MomentName>> = {
  tap: 'ui.press',
  hit: 'game.hit',
  combo: 'game.comboTier',
  fail: 'game.miss',
  win: 'game.win',
  lose: 'game.finish',
  star: 'reward.stamp',
  countdown: 'game.countTick',
  go: 'game.go',
  coin: 'catch.count',
};

/** Per-game music layers: base, hot (fever) and tension (last bars), all bar-synced. */
export const BED_LAYERS: Readonly<Record<string, { base: string; hot?: string; tension?: string }>> = {
  whack: { base: 'mus_whack_main', hot: 'mus_whack_fever', tension: 'mus_whack_intense' },
  sharky: { base: 'sharky_loop', hot: 'sharky_frenzy_loop', tension: 'sharky_loop_lift' },
  banana: { base: 'bb_loop_calm', hot: 'bb_loop_fever', tension: 'bb_loop_rush' },
  memory: { base: 'mm_loop_main', hot: 'mm_loop_showtime', tension: 'mm_loop_overtime' },
  trivia: { base: 'duel_loop', hot: 'duel_fever', tension: 'final_tension_open' },
  'current-quest': { base: 'cq_bed_calm', hot: 'cq_bed_open', tension: 'cq_bed_lowstrokes' },
  rhythm: { base: 'stage_opening_day_a', hot: 'stage_opening_day_a_fever' },
  'line-party': { base: 'lp_loop', tension: 'lp_last_bars' },
  boss: { base: 'boss_robo_loop', hot: 'boss_robo_fury_loop' },
};

/** Music follows the moment (BeatLayers / MusicDirector): the numbers the engine uses. */
export const MUSIC_RULES = {
  /** Layer changes wait for the next bar line, then crossfade this long. */
  layerCrossfadeMs: 200,
  /** Stings and reveals: -6 dB in 60 ms, back over 400 ms. */
  duck: DUCK_REVEAL,
  /** App to background, a call or other audio: fade the bed out, resume on the next downbeat. */
  backgroundFadeMs: 300,
  /** Playing a game while the line moves: music stays, 3 dB lower. */
  walkingTrimDb: -3,
} as const;

/** Parse a ref into its parts. */
export function parseRef(ref: SoundRef): { kind: 'chris'; cue: string } | { kind: 'studio'; game: string; id: string } {
  if (ref.startsWith('chris:')) return { kind: 'chris', cue: ref.slice(6) };
  const i = ref.indexOf('/');
  return { kind: 'studio', game: ref.slice(0, i), id: ref.slice(i + 1) };
}

/**
 * Pick the ladder rung for a counting moment. An explicit step wins;
 * otherwise consecutive plays inside LADDER_CHAIN_MS climb one rung, and a
 * pause restarts at the bottom. Clamped to the moment's rung range.
 */
export function ladderStep(def: MomentDef, explicit: number | undefined, last: { at: number; step: number } | undefined, now: number): number {
  const rungs = def.ladder ?? 1;
  const from = Math.min(def.ladderFrom ?? 0, rungs - 1);
  if (explicit !== undefined) return Math.max(0, Math.min(rungs - 1, Math.floor(explicit)));
  if (!last || now - last.at > LADDER_CHAIN_MS) return from;
  return Math.min(rungs - 1, Math.max(from, last.step + 1));
}

/** Next round-robin index (0..n-1), in order so neighbours always differ. */
export function nextRoundRobin(n: number, last: number | undefined): number {
  if (n <= 1) return 0;
  return last === undefined ? 0 : (last + 1) % n;
}

/** While walking in a line, haptics drop one rung (director spec). */
const ONE_RUNG_DOWN: Partial<Record<HapticPatternName, HapticPatternName>> = {
  golden: 'tierUp',
  tierUp: 'goodHit',
  crit: 'goodHit',
  finisher: 'tierUp',
  winRoll: 'goodHit',
  feverStart: 'goodHit',
  bigStarSlam: 'starSlam',
  starSlam: 'tap',
  goodHit: 'tap',
  triviaCorrect: 'goodHit',
  win: 'goodHit',
  tap: 'tick',
};

export function momentHaptic(name: MomentName, opts: { walking?: boolean } = {}): HapticPatternName | null {
  const h = MOMENTS[name].haptic;
  if (!h || !opts.walking) return h;
  return ONE_RUNG_DOWN[h] ?? h;
}
