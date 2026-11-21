'use strict';
/**
 * Fix pass w4, lane home (Nov 18 2026): the home guide always has one true next thing, and the park day counts
 * come from the server. Each test fails on 11f2e5f8 (the merged w3 build) and passes with the fix.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const H = loadTs('src/services/guide/homeNext.ts');
const read = rel => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

const base = (extra = {}) => ({
  levelUp: null, readyReward: null, daily3: null,
  treats: { onMap: 0, toTicket: null, capped: false },
  limited: null, parts: null, practice: false,
  park: { parkName: 'Disneyland', tickets: 3, plan: null },
  welcomeBack: false,
  ...extra,
});
const coinRef = (name, extra = {}) => ({ name, coinUrl: `https://x/${name}.png`, assetId: 41, parkId: 8, ...extra });
const goal = (kind, title, extra = {}) => ({ kind, park: false, target: 1, progress: 0, done: false, title, hint: '', ...extra });

test('T007: every home state has exactly one next thing with one working button, never a list and never nothing', () => {
  const states = [
    base(),
    base({ practice: true, park: { parkName: 'Disneyland', tickets: 3, plan: coinRef('Space Mountain') } }),
    base({ park: { parkName: null, tickets: 0, plan: coinRef('Space Mountain') } }),
    base({ treats: { onMap: 0, toTicket: 2, capped: false } }),
    base({ treats: { onMap: 4, toTicket: null, capped: true } }),
  ];
  for (const s of states) {
    const step = H.homeNextStep(s);
    assert.ok(step.copy.title, `a title for ${step.key}`);
    assert.ok(step.copy.button && step.copy.button.label, `one button for ${step.key}`);
    assert.equal(step.copy.secondary, null, 'one choice only');
    assert.equal(step.action, step.copy.button.action, 'the button does what the step says');
    assert.doesNotMatch(`${step.copy.title} ${step.copy.line ?? ''}`, /nothing|come back later/i);
  }
});

test('T007: a whole evening walks the steps in order, one at a time, each one true for the player now', () => {
  const plan = coinRef('Space Mountain', { assetId: 7 });
  let s = base({
    levelUp: coinRef('Haunted Mansion'),
    readyReward: { key: 'daily_chest', title: 'Daily Chest', line: 'Day 2 of 7 is ready' },
    daily3: { goals: [goal('chest', 'Open your daily chest', { done: true }), goal('catch', 'Win 2 ride coins', { park: true, target: 2 }),
      goal('look', 'Wear something new')], done: 1, total: 3 },
    treats: { onMap: 5, toTicket: 2, capped: false },
    limited: { ...coinRef('Holiday Coaster', { assetId: 99 }), leavesOn: '2026-11-30' },
    parts: { ...coinRef('Autopia', { assetId: 12 }), partsToGo: 2, levelName: 'Shiny' },
    practice: true,
    park: { parkName: 'Disneyland', tickets: 3, plan: null },
    veteran: true,
  });
  const seen = [];
  const take = () => { const step = H.homeNextStep(s); seen.push(step.key); return step; };

  let step = take();
  assert.equal(step.key, 'level_up');
  assert.equal(step.copy.button.label, 'LEVEL UP');
  assert.equal(step.coin.name, 'Haunted Mansion');
  s = { ...s, levelUp: null };

  step = take();
  assert.equal(step.key, 'reward');
  assert.equal(step.action, 'rewards');
  assert.equal(step.art, 'chest');
  assert.equal(step.copy.title, 'Daily Chest');
  s = { ...s, readyReward: null };

  // The park catch goal at home is "Find 2 treats" (its home side) and comes first, with treats on the map.
  step = take();
  assert.equal(step.key, 'daily3');
  assert.equal(step.copy.kicker, 'DAILY 3');
  assert.equal(step.copy.title, 'Find 2 treats');
  assert.equal(step.action, 'find');
  assert.equal(step.copy.line, '1 of 3 done · This one: 0 of 2');
  s = { ...s, daily3: { ...s.daily3, goals: [s.daily3.goals[0], { ...s.daily3.goals[1], done: true }, s.daily3.goals[2]], done: 2 } };

  step = take();
  assert.equal(step.copy.title, 'Wear something new');
  assert.equal(step.action, 'closet');
  s = { ...s, daily3: null };

  // Limited coins lead the treats (they leave on a set day). Arcade plan (Nov 20): a count, never one coin's name,
  // and SEE opens the park's Limited tab.
  step = take();
  assert.equal(step.key, 'limited');
  assert.equal(step.copy.title, '1 limited coin at Disneyland');
  assert.doesNotMatch(`${step.copy.title} ${step.copy.line}`, /Holiday Coaster/);
  assert.equal(step.action, 'limited');
  assert.equal(step.coin.assetId, null);
  s = { ...s, limited: null };

  // A veteran with no coin planned plans before the treats.
  step = take();
  assert.equal(step.key, 'plan');
  assert.equal(step.copy.line, 'Pick any coin on your shelf');
  s = { ...s, park: { ...s.park, plan: coinRef('Holiday Coaster', { assetId: 99 }) } };

  step = take();
  assert.equal(step.key, 'treat');
  assert.equal(step.copy.line, '2 more treats = 1 Ticket');
  assert.equal(step.copy.button.label, 'FIND');
  s = { ...s, treats: { onMap: 5, toTicket: 3, capped: true } };

  step = take();
  assert.equal(step.key, 'parts');
  assert.equal(step.copy.line, 'Wait in any ride\'s line to grow its coin', 'no coin named (Dustin, Nov 20)');
  assert.doesNotMatch(step.copy.title, /Autopia/);
  s = { ...s, parts: null };

  step = take();
  assert.equal(step.key, 'practice');
  assert.equal(step.action, 'practice');
  assert.equal(step.copy.line, 'Just for fun. 3 Tickets ready for Disneyland');
  s = { ...s, practice: false };

  step = take();
  assert.equal(step.key, 'park_day');
  assert.equal(step.copy.title, 'Disneyland: 3 Tickets ready');
  assert.equal(step.copy.line, 'Your pick: Holiday Coaster', 'the player\'s own pick only');
  assert.equal(step.action, 'plan');
  assert.deepEqual(seen, ['level_up', 'reward', 'daily3', 'daily3', 'limited', 'plan', 'treat', 'parts', 'practice', 'park_day']);
});

test('T007: the Daily 3 "Pick your next coin" goal opens the park day plan picker', () => {
  const d3 = { goals: [goal('plan', 'Pick your next coin')], done: 2, total: 3 };
  const step = H.homeNextStep(base({ daily3: d3 }));
  assert.equal(step.key, 'daily3');
  assert.equal(step.action, 'plan');
  assert.equal(step.copy.line, '2 of 3 done');
});

test('T007: a fresh player sees the treat meter with treats near, then PLAN, never a park-only goal or a dead FIND', () => {
  const fresh = base({ treats: { onMap: 6, toTicket: 3, capped: false }, park: { parkName: null, tickets: 0, plan: null } });
  assert.equal(H.homeNextStep(fresh).copy.line, '3 more treats = 1 Ticket');
  // No treat on the map: FIND would glide nowhere, so PLAN leads.
  const none = H.homeNextStep({ ...fresh, treats: { onMap: 0, toTicket: 3, capped: false } });
  assert.equal(none.key, 'plan');
  assert.equal(none.copy.title, '0 Tickets ready');
  assert.equal(none.copy.line, 'Pick any coin on your shelf');
  // A park-only Daily 3 goal waits for the park day; a treat goal with no treats on the map is skipped.
  const d3 = { goals: [goal('play', 'Win 2 ride games', { park: true, target: 2 }), goal('catch', 'Find 2 treats', { target: 2 })], done: 0, total: 3 };
  assert.equal(H.homeNextStep({ ...fresh, daily3: d3, treats: { onMap: 0, toTicket: 3, capped: false } }).key, 'plan');
});

test('T007: limited and Ride Parts coins come from the real shelf data', () => {
  const tasks = [
    { name: 'Holiday Coaster', asset_id: 99, coin_url: 'a', limited: { active: true, ends_on: '2026-11-30', ends_at: null, returns: true } },
    { name: 'Winter Swirl', asset_id: 98, coin_url: 'b', limited: { active: true, ends_on: '2026-11-25', ends_at: null, returns: true } },
    { name: 'Gone Coaster', asset_id: 97, coin_url: 'c', limited: { active: false, ends_on: null, ends_at: null, returns: true } },
  ];
  assert.equal(H.homeLimitedCoin(tasks, new Set(), 8).name, 'Winter Swirl', 'the one leaving soonest');
  assert.equal(H.homeLimitedCoin(tasks, new Set([98]), 8).name, 'Holiday Coaster', 'never one already on the shelf');
  assert.equal(H.homeLimitedCoin(tasks, new Set([98, 99]), 8), null);
  const c = (id, have, need, extra = {}) => ({ id, ride_name: `Ride ${id}`, park_id: 8, is_unlocked: true, current_level: 1, max_level: 3,
    available_parts: have, parts_to_next_level: need, ...extra });
  assert.equal(H.homePartsCoin([c(1, 0, 5), c(2, 2, 3), c(3, 3, 3)]).assetId, 2, 'closest with Parts still to get (a ready coin is the level-up step)');
  assert.equal(H.homePartsCoin([c(1, 0, 5, { current_level: 3 })]), null, 'a maxed coin needs nothing');
});

test('T007: the home map wires the step, its art and its buttons (practice, FIND, Rewards)', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /homeNextStep\(\{ \.\.\.homeGuide\.next,\n\s+treats: \{ onMap: treatsOnMap, toTicket: ticket\.until, capped: ticket\.capped \} \}\)/);
  assert.match(home, /if \(action === 'practice'\) \{ setArcadeOpen\(true\); return; \}/);
  assert.match(home, /if \(action === 'find'\) \{ setOwnHighlight\(Date\.now\(\)\); return; \}/);
  assert.match(home, /onCardPress=\{homeCopy\.button \? \(\) => onHomeAction\(homeCopy\.button!\.action\) : undefined\}/, 'a tap on the card is its button');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /case 'rewards': openRewards\(\); return;/);
  assert.match(explore, /readyReward: retention\.homeNext\?\.readyReward \?\? null,/);
  assert.match(read('src/components/retention/useRetention.tsx'), /const readyRow = settledSummary\.count > 0 \? rows\.find\(r => r\.ready > 0 && r\.action != null\) \?\? null : null;/,
    'the card and the Rewards button agree on what is ready');
});

test('T198: the park day counts come from the server: every won attempt, every wait and the rides logged', () => {
  const C = loadTs('src/services/guide/parkDayCounts.ts');
  const old = { distinct_rides_won: 1, line_play_sessions: 1, eligible_line_minutes: 2, ride_parts_earned: 0 };
  const core = { ...old, coins_won: 4, waits: 2, rides_ridden: 1 };
  // The goodbye: the phone saw 3, the server counted 4.
  assert.equal(C.goodbyeCoins(3, { coins_won: 4 }), 4);
  assert.equal(C.goodbyeCoins(3, null), 3, 'no answer yet: the phone count');
  assert.equal(C.goodbyeCoins(3, {}), 3, 'an older server: the phone count');
  assert.equal(C.recapWins(core), 4);
  assert.equal(C.recapWins(old), 1);
  assert.equal(C.recapLineCopy(core), '2 waits · 2 minutes in line · 0 Ride Parts');
  assert.equal(C.recapLineCopy(old), '2 minutes in line · 0 Ride Parts', 'older server: as before');
  assert.equal(C.recapLineCopy({ ...core, waits: 0, line_play_sessions: 0 }), null);
  assert.equal(C.recapRidesCopy(core), '1 ride ridden');
  assert.equal(C.recapRidesCopy(old), null);
  const guide = read('src/components/guide/useNextCoinGuide.ts');
  assert.match(guide, /leaving: leaving \? \{ parkName: leavingFrom\?\.parkName \?\? null,\n\s+coins: goodbyeWon \} : null,/);
  assert.match(guide, /getParkDayRecap\(leavingId\)\.then/);
  const card = read('src/screens/ParkDayRecapCard.tsx');
  assert.match(card, /\{recapWins\(recap\)\}<\/Text><Text style=\{styles\.statLabel\}>WINS/);
  assert.match(card, /\{!!lineCopy && <GameRichText/);
});

test('T023: while the first coin is picked the card breathes softly (UI thread, opacity only), still under Reduce Motion and Battery Saver', () => {
  const card = read('src/components/guide/NextCoinCard.tsx');
  assert.match(card, /const breathing = loading && !reduced && ambient;/);
  assert.match(card, /withRepeat\(withTiming\(0\.55, \{ duration: AMBIENT\.breathMs \/ 2, easing: Easing\.bezier\(\.\.\.BEZIER\.inOut\) \}\), -1, true\)/);
  assert.match(card, /<Animated\.View style=\{breathStyle\}><Image source=\{art\}/);
  // Arcade plan (Nov 20): nothing picked is normal, so it breathes only while the map data loads.
  assert.match(read('src/screens/ExploreScreen.tsx'), /loading=\{nextCoin\.loading\}/);
});

test('N11: the ride name under PLAY! is one line, fitted, and a very long name keeps its main words', () => {
  const P = loadTs('src/components/guide/playCaption.ts');
  assert.equal(P.playCaptionName('The Many Adventures of Winnie the Pooh'), 'The Many Adventures of Winnie the Pooh');
  assert.equal(P.playCaptionName('Meet Cinderella and a Visiting Princess at Princess Fairytale Hall'), 'Princess Fairytale Hall');
  assert.equal(P.playCaptionName("Meet Daring Disney Pals as Circus Stars at Pete's Silly Sideshow"), "Pete's Silly Sideshow");
  assert.equal(P.playCaptionName("A Pirate's Adventure ~ Treasures of the Seven Seas"), "A Pirate's Adventure");
  assert.equal(P.playCaptionName('Monsters Unchained: The Frankenstein Experiment'), 'Monsters Unchained');
  assert.equal(P.playCaptionName('Hagrid\'s Magical Creatures Motorbike Adventure'), 'Hagrid\'s Magical Creatures Motorbike Adventure', 'no subtitle: as is, it shrinks');
  for (const n of ['Under the Sea - Journey of The Little Mermaid', 'Harry Potter and the Battle at the Ministry', 'Finding Nemo Submarine Voyage']) {
    assert.ok(P.playCaptionName(n).length <= 45, n);
  }
  const modal = read('src/components/RedeemModal.tsx');
  assert.match(modal, /<Text style=\{styles\.captionText\} numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.7\}>\{playCaptionName\(coin\.name\)\}<\/Text>/);
  assert.match(modal, /accessibilityLabel=\{badge === 'free_try' \? `\$\{coin\.name\}\. Free try today\.`/, 'the spoken label keeps the full name');
});

test('T018: the follow camera fits the shark and a coin within 150 m on iPhone SE; farther coins keep the zoom and the edge arrow', () => {
  const F = loadTs('src/components/map/guideFit.ts');
  const se = { width: 375, height: 520 };
  const pro = { width: 402, height: 680 };
  const lat = 33.8121;
  // On SE, 60 m away does not fit at the default 17.6: the camera eases out just enough.
  const z60 = F.guideFitZoom({ meters: 60, latitude: lat, view: se, followZoom: 17.6 });
  assert.ok(z60 < 17.6 && z60 > 16.5, `SE 60 m: ${z60}`);
  // The coin then sits inside the clear circle: meters per point times radius covers 60 m.
  const mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * 2 ** z60);
  assert.ok(F.fitRadius(se) * mpp >= 59.9);
  // A near coin needs no change; a coin past 150 m keeps the player's zoom (the edge arrow shows the way).
  assert.equal(F.guideFitZoom({ meters: 25, latitude: lat, view: pro, followZoom: 17.6 }), 17.6);
  assert.equal(F.guideFitZoom({ meters: 400, latitude: lat, view: se, followZoom: 17.6 }), 17.6);
  assert.ok(F.guideFitZoom({ meters: 150, latitude: lat, view: se, followZoom: 17.6 }) >= F.FIT_MIN_ZOOM);
  // A player who zoomed out further keeps their zoom (the fit only ever zooms out).
  assert.equal(F.guideFitZoom({ meters: 60, latitude: lat, view: se, followZoom: 15.9 }), 15.9);
  assert.ok(Math.abs(F.fitMeters({ latitude: lat, longitude: -117.919 }, { latitude: lat + 60 / 111320, longitude: -117.919 }) - 60) < 0.5);
  const map = read('src/components/Map.tsx');
  assert.match(map, /const want = guideFitZoom\(\{ meters, latitude: location\.latitude, view: viewSize, followZoom: followZoomRef\.current \}\);/);
  assert.match(map, /fitApplied\.current === null\) followZoomRef\.current =/, 'a fit never becomes the player\'s own zoom');
});
