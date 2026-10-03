/**
 * Development fixture: Universal Studios Florida's haunts and Fright Reefs at
 * their official map coordinates (facts/houses.json and zones.json, Oct 2,
 * 2026), under parody codenames only. For previews and captures, never shipped
 * as data: the live map always renders the server's spots.
 */
import type { FrightSpot, FrightTonight } from '../../../../api/endpoints/fright/types';

const haunt = (key: string, name: string, latitude: number, longitude: number, sort: number,
  extra: Partial<FrightSpot> = {}): FrightSpot => ({
  key, kind: 'haunt', name, blurb: '', latitude, longitude, radius: 60, walk_minutes: 5, status: 'OPERATING',
  posted_minutes: 45, accepting: true, fan_rank: null, sort, art: null,
  fx: { flicker: ['candle', 'neon', 'strobe-soft'][sort % 3], windows: 3 + (sort % 3) }, ...extra,
});

const reef = (key: string, name: string, latitude: number, longitude: number, radius: number, sort: number,
  critter: string, props: string[]): FrightSpot => ({
  key, kind: 'reef', name, blurb: '', latitude, longitude, radius, walk_minutes: 0, status: null, posted_minutes: null,
  accepting: true, fan_rank: null, sort, art: null, fx: { critter, critters: 3, props },
});

export const USF_FRIGHT_SPOTS: readonly FrightSpot[] = [
  haunt('usf26-tug-of-the-tides', 'The Tug of the Tides', 28.475643, -81.468688, 1),
  haunt('usf26-creaky-book', 'The Cabin with the Creaky Book', 28.47436, -81.46923, 2),
  haunt('usf26-flicker-light-town', 'The Flicker-Light Town', 28.4741, -81.46926, 3),
  haunt('usf26-rock-legend', "The Rock Legend's Encore", 28.47481, -81.47005, 4),
  haunt('usf26-wild-zoo', 'The Wild Zoo After Dark', 28.47488, -81.46997, 5, { status: 'DOWN', accepting: false }),
  haunt('usf26-robot-city', 'The Robot City', 28.47779, -81.469558, 6),
  haunt('usf26-farmhouse-ufo', 'The Farmhouse UFO', 28.479192, -81.46778, 7),
  haunt('usf26-host-hammerhead', "Host Hammerhead's Matinee", 28.480165, -81.467529, 8),
  haunt('usf26-juke-joint', 'The Midnight Juke Joint', 28.480557, -81.46841, 9),
  haunt('usf26-puzzle-box', 'The Clockwork Puzzle Box', 28.48037, -81.46844, 10),
  reef('reef-tidepool-carnival', 'The Tidepool Carnival Gate', 28.475393, -81.467691, 90, 11,
    'barker-crab,juggler-octopus,shark-pumpkin', ['bats', 'lantern']),
  reef('reef-toy-chest', "Little Minnow's Toy Chest", 28.476199, -81.467172, 80, 12,
    'little-minnow,windup-fish,ghost-jelly', ['eyes', 'fog-thick']),
  reef('reef-kelp-fields', 'The Kelp Patch', 28.477379, -81.46781, 60, 13,
    'pumpkin-puffer,shark-scarecrow', ['pumpkin', 'bats']),
  reef('reef-giggle-alley', 'Giggle Alley', 28.476137, -81.46965, 130, 14,
    'whoopee-blowfish,balloon-jelly,shark-prank', ['skid-fins', 'eyes']),
];

/** A live night around `now`, with the encounter live at the carnival gate. */
export function usfFrightFixture(now: number, phase: FrightTonight['phase'] = 'live'): FrightTonight {
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    enabled: true,
    server_now: iso(now),
    phase,
    event: { slug: 'usf-2026', title: 'Fin-ister Nights', card_title: 'Fin-ister Nights 2026', lantern_star: 'Chuckles vs Riptide',
      park_id: 3, timezone: 'America/New_York', year: 2026, night_index: 3, nights_total: 34 },
    night: { night_on: iso(now).slice(0, 10), opens_at: iso(now - 3600_000), closes_at: iso(now + 4 * 3600_000),
      early_opens_at: null, last_call_at: iso(now + 3.5 * 3600_000), after_until: iso(now + 5 * 3600_000), teaser_from: iso(now - 4 * 3600_000) },
    spots: USF_FRIGHT_SPOTS,
    encounter: { key: 'enc-chuckles', critter: 'chuckles', name: 'Chuckles the Chum Jester', line: 'Something is giggling near the carnival. Go look.',
      latitude: 28.4757, longitude: -81.4674, radius: 40, starts_at: iso(now - 60_000), ends_at: iso(now + 6 * 60_000), caught: false },
    me: null,
    config: null,
  };
}
