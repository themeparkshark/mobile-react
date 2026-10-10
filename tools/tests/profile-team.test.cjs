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
  assert.match(read('src/components/Playercard.tsx'), /TEAMS\[team\]\.badge/);
});
