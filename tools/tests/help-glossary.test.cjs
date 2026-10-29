const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const glossary = loadTs('src/services/help/glossary.ts');
const topics = loadTs('src/services/help/helpTopics.ts');
const icons = loadTs('src/ui/iconNames.ts');

// Every term Dustin listed as undefined for a new player, plus what the audit found.
const REQUIRED = ['tickets', 'ride_parts', 'energy', 'coins', 'ride_coins', 'coin_levels', 'limited_coins', 'lineplay',
  'ride_passport', 'coin_guide', 'adventure_ticket', 'park_goal', 'stamps', 'sets', 'pins', 'home_finds',
  'rescue_pass', 'crew', 'standings', 'keys', 'swords', 'travel_mode', 'ride_control', 'daily_chest', 'day_streak',
  'supplies', 'bonus_ads', 'vip'];

test('the glossary covers every currency and game word a new player meets', () => {
  for (const key of REQUIRED) assert.ok(glossary.LOCAL_GLOSSARY[key], key);
  for (const key of glossary.GLOSSARY_KEYS) {
    const term = glossary.LOCAL_GLOSSARY[key];
    assert.equal(term.key, key);
    assert.ok(icons.isGameIconName(term.icon), `${key} uses a kit icon`);
    assert.ok(term.label && term.what && term.earn, `${key} has a name, what and how`);
    assert.ok(topics.helpTopic(term.topic), `${key} points at a How to play card`);
    for (const line of [term.label, term.what, term.earn]) {
      assert.doesNotMatch(line, /—/, `${key}: no em dashes`);
      assert.ok(line.length <= 160, `${key}: short`);
    }
  }
});

test('one name per thing: the glossary never uses a retired name', () => {
  const all = glossary.GLOSSARY_KEYS.map(key => {
    const term = glossary.LOCAL_GLOSSARY[key];
    return `${term.label} ${term.what} ${term.earn}`;
  }).join(' ');
  for (const retired of [/Park Coins/, /\bstamina\b/i, /\btokens?\b/i, /Shark Store/, /queue adventure/i, /\bLine Play\b/, /\bprep items?\b/i, /\bhome finds?\b/i, /\bsnacks?\b/i, /Power Up/i, /\bboss/i, /Day streak/]) {
    assert.doesNotMatch(all, retired, String(retired));
  }
});

test('every pill and badge spelling maps to one glossary term', () => {
  const cases = {
    Coins: 'coins', 'Shark Coins': 'coins', Tickets: 'tickets', 'Park Tickets': 'tickets', 'park ticket': 'tickets',
    Keys: 'keys', Energy: 'energy', Swords: 'swords', 'Ride Parts': 'ride_parts', Parts: 'ride_parts',
    'LinePlay Parts': 'ride_parts', 'Ride Coin': 'ride_coins', 'Shark Rescue Pass': 'rescue_pass', XP: 'xp',
    'Day streak': 'day_streak', 'Line Play': 'lineplay', LinePlay: 'lineplay', 'Travel Mode': 'travel_mode',
    '  shark   coins ': 'coins', ride_parts: 'ride_parts',
  };
  for (const [name, key] of Object.entries(cases)) assert.equal(glossary.glossaryKeyForName(name), key, name);
  for (const unknown of [undefined, null, '', 'Mystery Gems', 'Halloween Candy']) {
    assert.equal(glossary.glossaryKeyForName(unknown), null, String(unknown));
  }
});

test('server currency wording wins, but only for known currencies and clean strings', () => {
  const merged = glossary.mergeServerGlossary(glossary.LOCAL_GLOSSARY, {
    currencies: [
      { key: 'tickets', label: 'Park Tickets', what: 'Each ride challenge costs one Ticket.', earn: 'Home finds (up to 4 a day), plus your day 7 chest.' },
      { key: 'coins', label: '', what: 42, earn: 'Catch ride coins — and win raids.' },
      { key: 'swords', label: 'Hacked', what: 'x', earn: 'y' },
      { key: 'not_a_term', label: 'Nope' },
      null, 'junk',
    ],
    energy_rule: 'Energy powers boss raids and coin upgrades. It never runs out on a timer.',
  });
  assert.equal(merged.tickets.earn, 'Home finds (up to 4 a day), plus your day 7 chest.');
  assert.equal(merged.coins.label, 'Shark Coins', 'an empty label keeps the local one');
  assert.equal(merged.tickets.label, 'Tickets', 'an old server name becomes the glossary name');
  assert.equal(merged.coins.what, glossary.LOCAL_GLOSSARY.coins.what, 'a non-string keeps the local line');
  assert.equal(merged.coins.earn, 'Catch ride coins, and win raids.', 'an em dash from the server is cleaned');
  assert.equal(merged.swords.label, 'Swords', 'only the six server currencies can be overridden');
  assert.equal(merged.not_a_term, undefined);
  assert.match(merged.energy.earn, /never runs out on a timer/);
  assert.equal(merged.tickets.icon, 'ticket', 'icons and topics stay local');
  // A missing or broken payload never throws and keeps everything local.
  for (const payload of [undefined, null, {}, { currencies: 'nope' }]) {
    assert.deepEqual(plain(glossary.mergeServerGlossary(glossary.LOCAL_GLOSSARY, payload)), plain(glossary.LOCAL_GLOSSARY));
  }
});

test('the server glossary still serves every currency the app overlays (EconomyGlossary.php)', () => {
  const php = ['../tps-prime-time-backend', '../../tps-prime-time-backend']
    .map(dir => path.resolve(root, dir, 'app/Domains/Shared/EconomyGlossary.php')).find(file => fs.existsSync(file));
  if (!php) return; // Backend checkout not present on this machine.
  const keys = [...fs.readFileSync(php, 'utf8').matchAll(/'key'\s*=>\s*'([a-z_]+)'/g)].map(match => match[1]);
  for (const key of glossary.SERVER_CURRENCY_KEYS) assert.ok(keys.includes(key), `server still serves ${key}`);
});

test('a balance line reads naturally', () => {
  assert.equal(glossary.balanceLine({ label: 'Shark Coins' }, 1377), 'You have 1377 Shark Coins.');
  assert.equal(glossary.balanceLine({ label: 'Energy' }, -3), 'You have 0 Energy.');
  assert.equal(glossary.balanceLine({ label: 'Energy' }, null), null);
  assert.equal(glossary.balanceLine({ label: 'Energy' }, Number.NaN), null);
});

test('How to play cards are short, cover every term, and the "?" sheets are never empty', () => {
  const covered = new Set();
  for (const topic of topics.HELP_TOPICS) {
    assert.ok(topic.lines.length >= 1 && topic.lines.length <= 2, topic.id);
    for (const line of topic.lines) {
      assert.doesNotMatch(line, /—/);
      assert.ok(line.split(/(?<=[.!?])\s+/).length <= 2, `${topic.id}: two sentences at most per line`);
    }
    topic.terms.forEach(key => { assert.ok(glossary.LOCAL_GLOSSARY[key], key); covered.add(key); });
  }
  for (const key of glossary.GLOSSARY_KEYS) {
    const term = glossary.LOCAL_GLOSSARY[key];
    assert.ok(covered.has(key) || topics.helpTopic(term.topic), key);
  }
  // Every old information-modal id, and no id at all, gets a local help sheet.
  const sheets = loadTs('src/services/help/helpSheets.ts');
  for (const id of [1, 2, 3, 4, 5, undefined, 99]) assert.ok(sheets.helpSheetForInfoModal(id).pages.length > 0, String(id));
  assert.equal(sheets.helpSheetForInfoModal(5).id, 'standings');
});

test('every one-time tip and mini-game intro has copy without em dashes', () => {
  for (const [id, copy] of Object.entries(topics.TIP_COPY)) {
    assert.ok(copy.title && copy.body, id);
    assert.doesNotMatch(copy.title + copy.body, /—/, id);
    assert.ok(copy.body.length <= 140, `${id} fits a coach mark`);
  }
  for (const kind of ['tap', 'timing', 'memory', 'trivia', 'shark', 'banana', 'photo', 'current']) {
    const intro = topics.GAME_INTROS[kind];
    assert.ok(intro.name && intro.how && intro.win, kind);
    assert.equal(topics.gameIntroTip(kind), `game:${kind}`);
  }
  // The selector's game types all have an intro card.
  const selector = fs.readFileSync(path.join(root, 'src/components/MiniGameSelector.tsx'), 'utf8');
  const types = selector.match(/type MiniGameType = ([^;]+);/)[1].match(/'([a-z]+)'/g).map(value => value.slice(1, -1));
  for (const kind of types) assert.ok(topics.GAME_INTROS[kind], `intro for ${kind}`);
});

test('the Supplies shop and ad offers are explained: optional, what is sold, never Ride Parts', () => {
  const supplies = glossary.LOCAL_GLOSSARY.supplies;
  const ads = glossary.LOCAL_GLOSSARY.bonus_ads;
  assert.match(supplies.earn, /never sold/);
  assert.match(ads.what + ads.earn, /[Oo]ptional|costs nothing/);
  assert.equal(glossary.glossaryKeyForName('Supplies'), 'supplies');
  assert.ok(topics.TIP_COPY.supplies_tab && topics.TIP_COPY.bonus_ads);
  assert.match(topics.TIP_COPY.bonus_ads.body, /lose nothing/);
  // The Shark Shop "?" opens the shop sheet, which says Supplies are for grown-ups and ads are optional.
  const shop = loadTs('src/services/help/helpSheets.ts').helpSheetForInfoModal(3);
  assert.equal(shop.id, 'shop');
  const shopText = shop.pages.flatMap(page => page.points.map(point => point.text)).join(' ');
  assert.match(shopText, /grown-up/);
  // No ad talk while no player can see an ad (round 2).
  assert.doesNotMatch(shopText, /\bads?\b/i);
  assert.match(shopText, /never need them to win a ride coin/);
});

test('no help text mentions ads or a monthly plan while nobody can see an ad (round 2)', () => {
  assert.equal(topics.ADS_IN_HELP, false);
  const shop = topics.helpTopic('shop');
  assert.doesNotMatch(shop.title + ' ' + shop.lines.join(' '), /\bads?\b/i);
  assert.equal(shop.terms.includes('bonus_ads'), false, 'the Bonus ads term is hidden');
  const vip = glossary.LOCAL_GLOSSARY.vip.what;
  assert.doesNotMatch(vip, /\bads?\b|monthly/i);
  assert.match(vip, /grown-up/);
  for (const topic of topics.HELP_TOPICS) {
    for (const key of topic.terms) assert.doesNotMatch(glossary.LOCAL_GLOSSARY[key].what + glossary.LOCAL_GLOSSARY[key].earn, /\bads?\b/i, key);
  }
});

test('one streak number: the stats menu shows the Daily Chest streak, and the help says that rule', () => {
  const fs2 = require('node:fs');
  const p2 = require('node:path');
  const radial = fs2.readFileSync(p2.join(__dirname, '../../src/components/RadialStatsMenu.tsx'), 'utf8');
  assert.doesNotMatch(radial, /current_streak/, 'not the hidden home-find streak (a second number)');
  assert.match(radial, /useFlameStreak\(dailyGift\?\.streak, isOpen\)/, 'the chest number, or Daily 3 while it owns the flame');
  const chest = fs2.readFileSync(p2.join(__dirname, '../../src/components/DailyGiftModal.tsx'), 'utf8');
  assert.match(chest, /displayedGift\.streak/, 'the chest shows the same number');
  assert.match(glossary.LOCAL_GLOSSARY.day_streak.earn, /Daily Chest/);
});

test('one flame number: Daily 3 owns the flame while it is on, and ride days never use it (round 2)', () => {
  const fs2 = require('node:fs');
  const p2 = require('node:path');
  const readSrc = f => fs2.readFileSync(p2.join(__dirname, '../../', f), 'utf8');
  const flags = loadTs('src/services/retention/flags.ts', { '../../api/endpoints/platform/feature-flags': { default: async () => ({ flags: {} }) } });
  assert.equal(flags.streakOwner(null), null);
  assert.equal(flags.streakOwner({ dailyThree: true, levelChests: false }), 'daily3');
  assert.equal(flags.streakOwner({ dailyThree: false, levelChests: false }), 'chest');
  const flame = loadTs('src/services/retention/useFlameStreak.ts', {
    react: { useEffect() {}, useState: v => [typeof v === 'function' ? v() : v, () => {}] },
    '../../api/endpoints/retention': { getDailyThree: async () => null },
    './flags': flags,
    './useOwnStreak': { ownStreakOf: () => null },
  });
  assert.equal(flame.flameStreak('chest', 4, 9), 4);
  assert.equal(flame.flameStreak('daily3', 4, 9), 9);
  assert.equal(flame.flameStreak('daily3', 4, null), null, 'waits for the Daily 3 number, never shows the chest one');
  assert.equal(flame.flameStreak(null, 4, 9), null);
  // Round 3: the flags warm when the map mounts (menu closed), so the row never appears after the menu opens.
  let reads = 0;
  const ref = { current: false };
  const warm = loadTs('src/services/retention/useFlameStreak.ts', {
    react: { useEffect: fn => { fn(); }, useRef: () => ref, useState: v => [typeof v === 'function' ? v() : v, () => {}] },
    '../../api/endpoints/retention': { getDailyThree: async () => null },
    './flags': { ...flags, loadRetentionFlags: async () => { reads += 1; return null; } },
    './useOwnStreak': { ownStreakOf: () => null },
  });
  warm.default(4, false);
  assert.equal(reads, 1, 'reads once on mount, before the first open');
  warm.default(4, false);
  assert.equal(reads, 1, 'closing or re-rendering closed reads nothing more');
  warm.default(4, true);
  assert.equal(reads, 2, 'each open refreshes');
  const radial = readSrc('src/components/RadialStatsMenu.tsx');
  assert.match(radial, /useFlameStreak\(dailyGift\?\.streak, isOpen\)/);
  assert.match(radial, /streakFrom === 'daily3' \? 'daily3_streak' : 'day_streak'/);
  assert.match(readSrc('src/components/DailyGiftModal.tsx'), /\{chestOwnsFlame && !simple && \(displayedGift\.streak/);
  assert.match(glossary.LOCAL_GLOSSARY.daily3_streak.what, /Daily 3/);
  // Ride days in a row are their own number: never the flame icon, never "Day Streak".
  for (const f of ['src/screens/RideTracker/RideStatsScreen.tsx', 'src/screens/RideTracker/RideTrackerScreen.tsx', 'src/screens/RideTracker/RideWrappedScreen.tsx']) {
    const text = readSrc(f);
    assert.doesNotMatch(text, /Day Streak|Day streak|day streak/, f);
  }
  assert.doesNotMatch(readSrc('src/screens/RideTracker/RideStatsScreen.tsx'), /current_streak\} icon="streak"/);
});
