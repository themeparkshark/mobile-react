/**
 * Development-only sample payloads, one per kind (plus variants), for the
 * Share Studio preview and the r1 render sheet. Art comes from a local dev
 * server (EXPO_PUBLIC_SHARE_SAMPLE_BASE) or production asset URLs; never
 * imported by player-facing code.
 */
import type { InventoryType } from '../models/inventory-type';
import type { FlexKind, FlexPayload } from './types';

const BASE = (process.env.EXPO_PUBLIC_SHARE_SAMPLE_BASE || 'http://127.0.0.1:8742').replace(/\/$/, '');
const art = (file: string) => `${BASE}/${file}`;
const PROD = 'https://assets.themeparkshark.com/mobile/production/assets';
const COINS = [
  `${PROD}/6ZfzpRsqfroNih4XHDBmgoDwoPxxjlBvp4cU2vwc.png`,
  `${PROD}/YcExEGuduIZNjtBCnEPVgnenzhSzvMSs7ZA2QOgC.png`,
  `${PROD}/d4jDw5cL1wtDEHFh3Ym5TeajiwG4WN94kSWP34jW.png`,
  `${PROD}/yi8KkOCMksLVHRslaLxbUs7VzNMTyctVniTKK9TC.png`,
  `${PROD}/UXqhHc939YhJNsHTYks7Ewrik7eq1pNMUt797lqI.png`,
  `${PROD}/GoVjPLa6bSIVH1dtu3kYZwZpbSQocBpHnve0SCKC.png`,
  `${PROD}/ygI0Sc27wIMd3blodsXWO2PjNcAtaifOvwsxL6Zp.png`,
];

/** A dressed sample shark: tee, shades and a camera (real production papers). */
export const SAMPLE_INVENTORY = {
  body_item: { id: 9001, name: 'Tee', paper_url: `${PROD}/WwCOXJ7rMpwaUGjQwvG0TDNEW2EC4sdQwQZskaVC.png` },
  face_item: { id: 9002, name: 'Shades', paper_url: `${PROD}/63Z80KzmnLJLLZOO3xolJ0IMkd0tnYirHzOjiCPe.png` },
  neck_item: { id: 9003, name: 'Camera', paper_url: `${PROD}/EIbKxOUH3iQftK6iTkGzXaQtir5hOz94AqVqdaBp.png` },
} as unknown as InventoryType;

export interface FlexSample<K extends FlexKind = FlexKind> {
  readonly name: string;
  readonly kind: K;
  readonly payload: FlexPayload<K>;
}

const s = <K extends FlexKind>(name: string, kind: K, payload: FlexPayload<K>): FlexSample => ({ name, kind, payload } as FlexSample);

export const FLEX_SAMPLES: readonly FlexSample[] = [
  s('crowned', 'crowned', { coinUrl: COINS[0], tierName: 'Shark Crown', timesCollected: 48, ownedPct: 0.02 }),
  s('find-legendary', 'find', { itemName: 'Legendary Golden Churro', artUrl: art('golden-churro.webp'), rarity: 5, setName: 'Churro Cart', ownedPct: 0.03 }),
  s('find-golden-hour', 'find', { itemName: 'Giant Dragon Plush', artUrl: art('dragon-plush.webp'), rarity: 5, goldenHour: true, setName: 'Souvenirs' }),
  s('ride-photo', 'ride_photo', { itemName: 'Wishing Star', artUrl: art('shooting-star.webp'), rarity: 5, grade: 'frame_it' }),
  s('set-complete', 'set_complete', {
    setName: 'Snack Stand', badgeUrl: art('snack-stand.webp'), found: 12, total: 12, title: 'Snack Boss', source: 'home_hunt',
    artUrls: ['popcorn-bucket', 'corn-dog', 'pizza-slice', 'nacho-tray', 'turkey-leg', 'golden-feast-platter'].map(f => art(`${f}.webp`)),
  }),
  s('boss-win', 'boss_win', { bossName: 'The Kraken', artUrl: require('../../assets/images/boss/kraken.png'), difficulty: 'shark', title: 'Kraken Tamer', mvp: true }),
  s('stamp', 'stamp', { name: 'Wild Legend Finder', artUrl: art('wild-legend-finder.png'), rarity: 'legendary', how: 'Caught 2 different Legendary finds', ownedPct: 0.04 }),
  s('coin-level', 'coin_level', { coinUrl: COINS[1], level: 7, tierName: 'Tidal', tierIndex: 7, timesCollected: 31 }),
  s('standings', 'standings', { boardLabel: 'Home Hunt', tierLabel: 'Podium', rank: 2, percentile: 1, points: 1840 }),
  s('fright-night', 'fright_night', {
    cardTitle: 'Fin-ister Nights 2026', headline: '6 haunts survived!', nightNumber: 3, haunts: 6, minutesInLine: 212,
    badgeUrls: ['pumpkin-bucket', 'ghost-marshmallow', 'bat-cookie', 'witch-hat', 'cauldron-cup', null].map(f => (f ? art(`${f}.webp`) : null)),
    statLines: ['3 hours, 32 min in haunt lines'],
  }),
  s('fright-badge', 'fright_badge', { cardTitle: 'Fin-ister Nights 2026', hauntName: 'The Tug of the Tides', badgeUrl: art('candy-sack.webp'), pinUrl: art('mummy-dog.webp'), runs: 4, ownedPct: 0.08 }),
  s('fright-lifetime', 'fright_lifetime', { hauntsSurvived: 37, reSwims: 12, nights: 9, events: 2 }),
  s('ride-coin', 'ride_coin', { coinUrl: COINS[2], isNew: true, limited: true, milestone: { percent: 75, collected: 15, available: 20 } }),
  s('streak', 'streak', { days: 14, best: 21 }),
  s('level-up', 'level_up', { level: 25, unlockName: 'Golden Fin Pin' }),
  s('title', 'title', { title: 'Churro Champ', how: 'Finished the Churro Cart set', ownedPct: 0.06 }),
  s('park-day', 'park_day', { coinsCaught: 7, newCoins: 3, coinUrls: COINS }),
];
