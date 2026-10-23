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
