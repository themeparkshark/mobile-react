/** Fin-ister panel r2 follow-ups for round 3 (items 8, 9, 11, 14, 15, 16). */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers/fright-fixtures.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rank = load('rankCard');
const layout = load('layout');
const intro = load('introArt');

test('R3-8 rank card payoff: gold fins with bounce + haptic, toggling chips, only Done submits, 1.5 s stamp', () => {
  assert.equal(rank.rankStamp(4, 25), '4 FINS · +25 XP');
  assert.equal(rank.rankStamp(1, null), '1 FIN');
  assert.equal(rank.RANK_STAMP_MS, 1500);
  assert.equal(rank.toggleReaction(null, 'jumped'), 'jumped');
  assert.equal(rank.toggleReaction('jumped', 'jumped'), null);
  assert.equal(rank.toggleReaction('jumped', 'screamed'), 'screamed');
  const card = read('src/components/fright/RankCard.tsx');
  assert.match(card, /mono=\{NIGHT\.candy\}/, 'lit fins are gold');
  assert.match(card, /Animated\.spring\(value/, 'bounce');
  assert.match(card, /Haptics\.impactAsync/, 'haptic per tap');
  assert.match(card, /setReaction\(current => toggleReaction\(current/, 'chips toggle');
  assert.equal((card.match(/onSubmit\(/g) ?? []).length, 1, 'one submit path');
  assert.match(card, /<NightButton label="Done" loading=\{sending\} onPress=\{\(\) => \{ void send\(\); \}\}/);
  assert.match(card, /setTimeout\(finish, RANK_STAMP_MS\)/);
  assert.match(card, /rankStamp\(score, prompt\.xp\)/);
});

test('R3-9 coach: rank_first shows ON the first rank card; toasts and coach marks stop left of the right rail', () => {
  const engine = read('src/components/fright/useFrightEngine.ts');
  assert.doesNotMatch(engine, /enqueueCoach\('rank_first'\)/, 'no coach after the card');
  assert.match(engine, /const hint = seen\.rank_first \? null : COACH_LINES\.rank_first\.line;/);
  assert.match(read('src/components/fright/RankCard.tsx'), /prompt\.hint && !stamp/);
  assert.equal(layout.overlayRightInset(), 16 + 55 + 8);
  const overlays = read('src/components/fright/FrightOverlays.tsx');
  assert.match(overlays, /toast: \{ position: 'absolute', left: 16, right: overlayRightInset\(\)/);
  assert.match(overlays, /coach: \{ position: 'absolute', left: 16, right: overlayRightInset\(\)/);
  // Drift guard: the rail constants match Map.tsx.
  const map = read('src/components/Map.tsx');
  assert.match(map, /top: controlsTop,\s*right: 16,/);
});

test('R3-11 Case File reveal: the image, NEW stamp, year badge, and "See my Lantern" opens the Deep Lantern', () => {
  const reveal = read('src/components/fright/CaseFileReveal.tsx');
  assert.match(reveal, /uri=\{file\.image\}/);
  assert.match(reveal, /file\.new && <View style=\{styles\.stamp\}>/);
  assert.match(reveal, /openDeepLantern\(eventSlug\)/);
  assert.match(reveal, /\{!!eventSlug && \(\s*<NightButton label="See my Lantern"/);
  assert.match(reveal, /transform: reduced \? \[\] :/, 'Reduce Motion fades');
  assert.match(read('src/components/fright/FrightLayer.tsx'), /eventSlug=\{night\.tonight\?\.event\?\.slug \?\? null\}/);
  // Card 3's blank nameplate gets a title, inside the plate of the contain-fit image.
  const plate = intro.casePlateRect(200);
  const imageWidth = 200 * (480 / 693);
  assert.ok(plate.left > (200 - imageWidth) / 2 && plate.left + plate.width < (200 + imageWidth) / 2);
  assert.ok(plate.top > 130 && plate.top + plate.height < 160);
  assert.match(read('src/components/fright/tutorial/FrightTutorial.tsx'), /plate: 'Tug of the Tides'/);
});

test('R3-14 art polish: hero disc removed, slate angler outline, contact shadows, glow inside SE, no stray stars', () => {
  // The cinematic glow stays inside a 375 pt (SE) screen with its 8 pt margin.
  for (const width of [375, 393, 430]) {
    const size = Math.min(width * 0.56, 240);
    const box = size * 1.5;
    const glow = intro.cinematicGlow(width, box, box, size * 0.33);
    const absLeft = (width - box) / 2 + glow.left;
    assert.ok(absLeft >= 8 - 0.001, `${width} left`);
    assert.ok(absLeft + glow.size <= width - 8 + 0.001, `${width} right`);
  }
  const tutorial = read('src/components/fright/tutorial/FrightTutorial.tsx');
  assert.doesNotMatch(tutorial, /SKY_STARS/);
  assert.match(tutorial, /<ContactShadow width=\{item\} \/>/);
  assert.match(tutorial, /return <Image source=\{HERO\} contentFit="cover"/, 'card 1 uses the cleaned bundled hero');
  // Art checks on the bundled files (pixel probes): no disc tint at the lantern, slate outline on the angler.
  const { execFileSync } = require('node:child_process');
  const probe = `
from PIL import Image
h = Image.open(${JSON.stringify(path.join(root, 'src/components/fright/art/tutorial-hero.webp'))}).convert('RGB')
inside = h.getpixel((180, 770)); outside = h.getpixel((140, 760))
a = Image.open(${JSON.stringify(path.join(root, 'src/components/fright/art/lantern.webp'))}).convert('RGBA')
ring = [a.getpixel((x, 256)) for x in range(0, 120) if a.getpixel((x, 256))[3] > 200][:12]
print(abs(inside[0] - outside[0]) + abs(inside[1] - outside[1]), max(max(p[:3]) for p in ring))`;
  let out = null;
  try { out = execFileSync('python3', ['-c', probe], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(' ').map(Number); } catch { out = null; }
  if (out) {
    assert.ok(out[0] < 12, `disc tint removed (diff ${out[0]})`);
    assert.ok(out[1] < 110, `angler outline is dark slate (max channel ${out[1]})`);
  }
});

test('R3-15 primary button labels are 18 pt (Next, Into the fog, Done, See it, Let\'s go, Retry)', () => {
  const ui = read('src/components/fright/ui.tsx');
  assert.match(ui, /label: \{ fontFamily: 'Shark', fontSize: 18,/);
  assert.match(ui, /minHeight: 48/);
});

test('R3-16 Marquee footer sits on its own scrim, off the silhouettes', () => {
  const card = read('src/components/fright/FrightRecapCard.tsx');
  assert.match(card, /<View style=\{styles\.footPlate\}>/);
  assert.match(card, /footPlate: \{[^}]*backgroundColor: 'rgba\(30,24,56,0\.78\)'/);
});
