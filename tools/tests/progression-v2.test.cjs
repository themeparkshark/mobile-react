'use strict';
/**
 * S2 Progression v2, app side (progression.md 9): ten tier tokens, the
 * three-act level-up with its flash cap, the perk track, server-only proc
 * chips, the Crowning and the re-mint card.
 */
const assert = require('node:assert/strict'), test = require('node:test'), fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const model = () => loadTs('src/components/coin/progressionModel.ts');
const fixtures = () => loadTs('src/components/coin/previewFixtures.ts');

const NEW_FILES = ['src/components/coin/progressionModel.ts', 'src/components/coin/PerkTrack.tsx', 'src/components/coin/PerkChip.tsx',
  'src/components/coin/CoinStand.tsx', 'src/components/coin/LevelUpBurst.tsx', 'src/components/coin/Crowning.tsx',
  'src/components/coin/previewFixtures.ts', 'src/components/RemintNoticeModal.tsx', 'src/services/progression/progressionFlags.ts',
  'src/constants/coinTiers.ts'];

test('ten coin tiers: stands from Level 6, the crown only at 10, glow below 6 and shatter from 6', () => {
  const tiers = loadTs('src/constants/coinTiers.ts');
  assert.equal(tiers.MAX_COIN_LEVEL, 10);
  assert.equal(tiers.LEGENDARY_COIN_LEVEL, 5);
  assert.deepEqual(plain(tiers.COIN_TIERS.map(t => t.burst)), ['glow', 'glow', 'glow', 'glow', 'glow',
    'shatter', 'shatter', 'shatter', 'shatter', 'shatter']);
  assert.deepEqual(plain(tiers.COIN_TIERS.filter(t => t.stand !== 'none').map(t => t.level)), [6, 7, 8, 9, 10]);
  assert.deepEqual(plain(tiers.COIN_TIERS.filter(t => t.crown).map(t => t.level)), [10]);
  assert.equal(tiers.coinLevelLabel(10), 'Level 10 · Shark Crown');
  for (const tier of tiers.COIN_TIERS) assert.match(tier.ring, /^#[0-9a-f]{6}$/);
});

test('Level 2-5 is a rim glow with no flash; Level 6+ flashes at most 40% for 80 ms and shatters into 16', () => {
  const m = model();
  const glow = m.levelUpFx(3, 4, { reducedMotion: false });
  assert.equal(glow.burst, 'glow'); assert.equal(glow.flash, null); assert.equal(glow.shards, 0);
  const shatter = m.levelUpFx(6, 14, { reducedMotion: false });
  assert.equal(shatter.burst, 'shatter'); assert.deepEqual(plain(shatter.flash), { opacity: 0.4, ms: 80 });
  assert.equal(shatter.shards, 16); assert.equal(shatter.cogs, 12, 'cogs cap at 12');
  assert.ok(shatter.standRise); assert.equal(shatter.cameraPush, 1.08);
  assert.equal(m.levelUpFx(10, 52, { reducedMotion: false }).crowning, true);
  assert.equal(m.levelUpFx(9, 40, { reducedMotion: false }).crowning, false);
  // Charge haptics: Light 300, Medium 600, Heavy 900, then Success on the burst.
  assert.deepEqual(plain(shatter.haptics.map(h => [h.at, h.intent])).slice(0, 3), [[300, 'tapLight'], [600, 'hitMedium'], [900, 'comboHeavy']]);
  assert.deepEqual(plain(m.LEVEL_UP_ACTS), { charge: { start: 0, end: 900 }, burst: { start: 900, end: 1500 }, reveal: { start: 1500, end: 2600 } });
});

test('Reduce Motion and Dim Flashing Lights never flash', () => {
  const m = model();
  const reduced = m.levelUpFx(8, 30, { reducedMotion: true });
  assert.equal(reduced.burst, 'crossfade'); assert.equal(reduced.flash, null); assert.equal(reduced.sparks, 0);
  assert.equal(reduced.totalMs, 250);
  const dim = m.levelUpFx(8, 30, { reducedMotion: false, dimFlashingLights: true });
  assert.equal(dim.flash, null); assert.equal(dim.burst, 'glow', 'Lv6+ falls back to the rim glow');
  assert.ok(m.FLASH_CAP.opacity <= 0.4 && m.FLASH_CAP.ms <= 80);
});

test('the perk track: round perks, diamond milestones, a boss eye at 5, the boss at 10, only the next is prominent', () => {
  const m = model();
  const nodes = m.perkNodes(fixtures().previewPerkTrack(4, ['double_day']), 4);
  assert.deepEqual(plain(nodes.map(n => n.shape)), ['diamond', 'round', 'round', 'round', 'round', 'diamond', 'round', 'diamond', 'diamond', 'boss']);
  assert.deepEqual(plain(nodes.filter(n => n.isNext).map(n => n.level)), [5]);
  assert.deepEqual(plain(nodes.filter(n => n.bossEye).map(n => n.level)), [5]);
  assert.equal(nodes.find(n => n.level === 4).proc_today, true);
  assert.equal(m.nextReward(fixtures().previewPerkTrack(4), 4), 'LEVEL 5 · Queue Crew: +1 Part per 3 line Parts');
  assert.equal(m.nextReward(fixtures().previewPerkTrack(10), 10), null);
  for (const row of fixtures().previewPerkTrack(1)) assert.ok(row.short.split(/\s+/).length <= 6, row.short);
});

test('proc chips come only from the server and read like the design', () => {
  const m = model();
  assert.equal(m.perkChipText({ key: 'double_day', label: 'DOUBLE DAY', parts: 2, energy: 10, xp: 0 }), 'DOUBLE DAY +2 Parts +10 E');
  assert.equal(m.perkChipText({ key: 'ticket_back', label: 'TICKET BACK', tickets: 1 }), 'TICKET BACK');
  assert.equal(m.perkChipText({ key: 'short_wait', label: 'SHORT RIDE', parts: 2 }), 'SHORT RIDE +2 Parts');
  assert.deepEqual(plain(m.serverPerkChips([{ key: 'ride_regular', label: 'RIDE REGULAR', parts: 1 }, { nope: true }, null, 'x'])),
    [{ key: 'ride_regular', label: 'RIDE REGULAR', parts: 1 }]);
  assert.deepEqual(plain(m.serverPerkChips(undefined)), []);
  const modal = fs.readFileSync('src/components/PostWinRewardsModal.tsx', 'utf8');
  assert.match(modal, /<PerkChipRow perks=\{perks\}/);
  const flow = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
  assert.match(flow, /setPerkChips\(serverPerkChips\(attempt\.rewards\.perks\)\)/);
});

test('the reveal card names the new perk and its XP and coin chips', () => {
  const m = model();
  const card = m.revealCard(fixtures().previewUnlocks(7), 100);
  assert.equal(card.title, 'NEW PERK: Ride Regular');
  assert.deepEqual(plain(card.chips), ['+100 XP']);
  assert.deepEqual(plain(m.revealCard(fixtures().previewUnlocks(6), 80).chips), ['+80 XP', '+100 Shark Coins']);
  assert.deepEqual(plain(m.revealCard(fixtures().previewUnlocks(5), 60).chips), ['+60 XP', 'Boss Glimpse unlocked']);
  assert.equal(m.revealCard(null, 0), null);
  assert.equal(m.levelRibbon(7), 'LEVEL 7 · TIDAL');
});

test('the Crowning lightens the background, shows a navy 70% boss figure and one primary button', () => {
  const m = model();
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114; };
  assert.ok(lum(m.CROWNING.background.to) > lum(m.CROWNING.background.from), 'never darker');
  assert.deepEqual(plain(m.CROWNING.silhouette), { fill: '#164f82', opacity: 0.7, rimColor: '#ffffff', rimWidth: 2 });
  assert.equal(m.CROWNING.skippableAfterMs, 1500); assert.equal(m.CROWNING.totalMs, 5500);
  const boss = fixtures().PREVIEW_BOSS;
  const live = m.crowningCopy('Harbor Coaster', boss, true);
  assert.equal(live.ribbon, 'BOSS OF HARBOR COASTER IS AWAKE');
  assert.equal(live.primary, 'FIGHT NOW'); assert.equal(live.secondary, 'Later');
  assert.equal(live.hint, 'Watch for the Anchor Drop'); assert.equal(live.groggy, 'Free if you lose');
  assert.equal(m.crowningCopy('Harbor Coaster', boss, false, '120 m').primary, 'Fight at Harbor Coaster · 120 m');
  const soon = m.crowningCopy('Harbor Coaster', { ...boss, state: 'soon' }, true);
  assert.equal(soon.bossName, 'Boss Shark arrives soon'); assert.equal(soon.primary, 'SEE MY SHELF'); assert.equal(soon.secondary, null);
  assert.equal(m.crowningCopy('Harbor Coaster', boss, true, null, false).primary, 'SEE MY SHELF', 'no lobby in this build yet');
  for (const text of Object.values(live)) if (text) assert.doesNotMatch(String(text), /VIP|Ticket|Shop|buy/i, 'no offers');
});

test('the re-mint card flips coins 300 ms apart and has one button', () => {
  const m = model();
  const card = m.remintCard({ id: 'remint:1:9', total_parts: 14, total_energy: 30, coins: [
    { asset_id: 6, ride_name: 'Harbor', coin_url: '', from_level: 5, to_level: 6, from_tier: 'Legendary', to_tier: 'Sapphire', parts_refunded: 4, energy_refunded: 0 },
    { asset_id: 5, ride_name: 'Boats', coin_url: '', from_level: 4, to_level: 4, from_tier: 'Prismatic', to_tier: 'Prismatic', parts_refunded: 8, energy_refunded: 25 },
    { asset_id: 4, ride_name: 'Tea', coin_url: '', from_level: 3, to_level: 3, from_tier: 'Gold', to_tier: 'Gold', parts_refunded: 0, energy_refunded: 5 },
  ] });
  assert.deepEqual(plain(card.rows.map(r => r.flipAtMs)), [0, 300, 600]);
  assert.deepEqual(plain(card.rows.map(r => r.line)), ['Your Legendary coin grew into Sapphire', '8 Parts returned', '5 Energy returned']);
  assert.equal(card.button, 'See my shelf');
  assert.match(card.subtitle, /14 Ride Parts and 30 Energy/);
  assert.equal(m.remintCard(null), null);
  assert.equal(m.clientMaxLevel(undefined), 5); assert.equal(m.clientMaxLevel(10), 10); assert.equal(m.clientMaxLevel(99), 10);
});

test('the re-mint card and the Crowning go through the PresentationQueue', () => {
  const remint = fs.readFileSync('src/components/RemintNoticeModal.tsx', 'utf8');
  assert.match(remint, /usePresentationSlot\([^)]*'remint', 'coin_shelf'\)/);
  const sheet = fs.readFileSync('src/components/CoinLevelingModal.tsx', 'utf8');
  assert.match(sheet, /usePresentationSlot\(crowningId, 'crowning', 'coin_shelf'\)/);
  assert.doesNotMatch(sheet, /lottie-react-native/, 'the level-up drops Lottie');
  assert.match(sheet, /queueHaptic/); assert.match(sheet, /playLimited/);
  assert.match(fs.readFileSync('App.tsx', 'utf8'), /<RemintNoticeModal \/>/);
});

test('Ride Masters is a RideStandings segment behind the progression flag, not a new tab or route', () => {
  const standings = fs.readFileSync('src/screens/LeaderboardsScreen/RideStandings.tsx', 'utf8');
  assert.match(standings, /progressionV2 \? \[\.\.\.BASE_METRICS, MASTERS_METRIC\] : BASE_METRICS/);
  const copy = loadTs('src/screens/LeaderboardsScreen/standingsModel.ts', { dayjs: require('dayjs') }).rideMetricCopy('masters', '2026-10-05', 10);
  assert.equal(copy.unit, 'crowns');
  assert.doesNotMatch(fs.readFileSync('src/Root.tsx', 'utf8'), /RideBoss|Crowning|Remint/, 'no new route');
});

test('progression flags default off and load once', async () => {
  let reads = 0;
  const flags = loadTs('src/services/progression/progressionFlags.ts', {
    react: { useEffect() {}, useState: value => [value, () => {}] },
    '../../api/endpoints/platform/feature-flags': { __esModule: true, default: async () => { reads++; return { flags: { progression_v2: true } }; } },
  });
  const a = await flags.loadProgressionFlags(); const b = await flags.loadProgressionFlags();
  assert.equal(reads, 1); assert.equal(a.progressionV2, true); assert.equal(b.rideBoss, false);
});

test('new progression copy has no em dashes, no emoji and never says Dressing Room', () => {
  for (const file of NEW_FILES) {
    const src = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /\u2014/, `${file} has an em dash`);
    assert.doesNotMatch(src, /\p{Extended_Pictographic}/u, `${file} has an emoji`);
    assert.doesNotMatch(src, /Dressing Room/i, file);
  }
});
