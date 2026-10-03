'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const copy = loadTs('src/share/copy.ts');
const { FLEX_KINDS } = loadTs('src/share/types.ts');
const { FLEX_SAMPLES } = loadTs('src/share/samples.ts');
const store = loadTs('src/share/store.ts');

const telemetryCalls = [];
const posted = [];
const track = loadTs('src/share/track.ts', {
  '../api/endpoints/me/share': { postShareEvent: async body => { posted.push(body); } },
  '../services/telemetry': { addBreadcrumb: (...args) => telemetryCalls.push(args) },
});

const shared = { result: { action: 'sharedAction', activityType: 'com.burbn.instagram.shareextension' } };
const capture = loadTs('src/share/capture.ts', {
  'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => undefined },
  'react-native': {
    PixelRatio: { get: () => 3 }, Platform: { OS: 'ios' },
    Share: { sharedAction: 'sharedAction', dismissedAction: 'dismissedAction', share: async () => shared.result },
  },
  'react-native-view-shot': { captureRef: async () => 'file:///tmp/card.jpg' },
});

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i;
const DATE_LIKE = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b20\d\d-\d\d-\d\d\b/;

test('every kind has a sample, and every sample has full copy in "My ..." voice', () => {
  const sampled = new Set(FLEX_SAMPLES.map(sample => sample.kind));
  for (const kind of FLEX_KINDS) assert.ok(sampled.has(kind), `no sample for ${kind}`);
  for (const sample of FLEX_SAMPLES) {
    const c = copy.flexCopy(sample.kind, sample.payload);
    assert.ok(c.ribbon.length > 0 && c.ribbon === c.ribbon.toUpperCase(), `${sample.name} ribbon`);
    assert.match(c.kicker, /^My /, `${sample.name} kicker`);
    assert.ok(c.title.length > 0 && c.stat.length > 0 && c.cta.length > 0, sample.name);
    assert.ok(c.ribbon.length <= 18, `${sample.name} ribbon too long: ${c.ribbon}`);
  }
});

test('no card copy carries a date, an em dash or a handle', () => {
  for (const sample of FLEX_SAMPLES) {
    const text = copy.flexCopy(sample.kind, sample.payload).a11y;
    assert.doesNotMatch(text, MONTHS, sample.name);
    assert.doesNotMatch(text, DATE_LIKE, sample.name);
    assert.doesNotMatch(text, /—/, sample.name);
    assert.doesNotMatch(text, /@/, sample.name);
  }
});

test('names are scrubbed of handles, emails, links and long numbers, and clamped', () => {
  assert.equal(copy.cleanName('Golden Churro @kiddo_22'), 'Golden Churro');
  assert.equal(copy.cleanName('Wishing Star mom@example.com'), 'Wishing Star');
  assert.equal(copy.cleanName('Star https://evil.example/x'), 'Star');
  assert.equal(copy.cleanName('Call 4075551234 now'), 'Call now');
  assert.ok(copy.cleanName('x'.repeat(80)).length <= 34);
  const c = copy.flexCopy('fright_night', { cardTitle: 'Fin-ister Nights 2026', headline: '6 haunts survived! @sam', haunts: 6, statLines: ['see www.x.com'] });
  assert.doesNotMatch(c.a11y, /@sam|www\./);
});

test('the percent-of-players line only shows when it is a real brag', () => {
  assert.equal(copy.ownedLine(0.03), 'Only 3% of players have this');
  assert.equal(copy.ownedLine(0.004), 'Under 1% of players have this');
  assert.equal(copy.ownedLine(0.25), 'Only 25% of players have this');
  assert.equal(copy.ownedLine(0.26), null);
  assert.equal(copy.ownedLine(null), null);
  assert.equal(copy.ownedLine(Number.NaN), null);
  assert.equal(copy.ownedLine(-1), null);
  const common = copy.flexCopy('find', { itemName: 'Pretzel', artUrl: 'x', rarity: 1, ownedPct: 0.9 });
  assert.equal(common.stat, 'A Common find');
});

test('rarity accepts numbers and names; Frame It! reads as a brag line', () => {
  assert.equal(copy.normalizeRarity('legendary'), 5);
  assert.equal(copy.normalizeRarity(4.2), 4);
  assert.equal(copy.normalizeRarity(9), 1);
  assert.equal(copy.flexCopy('ride_photo', { itemName: 'Star', artUrl: 'x', rarity: 5, grade: 'frame_it' }).stat, 'Frame It! on a Legendary');
  assert.equal(copy.flexCopy('ride_photo', { itemName: 'Star', artUrl: 'x', rarity: 4, grade: 'great' }).stat, 'Great shot on an Epic');
});

test('shouldFlexReveal saves the full-screen moment for real brags', () => {
  const yes = (kind, payload) => assert.equal(copy.shouldFlexReveal(kind, payload), true, `${kind} ${JSON.stringify(payload)}`);
  const no = (kind, payload) => assert.equal(copy.shouldFlexReveal(kind, payload), false, `${kind} ${JSON.stringify(payload)}`);
  yes('find', { rarity: 3 }); no('find', { rarity: 2 }); yes('find', { rarity: 1, goldenHour: true });
  yes('ride_photo', { grade: 'frame_it', rarity: 1 }); no('ride_photo', { grade: 'good', rarity: 5 });
  yes('coin_level', { level: 5 }); no('coin_level', { level: 4 });
  yes('standings', { rank: 3 }); yes('standings', { percentile: 10 }); no('standings', { percentile: 40 });
  yes('streak', { days: 7 }); no('streak', { days: 8 });
  yes('level_up', { level: 20 }); no('level_up', { level: 21 });
  yes('fright_night', { haunts: 3 }); no('fright_night', { haunts: 2 });
  yes('crowned', {}); yes('set_complete', {});
});

test('the queue shows one request at a time, drops instant duplicates, and advances on finish', () => {
  store.__resetFlexQueue();
  let changes = 0;
  const off = store.subscribeFlex(() => { changes += 1; });
  store.flexReveal('find', { itemName: 'A', artUrl: 'x', rarity: 5 }, { surface: 'earn' });
  store.flexReveal('find', { itemName: 'A', artUrl: 'x', rarity: 5 }, { surface: 'earn' });
  store.shareFlex('stamp', { name: 'B', artUrl: 'y', rarity: 3 }, { surface: 'stamp_book' });
  const first = store.currentFlex();
  assert.equal(first.mode, 'reveal');
  assert.equal(first.kind, 'find');
  store.finishFlex(first.id);
  assert.equal(store.currentFlex().kind, 'stamp');
  store.finishFlex(store.currentFlex().id);
  assert.equal(store.currentFlex(), null);
  assert.equal(changes, 4);
  off();
});

test('share events carry only snake_case tokens and a clamped rarity, never free text', () => {
  posted.length = 0;
  track.trackShare({ kind: 'find', surface: 'collection_book', format: 'story', action: 'shared', activity: 'instagram', rarity: 5 });
  track.trackShare({ kind: 'find', surface: 'Hi Sam!', format: 'story', action: 'shared' });
  track.trackShare({ kind: 'stamp', surface: 'earn', format: 'square', action: 'opened', activity: 'com.apple.Mail stuff', rarity: 9 });
  assert.equal(posted.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(posted[0])), { kind: 'find', surface: 'collection_book', format: 'story', action: 'shared', activity: 'instagram', rarity: 5 });
  assert.equal(posted[1].activity, null);
  assert.equal(posted[1].rarity, null);
  assert.ok(telemetryCalls.every(([category]) => category === 'share'));
});

test('export sizes are exactly 1080x1920 and 1080x1080 at every density', () => {
  for (const density of [1, 2, 3]) {
    const story = capture.flexCaptureSize('story', 'ios', density);
    const square = capture.flexCaptureSize('square', 'ios', density);
    assert.equal(Math.round(story.width * density), 1080); assert.equal(Math.round(story.height * density), 1920);
    assert.equal(Math.round(square.width * density), 1080); assert.equal(Math.round(square.height * density), 1080);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(capture.flexCaptureSize('story', 'android', 2.75))), { width: 1080, height: 1920 });
});

test('the iOS share sheet reports the destination as a short label; dismissal is not a share', async () => {
  shared.result = { action: 'sharedAction', activityType: 'com.burbn.instagram.shareextension' };
  assert.deepEqual(JSON.parse(JSON.stringify(await capture.openShareSheet('file:///tmp/a.jpg'))), { shared: true, activity: 'instagram' });
  shared.result = { action: 'dismissedAction' };
  assert.deepEqual(JSON.parse(JSON.stringify(await capture.openShareSheet('file:///tmp/a.jpg'))), { shared: false, activity: null });
  assert.equal(capture.activityLabel('com.apple.UIKit.activity.SaveToCameraRoll'), 'save_photo');
  assert.equal(capture.activityLabel('com.zhiliaoapp.musically.ShareExtension'), 'tiktok');
  assert.equal(capture.activityLabel('com.apple.UIKit.activity.Message'), 'messages');
  assert.equal(capture.activityLabel(null), null);
});

/* ---------------- Round 2: privacy locks ---------------- */
const fs = require('node:fs');
const pathMod = require('node:path');
const repo = pathMod.resolve(__dirname, '../..');
const { PLACE_NAMES } = loadTs('src/share/placeNames.ts');
const REAL_PLACES = [
  'Magic Kingdom', 'EPCOT', 'Epic Universe', 'Universal Studios Florida', 'Universal Studios Hollywood', 'Disneyland',
  'Islands of Adventure', 'Volcano Bay', 'Animal Kingdom', 'Hollywood Studios', 'California Adventure',
  'Space Mountain', 'Revenge of the Mummy', 'Haunted Mansion', 'Harry Potter and the Forbidden Journey', 'VelociCoaster',
  "Hagrid's Magical Creatures Motorbike Adventure", 'Pirates of the Caribbean', 'Big Thunder Mountain Railroad',
  'TRON Lightcycle / Run', 'Rise of the Resistance', 'Halloween Horror Nights',
];

/** Every string reachable in a payload, replaced with `value` (arrays and nested objects too). */
function poison(payload, value) {
  if (typeof payload === 'string') return value;
  if (Array.isArray(payload)) return payload.map(item => poison(item, value));
  if (payload && typeof payload === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(payload)) {
      out[key] = /url|art|uri|Url|Uri|rarity|grade|difficulty|source|inventory/.test(key) ? item : poison(item, value);
    }
    return out;
  }
  return payload;
}

test('the place list covers every real park and the rides we test with', () => {
  const lower = new Set(PLACE_NAMES.map(name => name.toLowerCase()));
  for (const place of REAL_PLACES) assert.ok(lower.has(place.toLowerCase()) || PLACE_NAMES.some(name => place.toLowerCase().includes(name.toLowerCase())), place);
});

test('no park or ride name reaches any card text, through any text field of any kind', () => {
  for (const sample of FLEX_SAMPLES) {
    for (const place of REAL_PLACES) {
      for (const wrap of [place, `${place} Edition`, `My night at ${place}!`, place.toUpperCase()]) {
        const c = copy.flexCopy(sample.kind, poison(sample.payload, wrap));
        const text = [c.ribbon, c.kicker, c.title, c.big, c.stat, c.sub, c.cta, c.a11y].filter(Boolean).join(' | ').toLowerCase();
        assert.ok(!text.includes(place.toLowerCase()), `${sample.name} leaked "${place}" via "${wrap}": ${text}`);
        assert.ok(c.title.length > 0, `${sample.name} lost its title`);
      }
    }
  }
});

test('the sanitizer strips place names but keeps catalog words that only look similar', () => {
  assert.equal(copy.cleanName('6 haunts survived at Universal Studios Florida!'), '6 haunts survived!');
  assert.equal(copy.cleanName('Hogwarts Express Edition'), 'Edition');
  assert.equal(copy.cleanName('Mummy Dog'), 'Mummy Dog');
  assert.equal(copy.cleanName('Sand Castle'), 'Sand Castle');
  assert.equal(copy.cleanName('Pirate King'), 'Pirate King');
});

test('Park Day shares only coin counts and coin art: never park, day, rides, moments or the player', () => {
  const { parkDayFlexPayload } = loadTs('src/share/parkDay.ts');
  const recap = {
    park_id: 3, park_name: 'Universal Studios Florida', park_day: '2026-10-02', previous_active_day: '2026-10-01', timezone: 'America/New_York',
    distinct_rides_won: 7, new_coins: 3, ride_wins: 7, line_play_sessions: 2, eligible_line_minutes: 36, ride_parts_earned: 4, coin_upgrades: 1,
    park_project_points: 5, username: 'kiddo_22',
    coins: [{ asset_id: 1, ride_name: 'Revenge of the Mummy', coin_url: 'https://cdn.example/a.png', new: true }, { asset_id: 2, ride_name: 'Hulk', coin_url: null, new: false }],
    moments: [{ type: 'new_coin', title: 'Collected Revenge of the Mummy coin', at: '2026-10-02T14:10:00Z' }],
  };
  const payload = JSON.parse(JSON.stringify(parkDayFlexPayload(recap)));
  assert.deepEqual(Object.keys(payload).sort(), ['coinUrls', 'coinsCaught', 'newCoins']);
  assert.deepEqual(payload, { coinsCaught: 7, newCoins: 3, coinUrls: ['https://cdn.example/a.png'] });
  const json = JSON.stringify(payload);
  for (const leak of ['Universal', 'Mummy', 'Hulk', '2026', 'kiddo', 'America/']) assert.ok(!json.includes(leak), leak);

  const card = fs.readFileSync(pathMod.join(repo, 'src/screens/ParkDayRecapCard.tsx'), 'utf8');
  assert.match(card, /shareFlex\('park_day', parkDayFlexPayload\(recap\), \{ surface: 'park_day' \}\)/);
  assert.doesNotMatch(card, /AuthContext|username|avatar_url|captureRef|ParkDayShareCard/);
  assert.equal(card.match(/shareFlex\(/g).length, 1);
});

test('park-identifying reveals wait until the player leaves the park; re-share never waits', () => {
  store.__resetFlexQueue();
  assert.equal(store.holdWhileInPark({ mode: 'reveal', kind: 'park_day' }, true), true);
  assert.equal(store.holdWhileInPark({ mode: 'reveal', kind: 'ride_coin' }, true), true);
  assert.equal(store.holdWhileInPark({ mode: 'reveal', kind: 'ride_coin' }, false), false);
  assert.equal(store.holdWhileInPark({ mode: 'sheet', kind: 'park_day' }, true), false);
  assert.equal(store.holdWhileInPark({ mode: 'reveal', kind: 'find' }, true), false);
  store.flexReveal('park_day', { coinsCaught: 3, coinUrls: [] }, { surface: 'earn' });
  store.holdFlex(store.currentFlex().id);
  store.flexReveal('park_day', { coinsCaught: 5, coinUrls: [] }, { surface: 'earn' });
  store.holdFlex(store.currentFlex().id);
  assert.equal(store.currentFlex(), null);
  store.releaseHeldFlex();
  assert.equal(store.currentFlex().payload.coinsCaught, 5, 'only the latest park day replays');
  store.finishFlex(store.currentFlex().id);
  assert.equal(store.currentFlex(), null);
});

test('outlined text is sized once: a single line fits its box, never grows, never below half', () => {
  const { fitScale } = loadTs('src/share/Outlined.tsx', {
    react: { useId: () => 'x', useState: v => [v, () => {}] }, 'react/jsx-runtime': { jsx() {}, jsxs() {} },
    'react-native': { StyleSheet: { create: s => s, flatten: s => s }, Text: 'Text', View: 'View' },
    './FlexArtwork': { useReadyGate() {} },
  });
  assert.equal(fitScale(100, 200), 0.5);
  assert.equal(fitScale(150, 200), 0.75);
  assert.equal(fitScale(300, 200), 1);
  assert.equal(fitScale(100, 1000), 0.5);
  assert.equal(fitScale(0, 200), 1);
  const src = fs.readFileSync(pathMod.join(repo, 'src/share/Outlined.tsx'), 'utf8');
  assert.doesNotMatch(src, /adjustsFontSizeToFit/, 'no outline copy may fit itself');
});
