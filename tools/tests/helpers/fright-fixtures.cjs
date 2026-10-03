'use strict';
/** Shared Fin-ister Nights fixtures: parody codenames only, never real names. */
const { loadTs } = require('./ts-module.cjs');

const load = file => loadTs(`src/services/fright/${file}.ts`);

const USF_NIGHT = {
  night_on: '2026-10-09',
  opens_at: '2026-10-09T18:30:00-04:00',
  closes_at: '2026-10-10T02:00:00-04:00',
  early_opens_at: null,
  last_call_at: '2026-10-10T01:30:00-04:00',
  after_until: '2026-10-10T03:00:00-04:00',
  teaser_from: '2026-10-09T15:30:00-04:00',
};

const USH_NIGHT = {
  night_on: '2026-10-09',
  opens_at: '2026-10-09T19:00:00-07:00',
  closes_at: '2026-10-10T02:00:00-07:00',
  early_opens_at: '2026-10-09T17:00:00-07:00',
  last_call_at: '2026-10-10T01:30:00-07:00',
  after_until: '2026-10-10T03:00:00-07:00',
  teaser_from: '2026-10-09T16:00:00-07:00',
};

const T = iso => Date.parse(iso);

function event(parkId = 3, extra = {}) {
  return { slug: parkId === 3 ? 'usf-2026' : 'ush-2026', title: 'Fin-ister Nights', card_title: 'Fin-ister Nights 2026',
    lantern_star: 'Chuckles vs Riptide', park_id: parkId, timezone: parkId === 3 ? 'America/New_York' : 'America/Los_Angeles',
    year: 2026, night_index: 4, nights_total: 49, ...extra };
}

function haunt(key, extra = {}) {
  return { key, kind: 'haunt', name: 'The Robot City', blurb: 'Beep boop.', latitude: 28.4750, longitude: -81.4680,
    radius: 60, walk_minutes: 5, status: 'OPERATING', posted_minutes: 45, accepting: true, fan_rank: null, sort: 1,
    fx: null, art: null, ...extra };
}

function reef(key, extra = {}) {
  return { ...haunt(key, { kind: 'reef', name: 'The Tidepool Carnival', status: null, posted_minutes: null, radius: 70 }), ...extra };
}

function me(extra = {}) {
  return { runs: [], open_run: null, haunts_tonight: 0, haunts_season: 0, haunts_total: 0, side: null,
    lantern: { level: 1, parts: 0, next_at: 10 }, found_tonight: [], recap_seen: false, ...extra };
}

function tonight(extra = {}) {
  return { enabled: true, server_now: '2026-10-09T20:00:00-04:00', phase: 'live', event: event(3), night: USF_NIGHT,
    spots: [haunt('usf26-robot-city')], encounter: null, me: me(), config: null, ...extra };
}

/** A point `meters` north of a spot. */
function north(spot, meters) {
  return { latitude: spot.latitude + meters / 111320, longitude: spot.longitude };
}

module.exports = { load, USF_NIGHT, USH_NIGHT, T, event, haunt, reef, me, tonight, north };
