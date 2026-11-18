'use strict';
/**
 * Fix round w3 (Nov 18, 2026), lane shelf: shelf, Profile and words.
 * Each test fails without its fix (T ids in the names).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('T122: the map, LinePlay, Wait Times and the shelf read one name for each ride', () => {
  const { plainRideName, withPlainField } = loadTs('src/helpers/plainRideName.ts');
  // [coin row on the map and shelf, ride catalog for LinePlay, wait-times feed] as the scratch data spells them.
  const rides = [
    ['Thunder Mountain', 'Big Thunder Mountain Railroad', 'Big Thunder Mountain Railroad', 'Big Thunder Mountain Railroad'],
    ['Tiki Room', "Walt Disney's Enchanted Tiki Room", 'Walt Disney’s Enchanted Tiki Room', 'Enchanted Tiki Room'],
    ['Haunted Mansion', 'Haunted Mansion Holiday', 'Haunted Mansion Holiday', 'Haunted Mansion'],
    ["It's A Small World", '"it\'s a small world"', '“it’s a small world”', "It's a Small World"],
    ['The Many Adventures Of Pooh', 'The Many Adventures of Winnie the Pooh', 'The Many Adventures of Winnie the Pooh', 'The Many Adventures of Winnie the Pooh'],
    ['Pirates', 'Pirates of the Caribbean', 'Pirates of the Caribbean', 'Pirates of the Caribbean'],
    ['Smugglers', 'Millennium Falcon: Smugglers Run', 'Millennium Falcon: Smugglers Run', 'Millennium Falcon: Smugglers Run'],
    ['Astro Blasters', 'Buzz Lightyear Astro Blasters', 'Buzz Lightyear Astro Blasters™', 'Buzz Lightyear Astro Blasters'],
    ['Matterhorn', 'Matterhorn Bobsleds', 'Matterhorn Bobsleds', 'Matterhorn Bobsleds'],
    ['Star Tours', 'Star Tours - The Adventures Continue', 'Star Tours – The Adventures Continue', 'Star Tours'],
    ['Mr. Toad', "Mr. Toad's Wild Ride", "Mr. Toad's Wild Ride", "Mr. Toad's Wild Ride"],
    ['Submarine Voyage', 'Finding Nemo Submarine Voyage', 'Finding Nemo Submarine Voyage', 'Finding Nemo Submarine Voyage'],
    ['Jungle Cruise', 'Jungle Cruise', 'Jungle Cruise', 'Jungle Cruise'],
  ];
  for (const [coin, catalog, feed, want] of rides) {
    assert.equal(plainRideName(coin), want, coin);
    assert.equal(plainRideName(catalog), want, catalog);
    assert.equal(plainRideName(feed), want, feed);
  }
  const rows = withPlainField([{ ride_name: 'Tiki Room', id: 1 }, { ride_name: 'Jungle Cruise', id: 2 }], 'ride_name');
  assert.equal(rows[0].ride_name, 'Enchanted Tiki Room');
  // Every source of ride names passes through it: coins, the catalog, the feed, Ride Coins, the shelf lists, the story.
  for (const file of ['src/api/endpoints/parks/getTasks.ts', 'src/api/endpoints/parks/getSecretTasks.ts',
    'src/api/endpoints/parks/getLimitedTasks.ts', 'src/api/endpoints/parks/getArchivedTasks.ts',
    'src/api/endpoints/players/parks/getCompletedTasks.ts', 'src/api/endpoints/players/parks/getCompletedSecretTasks.ts',
    'src/api/endpoints/players/parks/getCompletedArchivedTasks.ts', 'src/api/endpoints/rides/index.ts',
    'src/api/endpoints/parks/queue-times/getWikiTimes.ts', 'src/api/endpoints/me/current-redeemables.js',
    'src/api/endpoints/me/ride-coins/index.ts', 'src/api/endpoints/me/ride-coins/show.ts', 'src/api/endpoints/me/park-day-recap.ts']) {
    assert.match(read(file), /plainRideName|withPlainNames|withPlainField|withPlainTaskNames/, file);
  }
  assert.doesNotMatch(read('src/screens/parkRideAvailability.ts'), /FEED_ALIASES/, 'no second alias table');
});

test('T132: one park name: the guide, the raid banner, Profile and the story say Disneyland', () => {
  const { parkLabel, shortParkName } = loadTs('src/helpers/parkName.ts');
  assert.equal(parkLabel({ name: 'Disneyland Park' }), 'Disneyland');
  assert.equal(parkLabel({ name: 'Disneyland Park', display_name: 'Disneyland' }), 'Disneyland');
  assert.equal(parkLabel({ name: 'Disney California Adventure Park' }), 'California Adventure');
  assert.equal(parkLabel({ name: "Universal's Islands of Adventure" }), 'Islands of Adventure');
  assert.equal(shortParkName('Universal Studios Hollywood'), 'Universal Studios Hollywood');
  assert.match(read('src/components/guide/useMapGuide.ts'), /parkName: park \? parkLabel\(park\) : null/);
  assert.match(read('src/components/home/HomeLive.tsx'), /\{parkLabel\(park\)\}<\/Text>/);
  assert.match(read('src/screens/ParkDayRecapCard.tsx'), /shortParkName\(recap\.park_name\)/);
});
