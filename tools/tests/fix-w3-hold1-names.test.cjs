/**
 * Fix round w3, hold-fix 1, regression R2: the guide card and the pill under PLAY! named the same coin two
 * ways (Matterhorn Bobsleds / Matterhorn, Enchanted Tiki Room / Tiki Room, Finding Nemo Submarine Voyage /
 * Submarine Voyage). Three API boundaries skipped the one display-name table: the coin PLAY! is up for, today's
 * Adventure ticket and the coin game result. Each test fails without its fix.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const N = loadTs('src/helpers/plainRideName.ts');

test('R2: the coin under PLAY! reads like the guide card (Matterhorn Bobsleds, Finding Nemo Submarine Voyage)', () => {
  for (const [raw, shown] of [['Matterhorn', 'Matterhorn Bobsleds'], ['Submarine Voyage', 'Finding Nemo Submarine Voyage'],
    ['Tiki Room', 'Enchanted Tiki Room'], ['Mr. Toad', "Mr. Toad's Wild Ride"]]) {
    const r = N.withPlainRedeemableName({ type: 'task', model: { id: 68, name: raw, ticket_cost: 1 } });
    assert.equal(r.model.name, shown);
    assert.equal(r.model.name, N.plainRideName(raw), 'the same table the map list uses');
    assert.equal(r.model.ticket_cost, 1);
  }
  const key = { type: 'key', model: { id: 3, name: 'Matterhorn' } };
  assert.equal(N.withPlainRedeemableName(key), key, 'a key or a find keeps its own name');
  assert.equal(N.withPlainRedeemableName(null), null);
  assert.match(read('src/api/endpoints/me/current-redeemable.ts'), /return withPlainRedeemableName\(data\.data\);/);
});

test('R2: today\'s Adventure sheet and the win card use the same names', () => {
  const ticket = N.withPlainAdventureNames({ id: 1, ride: { task_id: 77, ride_name: 'Tiki Room' },
    ride_choices: [{ task_id: 68, ride_name: 'Matterhorn' }], discover: { task_id: 77, ride_name: 'Tiki Room', kind: 'coin_win' }, play: null });
  assert.equal(ticket.ride.ride_name, 'Enchanted Tiki Room');
  assert.equal(ticket.ride_choices[0].ride_name, 'Matterhorn Bobsleds');
  assert.equal(ticket.discover.ride_name, 'Enchanted Tiki Room');
  assert.equal(ticket.play, null);
  const adv = read('src/api/endpoints/me/adventure-ticket.ts');
  assert.equal((adv.match(/return withPlainAdventureNames\(data\.data\);/g) ?? []).length, 2, 'get and pick');
  assert.match(read('src/api/endpoints/me/trip-goal.ts'), /adventure_ticket: withPlainAdventureNames\(data\.adventure_ticket\)/);
  const won = N.withPlainAttemptNames({ tickets: 2, attempt: { id: 9, rewards: { task_name: 'Submarine Voyage', xp_earned: 25,
    ride_control: { ride_name: 'Submarine Voyage', team: 'shark', points: 5 } } } });
  assert.equal(won.attempt.rewards.task_name, 'Finding Nemo Submarine Voyage');
  assert.equal(won.attempt.rewards.ride_control.ride_name, 'Finding Nemo Submarine Voyage');
  assert.equal(won.attempt.rewards.xp_earned, 25);
  assert.equal(won.tickets, 2);
  const attempts = read('src/api/endpoints/me/task-attempts.ts');
  assert.equal((attempts.match(/return withPlainAttemptNames\(data\.data\);/g) ?? []).length, 3, 'start, get and resolve');
});

test('integrator list: the LinePlay recap never says "4 of 2 Parts to Level 2"; it says the Parts are ready', () => {
  const R = loadTs('src/services/lineplay/waitScreen.ts');
  const coin = (parts, need, energy = 20) => ({ current_level: 1, max_level: 5, available_parts: parts, parts_to_next_level: need, energy_to_next_level: energy });
  assert.equal(R.recapCoinLine(coin(4, 2), 50), 'Ready to level up', 'the grader\'s Indiana Jones case');
  assert.equal(R.recapCoinLine(coin(4, 2, 30), 10), 'Parts ready · 20 more Energy');
  assert.equal(R.recapCoinLine(coin(1, 4), 50), '1 of 4 Parts to Level 2');
  assert.equal(R.recapCoinLine(coin(1, 4, 30), 10), '1 of 4 Parts to Level 2 · 20 more Energy');
  const recap = read('src/screens/LinePlay/components/SessionRecap.tsx');
  assert.doesNotMatch(recap, /of \$\{coin\.parts_to_next_level\} Parts to Level/);
  assert.match(recap, /\{recapCoinLine\(coin, playerEnergy\)\}/);
});

test('integrator list: no "You earned 10 XP!" on the map after a win card that said +25 XP', () => {
  const B = loadTs('src/api/broadcastFilter.ts');
  B.resetBroadcastHoldForTests();
  const shown = [];
  const show = m => shown.push(...m);
  B.holdBroadcasts(true);
  B.routeBroadcasts(['You earned 10 XP!', 'Level 4 unlocked!'], show);
  B.foldHeldXp(); // the win card's reward row shows +25 XP
  B.routeBroadcasts(['You earned 15 XP!'], show);
  B.holdBroadcasts(false);
  assert.deepEqual(shown, ['Level 4 unlocked!'], 'other news still shows, in order');
  // No win card: XP news shows as before.
  B.holdBroadcasts(true);
  B.routeBroadcasts(['You earned 5 XP!'], show);
  B.holdBroadcasts(false);
  assert.deepEqual(shown, ['Level 4 unlocked!', 'You earned 5 XP!']);
  B.routeBroadcasts(['You earned 7 XP!'], show);
  assert.equal(shown.at(-1), 'You earned 7 XP!', 'outside a hold nothing is folded');
  const modal = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(modal, /setXpEarned\(attempt\.rewards\.xp_earned\);\n\s+\/\/ [^\n]+\n\s+foldHeldXp\(\);/);
});
