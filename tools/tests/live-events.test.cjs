'use strict';
/**
 * Shark Events (director stream): display rules, the shared store and poll
 * policy, the fixture's shape, the art, and the self-contained wiring rules
 * (no edits to the map, markers or the player shark).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const m = loadTs('src/services/liveEvents/model.ts');
const fx = loadTs('src/services/liveEvents/fixture.ts');
const NOW = Date.parse('2026-10-17T17:00:00Z');
const ev = opts => fx.goldenReefFixture({ now: NOW, ...opts });

test('pickEvent: live first, then chests left to open, then the next upcoming', () => {
  const live = ev({}), upcoming = ev({ phase: 'upcoming', mine: 0, total: 0 }), ended = ev({ phase: 'ended', mine: 34, claimed: 2 });
  assert.equal(m.pickEvent([upcoming, ended, live]).phase, 'live');
  assert.equal(m.pickEvent([upcoming, ended]).phase, 'ended');
  const doneEnded = ev({ phase: 'ended', mine: 2, total: 0, claimed: 0 });
  assert.equal(m.pickEvent([doneEnded, upcoming]).phase, 'upcoming');
  assert.equal(m.pickEvent([]), null);
  assert.equal(m.pickEvent(null), null);
});

test('trackFill: chests evenly spaced, partial progress inside a step', () => {
  const chests = [{ points: 4 }, { points: 12 }, { points: 30 }, { points: 60 }];
  assert.deepEqual(plain(m.trackFill(chests, 0)), { fill: 0, stops: [0.25, 0.5, 0.75, 1] });
  assert.equal(m.trackFill(chests, 4).fill, 0.25);
  assert.equal(m.trackFill(chests, 8).fill, 0.375);
  assert.equal(m.trackFill(chests, 999).fill, 1);
  assert.equal(m.trackFill([], 5).fill, 0);
});

test('openableKeys lists yours, then everyone\'s, then the team chest', () => {
  assert.deepEqual(plain(m.openableKeys(ev({ mine: 13, claimed: 1, total: 140 }))), ['p2', 't2']);
  assert.deepEqual(plain(m.openableKeys(ev({ phase: 'ended', mine: 34, claimed: 3, total: 290 }))), ['t2', 't3', 'team']);
});

test('chipState: chest ready beats Frenzy beats progress; upcoming says when', () => {
  assert.equal(m.chipState(ev({ mine: 13, claimed: 1 }), NOW).kind, 'open');
  const frenzy = m.chipState(ev({ mine: 9, claimed: 2, total: 20, frenzy: true }), NOW);
  assert.equal(frenzy.kind, 'frenzy');
  assert.match(frenzy.line, /^Rides x2 until \d{1,2}(:\d\d)? (AM|PM)$/);
  const p = m.chipState(ev({ mine: 9, claimed: 2, total: 20 }), NOW);
  assert.equal(p.kind, 'progress');
  assert.ok(p.fill > 0.25 && p.fill < 0.5);
  assert.match(m.chipState(ev({ phase: 'upcoming', mine: 0, total: 0 }), NOW).line, /^Starts /);
});

test('time words are clock times or days, never a ticking countdown', () => {
  const live = ev({});
  assert.match(m.timeLine(live, NOW), /^Ends (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}(:\d\d)? (AM|PM)$/);
  const soon = { ...live, ends_at: new Date(NOW + 3 * 3600_000).toISOString() };
  assert.match(m.timeLine(soon, NOW), /^Ends \d{1,2}(:\d\d)? (AM|PM)$/);
  assert.equal(m.timeLine(ev({ phase: 'ended' }), NOW), 'Open your chests');
  for (const line of [m.timeLine(live, NOW), m.timeLine(soon, NOW)]) assert.doesNotMatch(line, /\d+:\d\d:\d\d|\d+m \d+s/);
});

test('next step hint counts actions, not points', () => {
  const e = ev({ mine: 9, claimed: 2, total: 20 }); // next chest at 12: 3 points
  assert.equal(m.nextStepHint(e, true), 'Win 1 ride');
  assert.equal(m.nextStepHint(e, false), 'Find 3 snacks');
  assert.equal(m.nextStepHint(ev({ mine: 60, claimed: 4 }), true), null);
  // Never more snacks than a day can count; a park-only event says so.
  assert.equal(m.nextStepHint(ev({ mine: 31, claimed: 3 }), false), 'Find 8 snacks today');
  assert.equal(m.nextStepHint({ ...e, include_home: false }, false), 'Win rides at a park');
});

test('star times are whole numbers and the goal word has a fallback', () => {
  assert.equal(m.starTimes(ev({})), 2);
  assert.equal(m.starTimes({ ...ev({}), star_times: undefined, points: { home_find: 1, ride_win: 4, spotlight_win: 10, boss_hit: 1 } }), 3);
  assert.equal(m.goalWord({ ...ev({}), goal_word: 'reef' }), 'reef');
  assert.equal(m.goalWord({ ...ev({}), goal_word: '' }), 'event');
});

test('team place shares ties and needs a team', () => {
  assert.equal(m.teamPlace({ mouse: 21, globe: 34, shark: 27 }, 'shark'), 2);
  assert.equal(m.teamPlace({ mouse: 34, globe: 34, shark: 27 }, 'mouse'), 1);
  assert.equal(m.teamPlace({ mouse: 0, globe: 0, shark: 0 }, 'mouse'), null);
  assert.equal(m.teamPlace({ mouse: 3, globe: 0, shark: 0 }, null), null);
  assert.equal(m.ordinal(3), '3rd');
});

test('gain only counts more points on the same event; star rides only live at an event park', () => {
  const a = ev({ mine: 9 }), b = ev({ mine: 17 });
  assert.equal(m.pointsGained(a, b), 8);
  assert.equal(m.pointsGained(b, a), 0);
  assert.equal(m.pointsGained(null, b), 0);
  assert.deepEqual([...m.starRideIds(a)], [101, 102, 103]);
  assert.equal(m.starRideIds({ ...a, here: false }).size, 0);
  assert.equal(m.starRideIds(ev({ phase: 'ended' })).size, 0);
});

test('reward chips put gear first and skip zeros', () => {
  const chips = plain(m.rewardChips({ coins: 300, tickets: 2, energy: 0, xp: 0, item: { id: 9, name: 'Golden Reef Snorkel', image: null } }));
  assert.deepEqual(chips.map(c => c.icon), ['gift', 'coin', 'ticket']);
});

function loadStore(reads) {
  const calls = [];
  const react = { useCallback: f => f, useEffect: () => undefined, useRef: v => ({ current: v }), useState: v => [v, () => undefined], useSyncExternalStore: (_s, get) => get() };
  const store = loadTs('src/services/liveEvents/useLiveEvent.ts', {
    react,
    '../../hooks/useLivePoll': { default: () => undefined },
    '../../api/endpoints/live-events': { getLiveEvents: async parkId => { calls.push(parkId); return reads.shift()(); }, openEventChest: async () => ({}) },
  });
  return { store, calls };
}

test('store: one request at a time, gain detected, poll slows when idle or failing', async () => {
  const first = ev({ mine: 9 }), second = ev({ mine: 17 });
  const { store, calls } = loadStore([() => [first], () => [second], () => { throw new Error('404'); }, () => []]);
  store.resetLiveEvent();
  await Promise.all([store.refreshLiveEvent(5), store.refreshLiveEvent(5)]);
  assert.equal(calls.length, 1);
  assert.equal(store.liveEventSnapshot().event.me.points, 9);
  assert.equal(store.pollIntervalForState(store.liveEventSnapshot()), store.LIVE_POLL_MS);
  await store.refreshLiveEvent(5);
  assert.equal(store.liveEventSnapshot().gained, 8);
  await store.refreshLiveEvent(5);
  assert.equal(store.liveEventSnapshot().failed, true);
  assert.equal(store.pollIntervalForState(store.liveEventSnapshot()), store.ERROR_POLL_MS);
  await store.refreshLiveEvent(5);
  assert.equal(store.liveEventSnapshot().event, null);
  assert.equal(store.pollIntervalForState(store.liveEventSnapshot()), store.IDLE_POLL_MS);
});

test('event art ships at drawn size and every screen piece stays self-contained', () => {
  for (const f of ['golden-reef-emblem.webp', 'reef-chest-closed.webp', 'reef-chest-open.webp']) {
    const size = fs.statSync(path.join(root, 'assets/images/events', f)).size;
    assert.ok(size < 60_000, `${f} is ${size} bytes`);
  }
  const files = fs.readdirSync(path.join(root, 'src/components/liveEvents'));
  for (const f of files) {
    const code = src(`src/components/liveEvents/${f}`);
    assert.doesNotMatch(code, /from '\.\.\/(Map|map\/|TaskMarker)/, `${f} must not reach into the map`);
    assert.doesNotMatch(code, /[\u{1F300}-\u{1FAFF}]/u, `${f} has no emoji`);
  }
});

test('copy stays short: how-to steps are 3 words or fewer', () => {
  const steps = plain(ev({}).how_to).map(s => s.text);
  const sheet = src('src/components/liveEvents/EventSheet.tsx');
  for (const t of ['Win and find', 'Fill the bar', 'Open chests']) assert.ok(sheet.includes(`'${t}'`), t);
  for (const s of steps) assert.ok(s.split(' ').length <= 3, s);
});

test('hooks are never called behind || / && / ? (hook order stays fixed)', () => {
  for (const dir of ['src/components/liveEvents', 'src/components/nextUp', 'src/services/liveEvents']) {
    for (const f of fs.readdirSync(path.join(root, dir))) {
      const code = src(`${dir}/${f}`);
      assert.doesNotMatch(code, /(\|\||&&|\?)\s*!?\s*use[A-Z]\w*\(/, `${dir}/${f}`);
    }
  }
});

test('activity line: counts only, never zero, recent opens only', () => {
  const NOWX = Date.parse('2026-10-17T17:00:00Z');
  const e = fx.goldenReefFixture({ now: NOWX });
  assert.equal(m.activityLine(e, NOWX), '+46 in the last 15 min  ·  a chest opened 3 min ago');
  assert.equal(m.activityLine({ ...e, activity: { recent_points: 0, last_open_at: null } }, NOWX), null);
  assert.equal(m.activityLine({ ...e, activity: { recent_points: 0, last_open_at: new Date(NOWX - 5 * 3600_000).toISOString() } }, NOWX), null);
});
