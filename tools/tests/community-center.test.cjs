'use strict';
/**
 * Community Center (WS8): the ticket count shown and flown comes from the
 * server's tickets_earned, cooldowns (seconds from the server) read as time,
 * and every flourish animation has a reduced-motion path.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const rules = loadTs('src/screens/CommunityCenter/communityCenterRewards.ts');

test('ticket count follows the server response', () => {
  assert.equal(rules.ticketsEarnedFrom({ tickets_earned: 3 }, 'give'), 3);
  assert.equal(rules.ticketsEarnedFrom({ tickets_earned: '1' }, 'give'), 1);
  assert.equal(rules.ticketsEarnedFrom({ tickets_earned: 0 }, 'claim'), 0);
  assert.equal(rules.ticketsEarnedFrom({}, 'give'), 2, 'older server: give rule');
  assert.equal(rules.ticketsEarnedFrom(null, 'claim'), 1, 'older server: claim rule');
  assert.equal(rules.ticketLabel(1), 'Ticket');
  assert.equal(rules.ticketLabel(2), 'Tickets');
});

test('cooldowns are seconds, shown as time', () => {
  assert.equal(rules.formatCooldown(45), '45s');
  assert.equal(rules.formatCooldown(600), '10m');
  assert.equal(rules.formatCooldown(3600), '1h');
  assert.equal(rules.formatCooldown(3900), '1h 5m');
  assert.equal(rules.formatCooldown(-4), '0s');
});

test('screen and modal: reduced motion gates every flourish, counts come from the server', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/CommunityCenterScreen.tsx'), 'utf8');
  const modal = fs.readFileSync(path.join(root, 'src/components/CommunityCenterModal.tsx'), 'utf8');
  for (const [name, src] of [['screen', screen], ['modal', modal]]) {
    assert.match(src, /useUiReducedMotion\(\)/, `${name} reads reduced motion`);
    assert.match(src, /ticketsEarnedFrom\(response\.data/, `${name} uses tickets_earned`);
    assert.doesNotMatch(src, /ticketsEarned: [12],/, `${name} has no hardcoded ticket reward`);
    assert.doesNotMatch(src, /animationIn="zoomIn"/, `${name} modals fade under reduced motion`);
  }
  assert.doesNotMatch(screen, /triggerTicketFly\([^,]+, [12],/, 'fly count is not hardcoded');
  assert.match(screen, /if \(reduced\)[^\n]*\n?[^\n]*onComplete\(\)/, 'ticket fly skips straight to the result');
  assert.doesNotMatch(modal, /cooldown_remaining\}m/, 'modal cooldown is not raw seconds with an m');
});
