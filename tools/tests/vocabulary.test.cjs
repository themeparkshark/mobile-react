'use strict';
/**
 * One word per thing (core loop blueprint 4.5).
 *
 * Scans the text a player can see (string literals, template chunks, JSX
 * text) under src/ for the words the blueprint retires, and names the lane
 * that owns each hit file (PLAN.json vocabulary_ownership, copied below; a
 * file no lane owns goes to shelf-words for copy-only edits).
 *
 * STRICT (shelf-words lane, October 28, 2026): the build fails on any hit in a
 * file owned by a lane that is not in PENDING_LANES. Lanes still building in
 * parallel stay report-only until they merge; the integrator removes each lane
 * from PENDING_LANES as it lands (an empty list is the whole app strict, the
 * PLAN.json integration check). Comments, import paths, console
 * text, identifier-like strings ("daily_three", "pins/mystery"), API
 * endpoints, models and dev-only screens are never hits.
 * A deliberate exception lives next to the string: // vocab-allow: <why>
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const ts = require(path.join(ROOT, 'node_modules/typescript'));

/** Strict since the end of the shelf-words lane. */
const STRICT = true;
/**
 * Lanes whose hits are reported but do not fail the build yet (they fix their own files on
 * their own branches). Remove a lane when it merges; empty means every file is strict.
 */
const PENDING_LANES = new Set(['guide-map', 'ride-challenge', 'lineplay-ride', 'rewards-unlocks']);

/** [id, pattern, say instead, files it skips]. Case matters only where the old word is a caps label. */
const RULES = [
  ['park-coins', /\bPark Coins?\b/i, 'Shark Coins (the money) or ride coin (the collectible)'],
  ['ride-coins-caps', /\bRIDE COINS\b/, '"9 of 35 coins" with tabs Rides, Sights, Limited'],
  ['play-ride', /\bPLAY RIDE\b/i, 'PLAY!'],
  ['coin-challenge', /\b(Coin|Ride) Challenge\b|\b(COIN|RIDE) CHALLENGE\b/, 'PLAY! (the card title says "Win the Walt Statue coin")'],
  ['rescue-pass', /\b(Shark )?Rescue Pass(es)?\b/i, 'Free try (the daily gift) or Extra tries (held passes)'],
  ['free-try-passes', /\bfree[- ]try passes\b/i, 'Extra tries'],
  ['park-tickets', /\bPark Tickets?\b|\bPARK TICKETS?\b/, 'Tickets'],
  // Food snacks are fine; only snacks as the home pickup are retired.
  ['snacks', /\bhome snacks?\b|\bsnack finds?\b|\bgrab (\d+ )?snacks?\b|\bsnacks? (near|around) (you|home)\b|\b\d+ (more )?snacks?\b/i, 'treats'],
  ['home-finds', /\bhome finds?\b/i, 'treats'],
  ['line-play-spaced', /\bLine Play\b/, 'LinePlay (tabs Story and Games)'],
  ['queue-play-names', /\b(queue adventure|Queue Quest|Ride Mission|Shark Fan Mission)\b/i, 'LinePlay'],
  ['adventure-count', /\bAdventures? \d+ of \d+\b|\bAdventures found\b/i, 'Line story: "Story 3 of 6", "Stories found 1 of 42"'],
  ['park-day-adventure', /\bPark[- ]Day Adventure\b/i, "Today's Adventure"],
  ['detour', /\bdetour\b/i, "Today's Adventure", /^src\/games\//],
  // Game mode names inside src/games stay unless ride-challenge renames them.
  ['mastery', /\bMastery\b/i, 'Level up', /^src\/games\//],
  // Whack's bad guy only: shark facts about teeth stay.
  ['teeth', /\b(skip|watch|avoid|dodge|miss|bonk) (the )?teeth\b|^teeth$/i, 'anglerfish, with its picture'],
  ['day-streak', /\bDay streak\b|\bHUNT STREAK\b/i, 'the flame (one number); the chest ladder says "Day 3 of 7"'],
  ['wins-label', /\b(Coins won|Rides won|rides held)\b/i, 'Wins this week'],
  ['team-points', /\+\s?\d+ points\b|You're the Captain/i, '"Team Shark took Main Street"'],
  ['pts', /\b\d+\s?pts\b|^pts$/i, 'Step 4 of 50 (the step bar)'],
  ['boss-energy', /\bpowers boss raids\b/i, 'Energy, for growing coins'],
  ['rhythm-tap', /\bRhythm Tap\b/i, 'Parade Beat'],
  ['shop-name', /^(Store|STORE|Shop|SHOP)$|\bShark Store\b/, 'Shark Shop'],
  // Dustin, Oct 28 (ledger 36): the bot rival is Captain Gill (rank ladder Admiral Gill). Coach Finn and
  // Fin-ister Nights stay; the internal icon name 'fin' is code, not copy.
  ['captain-fin', /\b(Captain|Admiral|CAPTAIN|ADMIRAL) (Fin|FIN)\b/, 'Captain Gill (rank ladder: Captain Gill, Admiral Gill)'],
  // Dustin, Oct 28 (ledger 39): the Green Train Toy left the shop; the app never names it (owners keep it as server data).
  ['green-train', /\bGreen Train\b/i, 'nothing: the shop list comes from the server'],
];

/** PLAN.json vocabulary_ownership (October 28, 2026). A trailing /** owns a folder. */
const OWNERS = {
  'shelf-words': ['src/components/CoinShelfArrival.tsx', 'src/components/money/CoinTopUpOffer.tsx', 'src/helpers/currency-balance.ts',
    'src/services/guestTaste.ts', 'src/screens/stampbook/model.ts', 'src/components/Tutorial/**', 'src/services/help/glossary.ts',
    'src/services/help/helpSheets.ts', 'src/services/help/howToCards.ts', 'src/screens/LeaderboardsScreen/standingsCache.ts',
    'src/screens/CommunityCenterScreen.tsx', 'src/constants/levelUnlocks.ts', 'src/screens/WelcomeScreen.tsx'],
  'guide-map': ['src/screens/ExploreScreen/HomeMapStatusCard.tsx', 'src/screens/ExploreScreen/HomeTicketProgress.tsx',
    'src/screens/ExploreScreen/PrepItem.tsx', 'src/screens/ExploreScreen/HomeCatchPreviewScreen.tsx',
    'src/screens/ExploreScreen/ParkProjectWidget.tsx', 'src/screens/ExploreScreen/ProjectRippleFeed.tsx',
    'src/screens/ExploreScreen/homePickupRange.ts', 'src/screens/ExploreScreen/TripGoalCard.tsx',
    'src/screens/ExploreScreen/AdventureTicketCard.tsx', 'src/screens/ExploreScreen/mapPresentationQueue.ts',
    'src/components/PrepItemRedeemModal.tsx', 'src/components/help/CoinTipPicture.tsx', 'src/components/boss/BossJoinCard.tsx',
    'src/components/boss/joinModel.ts', 'src/components/map/Marker.tsx'],
  'ride-challenge': ['src/components/TimingMiniGame.tsx', 'src/components/rewards/challengeCopy.ts', 'src/components/RedeemRedeemableModal.tsx',
    'src/components/PostWinRewardsModal.tsx', 'src/games/**', 'src/screens/GymBattle/TeamSelectionScreen.tsx'],
  'lineplay-ride': ['src/screens/LinePlay/**', 'src/services/lineplay/**', 'src/components/RideTracker/RideLogSuccess.tsx',
    'src/screens/RideTracker/RideBatchConfirmScreen.tsx',
    // Ledger 36 (Captain Gill): LinePlay's party seat names the bot rival.
    'src/gamekit/party/LineParty.tsx'],
  'rewards-unlocks': ['src/services/money/sharkPassModel.ts', 'src/screens/pins/**'],
};
/** Every OTA lane's owns_files (PLAN.json lanes[].owns_files, src/ entries). A hit here that is not listed above is a new hit for that lane. */
const LANE_FILES = {
  'guide-map': [
    'src/screens/ExploreScreen.tsx', 'src/screens/ExploreScreen/mapPresentationQueue.ts',
    'src/screens/ExploreScreen/dailyChestPresence.ts', 'src/screens/ExploreScreen/AdventureTicketCard.tsx',
    'src/screens/ExploreScreen/adventureTicketPresentation.ts', 'src/screens/ExploreScreen/useAdventureStampMoment.ts',
    'src/screens/ExploreScreen/DwellCard.tsx', 'src/screens/ExploreScreen/useQueueDwell.ts',
    'src/screens/ExploreScreen/MapSuggestionStub.tsx', 'src/screens/ExploreScreen/TripGoalCard.tsx',
    'src/screens/ExploreScreen/HomeExplore.tsx', 'src/screens/ExploreScreen/HomeHudChips.tsx',
    'src/screens/ExploreScreen/HomeMapStatusCard.tsx', 'src/screens/ExploreScreen/HomeTicketProgress.tsx',
    'src/screens/ExploreScreen/HomeCatchPreviewScreen.tsx', 'src/screens/ExploreScreen/PrepItem.tsx',
    'src/screens/ExploreScreen/ParkProjectWidget.tsx', 'src/screens/ExploreScreen/ProjectRippleFeed.tsx',
    'src/screens/ExploreScreen/homePickupRange.ts', 'src/screens/ExploreScreen/TaskMarker.tsx',
    'src/screens/ExploreScreen/PinMarker.tsx', 'src/screens/ExploreScreen/ItemMarker.tsx',
    'src/screens/ExploreScreen/mapOpportunityTiming.ts', 'src/screens/ExploreScreen/MapResourcePill.tsx',
    'src/screens/ExploreScreen/TooFarDialog.tsx', 'src/screens/ExploreScreen/FindLife.tsx', 'src/screens/ExploreScreen/Coin.tsx',
    'src/screens/parkRideSuggestion.ts', 'src/screens/parkRideAvailability.ts', 'src/components/Map.tsx',
    'src/components/map/**', 'src/components/nextUp/**', 'src/components/RideControlBar.tsx',
    'src/components/LiveEventsPill.tsx', 'src/components/retention/Daily3MapButton.tsx', 'src/components/Topbar.tsx',
    'src/components/Topbar/**', 'src/components/QuickAccessMenu.tsx', 'src/components/RadialStatsMenu.tsx',
    'src/components/home/HomeLive.tsx', 'src/components/PrepItemRedeemModal.tsx', 'src/components/help/CoinTipPicture.tsx',
    'src/components/boss/**', 'src/components/SharkDropHandler.tsx', 'src/api/client.ts', 'src/ui/modalLayers.ts',
    'src/services/guide/**', 'src/services/reveal/**', 'src/components/guide/**',
  ],
  'ride-challenge': [
    'src/components/RedeemModal.tsx', 'src/components/RedeemModal/**', 'src/components/RedeemRedeemableModal.tsx',
    'src/components/MiniGameSelector.tsx', 'src/components/TimingMiniGame.tsx', 'src/components/TicketPunch.tsx',
    'src/components/rewards/**', 'src/components/PostWinRewardsModal.tsx', 'src/components/CoinCatchReveal.tsx',
    'src/components/help/GameIntroCard.tsx', 'src/services/help/helpTopics.ts', 'src/services/task-attempt/**',
    'src/services/playPrefs.ts', 'src/games/**', 'src/gamekit/results/**', 'src/screens/GymBattle/TeamSelectionScreen.tsx',
    'src/screens/SettingsScreen.tsx',
  ],
  'lineplay-ride': [
    'src/screens/LinePlay/**', 'src/services/lineplay/**', 'src/services/RideDetectionService.ts',
    'src/services/RideDetectionEmitter.ts', 'src/hooks/useRideDetection.ts', 'src/components/RideTracker/**',
    'src/screens/RideTracker/**', 'src/screens/QueueTimesScreen.tsx', 'src/services/rideLogOutbox.ts',
    'src/services/rideJournalBatch.ts',
  ],
  'rewards-unlocks': [
    'src/components/retention/useRetention.tsx', 'src/components/retention/Daily3Sheet.tsx',
    'src/components/retention/RewardReveal.tsx', 'src/components/retention/StreakFlame.tsx', 'src/components/retention/power.ts',
    'src/components/retention/RewardsSheet.tsx', 'src/services/retention/**', 'src/components/DailyGiftModal.tsx',
    'src/context/DailyGiftProvider.tsx', 'src/components/trail/**', 'src/services/trail/**',
    'src/components/money/SharkPassBanner.tsx', 'src/components/money/WearFirstReward.tsx', 'src/screens/SharkPassScreen.tsx',
    'src/services/money/sharkPassModel.ts', 'src/components/liveEvents/**', 'src/services/liveEvents/**', 'src/screens/pins/**',
    'src/components/MemberLookHost.tsx',
  ],
  'shelf-words': [
    'src/screens/ParkScreen.tsx', 'src/screens/ParkCollectionHeader.tsx', 'src/screens/ParkRideDirectory.tsx',
    'src/screens/ParkDayRecapCard.tsx', 'src/screens/CoinShelfScreen.tsx', 'src/screens/parkCoinParts.ts',
    'src/services/collection/**', 'src/components/CoinLevelingModal.tsx', 'src/components/CoinShelfArrival.tsx',
    'src/components/TaskCoinModal.tsx', 'src/components/UnfoundCoinModal.tsx', 'src/components/ParkTrophyModal.tsx',
    'src/screens/ProfileScreen.tsx', 'src/components/profile/**', 'src/components/Experience.tsx',
    'src/constants/levelUnlocks.ts', 'src/screens/StampBookScreen.tsx', 'src/screens/stampbook/**',
    'src/screens/StoreScreen.tsx', 'src/screens/StoreScreen/SuppliesShop.tsx', 'src/services/money/supplies.ts',
    'src/components/money/BundleCard.tsx', 'src/components/money/CoinTopUpOffer.tsx', 'src/helpers/currency-balance.ts',
    'src/services/guestTaste.ts', 'src/screens/MembershipScreen.tsx', 'src/screens/LeaderboardScreen.tsx',
    'src/screens/LeaderboardsScreen/**', 'src/screens/CommunityCenterScreen.tsx', 'src/services/help/glossary.ts',
    'src/services/help/helpSheets.ts', 'src/services/help/howToCards.ts', 'src/components/help/HelpProvider.tsx',
    'src/screens/WelcomeScreen.tsx', 'src/components/launch/**', 'src/api/defaults/crumbs.json', 'src/components/Tutorial/**',
    'src/screens/ExploreScreen/HomeIntro.tsx', 'src/share/**',
  ],
};

const ALLOWLISTED = ['src/api/endpoints/**', 'src/models/**', 'src/screens/MiniGameTesterScreen.tsx', 'src/ui/UiKitGym.tsx'];
const DEV_ONLY = [/PreviewScreen\.tsx$/, /previewFixtures\.ts$/, /\/preview\.ts$/, /GameKitGymScreen\.tsx$/, /src\/devRoutes\.tsx$/, /src\/dev\//, /src\/utils\/standalonePreview\.ts$/];
const CATCH_ALL = 'shelf-words';

const matches = (file, pattern) => (pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -2)) : file === pattern);

/**
 * The owner lane for a file: its vocabulary_ownership entry (listed), else the
 * lane whose owns_files covers it (a new hit for that lane), else shelf-words
 * (the catch-all, copy-only edits), or 'allowlisted'.
 */
function ownerOf(file) {
  if (ALLOWLISTED.some(p => matches(file, p)) || DEV_ONLY.some(re => re.test(file))) return { owner: 'allowlisted', listed: true };
  for (const [lane, patterns] of Object.entries(OWNERS)) if (patterns.some(p => matches(file, p))) return { owner: lane, listed: true };
  for (const [lane, patterns] of Object.entries(LANE_FILES)) if (patterns.some(p => matches(file, p))) return { owner: lane, listed: false };
  return { owner: CATCH_ALL, listed: false, unowned: true };
}

function isSkipped(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent)) return true;                                    // type unions are not copy
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;          // object keys
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return true;
  for (let p = parent; p && !ts.isStatement(p); p = p.parent) {
    if (ts.isCallExpression(p)) {
      const callee = p.expression;
      if (ts.isIdentifier(callee) && callee.text === 'require') return true;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'console') return true;
      if (ts.isPropertyAccessExpression(callee) && ['getItem', 'setItem', 'removeItem', 'navigate', 'push', 'get', 'post', 'put'].includes(callee.name.text)) return true;
      break;
    }
  }
  return false;
}

/** Identifier-like strings ("daily_three", "pins/mystery", "rescue-pass") are code, not copy. */
const identifierLike = text => /^[a-z0-9_.:/@#-]*$/.test(text) || /^[A-Za-z][A-Za-z0-9]*$/.test(text) && /[a-z][A-Z]/.test(text);

function scanSource(source, file) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const lines = source.split('\n');
  const hits = [];
  const report = (node, text) => {
    if (!text || identifierLike(text.trim())) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    if (/vocab-allow:/.test(lines[line] ?? '') || /vocab-allow:/.test(lines[line - 1] ?? '')) return;
    for (const [id, re, say, skip] of RULES) {
      if (skip && skip.test(file)) continue;
      if (re.test(text)) hits.push({ line: line + 1, rule: id, say, text: text.replace(/\s+/g, ' ').trim().slice(0, 70) });
    }
  };
  const visit = node => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isSkipped(node)) report(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) report(node, node.text);
    else if (ts.isJsxText(node)) report(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function listFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) listFiles(full, out); }
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Every hit file under src/, with its owner. */
function scanVocabulary(root = ROOT) {
  const files = [];
  for (const full of listFiles(path.join(root, 'src')).sort()) {
    const file = path.relative(root, full).split(path.sep).join('/');
    const hits = scanSource(fs.readFileSync(full, 'utf8'), file);
    if (hits.length) files.push({ file, ...ownerOf(file), hits });
  }
  return files;
}

module.exports = { RULES, OWNERS, LANE_FILES, ownerOf, scanSource, scanVocabulary, STRICT, PENDING_LANES };

if (require.main === module || process.env.NODE_TEST_CONTEXT) {
  const test = require('node:test');

  test('the scanner sees visible copy and skips code', () => {
    const hits = scanSource([
      "import x from './RescuePass';",
      "const a = 'Rescue Pass';",
      "const key = 'rescue_pass';",
      "const t = { 'Park Coins': 1 };",
      "console.log('PLAY RIDE');",
      'const el = <Text>PLAY RIDE now</Text>;',
      "// vocab-allow: storage key shown nowhere",
      "const b = 'Mastery';",
      "type K = 'Park Tickets';",
    ].join('\n'), 'x.tsx');
    assert.deepEqual(hits.map(h => `${h.line}:${h.rule}`), ['2:rescue-pass', '6:play-ride']);
    assert.equal(ownerOf('src/games/whack/Whack.tsx').owner, 'ride-challenge');
    assert.equal(ownerOf('src/models/x.ts').owner, 'allowlisted');
    assert.deepEqual(ownerOf('src/screens/Nowhere.tsx'), { owner: 'shelf-words', listed: false, unowned: true });
    assert.deepEqual(ownerOf('src/components/RedeemModal.tsx'), { owner: 'ride-challenge', listed: false });
    assert.equal(scanSource("const a = 'Tidal Detour';", 'src/games/current-quest/boards.ts').length, 0, 'game content keeps its names');
    assert.equal(scanSource("const a = 'Do sharks lose their teeth?';", 'src/services/lineplay/content.ts').length, 0);
    assert.equal(scanSource("const a = 'Skip the teeth!';", 'src/games/whack/WhackAShark.tsx')[0].rule, 'teeth');
    assert.equal(scanSource("const a = 'Snack Stand';", 'x.ts').length, 0, 'food snacks are fine');
    // Ledger 36: the rival is Captain Gill; coach Finn, Fin-ister Nights and the 'fin' icon stay.
    assert.equal(scanSource("const a = 'Captain Fin';", 'x.ts')[0].rule, 'captain-fin');
    assert.equal(scanSource("const a = `Beat ADMIRAL FIN!`;", 'x.ts')[0].rule, 'captain-fin');
    assert.equal(scanSource("const a = 'Captain Gill'; const b = 'Coach Finn says hi'; const c = 'Fin-ister Nights'; const d = 'fin';", 'x.ts').length, 0);
    // Ledger 39: the Green Train Toy is server data only.
    assert.equal(scanSource("const a = 'Green Train Toy';", 'x.ts')[0].rule, 'green-train');
  });

  test(`vocabulary (${STRICT ? `strict, pending lanes: ${[...PENDING_LANES].join(', ') || 'none'}` : 'report only'}): banned UI words by owner lane`, t => {
    const files = scanVocabulary().filter(f => f.owner !== 'allowlisted');
    const total = files.reduce((n, f) => n + f.hits.length, 0);
    const byOwner = {};
    for (const f of files) (byOwner[f.owner] ??= []).push(f);
    for (const [owner, list] of Object.entries(byOwner)) {
      t.diagnostic(`${owner}: ${list.length} files, ${list.reduce((n, f) => n + f.hits.length, 0)} hits`);
      for (const f of list) t.diagnostic(`  ${f.file}${f.listed ? '' : f.unowned ? ' (new, no lane owns it)' : ' (new, lane owns_files)'}: ${[...new Set(f.hits.map(h => h.rule))].join(', ')}`);
    }
    void total;
    if (STRICT) {
      const failing = files.filter(f => !PENDING_LANES.has(f.owner));
      assert.deepEqual(failing.map(f => `${f.file} (${f.owner}): ${[...new Set(f.hits.map(h => h.rule))].join(', ')}`), [],
        'retired words in player-facing copy (see the diagnostics above)');
    }
  });
}
