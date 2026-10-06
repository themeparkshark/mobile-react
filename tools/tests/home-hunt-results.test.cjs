'use strict';
/**
 * Monday results: the held copy, the 900 ms rank countdown, rows inside the
 * modal, and the cap of 2 full-screen modals per app open (the rest become a
 * badge dot on the Standings tab).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');
const { plain } = require('./helpers/plain.cjs');

const model = loadTs('src/components/home/homeHuntResultsModel.ts');
const queueModule = loadTs('src/services/presentation/PresentationQueue.ts');

const result = (week, status = 'claimable', extra = {}) => ({
  week_key: week, status, rank: 12, tier_label: 'Top 25%', board_label: 'Orlando Area', points: 340, finds: 21,
  rewards: { energy: 60, tickets: 1, experience: 300 }, ...extra,
});

test('held results show the neutral checking copy and no Claim', () => {
  assert.equal(model.HELD_COPY, 'We are checking your reward. It shows up within 3 days.');
  assert.equal(model.isHeld(result('2026-W45', 'held')), true);
  assert.equal(model.canClaim(result('2026-W45', 'held')), false);
  assert.equal(model.canClaim(result('2026-W45')), true);
  const modal = read('src/components/home/HomeHuntResultsModal.tsx');
  assert.match(modal, /held \?[\s\S]*HELD_COPY/);
});

test('only claimable and held results present, oldest week first; claimed never does', () => {
  const list = [result('2026-W47'), result('2026-W45', 'claimed'), result('2026-W46', 'held')];
  assert.deepEqual(plain(model.presentableResults(list).map(r => r.week_key)), ['2026-W46', '2026-W47']);
  assert.equal(model.presentableResults(null).length, 0);
  assert.notEqual(model.resultPresentationId(result('2026-W46')), model.resultPresentationId(result('2026-W46', 'held')));
});

test('the rank countdown lasts 900 ms, never goes below the real rank and lands on it', () => {
  assert.equal(model.RANK_COUNTDOWN_MS, 900);
  let last = Infinity;
  for (let t = 0; t <= 900; t += 50) {
    const value = model.rankCountdownValue(12, t);
    assert.ok(value >= 12 && value <= last, `monotonic at ${t}`);
    last = value;
  }
  assert.equal(model.rankCountdownValue(12, 900), 12);
  assert.equal(model.rankCountdownValue(12, 5000), 12);
  assert.ok(model.rankCountdownValue(12, 0) > 12);
});

test('reduced motion shows everything at once', () => {
  const line = plain(model.revealTimeline(true));
  assert.deepEqual(Object.values(line), [0, 0, 0, 0, 0, 0]);
  const full = plain(model.revealTimeline(false));
  assert.ok(full.ribbon >= 900 && full.claim > full.rewards && full.rewards > full.chest && full.chest > full.ribbon);
  assert.match(read('src/components/home/HomeHuntResultsModal.tsx'), /useUiReducedMotion/);
});

test('team, stamps, ribbon, Perfect Week count and ticket note are rows inside the modal', () => {
  const rows = plain(model.extraRows(result('2026-W45', 'claimable', {
    cosmetic: { key: 'blue', label: 'Blue ribbon' }, perfect_week_count: 2, ticket_note: 'Ticket pouch full. Converted to 50 coins.',
    team_result: { label: 'Team Mouse won' }, stamps: [{ name: 'Wild Legend' }],
  })));
  assert.deepEqual(rows.map(row => row.key), ['cosmetic', 'perfect', 'team', 'stamps', 'ticket_note']);
  assert.deepEqual(plain(model.rewardRows(result('2026-W45')).map(row => row.value)), ['+60', '+1', '+300']);
  assert.equal(model.ribbonLabel(result('2026-W45')), 'Top 25%');
  assert.equal(model.rankLabel(result('2026-W45')), '#12 in the Orlando Area');
});

test('cap: at most 2 full-screen modals per app open; the rest become a Standings badge', () => {
  assert.equal(model.HOME_HUNT_MODAL_CAP, 2);
  assert.equal(queueModule.FULL_SCREEN_PER_APP_OPEN, 2);
  assert.equal(model.RESULTS_QUEUE_KIND, 'home_hunt_results');
  const queue = queueModule.createPresentationQueue();
  const request = week => ({ id: model.resultPresentationId(result(week)), kind: model.RESULTS_QUEUE_KIND, badge: model.RESULTS_BADGE_TARGET });
  assert.equal(queue.enqueue(request('2026-W44')), 'showing');
  assert.equal(queue.enqueue(request('2026-W45')), 'queued');
  assert.equal(queue.enqueue(request('2026-W46')), 'queued');
  queue.dismiss(request('2026-W44').id);
  assert.equal(queue.getState().current.id, request('2026-W45').id);
  queue.dismiss(request('2026-W45').id);
  assert.equal(queue.getState().current, null, 'a third modal never shows in one open');
  assert.equal(queue.badgesFor('standings').length, 1);
  assert.equal(queue.badgesFor('standings')[0].id, request('2026-W46').id);
  queue.startAppOpen();
  assert.equal(queue.enqueue(request('2026-W46')), 'showing', 'the next open gets another chance');
});

test('results never stack past the cap with a crowning ahead of them', () => {
  const queue = queueModule.createPresentationQueue();
  const id = week => model.resultPresentationId(result(week));
  queue.enqueue({ id: 'crown-1', kind: 'crowning', badge: 'coin_shelf' });
  queue.enqueue({ id: id('2026-W45'), kind: 'home_hunt_results', badge: 'standings' });
  queue.enqueue({ id: 'remint-1', kind: 'remint', badge: 'coin_shelf' });
  queue.dismiss('crown-1');
  assert.equal(queue.getState().current.id, id('2026-W45'));
  queue.dismiss(id('2026-W45'));
  assert.equal(queue.getState().current, null);
  assert.equal(queue.badgesFor('coin_shelf').length, 1);
});

test('the host asks the flag first, claimable before held, and the map mounts it after the daily chest', () => {
  const host = read('src/components/home/HomeHuntResultsHost.tsx');
  assert.match(host, /homeHuntEnabled\(week\)/);
  assert.match(host, /Number\(b\.status === 'claimable'\) - Number\(a\.status === 'claimable'\)/);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /<HomeHuntResultsHost enabled=\{[\s\S]*chestReady[\s\S]*dailyGiftOccluded/);
});

test('the chest art is the existing daily chest and no new art is added', () => {
  const modal = read('src/components/home/HomeHuntResultsModal.tsx');
  assert.match(modal, /daily\/chest-closed\.png/);
  assert.match(modal, /daily\/chest-open\.png/);
});
