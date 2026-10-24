'use strict';
/** "How do I know what team I'm on": team crest + name on Profile, the player card, and a Pick your team nudge. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');

const m = loadTs('src/components/profile/teamModel.ts');
const read = f => fs.readFileSync(f, 'utf8');

test('the team comes from the /me relation or a bare id, never a guess', () => {
  assert.equal(m.playerTeamId({ team: { team: 'shark', user_id: 1 } }), 'shark');
  assert.equal(m.playerTeamId({ team: 'globe' }), 'globe');
  assert.equal(m.playerTeamId({ team: null }), null);
  assert.equal(m.playerTeamId({ team: { team: 'pirates' } }), null);
  assert.equal(m.playerTeamId({}), null);
  assert.equal(m.playerTeamId(null), null);
});

test('own profile without a team gets the nudge; other players show only a real team', () => {
  assert.equal(m.teamSlot('mouse', true), 'team');
  assert.equal(m.teamSlot('mouse', false), 'team');
  assert.equal(m.teamSlot(null, true), 'pick');
  assert.equal(m.teamSlot(null, false), 'none');
});

test('Profile and player pages wire the chip and the card crest; the nudge opens team selection', () => {
  const profile = read('src/screens/ProfileScreen.tsx');
  assert.match(profile, /<TeamChip team=\{playerTeamId\(player\)\} own/);
  assert.match(profile, /navigate\('TeamSelection'/);
  assert.match(profile, /team=\{playerTeamId\(player\)\}\n\s+teamTop=\{76 \+ \(315 - STAGE_H\) \/ 2\}\n\s+inventory=/);
  const other = read('src/screens/PlayerScreen.tsx');
  assert.match(other, /<TeamChip team=\{playerTeamId\(currentPlayer\)\} own=\{false\} \/>/);
  assert.match(other, /team=\{playerTeamId\(currentPlayer\)\}/);
  const chip = read('src/components/profile/TeamChip.tsx');
  assert.match(chip, /Pick your team/);
  assert.doesNotMatch(chip, /—/);
  assert.match(read('src/components/profile/TitlePill.tsx'), /flexWrap: 'wrap'/);
  assert.match(read('src/components/Playercard.tsx'), /<TeamBadge\n\s+team=\{team\}\n\s+size=\{44\}/);
});

test('team names are plain: never Team Mouse or Team Globe (IP safety, Oct 23 2026)', () => {
  const fs2 = require('node:fs');
  const p2 = require('node:path');
  const { loadTs: load } = require('./helpers/ts-module.cjs');
  const teams = load('src/constants/teams.ts');
  assert.equal(teams.teamName('mouse'), 'Team Gold');
  assert.equal(teams.teamName('globe'), 'Team Green');
  assert.equal(teams.teamName('mouse', { mouse: 'Team Mouse' }), 'Team Gold', 'the old server default is ignored');
  assert.equal(teams.teamName('globe', { globe: 'Globe' }), 'Team Green');
  assert.equal(teams.teamName('mouse', { mouse: 'Team Sunrise' }), 'Team Sunrise', 'a real server rename still wins');
  assert.equal(teams.teamShortName('globe'), 'Green');
  const label = fs2.readFileSync(p2.join(__dirname, '../../src/services/liveEvents/model.ts'), 'utf8');
  assert.doesNotMatch(label, /'Team Mouse'|'Team Globe'/);
});

test('team badges never show the old mouse face or Earth globe (IP safety, round 2)', () => {
  const fs2 = require('node:fs');
  const p2 = require('node:path');
  const { loadTs: loadRaw } = require('./helpers/load-ts.cjs');
  // Every dependency is a stub; asset requires come back as numbers.
  const mocks = new Proxy({}, {
    has: () => true,
    get: (_, name) => (/\.png$/.test(name) ? 1 : name === '../constants/teams'
      ? { TEAMS: { mouse: { badge: 1, color: '#F59E0B' }, globe: { badge: 2, color: '#22C55E' }, shark: { badge: 3, color: '#3B82F6' } } }
      : {}),
  });
  const badge = loadRaw('src/components/TeamBadge.tsx', mocks);
  // Gold and Green are covered on every art kind; Shark is not.
  for (const kind of ['small', 'big', 'pillar']) {
    assert.ok(badge.TEAM_ART[kind].mouse.cover, `${kind} mouse`);
    assert.ok(badge.TEAM_ART[kind].globe.cover, `${kind} globe`);
    assert.equal(badge.TEAM_ART[kind].shark.cover, undefined, `${kind} shark`);
  }
  assert.equal(badge.TEAM_EMBLEM.mouse.icon, 'star');
  assert.equal(badge.TEAM_EMBLEM.globe.icon, 'map');
  // The cover sits on the circle inside a "contain" box: a tall art in a square box is centered sideways.
  const f = badge.coverFrame({ w: 85, h: 96, cover: { cx: 0.482, cy: 0.3125, d: 0.45 } }, 96, 96);
  assert.ok(Math.abs(f.size - 0.45 * 85) < 0.01);
  assert.ok(Math.abs(f.left - ((96 - 85) / 2 + 0.482 * 85 - f.size / 2)) < 0.01);
  assert.ok(Math.abs(f.top - (0.3125 * 96 - f.size / 2)) < 0.01);
  assert.equal(badge.coverFrame({ w: 1, h: 1 }, 10, 10), null);
  // Round 3: a cream face under the glyph, so the compass reads on a green chip, at every size.
  for (const size of [8, 12, 24, 60, 120]) {
    const l = badge.emblemLayers(size);
    assert.equal(l.face + 2 * (l.rim + l.ring), Math.max(size, l.face + 2 * (l.rim + l.ring)), `layers fit at ${size}`);
    assert.ok(l.face >= 2 && l.glyph >= 4 && l.glyph <= Math.max(4, l.face), `glyph fits the face at ${size}`);
    assert.ok(l.glyph / size >= (size >= 24 ? 0.55 : 0.3), `glyph is big enough at ${size}`);
  }
  // Round 4: at chip size (a 22pt badge has a ~9pt disc) the team ring goes and the glyph fills about 0.9 of the face.
  for (const size of [8, 9, 12, 15]) {
    const l = badge.emblemLayers(size);
    assert.equal(l.ring, 0, `no team ring at ${size}`); assert.equal(l.rim, 1);
    assert.ok(l.glyph / l.face >= 0.85, `glyph fills the face at ${size}`);
  }
  assert.ok(badge.emblemLayers(24).ring > 0, 'big badges keep the team ring');
  // Wave 2: under SMALL_EMBLEM the compass art (a gray dot at 9pt) becomes a plain two-tone needle; big badges keep Alex's compass.
  const badgeSrc = require('node:fs').readFileSync('src/components/TeamBadge.tsx', 'utf8');
  assert.match(badgeSrc, /needle: icon === 'map' && size < SMALL_EMBLEM/);
  assert.match(badgeSrc, /\{l\.needle \? <Needle size=\{l\.glyph\} \/> : <GameIcon name=\{icon\} size=\{l\.glyph\} \/>\}/);
  // It reads as a compass, not a diamond: a navy bezel ring, a tilted needle and a pivot.
  assert.match(badgeSrc, /l\.needle \? \{ borderWidth: 1, borderColor: NEEDLE_NORTH \} : null/);
  assert.match(badgeSrc, /rotate: '35deg'/);
  // The Green chip sits one step deeper than the shield's green, so the shield and compass stand out on it.
  const teamsMod = loadTs('src/constants/teams.ts');
  assert.notEqual(teamsMod.teamChipColor('globe'), teamsMod.TEAMS.globe.color);
  assert.equal(teamsMod.teamChipColor('mouse'), teamsMod.TEAMS.mouse.color);
  for (const file of ['src/components/RideControlBar.tsx', 'src/components/home/HomeLive.tsx']) {
    assert.match(fs2.readFileSync(p2.join(__dirname, '../..', file), 'utf8'), /styles\.chip, \{ backgroundColor: teamChipColor\(team\) \}/, file);
  }
  const team = fs2.readFileSync(p2.join(__dirname, '../../src/components/TeamBadge.tsx'), 'utf8');
  assert.match(team, /backgroundColor: FACE/, 'the glyph sits on a cream face, not on the team color');
  assert.match(team, /borderTopColor: RIM_LIGHT, borderBottomColor: RIM_DEEP/, 'the rim is beveled like Alex\'s shields');
  // Nothing else draws the old art directly.
  const src = p2.join(__dirname, '../../src');
  const walk = d => fs2.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(p2.join(d, e.name))
    : /\.tsx?$/.test(e.name) ? [p2.join(d, e.name)] : []);
  for (const file of walk(src)) {
    if (/TeamBadge\.tsx$|constants[\\/]teams\.ts$/.test(file)) continue;
    const text = fs2.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /team-(?:mouse|globe)-badge|pillar-(?:mouse|globe)|teams\/(?:mouse|globe)-small/, file);
    assert.doesNotMatch(text, /source=\{(?:team|TEAMS\[[^\]]+\])\.badge\}/, file);
  }
});

test('the team-pick screen shows no globe or castle skyline, and its copy is kid words (round 3)', () => {
  const fs2 = require('node:fs');
  const p2 = require('node:path');
  const screen = fs2.readFileSync(p2.join(__dirname, '../../src/screens/GymBattle/TeamSelectionScreen.tsx'), 'utf8');
  // water_background has a globe and castle in its top band: drawn 145% tall and pinned to the bottom, so that
  // band (the top ~31%) is above the screen. A cover fit keeps the cut a share of the art at every phone size.
  assert.match(screen, /source=\{require\('\.\.\/\.\.\/\.\.\/assets\/images\/water_background\.png'\)\} style=\{s\.bg\} contentFit="cover" contentPosition="bottom"/);
  assert.match(screen, /bg: \{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BG_TALL \}/);
  const tall = Number(/const BG_TALL = '(\d+)%'/.exec(screen)[1]) / 100;
  assert.ok(1 - 1 / tall >= 0.3, 'at least the top 30% of the art is off screen');
  for (const [w, h] of [[375, 667], [402, 874], [440, 956]]) {
    // Art 1290 x 2790 (aspect 0.462) in a box w x tall*h: cover scales by height when the box is narrower than the art.
    assert.ok(w / (tall * h) < 1290 / 2790, `cover fits by height at ${w}x${h}, so the cut is the same share`);
  }
  assert.doesNotMatch(screen, /water_background\.png'\)\} style=\{StyleSheet\.absoluteFill\}/);
  assert.doesNotMatch(screen, /Rope drop|perfect routes/, 'no grown-up park words on the team cards');
  // GymBattle's arena-bg.png is a stone plaza with plain towers: no globe, castle or wizard hat.
  const gym = fs2.readFileSync(p2.join(__dirname, '../../src/screens/GymBattle/GymBattleScreen.tsx'), 'utf8');
  assert.doesNotMatch(gym, /water_background/);
  // Round 4: the close X hangs from the safe-area top, never a fixed 54pt that crowds the title on iPhone SE.
  assert.match(screen, /style=\{\[s\.close, \{ top: insets\.top \+ CLOSE_GAP \}\]\}/);
  assert.doesNotMatch(screen, /close: \{ position: 'absolute', top: \d+/);
  const gap = Number(/const CLOSE_GAP = (\d+);/.exec(screen)[1]);
  // iPhone SE (r4 capture, idb frames): the X is 24..60pt tall at x 321, the title box starts at y 67 and ends at x 307.5.
  // So the X sits fully above the title line and 13.5pt to its right: never on top of the title.
  assert.ok(20 + gap + 36 < 67, 'the X ends above PICK YOUR TEAM on iPhone SE');
});
