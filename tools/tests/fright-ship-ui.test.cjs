/** Fin-ister ship panel, app-side named fixes (panel.md ship round): reveal headlines, duplicates, Case File buttons, names, share, intro, tally, pins. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers/fright-fixtures.cjs');
const { plain } = require('./helpers/plain.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');

const nav = [];
const loadOpen = () => loadTs('src/components/fright/openDeepLantern.ts', { '../../RootNavigation': { navigate: (name, params) => nav.push([name, params]) } });

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rewards = load('rewards');
const critters = load('critters');
const tutorial = load('tutorial');
const marquee = load('marquee');
const art = load('art');
const share = load('share');

const item = (kind, extra = {}) => ({ kind, name: kind === 'pin' ? 'Haunt Pin' : 'Fin-ister Medallion', image: null, item_id: kind === 'pin' ? 9 : 12, ...extra });

test('SHIP-1 every milestone key has its own headline; encounter names the live critter; "New reward!" only without a key', () => {
  const lines = {};
  for (const key of ['first_haunt', 'ten_in_one', 'all_haunts', 'haunts_5', 'case_files_10', 'first_night', 'lantern_lv10']) {
    const reveal = rewards.rewardReveal([item('cosmetic', { key })]);
    assert.ok(reveal.headline && !/^New reward/.test(reveal.headline), key);
    lines[key] = reveal.headline;
  }
  assert.equal(new Set(Object.values(lines)).size, 7, 'one headline per key');
  assert.equal(lines.first_haunt, 'Your first haunt!');
  assert.equal(lines.ten_in_one, 'Every haunt in one night!');
  assert.equal(lines.all_haunts, 'Every haunt this season!');
  assert.equal(rewards.rewardReveal([item('pin', { key: 'encounter' })], 'Ringmaster Riptide').headline, 'You caught Ringmaster Riptide!');
  assert.equal(rewards.rewardReveal([item('pin', { key: 'encounter' })]).headline, 'You caught a Chaos critter!', 'neutral without a name');
  assert.equal(rewards.rewardReveal([item('pin', { key: 'encounter' })], 'Lantern Star').headline, 'You caught a Chaos critter!',
    'the event title is never a critter name');
  assert.equal(rewards.rewardReveal([item('pin')]).headline, 'New reward!');
  assert.equal(rewards.rewardReveal([item('pin'), item('cosmetic')]).headline, 'New rewards!');
  assert.equal(rewards.rewardReveal([item('pin', { key: 'mystery_key' })]).headline, 'New reward!', 'unknown key falls back');
  // A pin first and a milestone gear second: the gear (hero) and its headline lead.
  const mixed = rewards.rewardReveal([item('pin'), item('cosmetic', { key: 'first_haunt' })]);
  assert.equal(mixed.items[0].kind, 'cosmetic');
  assert.equal(mixed.headline, 'Your first haunt!');
});

test('SHIP-1 an earned cosmetic is the hero (large art, its name) ahead of a spot pin; the pin drops to the small row', () => {
  const reveal = rewards.rewardReveal([{ kind: 'xp', name: 'XP', image: null, amount: 25 }, item('pin'), item('cosmetic', { key: 'first_night' })]);
  assert.equal(reveal.items.map(r => r.kind).join(','), 'cosmetic,pin');
  // Without an item_id a cosmetic is not real gear, so a real pin leads.
  assert.equal(rewards.rewardReveal([item('cosmetic', { item_id: null }), item('pin')]).items[0].kind, 'pin');
  const ui = read('src/components/fright/RewardReveal.tsx');
  assert.match(ui, /const \[hero, \.\.\.rest\] = reveal\.items;/);
  assert.match(ui, /<ArtImage uri=\{hero\.image\} style=\{\{ width: HERO_ART, height: HERO_ART \}\}/);
  assert.match(ui, /const HERO_ART = 176;/);
  assert.match(ui, /rest\.slice\(0, 4\)\.map/, 'pins become the small row');
  assert.match(ui, /backgroundColor: NIGHT\.haunt/, 'opaque card');
  const layer = read('src/components/fright/FrightLayer.tsx');
  assert.match(layer, /critter=\{engine\.modal\?\.kind === 'rewards' \? engine\.modal\.critter \?\? null : null\}/);
  const engine = read('src/components/fright/useFrightEngine.ts');
  assert.match(engine, /const caught = critterName\(result\) \?\? critter;/, 'catch result name first');
  assert.match(engine, /afterFound\(encounterNow\.key, result, side \?\? me\?\.side \?\? null, critterName\(encounterNow\)\)/, 'then the live encounter');
});

test('SHIP-2 duplicate gear: owned rows read "Already yours", never "Added to your wardrobe"; the coins still show', () => {
  const owned = item('cosmetic', { key: 'all_haunts', owned: true });
  assert.equal(rewards.wardrobeLine(owned), 'Already yours');
  assert.equal(rewards.wardrobeLine(item('cosmetic')), 'Added to your closet');
  assert.equal(rewards.wardrobeLine({ ...owned, owned: null }), 'Added to your closet', 'old servers: no field, no change');
  assert.equal(rewards.lanternLine(item('pin', { owned: true })), null, 'a duplicate pin is already on the Lantern');
  const reveal = rewards.rewardReveal([owned, { kind: 'coins', name: 'Coins', image: null, amount: 25, owned: true }]);
  assert.equal(plain(reveal.chips).join('|'), '+25 Coins');
  // New gear outranks gear the player already had.
  assert.equal(rewards.rewardReveal([owned, item('pin')]).items[0].kind, 'pin');
  assert.match(read('src/components/fright/RewardReveal.tsx'), /isOwned\(item\) && <Text style=\{styles\.smallOwned\}>Already yours<\/Text>/);
});

test('SHIP-3 Case File: "Keep it" closes and stays on the map; ghost "See my Lantern" closes then opens FrightCard (only with a slug)', () => {
  const src = read('src/components/fright/CaseFileReveal.tsx');
  assert.match(src, /<NightButton label="Keep it" style=\{\{ marginTop: 14, minWidth: 220 \}\} onPress=\{onClose\} \/>/);
  assert.match(src, /\{!!eventSlug && \(\s*<NightButton label="See my Lantern" variant="ghost"[\s\S]*?onClose\(\);\s*openDeepLantern\(eventSlug\);/);
  assert.doesNotMatch(src, /RootNavigation/);
  const open = loadOpen();
  assert.equal(JSON.stringify(open.deepLanternParams('usf-2026')), '{"eventSlug":"usf-2026"}');
});

test('SHIP-4 one name per critter: Chaos card, coach line, Marquee', () => {
  assert.equal(tutorial.CHAOS_CARD.line, 'Catch the critters. Chaos Hour at 11:11 PM.');
  assert.doesNotMatch(tutorial.COACH_LINES.chaos_hour.line, /giggl|Chuckles|Riptide/i, 'neutral default');
  assert.equal(tutorial.coachLine('chaos_hour', 'Ringmaster Riptide'), 'Chaos Hour! Ringmaster Riptide is loose near a reef.');
  assert.doesNotMatch(tutorial.coachLine('chaos_hour', 'Ringmaster Riptide'), /giggl/i);
  assert.equal(tutorial.coachLine('chaos_hour', null), 'Chaos Hour! A critter is loose near a reef.');
  assert.equal(tutorial.coachLine('reef_first', 'Ringmaster Riptide'), tutorial.COACH_LINES.reef_first.line);
  assert.match(read('src/components/fright/FrightLayer.tsx'), /critter=\{engine\.encounter\?\.name \?\? null\} \/>/);
  assert.match(read('src/components/fright/FrightOverlays.tsx'), /const line = coachLine\(coach, critter\);/);
  // critterName: explicit name, then the critter key, never the event title.
  assert.equal(critters.critterName({ critter: 'riptide' }), 'Ringmaster Riptide');
  assert.equal(critters.critterName({ critter: 'chuckles', name: 'Lantern Star' }), 'Chuckles the Chum Jester');
  assert.equal(critters.critterName({ critter_name: 'Ringmaster Riptide', critter: 'chuckles' }), 'Ringmaster Riptide');
  assert.equal(critters.critterName({ name: 'Lantern Star' }), null);
  assert.equal(critters.critterName(null), null);
  const base = { event_slug: 'usf-2026', card_title: 'Fin-ister Nights 2026', park_name: 'Park', night_on: '2026-10-09', night_number: 1,
    haunts: [], reefs: [], case_files: [], pins: [], ten_in_one: false, headline: '', share: { title: '', subtitle: '', stat_lines: [] },
    totals: { haunts: 0, minutes_in_line: 0, lantern_parts: 0 } };
  assert.equal(marquee.marqueeModel({ ...base, encounter: { key: 'e', name: 'Ringmaster Riptide' } }).caught, 'Caught Ringmaster Riptide');
  assert.equal(marquee.marqueeModel({ ...base, encounter: { key: 'e', name: 'Lantern Star' } }).caught, 'Caught a Chaos critter', 'old server label');
  assert.equal(marquee.marqueeModel({ ...base, encounter: { key: 'e', name: 'Lantern Star', critter: 'riptide' } }).caught, 'Caught Ringmaster Riptide');
  assert.equal(marquee.marqueeModel({ ...base, encounter: true }).caught, 'Caught a Chaos critter', 'boolean-only recap');
  assert.equal(marquee.marqueeModel({ ...base, encounter: null }).caught, null);
  const card = read('src/components/fright/FrightRecapCard.tsx');
  assert.doesNotMatch(card, /Spotted/);
  assert.match(card, /m\.caught,/);
});

test('SHIP-5 Marquee modal: "Share from your Lantern" closes the recap and opens the Deep Lantern screen with that night featured', () => {
  const src = read('src/components/fright/MarqueeRecap.tsx');
  assert.match(src, /inModal && !SHARE_IN_MODALS && !!onShareFromLantern/);
  assert.match(src, /label="Share from your Lantern"/);
  assert.match(src, /onShareFromLantern=\{\(\) => \{\s*onClose\(\);\s*openDeepLantern\(target\.slug, \{ nightOn: target\.nightOn \}\);/);
  const open = loadOpen();
  assert.equal(JSON.stringify(open.deepLanternParams('usf-2026', { nightOn: '2026-10-09' })), '{"eventSlug":"usf-2026","nightOn":"2026-10-09"}');
  // FrightCard is a route (not a modal): the featured night carries a real Share Studio button there.
  const screen = read('src/components/fright/FrightCardScreen.tsx');
  assert.match(screen, /const featured = friend \? null : featuredNight\(card, params\.nightOn\);/);
  assert.match(screen, /<FlexShareButton kind="fright_night" payload=\{nightFlex\(card, featured\.night, featured\.number\)\} surface="fright_recap" size="md" \/>/);
  assert.match(read('src/Root.tsx'), /name="FrightCard"/);
  const card = { recaps: [{ night_on: '2026-10-11', haunts: 3, minutes_in_line: 90 }, { night_on: '2026-10-09', haunts: 2, minutes_in_line: 40 },
    { night_on: '2026-10-10', haunts: 0, minutes_in_line: 0 }] };
  const hit = share.featuredNight(card, '2026-10-11');
  assert.equal(hit.number, 3);
  assert.equal(hit.night.haunts, 3);
  assert.equal(share.featuredNight(card, '2026-10-09').number, 1);
  assert.equal(share.featuredNight(card, '2026-10-10'), null, 'nothing to share on a zero-haunt night');
  assert.equal(share.featuredNight(card, '2026-10-12'), null);
  assert.equal(share.featuredNight(card, null), null);
});

test('SHIP-6 intro: hero and card sky prefetched before the first card; each card held at opacity 0 until its art loads', () => {
  const pre = read('src/components/fright/tutorial/preloadTutorialArt.ts');
  assert.match(pre, /require\('\.\.\/art\/tutorial-hero\.webp'\)/);
  assert.match(pre, /require\('\.\.\/art\/card-sky\.webp'\)/);
  assert.match(pre, /Image\.prefetch\(uris, 'memory-disk'\)/);
  assert.match(read('src/components/fright/FrightLayer.tsx'), /useEffect\(\(\) => \{ if \(night\.modeOn\) void preloadFrightTutorialArt\(\); \}, \[night\.modeOn\]\);/);
  assert.match(read('src/components/fright/tutorial/openFrightTutorial.ts'), /void preloadFrightTutorialArt\(\);/);
  const tut = read('src/components/fright/tutorial/FrightTutorial.tsx');
  assert.match(tut, /useEffect\(\(\) => \{ void preloadFrightTutorialArt\(\); \}, \[\]\);/);
  assert.match(tut, /const HERO = TUTORIAL_HERO;/, 'same source as the prefetch');
  assert.match(tut, /<ArtHold reduced=\{reduced\}/);
  assert.match(tut, /const opacity = useRef\(new Animated\.Value\(0\)\)\.current;/);
  assert.match(tut, /setTimeout\(show, CARD_ART_WAIT_MS\)/, 'never stuck hidden');
  assert.match(tut, /<Image source=\{HERO\} contentFit="cover" style=\{StyleSheet\.absoluteFill\} onLoad=\{onLoad\} onError=\{onLoad\} \/>/);
  assert.match(tut, /<Image source=\{SKY\} contentFit="cover" style=\{StyleSheet\.absoluteFill\} onLoad=\{onLoad\} onError=\{onLoad\} \/>/);
});

test('SHIP-7 art: no ring edge around the card 1 lantern (pixel probe on the bundled hero)', () => {
  const { execFileSync } = require('node:child_process');
  // A thin light ring sat at r ~103 px around (242, 834): about 21 levels brighter than the paint beside it on these flat angles (old file).
  const probe = `
from PIL import Image
import math
h = Image.open(${JSON.stringify(path.join(root, 'src/components/fright/art/tutorial-hero.webp'))}).convert('L')
worst = 0
for deg in (40, 50, 60, 70, 80, 90, 130, 160):
    t = math.radians(deg)
    ring = max(h.getpixel((int(round(242 + r * math.cos(t))), int(round(834 + r * math.sin(t))))) for r in range(98, 110))
    base = sorted(h.getpixel((int(round(242 + r * math.cos(t))), int(round(834 + r * math.sin(t))))) for r in (92, 93, 94, 112, 113, 114))[2]
    worst = max(worst, ring - base)
print(worst)`;
  let worst = null;
  try { worst = Number(execFileSync('python3', ['-c', probe], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch { worst = null; }
  if (worst != null) assert.ok(worst < 8, `ring edge removed (line response ${worst})`);
});

test('SHIP-8 Team Chaos vs Control: an empty track until the first point, then real shares', () => {
  assert.equal(art.tallyFill({ chaos: 0, control: 0 }), null);
  assert.equal(art.tallyFill(null), null);
  assert.equal(JSON.stringify(art.tallyFill({ chaos: 3, control: 1 })), '{"chaos":0.75,"control":0.25}');
  assert.equal(JSON.stringify(art.tallyFill({ chaos: 0, control: 2 })), '{"chaos":0,"control":1}');
  const screen = read('src/components/fright/FrightCardScreen.tsx');
  assert.match(screen, /const fill = tallyFill\(card\.tally\);/);
  assert.match(screen, /\{fill && <>/);
  assert.doesNotMatch(screen, /: 0\.5;/, 'no 50/50 default');
});

test('SHIP-9 fright pins open the Deep Lantern pins section (FrightCard), never PinCollections', () => {
  const ui = read('src/components/fright/RewardReveal.tsx');
  assert.match(ui, /openDeepLantern\(eventSlug, \{ section: 'pins' \}\)/);
  assert.match(read('src/components/fright/FrightLayer.tsx'), /eventSlug=\{night\.tonight\?\.event\?\.slug \?\? null\} onClose=\{engine\.closeModal\}/);
  const open = loadOpen();
  assert.equal(JSON.stringify(open.deepLanternParams('usf-2026', { section: 'pins' })), '{"eventSlug":"usf-2026","section":"pins"}');
  const screen = read('src/components/fright/FrightCardScreen.tsx');
  assert.match(screen, /onLayout=\{event => setPinsY\(event\.nativeEvent\.layout\.y\)\}/);
  assert.match(screen, /params\.section === 'pins' \? pinsY : params\.section === 'files' \? filesY : null/);
  // No fright surface outside the dev capture flow links PinCollections.
  const dir = path.join(root, 'src/components/fright');
  for (const file of fs.readdirSync(dir).filter(name => /\.tsx?$/.test(name))) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, file), 'utf8'), /navigate\('PinCollections'/, file);
  }
});
