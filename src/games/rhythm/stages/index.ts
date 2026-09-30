/**
 * Parade Beat stages: Chris's songs, cut on beat-map bar lines by
 * tools/rhythm/build_stages.py and charted by tools/rhythm/author_charts.py.
 * Metro needs literal requires.
 */

import type { RoundFormat, StageJson } from '../core/types';

export type StageId = 'opening_day_a' | 'waiting_room_a' | 'shark_shop_a' | 'backpack_bounce_a';

export interface StageEntry {
  id: StageId;
  title: string;
  json: StageJson;
  audio: Partial<Record<RoundFormat, { song: number; fever: number }>>;
  /** FTUE unlock order (1 = first). */
  order: number;
  /** The new idea this stage introduces (callout copy). */
  teaches: string;
  /** Difficulty 3 only stages. */
  d3Only?: boolean;
}

export const STAGES: Record<StageId, StageEntry> = {
  opening_day_a: {
    id: 'opening_day_a',
    title: 'Opening Day',
    json: require('./opening_day_a.json'),
    audio: {
      queue: { song: require('../audio/opening_day_a_queue.m4a'), fever: require('../audio/opening_day_a_queue_fever.m4a') },
      ride: { song: require('../audio/opening_day_a_ride.m4a'), fever: require('../audio/opening_day_a_ride_fever.m4a') },
    },
    order: 1,
    teaches: 'TAP ON THE BEAT',
  },
  waiting_room_a: {
    id: 'waiting_room_a',
    title: 'Waiting Room',
    json: require('./waiting_room_a.json'),
    audio: {
      queue: { song: require('../audio/waiting_room_a_queue.m4a'), fever: require('../audio/waiting_room_a_queue_fever.m4a') },
      ride: { song: require('../audio/waiting_room_a_ride.m4a'), fever: require('../audio/waiting_room_a_ride_fever.m4a') },
    },
    order: 2,
    teaches: 'HIT THE SIDE',
  },
  shark_shop_a: {
    id: 'shark_shop_a',
    title: 'Shark Shop',
    json: require('./shark_shop_a.json'),
    audio: {
      queue: { song: require('../audio/shark_shop_a_queue.m4a'), fever: require('../audio/shark_shop_a_queue_fever.m4a') },
    },
    order: 3,
    teaches: 'HOLD',
  },
  backpack_bounce_a: {
    id: 'backpack_bounce_a',
    title: 'Backpack Bounce',
    json: require('./backpack_bounce_a.json'),
    audio: {
      queue: { song: require('../audio/backpack_bounce_a_queue.m4a'), fever: require('../audio/backpack_bounce_a_queue_fever.m4a') },
    },
    order: 4,
    teaches: 'FLICK UP',
  },
};

export const STAGE_ORDER: StageId[] = ['opening_day_a', 'waiting_room_a', 'shark_shop_a', 'backpack_bounce_a'];
/** Ride challenge stages (design 3.5): the two ride windows. */
export const RIDE_STAGES: StageId[] = ['waiting_room_a', 'opening_day_a'];
