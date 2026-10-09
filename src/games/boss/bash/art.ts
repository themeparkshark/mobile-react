/**
 * Boss Bash art. Reuses the boss studio set (Alex-style, already shipped) plus
 * three Codex GPT Image pieces made from those references (tentacle, puffer,
 * dizzy Kraken; see dustin-feedback-oct8/boss/ART_QA.md).
 */
import type { BossId } from '../../../api/endpoints/parks/raid';

export const BASH_ART = {
  lagoon: require('../../../assets/games/boss/bg_lagoon.jpg'),
  beach: require('../../../assets/games/boss/k1_fore.png'),
  hat: require('../../../assets/games/boss/bash/hat.png'),
  ink: require('../../../assets/games/boss/bash/ink.png'),
  puffer: require('../../../assets/games/boss/bash/puffer.png'),
  // Hand-drawn hit bursts (Codex, r9): white for bonks, gold for smashes.
  splash: require('../../../assets/games/boss/bash/splash_hd.webp'),
  impact: require('../../../assets/games/boss/bash/burst_white.webp'),
  impactGold: require('../../../assets/games/boss/bash/burst_gold.webp'),
  star: require('../../../assets/games/boss/fx_small_dizzy_star.png'),
  swirl: require('../../../assets/games/boss/bo_fx_09.png'),
  sparkle: require('../../../assets/games/boss/bo_fx_11.png'),
  puff: require('../../../assets/games/boss/bo_fx_08.png'),
  ring: require('../../../assets/games/boss/prop_swim_ring.png'),
  finEmpty: require('../../../assets/games/boss/hud/fin_empty.png'),
  finFull: require('../../../assets/games/boss/hud/fin_full.png'),
  finPop: require('../../../assets/games/boss/hud/fin_popping.png'),
  tapHand: require('../../../../assets/images/ride-photo/tap-hand.webp'),
  shark: {
    idle: require('../../../assets/games/boss/shark_fist_pump.png'),
    cheer: require('../../../assets/games/boss/shark_cheer.png'),
    bonked: require('../../../assets/games/boss/shark_bonked.png'),
    dizzy: require('../../../assets/games/boss/shark_dizzy.png'),
  },
  wm: {
    nice: require('../../../assets/games/boss/wm/nice_f1.png'),
    great: require('../../../assets/games/boss/wm/great_f1.png'),
    superb: require('../../../assets/games/boss/wm/superb_f1.png'),
    perfect: require('../../../assets/games/boss/wm/perfect_f1.png'),
    fury: require('../../../assets/games/boss/wm/fury_f1.png'),
    finish: require('../../../assets/games/boss/wm/finish_f1.png'),
    knockout: require('../../../assets/games/boss/wm/knockout_f1.png'),
  },
} as const;

/** Wordmark aspect ratios (w/h), read from the files once. */
export const WM_ASPECT: Record<keyof typeof BASH_ART.wm, number> = {
  nice: 576 / 243, great: 576 / 172, superb: 576 / 160, perfect: 576 / 152, fury: 576 / 205, finish: 576 / 189, knockout: 576 / 138,
};

export interface BossSkin {
  /** The body, the dizzy body (same frame), and how big the head is in it. */
  readonly body: number;
  readonly dizzy: number | null;
  readonly hurt: number | null;
  readonly laugh: number | null;
  readonly roar: number | null;
  /** Cheeks full of ink: the INK tell (its own face, never the phase roar). */
  readonly puff: number | null;
  /** The limb that pops out of the water. */
  readonly limb: number;
  readonly limbAspect: number;
  /** Head centre in the body image (0-1). */
  readonly head: readonly [number, number];
  readonly hat: boolean;
  /** What the limb is called in the one-word callouts. */
  readonly limbWord: string;
  /** Ghost Squid fades in and out a little. */
  readonly ghostly: boolean;
}

const KRAKEN: BossSkin = {
  body: require('../../../assets/games/boss/bash/kraken_body_hd.webp'),
  dizzy: require('../../../assets/games/boss/bash/kraken_dizzy_hd.webp'),
  hurt: require('../../../assets/games/boss/bash/kraken_hurt_hd.webp'),
  laugh: require('../../../assets/games/boss/bash/kraken_laugh_hd.webp'),
  roar: require('../../../assets/games/boss/bash/kraken_roar_hd.webp'),
  puff: require('../../../assets/games/boss/bash/kraken_puff_hd.webp'),
  limb: require('../../../assets/games/boss/bash/tentacle.png'),
  limbAspect: 261 / 600,
  // Between the eyes (the hat sits above), so the smash ring frames the face.
  head: [0.5, 0.42],
  hat: true,
  limbWord: 'tentacles',
  ghostly: false,
};

export const BOSS_SKINS: Record<BossId, BossSkin> = {
  kraken: KRAKEN,
  robo_shark: {
    ...KRAKEN,
    body: require('../../../../assets/images/boss/robo_shark-crop.png'),
    dizzy: null, hurt: null, laugh: null, roar: null, puff: null,
    limb: require('../../../assets/games/boss/bash/robo_arm.png'),
    limbAspect: 259 / 600,
    head: [0.5, 0.36],
    hat: false,
    limbWord: 'robot arms',
  },
  ghost_squid: {
    ...KRAKEN,
    body: require('../../../../assets/images/boss/ghost_squid.png'),
    dizzy: null, hurt: null, laugh: null, roar: null, puff: null,
    limb: require('../../../assets/games/boss/bash/ghost_tentacle.png'),
    limbAspect: 270 / 600,
    head: [0.5, 0.32],
    hat: false,
    ghostly: true,
  },
};
