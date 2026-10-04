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
/** Real production coin art from five parks (full colour: Alex's coin body recoloured per park). */
const COIN = (path: string) => `${PROD}/${path}.png`;
const COINS = [
  COIN('glCieW3K87CwbpdBcCzxjCVHKRcwNEw9F4nswmCO'), // orange park
  COIN('vNgekqJJn9PbI2NjD4VSjgnexTtiuqfWS4QalA99'), // red park
  COIN('Fw3yUQQowFAIh94E6KbA4HE7nP6IyXkXiopWzKq5'), // azure park
  COIN('6ZfzpRsqfroNih4XHDBmgoDwoPxxjlBvp4cU2vwc'), // royal blue park
  COIN('nCpFbuCe2riwksT9QDBKjdBQBquTXpR9CO4pg8g9'),
  COIN('enxnmV5qxptzlLfsf5DwXeppDw0i695XcyKVeuEA'),
  COIN('5u5ygBhsuGZtaYIK1JExUSbItVbCoJT19pYuUaXg'),
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
  s('find-legendary', 'find', { itemName: 'Legendary Golden Churro', artUrl: art('golden-churro.webp'), rarity: 5, setName: 'Churro Cart', setFound: 4, setTotal: 9, ownedPct: 0.03 }),
  s('find-golden-hour', 'find', { itemName: 'Giant Dragon Plush', artUrl: art('dragon-plush.webp'), rarity: 5, goldenHour: true, setName: 'Souvenirs', setFound: 7, setTotal: 10 }),
  s('find-epic', 'find', { itemName: 'Firework Rocket Toy', artUrl: art('firework-rocket.webp'), rarity: 4, setName: 'Night Glow', setFound: 3, setTotal: 8 }),
  s('ride-photo', 'ride_photo', { itemName: 'Wishing Star', artUrl: art('shooting-star.webp'), rarity: 5, grade: 'frame_it' }),
  s('set-complete', 'set_complete', {
    setName: 'Snack Stand', badgeUrl: art('snack-stand.webp'), found: 12, total: 12, title: 'Snack Boss', source: 'home_hunt',
    artUrls: ['popcorn-bucket', 'corn-dog', 'pizza-slice', 'nacho-tray', 'turkey-leg'].map(f => art(`${f}.webp`)),
  }),
  s('boss-win', 'boss_win', { bossName: 'The Kraken', artUrl: require('../../assets/images/boss/kraken.png'), difficulty: 'shark', title: 'Kraken Tamer', mvp: true }),
  s('stamp', 'stamp', { name: 'Wild Legend Finder', artUrl: art('wild-legend-finder.png'), rarity: 'legendary', how: 'Caught 2 different Legendaries', ownedPct: 0.04, artHasShark: true }),
  s('coin-level', 'coin_level', { coinUrl: COINS[1], level: 7, tierName: 'Tidal', tierIndex: 7, timesCollected: 31 }),
  s('coin-level-5', 'coin_level', { coinUrl: COINS[2], level: 5, tierName: 'Legendary', tierIndex: 5, timesCollected: 12 }),
  s('coin-level-9', 'coin_level', { coinUrl: COINS[3], level: 9, tierName: 'Royal', tierIndex: 9, timesCollected: 40 }),
  s('standings', 'standings', { tierLabel: 'Podium', rank: 2, percentile: 1, points: 1840 }),
  s('standings-1', 'standings', { tierLabel: 'Champion', rank: 1, percentile: 1, points: 2210 }),
  s('standings-top18', 'standings', { tierLabel: 'Top 25%', percentile: 18, points: 960 }),
  s('fright-night', 'fright_night', {
    cardTitle: 'Fin-ister Nights 2026', headline: '6 haunts survived!', nightNumber: 3, haunts: 6, minutesInLine: 212,
    badgeUrls: ['pumpkin-bucket', 'ghost-marshmallow', 'bat-cookie', 'witch-hat', 'cauldron-cup', null].map(f => (f ? art(`${f}.webp`) : null)),
    statLines: ['3 hours, 32 min in haunt lines'],
  }),
  s('fright-badge', 'fright_badge', { cardTitle: 'Fin-ister Nights 2026', hauntName: 'The Tug of the Tides', badgeUrl: art('candy-sack.webp'), pinUrl: art('mummy-dog.webp'), runs: 4 }),
  s('fright-lifetime', 'fright_lifetime', { hauntsSurvived: 37, reSwims: 12, nights: 9, events: 2 }),
  s('ride-coin', 'ride_coin', { coinUrl: COINS[2], isNew: true, limited: true, milestone: { percent: 75, collected: 15, available: 20 } }),
  s('streak', 'streak', { days: 14, best: 21 }),
  s('level-up', 'level_up', { level: 25, unlockName: 'Golden Fin Pin' }),
  s('title', 'title', { title: 'Churro Champ', how: 'Finished the Churro Cart set' }),
  s('park-day', 'park_day', { coinsCaught: 7, newCoins: 3, coinUrls: COINS }),
];
