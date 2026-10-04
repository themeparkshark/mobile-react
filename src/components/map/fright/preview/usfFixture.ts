/**
 * Development fixture: Universal Studios Florida's haunts and Fright Reefs at
 * their official map coordinates (facts/houses.json and zones.json, Oct 2,
 * 2026), under parody codenames only. For previews and captures, never shipped
 * as data: the live map always renders the server's spots.
 */
import type { FrightSpot, FrightTonight } from '../../../../api/endpoints/fright/types';
import { USF_FIXTURE_ASSETS } from './usfAssets';

const haunt = (key: string, name: string, latitude: number, longitude: number, sort: number,
  extra: Partial<FrightSpot> = {}): FrightSpot => ({
  key, kind: 'haunt', name, blurb: '', latitude, longitude, radius: 60, walk_minutes: 5, status: 'OPERATING',
  posted_minutes: 45, accepting: true, fan_rank: null, sort,
  fx: { flicker: ['candle', 'neon', 'strobe-soft'][sort % 3], windows: 3 + (sort % 3), art: HAUNT_ART[key] ?? null },
  art: { icon: iconFor(HAUNT_ART[key]), badge: null, pin: null }, ...extra,
});

/** Spot key to the manifest's haunt art slug (the server sends this as fx.art). */
const HAUNT_ART: Record<string, string> = {
  'usf26-tug-of-the-tides': 'h01-tug-of-the-tides',
  'usf26-creaky-book': 'h05-cabin-creaky-book',
  'usf26-flicker-light-town': 'h02-flicker-light-town',
  'usf26-rock-legend': 'h06-rock-legend-encore',
  'usf26-wild-zoo': 'h08-wild-zoo-after-dark',
  'usf26-robot-city': 'h09-robot-city',
  'usf26-farmhouse-ufo': 'h10-farmhouse-ufo',
  'usf26-host-hammerhead': 'h07-host-hammerhead-matinee',
  'usf26-juke-joint': 'h03-midnight-juke-joint',
  'usf26-puzzle-box': 'h04-clockwork-puzzle-box',
};

function iconFor(slug: string | undefined): string | null {
  return slug ? USF_FIXTURE_ASSETS.haunts?.[slug]?.icon?.['128'] ?? null : null;
}

const reef = (key: string, name: string, latitude: number, longitude: number, radius: number, sort: number,
  cast: string, props: string[]): FrightSpot => ({
  key, kind: 'reef', name, blurb: '', latitude, longitude, radius, walk_minutes: 0, status: null, posted_minutes: null,
  accepting: true, fan_rank: null, sort, art: null, fx: { scareactors: cast.split(','), critters: 3, props },
});

/** The manifest's reef casts (art MANIFEST reefs.<slug>.scareactors), as the server sends them in fx.scareactors. */
const castOf = (slug: string) => (MANIFEST_CASTS[slug] ?? []).join(',');
const MANIFEST_CASTS: Record<string, readonly string[]> = {
  'reef-tidepool-carnival': ['sa-jester', 'sa-ringmaster', 'sa-stilt-carny', 'sa-juggler'],
  'reef-toy-chest': ['sa-sideshow-girl', 'sa-masked-usher', 'sa-storyteller', 'sa-barker'],
  'reef-kelp-fields': ['sa-battle-player', 'sa-squad-zombie', 'sa-storm-lurker'],
  'reef-giggle-alley': ['sa-pale-clown', 'sa-tinsel-clown', 'sa-hobo-clown', 'sa-candy-klown'],
};

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
    castOf('reef-tidepool-carnival'), ['bats', 'lantern']),
  reef('reef-toy-chest', "Little Minnow's Toy Chest", 28.476199, -81.467172, 80, 12,
    castOf('reef-toy-chest'), ['eyes', 'fog-thick']),
  reef('reef-kelp-fields', 'The Kelp Patch', 28.477379, -81.46781, 60, 13,
    castOf('reef-kelp-fields'), ['pumpkin', 'bats']),
  reef('reef-giggle-alley', 'Giggle Alley', 28.476137, -81.46965, 130, 14,
    castOf('reef-giggle-alley'), ['skid-fins', 'eyes']),
];

/**
 * The lagoon show (approximate lagoon middle; the server sends the real spot),
 * live from a minute ago for the 'show' capture (the Lagoon Glow-Down plays and
 * the fright sprites hold still), otherwise two hours out.
 */
export function usfLagoonShow(now: number, live = false): FrightSpot {
  return {
    key: 'usf26-lagoon-glow-down', kind: 'show', name: 'The Lagoon Glow-Down', blurb: '', latitude: 28.4787, longitude: -81.4683,
    radius: 120, walk_minutes: 0, status: 'OPERATING', posted_minutes: null, accepting: false, fan_rank: null, sort: 20,
    fx: { props: ['lagoon-glow'] }, art: null, times: [new Date(live ? now - 60_000 : now + 2 * 3600_000).toISOString()],
  };
}

/** A live night around `now`, with the encounter live at the carnival gate. */
export function usfFrightFixture(now: number, phase: FrightTonight['phase'] = 'live', showLive = false): FrightTonight {
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    enabled: true,
    server_now: iso(now),
    phase,
    event: { slug: 'usf-2026', title: 'Fin-ister Nights', card_title: 'Fin-ister Nights 2026', lantern_star: 'Chuckles vs Riptide',
      park_id: 3, timezone: 'America/New_York', year: 2026, night_index: 3, nights_total: 34 },
    night: { night_on: iso(now).slice(0, 10), opens_at: iso(now - 3600_000), closes_at: iso(now + 4 * 3600_000),
      early_opens_at: null, last_call_at: iso(now + 3.5 * 3600_000), after_until: iso(now + 5 * 3600_000), teaser_from: iso(now - 4 * 3600_000) },
    spots: [...USF_FRIGHT_SPOTS, usfLagoonShow(now, showLive)],
    encounter: { key: 'enc-chuckles', critter: 'chuckles', scareactor: 'sa-jester', name: 'Chuckles the Chum Jester', line: 'Something is giggling near the carnival. Go look.',
      latitude: 28.4757, longitude: -81.4674, radius: 40, starts_at: iso(now - 60_000), ends_at: iso(now + 6 * 60_000), caught: false, chaos_hour: false },
    me: null,
    config: null,
    assets: USF_FIXTURE_ASSETS,
  };
}
