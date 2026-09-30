import type { BossId } from '../../api/endpoints/parks/raid';

/**
 * The three bosses as drawn, for every surface outside the brawl itself (map,
 * sheets, pills, win card). Robo-Shark is the approved clean-v2 art cropped to
 * its outline, so all three render at the same size with no per-boss scale.
 */
export const BOSS_ART: Record<BossId, number> = {
  kraken: require('../../../assets/images/boss/kraken.png'),
  robo_shark: require('../../../assets/images/boss/robo_shark-crop.png'),
  ghost_squid: require('../../../assets/images/boss/ghost_squid.png'),
};

/** Per-boss accent for effects only (never a surface colour). */
export const BOSS_FX: Record<BossId, { readonly particles: string[]; readonly label: string }> = {
  kraken: { particles: ['#ffffff', '#a0edff', '#4fc3f7', '#bfe5ff'], label: 'splash' },
  robo_shark: { particles: ['#ffcf3b', '#ffe07a', '#ffffff', '#ff9f1c'], label: 'sparks' },
  ghost_squid: { particles: ['#ffffff', '#dff4ff', '#b9d7ee', '#8fb3cf'], label: 'wisps' },
};
