// Fix pass w4, lane shop-shelf. Each test fails on 11f2e5f8 (the merged w3 build).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ---------- N05: Finn's first-visit tip never opens with a blank body ----------
const reveal = loadTs('src/components/Tutorial/teacherReveal.ts');
const layout = loadTs('src/components/Tutorial/tutorialLayout.ts');

function finnAt(clock) {
  const FakeDate = { now: () => clock.now };
  const app = runtime('src/components/Tutorial/TeacherShark.tsx', {
    '../../ui/useUiReducedMotion': { default: () => false },
    '../../ui': { BRAND: { navy: '#05346e', white: '#fff', blue: '#0768b9', blueBright: '#0879ca', sky: '#bfe5ff', gold: '#ffcf3b', navySoft: '#3d5f8c', shadow: '#05346e' }, GameButton: 'GameButton' },
    './teacherReveal': reveal,
  }, { text: 'Welcome to the Shark Shop! Use Shark Coins.', subtitle: 'Supplies cost real money.', mood: 'happy', position: 'bottom-center',
    stepIndex: 0, totalSteps: 1, onNext() {} }, { Date: FakeDate });
  return app;
}
const lineNode = app => app.find(n => n.type === 'Text' && Array.isArray(n.props.children) && n.props.children.length > 5);
const shownWords = app => lineNode(app).props.children.filter(child => !child.props.style).length;
const fireNext = (app, clock, advance) => {
  const [id, fn] = [...app.timers.entries()].at(-1);
  clock.now += advance ?? app.delays.get(id);
  app.timers.delete(id); fn(); app.render();
};

test('N05: a late reveal tick (busy JS thread) shows the whole line at once', () => {
  const parts = reveal.splitWords('Welcome to the Shark Shop!');
  assert.deepEqual({ ...reveal.revealTick(parts, 0, 0) }, { shown: 1, nextAt: reveal.revealSchedule(parts)[1] });
  assert.equal(reveal.revealTick(parts, 2000, 42).shown, parts.length, 'two seconds late: everything shows');
  assert.equal(reveal.revealTick(parts, 2000, 42).nextAt, null);
  assert.equal(reveal.revealTick(parts, 50, 42).shown < parts.length, true, 'on time: still word by word');
});

test('N05: the bubble pops with the first word, and a start that comes late shows the full line', () => {
  const clock = { now: 1000 };
  const app = finnAt(clock);
  const parts = reveal.splitWords('Welcome to the Shark Shop! Use Shark Coins.');
  assert.equal(shownWords(app), 0);
  const springsBefore = app.motions.filter(m => m === 'spring').length;
  // The JS thread was busy for 3 s before Finn's first tick (a shop rendering its shelves).
  fireNext(app, clock, reveal.REVEAL_START_MS + 3000);
  assert.equal(shownWords(app), parts.length, 'the whole line, never one word over a blank bubble');
  assert.ok(app.motions.filter(m => m === 'spring').length > springsBefore, 'the bubble pops in the same tick as the words');
});

test('N05: on time, Finn still talks word by word, and a stall mid-line catches up at once', () => {
  const clock = { now: 1000 };
  const app = finnAt(clock);
  fireNext(app, clock);
  const first = shownWords(app);
  assert.ok(first >= 1 && first < 5, 'word by word when the thread is free');
  fireNext(app, clock, 1500);
  assert.equal(shownWords(app), reveal.splitWords('Welcome to the Shark Shop! Use Shark Coins.').length);
});

test('N05: the bubble does not pop on its own UI timer before any word can show', () => {
  const src = read('src/components/Tutorial/TeacherShark.tsx');
  assert.doesNotMatch(src, /bubbleValue\.value = withDelay\(/, 'no bubble pop scheduled apart from the words');
});

test('N05: a guide draws only over its own screen; a left screen tip ends unseen', () => {
  assert.equal(layout.guideShowsOn('onboarding', 'Explore'), true);
  assert.equal(layout.guideShowsOn('onboarding', 'Store'), false, "Finn's home hello never draws over the Shark Shop");
  assert.equal(layout.guideShowsOn('park_arrival', 'SharkPass'), false);
  assert.equal(layout.guideShowsOn('onboarding', undefined), true, 'before navigation is ready');
  assert.equal(layout.guideShowsOn('store', 'Store'), true, "the shop's own tip shows on the shop");
  assert.equal(layout.guideShowsOn('store', 'Profile'), false, 'the shop tip never follows the player back to Profile');
  assert.equal(layout.guideLeftItsScreen('store', 'Profile'), true);
  assert.equal(layout.guideLeftItsScreen('store', 'Store'), false);
  assert.equal(layout.guideLeftItsScreen('onboarding', 'Store'), false, 'map guides pause, they never end unseen');
  const provider = read('src/components/Tutorial/TutorialProvider.tsx');
  assert.match(provider, /guideShowsOn\(isActive \? currentSequence : null, routeName\)/);
  assert.match(provider, /!firstPlayOpen && guideOnScreen &&/);
  assert.match(provider, /if \(!leftItsScreen\) return;\s*setIsActive\(false\);/);
});

test('N05: the Shark Shop tip waits for a loaded, painted shop (no fixed 800 ms timer)', () => {
  const store = read('src/screens/StoreScreen.tsx');
  assert.doesNotMatch(store, /startTutorial\('store'\), 800/);
  assert.match(store, /useTutorialWhenReady\('store', status === 'ready'\)/);
});

// ---------- T221: one lean Ticket ladder whatever the server sends ----------
const { leanLadder } = loadTs('src/services/money/ladder.ts');
const product = (id, section, grants, extra = {}) => ({ product_id: `com.themeparkshark.app.${id}`, section, title: id, badge: null,
  grants, limit: null, deal_key: null, available: true, unavailable_reason: null, ...extra });
const FULL = ['pack.starter', 'deal.daily', 'pack.parkday', 'pack.parktrip', 'tickets.5', 'tickets.12', 'tickets.25', 'coins.500', 'coins.7000', 'coins.16000']
  .map(id => product(id, id.split('.')[0] === 'tickets' ? 'tickets' : id.startsWith('coins') ? 'coins' : 'featured', { tickets: 1 }));

test('T221: an older server (no ladder) never lists the 12 and 25 Ticket packs', () => {
  const ids = leanLadder({ products: FULL }).products.map(p => p.product_id.replace('com.themeparkshark.app.', ''));
  assert.equal(ids.includes('tickets.12'), false);
  assert.equal(ids.includes('tickets.25'), false);
  assert.equal(ids.includes('tickets.5'), true);
  assert.equal(ids.includes('coins.16000'), true, 'only the server knows a first purchase: big coin packs stay in More');
  assert.equal(leanLadder({ ladder: 'full', products: FULL }).products.length, FULL.length - 2);
});

test('T221: a lean server list is used as served', () => {
  const served = { ladder: 'lean', products: FULL };
  assert.equal(leanLadder(served), served);
  assert.match(read('src/api/endpoints/me/shop.ts'), /return leanLadder\(data\.data\)/, 'every reader of the shop gets the same list');
});

// ---------- T233: a Limited coin is a dated special edition ----------
const limitedCoins = loadTs('src/services/collection/limitedCoins.ts');

test('T233: Limited coins and the Limited tab name their dated edition', () => {
  const now = { active: true, ends_at: '2026-12-01T08:00:00+00:00', ends_on: '2026-11-30', returns: false, edition: 'November 2026 Edition' };
  const later = { active: false, ends_at: null, ends_on: null, returns: true, edition: 'October 2026 Edition' };
  assert.equal(limitedCoins.limitedLabel(now), 'November 2026 Edition · leaves Monday, Nov 30');
  assert.equal(limitedCoins.limitedLabel(later), 'October 2026 Edition · returns later');
  assert.equal(limitedCoins.limitedLabel({ ...now, edition: undefined }), 'Limited · leaves Monday, Nov 30', 'older server unchanged');
  assert.equal(limitedCoins.shelfEdition([{ limited: later }, { limited: now }]), 'November 2026 Edition', 'the edition in play');
  assert.equal(limitedCoins.limitedTabLine('November 2026 Edition', 'Monday, Nov 30'), 'November 2026 Edition · leaves Monday, Nov 30');
  assert.equal(limitedCoins.limitedTabLine(null, 'Monday, Nov 30'), 'These limited coins leave Monday, Nov 30');
});

test('T233: the coin cards and the tab header read the edition', () => {
  assert.match(read('src/components/UnfoundCoinModal.tsx'), /const edition = limitedEdition\(limited\)/);
  assert.match(read('src/components/TaskCoinModal.tsx'), /limitedEdition\(\(task as TaskType\)\.limited\)/);
  assert.match(read('src/screens/ParkCollectionHeader.tsx'), /limitedTabLine\(limitedEdition, limitedLeaves\)/);
  assert.match(read('src/screens/ParkScreen.tsx'), /limitedEdition=\{shelfEdition\(limitedShelf\)\}/);
});

// ---------- T174: the name check runs before LET'S GO; never a raw server sentence ----------
const welcome = loadTs('src/screens/welcomeCopy.ts');

test('T174: a taken name is caught before the save; unknown answers never block', () => {
  assert.equal(welcome.nameTaken({ available: false, yours: false }), true);
  assert.equal(welcome.nameTaken({ available: false, yours: true }), false, 'your own name re-saves');
  assert.equal(welcome.nameTaken({ available: true, yours: false }), false);
  assert.equal(welcome.nameTaken(null), false, 'older server or a slow check: the save decides');
  const screen = read('src/screens/WelcomeScreen.tsx');
  assert.match(screen, /await checkUsername\(name\)/, 'LET\'S GO checks the exact name first');
  assert.match(screen, /if \(nameTaken\(known\)\) \{\s*setServerError\(NAME_TAKEN_LINE\)/);
  assert.match(screen, /takenNow \? NAME_TAKEN_LINE : status\.hint/, 'the hint says taken while typing');
  const api = read('src/api/endpoints/me/username-check.ts');
  assert.doesNotMatch(api, /message/, "the server's sentence is never read");
});

// ---------- T242: a Ride Passport's title shows as worn at the claim ----------
test('T242: the claim answer that wore a title shows it on the card at once', () => {
  const stamps = loadTs('src/api/endpoints/me/stamps.ts', { '../../client': { default: {} } });
  assert.equal(stamps.titleWornByClaim({ title_worn: true, equipped_title: 'Disneyland Ride Master' }), 'Disneyland Ride Master');
  assert.equal(stamps.titleWornByClaim({ title_worn: false, equipped_title: 'Explorer' }), null, 'a title was already worn');
  assert.equal(stamps.titleWornByClaim({ success: true }), null, 'older server');
  const book = read('src/screens/StampBookScreen.tsx');
  assert.match(book, /const res = await claimStampReward\(stamp\.id\);\s*pendingPatch\.current\.push\(stamp\.id\);\s*showClaimTitle\(res\);/, 'Claim all too');
  assert.match(book, /if \(!showClaimTitle\(res\)\) refreshPlayer\(\)/);
});

// ---------- N09: the Shark Pass banner counts the rewards this player can claim ----------
test('N09: rewards, not steps: a pass owner with both rows waiting sees both', () => {
  const model = loadTs('src/services/money/sharkPassModel.ts');
  const tiers = Array.from({ length: 50 }, (_, i) => ({ tier: i + 1, unlocked: i < 12, free: i === 0 ? null : { type: 'tickets', amount: 1 },
    paid: { type: 'energy', amount: 60 }, free_claimed: false, paid_claimed: false }));
  const base = { enabled: true, season: { key: 's1', tier_count: 50, points_per_tier: 250 }, tiers };
  assert.equal(model.claimableRewards({ ...base, progress: { tier: 12, premium: false, claimable: 11 } }), 11);
  assert.equal(model.claimableRewards({ ...base, progress: { tier: 12, premium: true, claimable: 12 } }), 23, 'steps say 12, rewards are 23');
  assert.equal(model.claimableRewards({ ...base, progress: { tier: 12, premium: true, claimable: 12, claimable_rewards: 20 } }), 20, 'B09 wins');
  const fresh = { ...base, tiers: tiers.map(t => ({ ...t, unlocked: false })), progress: { tier: 0, premium: false, claimable: 0 } };
  assert.equal(model.claimableRewards(fresh), 0, 'a new player has nothing to claim');
  assert.match(read('src/components/money/SharkPassBanner.tsx'), /const claimable = claimableRewards\(state\);/);
  assert.match(read('src/screens/SharkPassScreen.tsx'), /Claim \$\{rewardsToClaim\} rewards/);
});

// ---------- T158: the Home menu sticker never covers the Shark Shop icon ----------
test('T158: the JUST ONCE sticker sits on the label, not on the round icon', () => {
  const menu = read('src/components/QuickAccessMenu.tsx');
  const round = menu.slice(menu.indexOf('const round = ('), menu.indexOf('const label = ('));
  const label = menu.slice(menu.indexOf('const label = ('), menu.indexOf('return (', menu.indexOf('const label = (')));
  assert.doesNotMatch(round, /StarterSticker/);
  assert.match(label, /StarterSticker/);
});

test('Supplies on iPhone SE: the Starter Frame line is short enough for two lines', () => {
  const card = read('src/components/money/BundleCard.tsx');
  assert.match(card, /\{`Plus the \$\{product\.frame\.name\}`\}/);
  assert.doesNotMatch(card, /for your shark`\}<\/Text>/);
});

test('N05 merge smoke: the tip route watch never reads the navigator before it is ready (no launch console.error)', () => {
  const src = fs.readFileSync(path.join(root, 'src/components/Tutorial/TutorialProvider.tsx'), 'utf8');
  const sync = src.slice(src.indexOf('const sync = () => {'), src.indexOf("navigationRef.addListener('state', sync)"));
  assert.ok(sync.length > 0, 'the route watch is there');
  assert.ok(sync.indexOf('if (!navigationRef.isReady()) return;') >= 0, 'guarded by isReady');
  assert.ok(sync.indexOf('if (!navigationRef.isReady()) return;') < sync.indexOf('navigationRef.getCurrentRoute()'), 'guard before the read');
});
