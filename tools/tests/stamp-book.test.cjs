const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
// Run with: node --test tools/tests/stamp-book.test.cjs
// Stamp Book v2: grouping, progress, locked and secret stamps, rewards, art source and the slam.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const model = loadTs('src/screens/stampbook/model.ts');

const rewards = (over = {}) => ({ energy: 0, tickets: 0, xp: 0, coins: 0, title: null, ...over });
function stamp(over = {}) {
  return {
    id: 1, slug: 'explorer', name: 'Explorer', category: 'events', goal: 'Visit 2 different parks',
    metric: 'parks_visited', target_value: 2, rarity: 'uncommon', image_key: null, emoji: null,
    is_hidden: false, sort_order: 1, progress: 0, target: 2, progress_percentage: 0, progress_text: '0/2',
    is_earned: false, earned_at: null, reward_claimed: false, rewards: rewards({ xp: 250 }), ...over,
  };
}

test('server sections drive the book; an older server falls back to metric rules', () => {
  const v2 = model.buildBook({
    stamps: { regions: [stamp({ id: 1, section: 'parks' })], stamps: [stamp({ id: 2, slug: 'first-steps', section: 'hunt' })] },
    sections: [{ key: 'hunt', label: 'Treasure Hunt', color: '#FF8A3D', blurb: 'x' }, { key: 'parks', label: 'Park Passport', color: '#2F6BFF', blurb: 'y' }],
  });
  assert.deepEqual(plain(v2.map(s => s.key)), ['hunt', 'parks']);

  const old = model.buildBook({ stamps: { all: [
    stamp({ id: 1, metric: 'visited_epcot' }), stamp({ id: 2, metric: 'prep_items_collected' }),
    stamp({ id: 3, metric: 'park_coins_collected' }), stamp({ id: 4, metric: 'friends_count' }),
    stamp({ id: 5, metric: 'longest_streak' }), stamp({ id: 6, metric: 'coins_held' }),
    stamp({ id: 7, metric: 'logged_in_after_midnight' }), stamp({ id: 8, metric: 'park_shelf:10' }),
    stamp({ id: 9, metric: 'prep_items_collected', is_hidden: true }),
  ] } });
  assert.deepEqual(plain(old.map(s => [s.key, s.stamps.map(x => x.id)])), [
    ['parks', [1, 8]], ['hunt', [2]], ['rides', [3]], ['friends', [4]], ['streaks', [5]], ['milestones', [6]], ['special', [7, 9]],
  ]);
  // An unknown section from a newer server still shows, on the Special page.
  const unknown = model.buildBook({ stamps: { a: [stamp({ section: 'brand-new' })] }, sections: [...model.FALLBACK_SECTIONS] });
  assert.equal(unknown[0].key, 'special');
});

test('earned first (newest first), then closest to done, secrets last', () => {
  const book = model.buildBook({ stamps: { a: [
    stamp({ id: 1, progress: 1, sort_order: 1 }),
    stamp({ id: 2, is_earned: true, earned_at: '2026-09-01T00:00:00Z', progress: 2 }),
    stamp({ id: 3, is_earned: true, earned_at: '2026-10-01T00:00:00Z', progress: 2 }),
    stamp({ id: 4, is_hidden: true, progress: 1, section: 'parks' }),
    stamp({ id: 5, progress: 0, sort_order: 0 }),
  ] }, sections: [{ key: 'parks', label: 'P', color: '#000000', blurb: '' }] });
  assert.deepEqual(plain(book[0].stamps.map(s => s.id)), [3, 2, 1, 5, 4]);
  // Secrets do not count toward the total until found.
  assert.equal(book[0].total, 4);
  assert.equal(book[0].earned, 2);
});

test('a locked stamp shows its how-to and progress; a secret hides its name and goal', () => {
  const locked = model.toBookStamp(stamp({ progress: 1, how_to: 'Visit 2 different parks' }));
  assert.equal(locked.earned, false);
  assert.equal(locked.percent, 50);
  assert.equal(model.progressLabel(locked), '1 / 2');
  assert.equal(locked.howTo, 'Visit 2 different parks');

  const secret = model.toBookStamp(stamp({ is_hidden: true, name: '???', goal: 'Catch 100 finds' }));
  assert.equal(secret.secret, true);
  assert.equal(secret.name, 'Secret stamp');
  assert.ok(!/100/.test(secret.howTo));
  const found = model.toBookStamp(stamp({ is_hidden: true, name: 'Legend', is_earned: true }));
  assert.equal(found.secret, false);
  assert.equal(found.name, 'Legend');

  // Passports are percentages; big counts get separators; earned is always full.
  assert.equal(model.progressLabel({ progress: 40, target: 100 }), '40 / 100');
  assert.equal(model.progressLabel({ progress: 8120, target: 30000 }), '8.1K / 30K');
  assert.equal(model.progressLabel({ progress: 12560, target: 30000 }), '12.5K / 30K');
  assert.equal(model.progressLabel({ progress: 0, target: 10000 }), '0 / 10K');
  assert.equal(model.compactCount(1250000), '1.2M');
  assert.equal(model.toBookStamp(stamp({ is_earned: true, progress: 0 })).percent, 100);
});

test('earned date is an absolute local date, never relative', () => {
  const iso = '2026-10-02T18:30:00Z';
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  assert.equal(model.earnedDate(iso), `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`);
  assert.equal(model.earnedDate(null), null);
  assert.equal(model.earnedDate('nope'), null);
});

test('rare and up shine once earned; rewards and claim counts read the payload', () => {
  assert.equal(model.hasShine({ rarity: 'rare', earned: true }), true);
  assert.equal(model.hasShine({ rarity: 'legendary', earned: false }), false);
  assert.equal(model.hasShine({ rarity: 'uncommon', earned: true }), false);
  assert.deepEqual(plain(model.rewardChips(rewards({ energy: 30, tickets: 1, xp: 1500, title: 'Explorer' })).map(c => c.label)),
    ['+30 Energy', '+1 Ticket', '+1,500 XP', '"Explorer" title']);
  const book = model.buildBook({ stamps: { a: [
    stamp({ id: 1, is_earned: true, reward_claimed: false }),
    stamp({ id: 2, is_earned: true, reward_claimed: true }),
    stamp({ id: 3, is_earned: true, reward_claimed: false, rewards: rewards() }),
  ] }, sections: [{ key: 'parks', label: 'P', color: '#000000', blurb: '' }] });
  assert.deepEqual(plain(model.bookTotals(book)), { earned: 3, total: 3, toClaim: 1 });
});

test('progress ring geometry is clamped', () => {
  const full = model.ring(1, 10);
  assert.equal(Math.round(full.offset), 0);
  assert.equal(model.ring(2, 10).offset, 0);
  assert.equal(model.ring(-1, 10).offset, full.circumference);
  assert.equal(model.ring(Number.NaN, 10).offset, full.circumference);
});

test('art comes from the server in four variants; one small bundled fallback; failures never leave a hole', () => {
  const src = read('src/screens/stampbook/art.ts');
  const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]);
  assert.deepEqual(requires, ['../../../assets/images/stamps/stamp-fallback.png']);
  assert.ok(fs.statSync(path.join(root, 'assets/images/stamps/stamp-fallback.png')).size < 60_000, 'fallback must stay small');
  const artView = read('src/screens/stampbook/StampArt.tsx');
  assert.match(artView, /source=\{failed \? FALLBACK_ART : source\}/);
  // The big card shows the cached thumb until the 768 px art lands, and reports when it is ready.
  assert.match(artView, /placeholder=\{thumb\}/);
  assert.match(artView, /onLoad=\{onReady\}/);
  assert.match(read('src/screens/stampbook/StampTile.tsx'), /<StampArt stamp=\{stamp\} size="thumb"/);
  // The 768 px art for every stamp that will slam is prefetched after load.
  // Gated on the seen set having loaded (otherwise every earned stamp would count as unseen).
  assert.match(read('src/screens/StampBookScreen.tsx'), /\.filter\(s => s\.is_earned && s\.icon_url && \(!s\.reward_claimed \|\| \(!!seen && !seen\.has\(String\(s\.id\)\)\)\)\)/);
  assert.ok(!/^import .*preview/m.test(read('src/screens/StampBookScreen.tsx')));
});

test('the slam: staged after the art loads (cap 350 ms), no Modal fade, navy ink, one-overshoot settle, predicted impact', () => {
  const src = read('src/screens/stampbook/StampCard.tsx');
  assert.match(src, /animationType="none"/);
  assert.match(src, /later\(350, start\)/);
  assert.match(src, /const onArtReady = useCallback\(\(\) => \{ later\(120, start\); \}/);
  assert.match(src, /Easing\.in\(Easing\.exp\)/);
  assert.match(src, /const hold = rank >= 5 \? 120 : 50;/);
  assert.match(src, /const settle = \{ damping: 20, stiffness: 380 \};/);
  assert.match(src, /later\(T\(300\), \(\) => impact\(celebrate\)\)/);
  // The capture slow-motion is dev only: release always plays at 1x.
  assert.match(src, /const SLOWMO = __DEV__ \? Math\.max\(1, Number\(process\.env\.EXPO_PUBLIC_SLAM_SLOWMO\) \|\| 1\) : 1;/);
  assert.ok(!/runOnJS/.test(src));
  assert.match(src, /<InkBurst seed=\{stamp\.id\} size=\{ART\} color=\{INK\}/);
  assert.match(src, /const INK = '#14213D';/);
  assert.match(src, /<Sunburst size=\{ART \* 1\.38\} color=\{LEGENDARY_GOLD\}/);
  assert.match(src, /accessibilityViewIsModal onAccessibilityEscape=\{onClose\}/);
  assert.match(src, /<Pressable style=\{StyleSheet\.absoluteFill\} onPress=\{onClose\} accessible=\{false\}/);
  // Repeat opens of rare+ still get one foil sweep; the landed tilt matches the slam.
  assert.match(src, /if \(hasShine\(stamp\)\) \{ foil\.value = 0; foil\.value = withDelay\(300,/);
  assert.match(src, /const tilt = useSharedValue\(hover \? -12 : stamp\.earned \? -3 : 0\);/);
  // Never an empty stage: art visible from the first frame, a fresh slam starts in its hover pose.
  assert.match(src, /const fade = useSharedValue\(1\);/);
  assert.match(src, /const hover = stamp\.earned && fresh && !reducedMotion;/);
  // The ink settles, holds about 400 ms and fades away; the flash is badge-shaped; HUD above the sunburst.
  assert.match(read('src/screens/stampbook/SlamFx.tsx'), /hit\.value < 0\.7 \? 0\.25 : 0\.25 \* \(1 - \(hit\.value - 0\.7\) \/ 0\.3\)/);
  assert.match(src, /flash: \{ position: 'absolute', width: ART \* 0\.72, height: ART \* 0\.72, borderRadius: ART/);
  assert.match(src, /hud: \{ zIndex: 3/);
  assert.match(src, /useLayoutEffect\(\(\) => \{ setPhase\('idle'\); \}, \[stamp\.id\]\);/);
  assert.match(src, /styles\.preload/);
});

test('claim cascade: instant feedback, rising pitch, per-landing count-up, fresh wallet, announced, one persistent button', () => {
  const src = read('src/screens/stampbook/StampCard.tsx');
  // Feedback before the network answers.
  const claimFn = src.slice(src.indexOf('const claim = useCallback(async () => {'));
  assert.ok(claimFn.indexOf('repress(false)') < claimFn.indexOf('await onClaim()'), 'press feedback must come before the request');
  assert.match(src, /const step = n;/);
  assert.match(src, /pitch: Math\.min\(12, step\)/);
  assert.match(src, /bus\.add\(kind, share\);/);
  assert.match(src, /add: \(kind, n\) => setShown\(w => \(\{ \.\.\.w, \[kind\]: w\[kind\] \+ n \}\)\)/);
  assert.match(src, /if \(cascadingRef\.current\) return;\s*setShown\(prev => \(claimedIds\.length === 0 \? wallet : \{\s*energy: Math\.max\(prev\.energy, wallet\.energy\)/);
  assert.match(src, /AccessibilityInfo\.announceForAccessibility/);
  assert.match(src, /tokenShake\.value = withSequence/);
  // Status is not a button, and the action button lives in the Frame (not remounted per chained stamp).
  assert.match(src, /accessibilityRole="text" accessibilityLabel=\{shownStatus\}/);
  assert.match(src, /<Content key=\{s\.id\} ref=\{s\.id === stamp\.id \? content : undefined\}/);
  assert.ok(src.indexOf("<GameButton label={phase === 'claiming'") > src.indexOf('<Content key={s.id}'));
  // Pending stays yellow: the button is not disabled while the claim is in flight.
  assert.match(src, /loading=\{phase === 'claiming'\} disabled=\{!action \|\| phase === 'cascading' \|\| phase === 'gotIt'\}/);
  const btn = read('src/ui/GameButton.tsx');
  assert.match(btn, /<Animated\.View style=\{\[\{ opacity: disabled \? 0\.5 : 1 \}/, 'loading must not dim the button');
  assert.match(btn, /accessibilityState=\{\{ disabled: inactive, busy: loading \}\}/);
  assert.match(btn, /if \(inactive \|\| !onPress\) return;/);
  assert.match(btn, /if \(inactive \|\| reducedMotion \|\| !onPress\) return;/);
});

test('clocks truly rest: JS-kicked sweeps, per-tile gate, tags mounted only where needed, stable open', () => {
  const fx = read('src/screens/stampbook/BookFx.tsx');
  assert.ok(!/withRepeat/.test(fx), 'no always-running repeat');
  assert.match(fx, /setInterval\(sweep, SHINE_EVERY_MS\)/);
  assert.match(fx, /useAnimatedReaction\(/);
  assert.match(fx, /\(next, prev\) => \{ if \(next !== prev\) local\.value = next; \}/);
  const tile = read('src/screens/stampbook/StampTile.tsx');
  assert.ok(!/withRepeat/.test(tile));
  // Only rare-or-better owned tiles carry the per-frame shine clock.
  assert.match(tile, /function ShineFoil\([^]*?useTileClock\(fx\.shine, top, height, 1\)/);
  assert.match(tile, /function Pulsing\(/);
  const screen = read('src/screens/StampBookScreen.tsx');
  assert.match(screen, /const open = useCallback\(\(stamp: BookStamp\) => \{[^]*?\}, \[\]\);/);
  assert.match(screen, /const seenRef = useRef/);
  assert.match(screen, /const SectionPage = memo\(/);
  assert.match(screen, /useBookClocks\(focused && !selected && !titlesOpen && !claimAllOpen, reducedMotion, \{ pulseOn: totals\.toClaim > 0, shineOn: shinyOwned, pulseWhenIdle: totals\.toClaim > 0 \}\)/);
  assert.match(screen, /buildBook\(response, prevIndex\.current\)/);
});

test('30 s throttle has no holes: retry is one-shot, a catch or a park change marks the book stale', () => {
  const screen = read('src/screens/StampBookScreen.tsx');
  assert.ok(!/load\(reloadKey > 0\)/.test(screen));
  assert.match(screen, /if \(takeStampsDirty\(\)\) force = true;/);
  const dirty = loadTs('src/screens/stampbook/dirty.ts');
  assert.equal(dirty.takeStampsDirty(), false);
  dirty.markStampsDirty();
  assert.equal(dirty.takeStampsDirty(), true);
  assert.equal(dirty.takeStampsDirty(), false);
  dirty.noteCurrentPark(2); assert.equal(dirty.takeStampsDirty(), true);
  dirty.noteCurrentPark(2); assert.equal(dirty.takeStampsDirty(), false);
  dirty.noteCurrentPark(8); assert.equal(dirty.takeStampsDirty(), true);
  assert.match(read('src/api/endpoints/me/prep-items/redeem.ts'), /if \(Array\.isArray\(earned\) && earned\.length > 0\) markStampsDirty\(\);/);
  assert.match(read('src/api/endpoints/me/current-park.ts'), /noteCurrentPark\(park\?\.id\);/);
});

test('every Go! target opens with no params (Park needs a park id and is never a target)', () => {
  const metrics = ['prep_items_collected', 'wild_legendary_variants', 'sets_completed', 'longest_streak', 'parks_visited', 'visited_epcot',
    'park_shelf:2', 'ride_passport_magic_kingdom', 'friends_count', 'park_coins_collected', 'ride_coins_maxed', 'verified_lineplay_sessions',
    'trivia_wins', 'ride_bosses_defeated', 'ride_boss_shark_clears', 'total_experience', 'coins_held', 'night_show', 'holiday_login', 'something_new'];
  const targets = new Set(metrics.map(m => model.requirement({ metric: m, target: 5 }).go).filter(Boolean));
  for (const t of targets) assert.ok(model.GO_TARGETS.includes(t), `${t} is not a safe Go target`);
  assert.ok(!model.GO_TARGETS.includes('Park'));
  const root = read('src/Root.tsx');
  for (const t of model.GO_TARGETS) {
    const reg = root.match(new RegExp(`name="${t}"[^]*?(?:require\\('\\./screens/([A-Za-z/]+)'\\)|component=\\{(\\w+)\\})`));
    assert.ok(reg, `${t} is not a registered screen`);
    const file = reg[1] ? `src/screens/${reg[1]}.tsx` : `src/screens/${reg[2]}.tsx`;
    const src = read(file);
    // Any params a target reads must be optional: no bare route.params.x and no destructuring of route.params.
    assert.ok(!/route\.params\.[a-zA-Z]/.test(src), `${t} reads route.params without ?.`);
    assert.ok(!/=\s*route\.params\s*[;\n]/.test(src) && !/\}\s*=\s*route\.params\b(?!\s*\?\?)/.test(src), `${t} destructures route.params`);
  }
  assert.equal(model.requirement({ metric: 'night_show', target: 1 }).go, 'Explore');
  assert.equal(model.requirement({ metric: 'night_show', target: 1 }).icon, 'moon');
  assert.equal(model.sectionForMetric('night_show', false), 'special');
});

test('v3: the cover opens Titles, Almost there shows the 3 closest stamps, each stamp card owns its Go button', () => {
  const screen = read('src/screens/StampBookScreen.tsx');
  assert.match(screen, /<Cover [^>]*onTitles=\{openTitles\}/);
  assert.match(screen, /almostThereList\(sections, 3\)/);
  assert.match(screen, /<TitlesSheet visible=\{titlesOpen\}/);
  // The Titles list closes before a stamp card opens (one Modal at a time on iOS).
  assert.match(screen, /if \(stamp\) open\(stamp\);/);
  assert.match(read('src/screens/stampbook/StampCard.tsx'), /action = \{ label: 'Go!'/);
});

test('locked bleed never reads as earned; postmark sits in the free corner; rarity shows on earned tiles', () => {
  assert.equal(model.bleedFraction({ earned: false, percent: 74 }), 0);
  assert.ok(model.bleedFraction({ earned: false, percent: 85 }) < 0.5);
  assert.ok(model.bleedFraction({ earned: false, percent: 100 }) <= model.BLEED_CAP);
  assert.equal(model.BLEED_CAP, 0.65);
  assert.equal(model.toBookStamp(stamp({ art_free_corner: 'bl' })).freeCorner, 'bl');
  assert.equal(model.toBookStamp(stamp({ art_free_corner: 'nope' })).freeCorner, 'tr');
  const tile = read('src/screens/stampbook/StampTile.tsx');
  assert.match(tile, /<View style=\{\[styles\.postmark, CORNER\[postmarkCorner\(stamp\.freeCorner, !!tag\)\]\]\}/);
  // One app-wide palette: stamps read design-system colors.rarity (shop and wardrobe ladder); gold is Legendary only.
  const rarity = loadTs('src/screens/stampbook/rarity.ts');
  const ds = loadTs('src/design-system.ts');
  assert.deepEqual(plain(['common', 'uncommon', 'rare', 'epic', 'legendary'].map(k => rarity.STAMP_RARITY[k].frame)),
    plain(['common', 'uncommon', 'rare', 'epic', 'legendary'].map(k => ds.colors.rarity[k].main)));
  assert.deepEqual(plain(['uncommon', 'rare', 'epic', 'legendary'].map(k => ds.wearableRarityUi[['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(k) + 1].border)),
    plain(['uncommon', 'rare', 'epic', 'legendary'].map(k => rarity.STAMP_RARITY[k].frame.toUpperCase())).map(c => c.replace('#00A5F5', '#00a5f5')));
  assert.deepEqual(plain(Object.values(rarity.STAMP_RARITY).map(r => r.gems)), [1, 2, 3, 4, 5]);
  assert.match(tile, /Array\.from\(\{ length: look\.gems \}/);
  assert.match(read('src/screens/stampbook/StampCard.tsx'), /backgroundColor: tone\.chip, borderColor: tone\.frame/);
  // Postmark always in a bottom corner (tags own the top).
  const tileMod = read('src/screens/stampbook/StampTile.tsx');
  assert.match(tileMod, /return free === 'tr' \? 'br' : free === 'tl' \? 'bl' : free;/);
  const card = read('src/screens/stampbook/StampCard.tsx');
  assert.match(card, /<View pointerEvents="none" style=\{\[styles\.stampHere/);
  assert.match(card, /<InkEdge width=\{ART \* 0\.68\}/);
  assert.match(card, /<SoftShadow /);
});

test('stable identity: an unchanged stamp keeps its object across rebuilds', () => {
  const resp = { stamps: { a: [stamp({ id: 1, section: 'parks' }), stamp({ id: 2, section: 'parks' })] }, sections: [{ key: 'parks', label: 'P', color: '#000000', blurb: '' }] };
  const first = model.buildBook(resp);
  const idx = model.stampIndex(first);
  const second = model.buildBook({ ...resp, stamps: { a: [stamp({ id: 1, section: 'parks' }), stamp({ id: 2, section: 'parks', progress: 1 })] } }, idx);
  const byId = new Map(second[0].stamps.map(s => [s.id, s]));
  assert.equal(byId.get(1), idx.get(1));
  assert.notEqual(byId.get(2), idx.get(2));
});

test('zero-reading: pictograms, pips, positive lines, Go targets, claim chain and next up', () => {
  const r = (metric, target) => model.requirement({ metric, target });
  assert.equal(r('prep_items_collected', 25).icon, 'pin');
  assert.equal(r('prep_items_collected', 25).count, 25);
  assert.equal(r('longest_streak', 7).pips, true);
  assert.equal(r('friends_count', 3).go, 'Friends');
  assert.equal(r('visited_epcot', 1).count, null);
  assert.equal(r('logged_in_after_midnight', 1).go, null);
  assert.equal(model.remainingLine({ metric: 'longest_streak', target: 7, progress: 4, earned: false, secret: false }), '3 more days!');
  assert.equal(model.remainingLine({ metric: 'prep_items_collected', target: 25, progress: 24, earned: false, secret: false }), '1 more find!');
  assert.equal(model.remainingLine({ metric: 'park_shelf:2', target: 100, progress: 40, earned: false, secret: false }), '60% to go!');
  const book = model.buildBook({ stamps: { a: [
    stamp({ id: 1, section: 'parks', is_earned: true, reward_claimed: false }),
    stamp({ id: 2, section: 'parks', progress: 1, target: 5, target_value: 5 }),
    stamp({ id: 3, section: 'parks', progress: 4, target: 5, target_value: 5 }),
  ] }, sections: [{ key: 'parks', label: 'P', color: '#000000', blurb: '' }] });
  assert.deepEqual(plain(model.claimQueue(book).map(s => s.id)), [1]);
  assert.equal(model.nextUp(book).id, 3);
  assert.equal(model.almostThere(book[0].stamps.find(s => s.id === 3)), true);
  assert.equal(model.tileLabel(book[0].stamps.find(s => s.id === 3)), 'Explorer. In progress. 4 of 5. Visit 2 different parks');
  assert.equal(model.tileLabel(book[0].stamps.find(s => s.id === 1)), 'Explorer. Earned. Rewards ready to claim.');
});

test('stamp book copy has no em dashes and no internal words', () => {
  for (const file of ['src/screens/StampBookScreen.tsx', 'src/screens/stampbook/StampTile.tsx', 'src/screens/stampbook/StampCard.tsx',
    'src/screens/stampbook/model.ts', 'src/screens/stampbook/preview.ts', 'src/screens/stampbook/SlamFx.tsx', 'src/screens/stampbook/Foil.tsx']) {
    const src = read(file);
    assert.ok(!src.includes('—'), `${file} has an em dash`);
    assert.ok(!/prep item/i.test(src), `${file} says "prep item"`);
  }
});

test('preview data is dev only and the API keeps v2 fields optional', () => {
  assert.match(read('src/screens/StampBookScreen.tsx'), /const previewMode = __DEV__ && process\.env\.EXPO_PUBLIC_STAMP_BOOK_PREVIEW === '1';/);
  const api = read('src/api/endpoints/me/stamps.ts');
  for (const field of ['section?: string;', 'icon_url?: string | null;', 'how_to?: string;', 'sections?: StampSectionInfo[];'])
    assert.ok(api.includes(field), field);
});

test('round 6: hand-off prefetches the next art, HUD lives outside the remounting content, level-up from the claim', () => {
  const card = read('src/screens/stampbook/StampCard.tsx');
  // HUD rendered in Frame, before the keyed Content.
  assert.ok(card.indexOf('<View style={styles.hud}') < card.indexOf('<Content key={s.id}'));
  assert.ok(card.indexOf('<View style={styles.hud}') > card.indexOf('function Frame('));
  assert.ok(card.indexOf('<View style={styles.hud}') < card.indexOf('const Content = forwardRef'));
  assert.match(card, /if \(phase !== 'cascading' \|\| !nextStamp\) return;/);
  assert.match(card, /Image\.prefetch\(urls, 'memory-disk'\)/);
  assert.match(card, /if \(levelled\) later\(lastLanding \+ 650, \(\) => bus\.levelUp\(result\.level as number\)\);/);
  assert.match(card, /function LevelUp\(/);
  const screen = read('src/screens/StampBookScreen.tsx');
  assert.match(screen, /Image\.prefetch\(\[thumb\], 'memory-disk'\)\.then\(go, go\);\n\s+handoffTimer\.current = setTimeout\(go, 350\);/);
  assert.match(screen, /levelsGained: Number\(res\?\.levels_gained \?\? 0\)/);
  assert.match(screen, /coins: player\?\.coins \?\? 0/);
});

test('round 6: coin stamps show coins in the HUD; Holiday Shark and Wild Legend have their own pictograms', () => {
  const card = read('src/screens/stampbook/StampCard.tsx');
  assert.match(card, /stamp\.metric === 'coins_held' \|\| stamp\.metric === 'coins_earned'/);
  assert.equal(model.requirement({ metric: 'holiday_login', target: 1 }).icon, 'gift');
  assert.equal(model.requirement({ metric: 'wild_legendary_variants', target: 2 }).icon, 'sparkle');
  const icons = read('src/ui/iconNames.ts');
  for (const n of ['gift', 'sparkle', 'moon', 'pumpkin']) assert.ok(icons.includes(`'${n}'`), n);
});

test('round 6: event haunt stamps get the pumpkin pictogram; the postmark stays off the badge and the name', () => {
  assert.equal(model.requirement({ metric: 'fright_haunts', target: 5 }).icon, 'pumpkin');
  assert.match(read('src/screens/stampbook/StampTile.tsx'), /bl: \{ left: -12, bottom: -2 \}, br: \{ right: -12, bottom: -2 \}/);
});

test('round 6: the outgoing stamp stays drawn until the incoming art is on screen (no one-frame gap)', () => {
  const card = read('src/screens/stampbook/StampCard.tsx');
  assert.match(card, /\[stamp, \.\.\.\(held && held\.id !== stamp\.id \? \[held\] : \[\]\)\]\.map/);
  assert.match(card, /onShown=\{s\.id === stamp\.id \? release : undefined\}/);
  assert.match(card, /const cap = setTimeout\(\(\) => setHeld\(null\), 700\);/);
  assert.match(card, /if \(current\.id !== stamp\.id\) \{\n\s+setHeld\(current\);/);
  assert.match(read('src/screens/stampbook/StampArt.tsx'), /onDisplay=\{onShown\}/);
});

test('round 7: opaque level-up plate above everything; the held stamp drives the whole card; no crossfade', () => {
  const card = read('src/screens/stampbook/StampCard.tsx');
  // The gold plate is a static full-size view inside the animated wrapper.
  assert.match(card, /<Animated\.View pointerEvents="none" style=\{\[styles\.levelUpWrap, style\]\}/);
  assert.match(card, /<View style=\{styles\.levelUpPlate\}>/);
  assert.match(card, /levelUpWrap: \{ position: 'absolute', left: 24, right: 24, top: '30%', zIndex: 30, elevation: 30 \}/);
  assert.match(card, /levelUpPlate: \{\n\s+alignItems: 'center',[^}]*backgroundColor: LEGENDARY_GOLD/);
  assert.match(card, /<View style=\{styles\.levelUpPill\}>/);
  // Confetti renders before (behind) the plate, and the plate never fades in: opaque from its first frame.
  const lv = card.slice(card.indexOf('function LevelUp('));
  assert.ok(lv.indexOf('<Confetti') > 0 && lv.indexOf('<Confetti') < lv.indexOf('<View style={styles.levelUpPlate}>'), 'confetti behind the plate');
  assert.match(lv, /const fade = useSharedValue\(1\);/);
  assert.doesNotMatch(lv, /fade\.value = withTiming\(1/);
  // Hand-off: overlay on top, never flattened; ribbon, frame and button from the held stamp.
  assert.match(card, /overlay: \{ \.\.\.StyleSheet\.absoluteFillObject, backgroundColor: DIALOG_CARD\.backgroundColor, zIndex: 20, elevation: 20 \}/);
  assert.match(card, /<View collapsable=\{false\} style=\{\[styles\.content, overlay && styles\.overlay\]\}/);
  assert.match(card, /<Ribbon text=\{display\.name\} \/>/);
  assert.match(card, /if \(holding\) action = \{ label: `Next reward \(\$\{nextCount \+ 1\} left\)`/);
  assert.match(card, /onShown=\{onShown\} transition=\{0\} \/>/);
});

test('round 7: claim broadcasts are not doubled; a pending hand-off is cancelled on close', () => {
  assert.match(read('src/api/endpoints/me/stamps.ts'), /\{ skipBroadcasts: true \}/);
  // RC: merged with production's Watch coin filter; skipBroadcasts still suppresses every broadcast.
  assert.match(read('src/hooks/useAxiosSetup.ts'), /const skipAll = cfg\?\.skipBroadcasts === true;/);
  assert.match(read('src/hooks/useAxiosSetup.ts'), /if \(!skipAll && response\.data && Array\.isArray\(response\.data\.broadcasts\)\)/);
  const screen = read('src/screens/StampBookScreen.tsx');
  assert.match(screen, /handoffCancelled\.current = true;\n\s+if \(handoffTimer\.current\) clearTimeout\(handoffTimer\.current\);\n\s+playSfx\('ui\.modalClose'/);
  assert.ok(!/Park Collector|Park Coin/.test(read('src/screens/stampbook/preview.ts')));
});

test('v3: five tile states, each its own look; where to play; Almost there', () => {
  const b = (over) => model.toBookStamp(stamp(over));
  assert.equal(model.stampState(b({ is_earned: true, reward_claimed: false })), 'claim');
  assert.equal(model.stampState(b({ is_earned: true, reward_claimed: true })), 'owned');
  assert.equal(model.stampState(b({ progress: 1 })), 'progress');
  assert.equal(model.stampState(b({ progress: 0 })), 'fresh');
  assert.equal(model.stampState(b({ is_hidden: true })), 'secret');
  // An earned stamp with no rewards is owned, never stuck on claim.
  assert.equal(model.stampState(b({ is_earned: true, rewards: rewards() })), 'owned');
  assert.equal(model.whereFor('visited_epcot'), 'park');
  assert.equal(model.whereFor('ride_passport_magic_kingdom'), 'park');
  assert.equal(model.whereFor('parks_visited'), 'park');
  assert.equal(model.whereFor('prep_items_collected'), 'anywhere');
  assert.equal(model.whereFor('friends_count'), 'anywhere');
  const book = model.buildBook({ stamps: { a: [
    stamp({ id: 1, progress: 1, target: 2 }), stamp({ id: 2, progress: 9, target: 10 }), stamp({ id: 3, progress: 0 }),
    stamp({ id: 4, progress: 3, target: 4 }), stamp({ id: 5, progress: 1, target: 100 }), stamp({ id: 6, is_hidden: true, progress: 5, target: 6 }),
    stamp({ id: 7, is_earned: true, progress: 2 }),
  ] } });
  assert.deepEqual(plain(model.almostThereList(book, 3).map(s => s.id)), [2, 4, 1]);
  // The tile tags are mutually exclusive and sit top-centre; title stamps wear a crown.
  const tile = read('src/screens/stampbook/StampTile.tsx');
  assert.match(tile, /const tag = state === 'claim' \? 'claim' : isNew && stamp\.earned \? 'new' : almost \? 'almost' : null;/);
  assert.match(tile, /\{hasTitle && \(/);
});

test('v3: titles list: wearing, ready, claim, progress, locked; secrets and unheld retired titles stay hidden', () => {
  const book = model.buildBook({ stamps: { a: [
    stamp({ id: 1, slug: 'a', is_earned: true, reward_claimed: true, progress: 2, rewards: rewards({ title: 'Explorer' }) }),
    stamp({ id: 2, slug: 'b', is_earned: true, reward_claimed: true, progress: 2, rewards: rewards({ title: 'Captain' }) }),
    stamp({ id: 3, slug: 'c', is_earned: true, reward_claimed: false, progress: 2, rewards: rewards({ title: 'Wild Legend' }) }),
    stamp({ id: 4, slug: 'd', progress: 1, rewards: rewards({ title: 'Hop Star' }) }),
    stamp({ id: 5, slug: 'e', progress: 0, rewards: rewards({ title: 'XP Machine' }) }),
    stamp({ id: 6, slug: 'f', is_hidden: true, rewards: rewards({ title: 'Legendary Explorer' }) }),
    stamp({ id: 7, slug: 'g', retired: true, rewards: rewards({ title: 'Night Owl' }) }),
    stamp({ id: 8, slug: 'h', rewards: rewards({ xp: 10 }) }),
  ] } });
  const list = model.titleEntries(book, [{ stamp_id: 1, title: 'Explorer' }, { stamp_id: 2, title: 'Captain' }], 'Captain');
  assert.deepEqual(plain(list.map(e => [e.title, e.state])), [
    ['Captain', 'wearing'], ['Explorer', 'ready'], ['Wild Legend', 'claim'], ['Hop Star', 'progress'], ['XP Machine', 'locked'],
  ]);
  assert.deepEqual(plain(model.titleCounts(list)), { owned: 2, total: 5 });
  assert.equal(model.titleLine(list[2]), 'Claim the stamp to unlock');
  assert.equal(model.titleLine(list[3]), 'From the Explorer stamp');
  for (const e of list) assert.ok(!/\u2014/.test(model.titleLine(e)));
});

test('v3: a claimed title stamp makes Wear title the main button; the book unlocks the title locally on close', () => {
  const card = read('src/screens/stampbook/StampCard.tsx');
  assert.match(card, /const wearFirst = titleReady && !wearingTitle;/);
  assert.match(card, /else if \(wearFirst\) action = \{ label: equipping \? 'Saving\.\.\.' : 'Wear title'/);
  assert.match(card, /function TitleBox\(/);
  const screen = read('src/screens/StampBookScreen.tsx');
  assert.match(screen, /if \(s\?\.rewards\?\.title && !unlocked\.some\(u => u\.stamp_id === id\)\) unlocked\.push/);
  // Wearing refreshes the player so the profile pill matches.
  // Optimistic: the title shows on the tap; the server call runs behind it and a failure puts the old one back.
  assert.match(screen, /setTitleOverride\(\{ title \}\);\s*try \{\s*await equipStampTitle\(stampId\);/);
  assert.match(screen, /setTitleOverride\(\{ title: before \}\);/);
});

test('v3: a stamp the app has never heard of still renders: star pictogram, plain count, km for distance, fallback art', () => {
  const unknown = model.toBookStamp(stamp({ metric: 'brand_new_metric', target_value: 5, target: 5, progress: 2 }));
  assert.equal(model.requirement(unknown).icon, 'star');
  assert.equal(model.remainingLine(unknown), '3 to go!');
  assert.equal(model.progressLabel(unknown), '2 / 5');
  const walk = model.toBookStamp(stamp({ metric: 'park_distance_m', target_value: 42200, target: 42200, progress: 12400 }));
  assert.equal(model.progressLabel(walk), '12.4 / 42.2 km');
  assert.equal(model.remainingLine(walk), '29.8 km to go!');
  assert.equal(model.whereFor('park_distance_m'), 'park');
  assert.equal(model.requirement(model.toBookStamp(stamp({ metric: 'trail_boxes_opened' }))).icon, 'gift');
  // No section from the server: the metric rules put it on the Special page; no art: the bundled fallback.
  assert.equal(model.toBookStamp(stamp({ metric: 'trail_boxes_opened' })).section, 'special');
  assert.match(read('src/screens/stampbook/art.ts'), /return \{ source: FALLBACK_ART, ghostIsReal: false \};/);
});

test('v3 round 2: compact counts, colour fills up but never reads as owned, claim-all totals, book cache per player', () => {
  assert.equal(model.compactCount(9999), '9,999');
  assert.equal(model.compactCount(10000), '10K');
  assert.equal(model.compactCount(30000), '30K');
  assert.equal(model.fillFraction(0), 0);
  assert.equal(model.fillFraction(40), 0.4);
  assert.ok(model.fillFraction(99) <= 0.85 && model.fillFraction(100) <= 0.85);
  assert.deepEqual(plain(model.sumRewards([{ rewards: rewards({ energy: 5, xp: 100 }) }, { rewards: rewards({ tickets: 2, xp: 50 }) }])),
    { energy: 5, tickets: 2, xp: 150, coins: 0 });
  const cache = read('src/screens/stampbook/cache.ts');
  assert.match(cache, /memory\.player === player/);
  assert.match(cache, /saved\.player !== player/);
  // The Titles list only ever says "Take off" (one word for it everywhere).
  assert.ok(!/'Remove'/.test(read('src/screens/stampbook/TitlesSheet.tsx')));
  assert.match(read('src/screens/stampbook/StampCard.tsx'), /wearingTitle \? 'Take off' : 'Wear title'/);
  assert.equal(model.secretHint({ metric: 'prep_items_collected', target: 100 }), 'Hint: keep catching finds!');
});

test('round 5: the unlock sparkle plays only on claim, never on taking a title off; Take off is one real button everywhere', () => {
  const card = read('src/screens/stampbook/StampCard.tsx');
  assert.match(card, /if \(state === 'ready' && was !== 'claim'\) return;/);
  assert.match(card, /wearingTitle \? 'Take off' : 'Wear title'\} variant="secondary"/);
  assert.ok(!/'Remove'/.test(read('src/screens/stampbook/TitlesSheet.tsx')));
  // The header title stops growing at 1.2x so it never outgrows its art at the largest text size.
  assert.match(read('src/components/Topbar/TopbarText.tsx'), /maxFontSizeMultiplier=\{1\.2\}/);
});
