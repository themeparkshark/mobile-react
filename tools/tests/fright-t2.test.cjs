/** Fin-ister tranche 2: encounter catch, Case File reveal, rewards, Share Studio, Deep Lantern pins. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers/fright-fixtures.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tutorial = load('tutorial');
const modals = load('modalQueue');
const rewards = load('rewards');
const share = load('share');
const art = load('art');

test('T1 tutorial: card 4 is Chaos Hour ONLY when config.encounters_enabled; still 5 cards; 7 words max', () => {
  const off = tutorial.tutorialCards(false);
  assert.equal(off.length, 5);
  assert.equal(off.some(card => card.key === 'chaos'), false, 'never promise an encounter that is off');
  assert.equal(tutorial.tutorialCards(null).some(card => card.key === 'chaos'), false);
  const on = tutorial.tutorialCards(true);
  assert.equal(on.length, 5);
  assert.equal(on[3].key, 'chaos');
  assert.equal(on[3].title, 'Chaos Hour');
  assert.equal(on[3].line, 'Catch the critters. Chaos Hour at 11:11 PM.', 'names no single critter (panel ship #7)');
  assert.ok(on.filter(card => card.key !== 'chaos').every(card => card.line.split(/\s+/).length <= 7), '7 words max');
  assert.match(read('src/components/fright/FrightLayer.tsx'), /encountersEnabled=\{night\.tonight\?\.config\?\.encounters_enabled === true\}/);
});

test('T1 encounter catch: server-gated, side asked before the first catch, quiet respected, sprite tap wired', () => {
  const engine = read('src/components/fright/useFrightEngine.ts');
  assert.match(engine, /const encountersOn = tonight\?\.config\?\.encounters_enabled === true/);
  assert.match(engine, /if \(needsSidePick\(me\)\) \{\s*queueModal\(\{ id: `side:/, 'first catch of the night asks for a side');
  assert.match(engine, /result\.needs_side/, 'a server needs_side also opens the picker');
  assert.match(engine, /findFrightSpot\(encounterNow\.key, \[toWireFix\(sample\)\], side\)/);
  assert.match(read('src/components/fright/FrightPill.tsx'), /engine\.encounter && !engine\.encounter\.caught && !engine\.quiet/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /onEncounterPress: \(\) => \{ void frightEngine\.catchEncounter\(\); \}/);
  const picker = read('src/components/fright/SidePicker.tsx');
  assert.match(picker, /Team Chaos/);
  assert.match(picker, /Team Control/);
});

test('T2 one modal at a time: arrival order, the team pick first, never in quiet / off-map / blocked', () => {
  const gate = { quiet: false, focused: true, foreground: true, blocked: false };
  let q = modals.pushModal([], { id: 'rank:a', kind: 'rank', prompt: { key: 'a', name: 'A', reSwim: false, lastScore: null } });
  q = modals.pushModal(q, { id: 'file:x', kind: 'case_file', file: { key: 'x' } });
  q = modals.pushModal(q, { id: 'file:x', kind: 'case_file', file: { key: 'x' } });
  assert.equal(q.length, 2, 'duplicates dropped');
  assert.equal(modals.visibleModal(q, gate).id, 'rank:a');
  assert.equal(modals.visibleModal(q, { ...gate, quiet: true }), null, 'phones-down quiet');
  assert.equal(modals.visibleModal(q, { ...gate, focused: false }), null, 'never over Line Play');
  assert.equal(modals.visibleModal(q, { ...gate, blocked: true }), null, 'tutorial / sheet / other dialog');
  q = modals.pushModal(q, { id: 'side:enc', kind: 'side', encounterKey: 'enc', name: 'Chuckles' });
  assert.equal(modals.visibleModal(q, gate).kind, 'side');
  q = modals.dropModal(q, 'side:enc');
  q = modals.dropModal(q, 'rank:a');
  assert.equal(modals.visibleModal(q, gate).id, 'file:x');
  assert.match(read('src/components/fright/FrightLayer.tsx'), /visible=\{!!engine\.recapOffer && !engine\.modal\}/, 'exit card waits too');
});

test('T2 rank card first: a Case File found in line waits behind it; the finish rewards follow the rank; never yanks the modal on screen', () => {
  const gate = { quiet: false, focused: true, foreground: true, blocked: false };
  const rank = { id: 'rank:h:1', kind: 'rank', prompt: { key: 'h', name: 'H', reSwim: false, lastScore: null } };
  let q = modals.pushModal([], { id: 'file:x', kind: 'case_file', file: { key: 'x' } });
  q = modals.pushModal(q, { id: 'rewards:found:x', kind: 'rewards', rewards: [] });
  q = modals.pushModal(q, rank);
  q = modals.pushModal(q, { id: 'rewards:h:1', kind: 'rewards', rewards: [] });
  assert.equal(q.map(m => m.id).join(','), 'rank:h:1,rewards:h:1,file:x,rewards:found:x');
  assert.equal(modals.visibleModal(q, gate).id, 'rank:h:1');
  // A Case File already on screen stays; the rank card is next.
  let shown = modals.pushModal([], { id: 'file:y', kind: 'case_file', file: { key: 'y' } });
  shown = modals.pushModal(shown, { id: 'rewards:found:y', kind: 'rewards', rewards: [] });
  shown = modals.pushModal(shown, rank, 'file:y');
  assert.equal(shown.map(m => m.id).join(','), 'file:y,rank:h:1,rewards:found:y');
  assert.match(read('src/components/fright/useFrightEngine.ts'), /pushModal\(current, modal, showingModal\.current\)/);
  // In line past the quiet window: the Case File waits; only a team pick (a catch tap) shows.
  const waiting = modals.pushModal([], { id: 'file:z', kind: 'case_file', file: { key: 'z' } });
  assert.equal(modals.visibleModal(waiting, { ...gate, inLine: true }), null);
  assert.equal(modals.visibleModal(modals.pushModal(waiting, { id: 'side:e', kind: 'side', encounterKey: 'e', name: 'C' }), { ...gate, inLine: true }).kind, 'side');
  assert.equal(modals.visibleModal(waiting, gate).id, 'file:z');
  assert.match(read('src/components/fright/useFrightEngine.ts'), /visibleModal\(modals, \{ quiet, inLine: !!openRun,/);
});

test('T2 Case File reveal: flip from the silhouette to the front art, NEW stamp, year badge, title overlay; Reduce Motion fades', () => {
  const src = read('src/components/fright/CaseFileReveal.tsx');
  assert.match(src, /useReducedGameMotion/);
  assert.match(src, /rotateY/);
  assert.match(src, /transform: reduced \? \[\] :/, 'no flip with Reduce Motion');
  assert.match(src, /uri=\{file\.image\}/);
  assert.match(src, /file\.new && <View style=\{styles\.stamp\}>/);
  assert.match(src, /file\.year_label/);
  assert.match(src, /label="Keep it"/);
  assert.match(src, /label="See my Lantern" variant="ghost"/);
  assert.doesNotMatch(src, /Into the Lantern/);
});

test('T3 rewards: render what the server sends; "Added to your wardrobe" only for real items; XP alone shows no modal', () => {
  const pin = { kind: 'pin', name: 'I Survived Pin', image: null, item_id: 9, key: 'haunts_5' };
  const coat = { kind: 'cosmetic', name: 'Ringmaster of Frights Coat', image: null, item_id: 12, key: 'all_haunts' };
  const xp = { kind: 'xp', name: 'XP', image: null, amount: 25 };
  assert.equal(rewards.wardrobeLine(pin), 'Added to your wardrobe');
  assert.equal(rewards.wardrobeLine({ ...pin, item_id: null }), null, 'no item, no wardrobe promise');
  assert.equal(rewards.wardrobeLine(xp), null);
  assert.equal(rewards.lanternLine(pin), 'On your Deep Lantern too');
  assert.equal(rewards.lanternLine(coat), null);
  assert.equal(rewards.rewardReveal([xp]), null);
  const reveal = rewards.rewardReveal([xp, coat, pin, { kind: 'coins', name: 'Coins', image: null, amount: 10 }]);
  assert.equal(reveal.items[0].kind, 'cosmetic', 'earned gear is the hero, ahead of the pin');
  assert.equal(reveal.items[1].kind, 'pin');
  assert.equal(reveal.headline, 'Every haunt this season!');
  assert.deepEqual(plain(reveal.chips), ['+25 XP', '+10 Coins']);
  for (const key of ['ten_in_one', 'first_haunt', 'all_haunts', 'haunts_5', 'case_files_10', 'first_night', 'encounter', 'lantern_lv10']) {
    assert.ok(rewards.MILESTONE_LINES[key], key);
  }
});

test('T4 Share Studio: fright payloads carry no dates, parks or usernames; Marquee share hidden inside modals', () => {
  const recap = { event_slug: 'usf-2026', card_title: 'Fin-ister Nights 2026', park_name: 'Universal Studios Florida', night_on: '2026-10-09',
    night_number: 3, haunts: Array.from({ length: 12 }, (_, i) => ({ key: `h${i}`, name: 'The Robot City', badge: `https://cdn.test/b${i}.webp`,
      wait_minutes: 10, posted_minutes: 20, score: 4, reaction: null, re_swim: false, at: '2026-10-09T20:00:00-04:00' })),
    reefs: [], case_files: [], pins: [], encounter: null, totals: { haunts: 12, minutes_in_line: 160, lantern_parts: 16 }, ten_in_one: false,
    headline: '12 haunts survived!', share: { title: 't', subtitle: 's', stat_lines: ['2h 40m in line'] } };
  const night = share.recapFlex(recap);
  assert.equal(night.badgeUrls.length, 10, 'contract cap');
  assert.equal(night.haunts, 12);
  const text = JSON.stringify(night);
  assert.doesNotMatch(text, /2026-10-09|Universal|Florida/);
  const card = { card_title: 'Fin-ister Nights 2026', nights: 3, slots: [
    { key: 'a', kind: 'haunt', name: 'The Robot City', earned: true, runs: 3, badge: 'https://cdn.test/a.webp', pin: null, pin_art: null },
    { key: 'b', kind: 'haunt', name: 'The Farmhouse UFO', earned: true, runs: 1, badge: null, pin: { image: 'https://cdn.test/p.webp' }, pin_art: null },
    { key: 'c', kind: 'haunt', name: 'Locked', earned: false, runs: 0, badge: null, pin: null, pin_art: null },
    { key: 'r', kind: 'reef', name: 'Reef', earned: true, runs: 1, badge: null, pin: null, pin_art: null }] };
  assert.equal(share.badgeFlex(card, card.slots[2]), null, 'locked haunts never share');
  assert.equal(share.badgeFlex(card, card.slots[3]), null);
  assert.equal(share.badgeFlex(card, card.slots[0]).runs, 3);
  assert.equal(share.badgeFlex(card, card.slots[1]).pinUrl, 'https://cdn.test/p.webp');
  assert.deepEqual(plain(share.lanternFlex(card)), { hauntsSurvived: 4, reSwims: 2, nights: 3, cardTitle: 'Fin-ister Nights 2026' });
  assert.equal(share.nightFlex(card, { haunts: 1, minutes_in_line: 30 }, 2).headline, '1 haunt survived!');
  const marquee = read('src/components/fright/MarqueeRecap.tsx');
  assert.match(marquee, /\(!inModal \|\| SHARE_IN_MODALS\)/);
  assert.match(marquee, /nightOn=\{target\.nightOn\} inModal/);
  assert.doesNotMatch(marquee, /captureRef/);
  // Off on production: only an opted-in dev build or the internal testflight channel turns it on (src/share/modalGate.ts).
  assert.match(read('src/share/index.ts'), /SHARE_IN_MODALS(?:: boolean)? = (?:false|__DEV__ && process\.env\.EXPO_PUBLIC_SHARE_IN_MODALS === '1'|shareInModalsFor\(__DEV__, process\.env\.EXPO_PUBLIC_SHARE_IN_MODALS, Updates\.channel\));/, 'flag off in release');
  const gate = read('src/share/modalGate.ts');
  assert.match(gate, /if \(channel === 'testflight'\) return true;\n  return dev && devFlag === '1';/, 'production never turns it on');
  const cardScreen = read('src/components/fright/FrightCardScreen.tsx');
  for (const kind of ['fright_lifetime', 'fright_badge', 'fright_night']) assert.match(cardScreen, new RegExp(`kind="${kind}"`));
});

test('T5 Deep Lantern pins: the real pin item image when earned, else pin_art; locked silhouette otherwise', () => {
  const pinArt = { image: 'https://cdn.test/art.webp', locked: 'https://cdn.test/locked.webp' };
  const pin = { image: 'https://cdn.test/item.webp', earned_on: '2026-10-09' };
  assert.equal(art.pinImage({ earned: true, pin_art: pinArt, pin }).uri, 'https://cdn.test/item.webp');
  assert.equal(art.pinImage({ earned: true, pin_art: pinArt, pin: { image: null, earned_on: 'x' } }).uri, 'https://cdn.test/art.webp');
  assert.equal(art.pinImage({ earned: false, pin_art: pinArt, pin: { image: 'https://cdn.test/item.webp', earned_on: null } }).uri,
    'https://cdn.test/locked.webp');
});

test('Case File title sits on the art\'s blank nameplate (measured band, cover-fit math), in dark ink', () => {
  const src = read('src/components/fright/CaseFileReveal.tsx');
  assert.match(src, /CASE_FILE_ART = \{ w: 480, h: 719, plateTop: 0\.659, plateBottom: 0\.821, plateLeft: 0\.11, plateRight: 0\.9 \}/);
  assert.match(src, /plate: \{ position: 'absolute', top: PLATE\.top, height: PLATE\.height, left: PLATE\.left, right: PLATE\.right,/);
  assert.match(src, /title: \{ fontFamily: 'Shark', fontSize: 20, color: NIGHT\.ink,/);
  // 260 x 360 card: the plate is 242 to 305 pt down, 29 pt in from the left, 26 from the right.
  const W = 260, H = 360, a = { w: 480, h: 719, t: 0.659, b: 0.821, l: 0.11, r: 0.9 };
  const s = Math.max(W / a.w, H / a.h), dh = a.h * s, dw = a.w * s, y0 = (H - dh) / 2, x0 = (W - dw) / 2;
  assert.equal(Math.round(y0 + dh * a.t), 242);
  assert.equal(Math.round(dh * (a.b - a.t)), 63);
  assert.equal(Math.round(x0 + dw * a.l), 29);
});

test('Lantern card Case File thumbnails: title on the art nameplate (same measured band as the reveal), art-shaped tile', () => {
  const src = read('src/components/fright/FrightCardScreen.tsx');
  assert.match(src, /import \{ CASE_FILE_ART, caseFilePlate \} from '\.\/CaseFileReveal';/);
  assert.match(src, /const THUMB_PLATE = caseFilePlate\(THUMB_W, THUMB_H\);/);
  assert.match(src, /filePlate: \{ position: 'absolute', top: THUMB_PLATE\.top, height: THUMB_PLATE\.height,/);
  assert.match(src, /filePlateTitle: \{ fontFamily: 'Shark', fontSize: 13, color: NIGHT\.ink/);
});
