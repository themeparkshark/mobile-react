const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/match-link.test.cjs
// Multiplayer cleanup: a battle or waiting screen that loses the park server
// says "Reconnecting...", retries with backoff, then offers a free way out.
// Backgrounding never counts as a drop. Every wait has an exit.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const link = loadTs('src/services/match/matchLink.ts');

function fakeClock(start = 1_000_000) {
  let now = start, id = 0;
  const timers = new Map();
  return {
    now: () => now,
    random: () => 0.5,
    setTimeout(fn, ms) { const handle = ++id; timers.set(handle, { fn, at: now + ms }); return handle; },
    clearTimeout(handle) { timers.delete(handle); },
    pending: () => [...timers.values()].map(t => t.at - now).sort((a, b) => a - b),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

function controller(windowMs) {
  const clock = fakeClock();
  const phases = [];
  let retries = 0;
  const c = new link.MatchLinkController(() => { retries += 1; }, phase => phases.push(phase), clock, windowMs);
  return { c, clock, phases, retries: () => retries };
}

const offline = Object.assign(new Error('Network Error'), { response: { status: 0 } });

test('the phase is live until a failure, reconnecting inside the window, then lost', () => {
  let s = link.INITIAL_LINK;
  assert.equal(link.linkPhase(s, 0), 'live');
  s = link.linkFail(s, 1000);
  assert.equal(link.linkPhase(s, 1000), 'reconnecting');
  assert.equal(link.linkPhase(link.linkFail(s, 5000), 5000), 'reconnecting', 'more failures keep the first failure time');
  assert.equal(link.linkPhase(s, 1000 + link.RECONNECT_WINDOW_MS - 1), 'reconnecting');
  assert.equal(link.linkPhase(s, 1000 + link.RECONNECT_WINDOW_MS), 'lost');
  assert.equal(link.linkPhase(link.linkOk(s, 30000), 30000), 'live');
  assert.ok(link.RECONNECT_WINDOW_MS >= 10_000 && link.RECONNECT_WINDOW_MS <= 30_000, 'a short window, not minutes');
});

test('retries back off 1, 2, 4, 8 s, hold at 8 s, and jitter stays within 20%', () => {
  const mid = () => 0.5;
  assert.deepEqual([1, 2, 3, 4, 5, 50].map(n => link.retryDelayMs(n, mid)), [1000, 2000, 4000, 8000, 8000, 8000]);
  assert.equal(link.retryDelayMs(1, () => 0), 800);
  assert.equal(link.retryDelayMs(1, () => 1), 1200);
  assert.equal(link.retryDelayMs(0, mid), 1000);
  assert.equal(link.retryDelayMs(2, () => NaN), 2000);
});

test('only a missing answer or a dead gateway is a dropped link; the server saying no is not', () => {
  for (const error of [new Error('Network Error'), { response: { status: 0 } }, { code: 'ECONNABORTED' }, null,
    { response: { status: 502 } }, { response: { status: 503 } }, { response: { status: 504 } }, { response: { status: 530 } }]) {
    assert.equal(link.isLinkFailure(error), true, JSON.stringify(error));
  }
  for (const status of [400, 401, 404, 409, 422, 429, 500]) {
    assert.equal(link.isLinkFailure({ response: { status } }), false, String(status));
  }
});

test('a failed poll says Reconnecting, retries with backoff and offers to leave once the window closes', () => {
  const { c, clock, phases, retries } = controller(20_000);
  c.fail(offline);
  assert.equal(c.phase, 'reconnecting');
  assert.deepEqual(phases, ['reconnecting']);
  clock.advance(999); assert.equal(retries(), 0);
  clock.advance(1); assert.equal(retries(), 1, 'first retry after 1 s');
  c.fail(offline); clock.advance(2000); assert.equal(retries(), 2, 'second after 2 s');
  c.fail(offline); clock.advance(4000); assert.equal(retries(), 3);
  c.fail(offline);
  clock.advance(20_000 - 7000 + 1);
  assert.equal(c.phase, 'lost');
  assert.deepEqual(phases, ['reconnecting', 'lost'], 'the leave offer appears on its own when the window closes');
  c.ok();
  assert.deepEqual(phases, ['reconnecting', 'lost', 'live']);
  const before = retries();
  clock.advance(60_000);
  assert.equal(retries(), before, 'a recovered link stops retrying');
});

test('a server error keeps the link live and never shows Reconnecting', () => {
  const { c, phases, clock, retries } = controller();
  c.fail({ response: { status: 422 } });
  c.fail({ response: { status: 500 } });
  assert.equal(c.phase, 'live');
  assert.deepEqual(phases, []);
  clock.advance(30_000);
  assert.equal(retries(), 0);
});

test('backgrounding mid-match pauses retries and time asleep never counts as a drop', () => {
  const { c, clock, phases, retries } = controller(20_000);
  c.fail(offline);
  c.setActive(false);
  clock.advance(10 * 60_000);
  assert.equal(retries(), 0, 'no retries while the phone is locked');
  assert.deepEqual(phases, ['reconnecting'], 'no lost banner fires in the background');
  c.setActive(true);
  assert.equal(retries(), 1, 'back in the app: retry at once');
  assert.equal(c.phase, 'reconnecting', 'a fresh window, not an instant "lost"');
  c.ok();
  assert.equal(c.phase, 'live');
  c.setActive(false); c.setActive(true);
  assert.equal(retries(), 1, 'a healthy link does not retry on resume');
});

test('Try again from the lost card opens a fresh window and asks right away', () => {
  const { c, clock, retries } = controller(20_000);
  c.fail(offline);
  clock.advance(20_000);
  assert.equal(c.phase, 'lost');
  const before = retries();
  c.retryNow();
  assert.equal(retries(), before + 1);
  assert.equal(c.phase, 'reconnecting');
  c.fail(offline);
  clock.advance(20_001);
  assert.equal(c.phase, 'lost');
});

test('reset and dispose stop every timer', () => {
  const { c, clock, retries } = controller();
  c.fail(offline);
  c.reset();
  assert.equal(c.phase, 'live');
  assert.deepEqual(clock.pending(), []);
  c.fail(offline);
  c.dispose();
  clock.advance(60_000);
  assert.equal(retries(), 0);
  c.fail(offline); c.retryNow();
  assert.equal(retries(), 0, 'a disposed link is inert');
});

test('battle actions explain a dropped connection in plain words and never show transport noise', () => {
  const offlineText = link.friendlyActionError(new Error('timeout of 12000ms exceeded'));
  assert.match(offlineText, /^Can't reach the park right now\./);
  assert.doesNotMatch(offlineText, /timeout|Network Error|12000/);
  assert.doesNotMatch(offlineText, /Nothing was spent/, 'a dropped write may have landed');
  assert.equal(link.friendlyActionError({ response: { status: 422, data: { error: 'Not enough swords' } } }), 'Not enough swords');
  assert.equal(link.friendlyActionError({ response: { status: 500, data: {} } }, 'Attack failed!'), 'Attack failed!');
  assert.equal(link.friendlyActionError({ response: { status: 500, data: { message: 'x'.repeat(400) } } }, 'Attack failed!'), 'Attack failed!');
});

test('connection copy is plain, friendly and has no em dashes', () => {
  for (const text of Object.values(link.LINK_COPY)) assert.doesNotMatch(text, /—/);
  for (const file of ['src/services/match/matchLink.ts', 'src/components/match/MatchLinkBanner.tsx', 'src/hooks/useMatchLink.ts']) {
    assert.doesNotMatch(read(file), /—/, file);
  }
  assert.equal(link.LINK_COPY.reconnecting, 'Reconnecting…');
  assert.doesNotMatch(Object.values(link.LINK_COPY).join(' '), /server|error|failed/i);
});

test('the banner shows nothing while live, a chip while reconnecting and a way out once lost', () => {
  const src = read('src/components/match/MatchLinkBanner.tsx');
  assert.match(src, /if \(phase === 'live'\) return null;/);
  assert.match(src, /LINK_COPY\.reconnecting/);
  assert.match(src, /label=\{LINK_COPY\.retry\}[^\n]*onPress=\{onRetry\}/);
  assert.match(src, /label=\{leaveLabel\}[^\n]*onPress=\{onLeave\}/);
});

test('Gym arena: a dropped connection keeps the real scores and never fakes a teamless arena', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  assert.doesNotMatch(src, /player: null,\s*teammates_here: 0/, 'the fake empty arena read as "Join a Team!"');
  assert.match(src, /if \(isLinkFailure\(error\)\) gymLink\.fail\(error\);/);
  assert.match(src, /gymLink\.ok\(\);/);
  assert.match(src, /useMatchLink\(\(\) => fetchGymRef\.current\(\), parkId\)/);
});

test('Gym arena: loading, reconnecting and lost all have a visible way out', () => {
  const src = read('src/screens/GymBattle/GymBattleScreen.tsx');
  const waiting = src.slice(src.indexOf('if (!gymData) {'), src.indexOf('const { player } = gymData;'));
  assert.ok(waiting.length > 0);
  assert.match(waiting, /Loading Arena/);
  assert.match(waiting, /GO BACK/);
  assert.match(waiting, /MatchLinkBanner phase=\{gymLink\.phase\}[^\n]*onLeave=\{handleGoBack\}/);
  assert.doesNotMatch(src, /if \(loading\) \{\s*return/, 'the old loading screen had no back button');
  const main = src.slice(src.indexOf('{/* Connection:'));
  assert.match(main, /MatchLinkBanner phase=\{gymLink\.phase\}[^\n]*leaveLabel="Leave arena"/);
});

test('Gym actions show friendly words instead of raw transport errors', () => {
  for (const file of ['SwordAttackModal', 'DefendMiniGameModal', 'TapMiniGameModal', 'PlaceCoinModal']) {
    const src = read(`src/components/GymBattle/${file}.tsx`);
    assert.match(src, /friendlyActionError\(/, file);
    assert.doesNotMatch(src, /\.message \|\| '/, file);
  }
  assert.doesNotMatch(read('src/screens/GymBattle/GymBattleScreen.tsx'), /error instanceof Error \? error\.message/);
});

test('Boss Raid: a failed poll reports the link instead of failing silently', () => {
  const src = read('src/components/boss/BossRaidFlow.tsx');
  const hook = src.slice(src.indexOf('export function useParkRaid'), src.indexOf('function meters'));
  assert.match(hook, /\.catch\(error => \{[\s\S]*?link\.fail\(error\)/);
  assert.match(hook, /link\.ok\(\);/);
  assert.match(hook, /link: link\.phase, retryLink: link\.retryNow/);
});

test('Boss Raid sheet: no FIGHT while the link is down, a chip while reconnecting, Leave fight once lost', () => {
  const src = read('src/components/boss/BossRaidFlow.tsx');
  assert.match(src, /link === 'lost' \? `\$\{LINK_COPY\.lostTitle\}\.` : link === 'reconnecting' \? LINK_COPY\.reconnecting/);
  const banners = src.match(/<MatchLinkBanner phase=\{link\}[^\n]*onLeave=\{closeSheet\} leaveLabel="Leave fight" \/>/g) ?? [];
  assert.equal(banners.length, 2, 'both the raid sheet and the empty/loading sheet');
  assert.match(src, /link === 'lost' \? null : <BossSheetSkeleton \/>/, 'no endless skeleton once the park is unreachable');
  assert.match(read('src/components/home/HomeLive.tsx'), /link=\{raidPark !== null \? raidLink : 'live'\} onRetryLink=\{retryRaidLink\}/);
  assert.match(read('src/screens/ExploreScreen.tsx'), /link=\{raidLink\} onRetryLink=\{retryRaidLink\}/);
});

test('pass-and-play: every hand-off and podium keeps its way out', () => {
  const src = read('src/screens/LinePlay/group/PassPhoneOverlay.tsx');
  assert.match(src, /label=\{`Skip \$\{mode\.turn\.player\.name\}`\}/);
  assert.match(src, /label="End round"/);
  assert.match(src, /label="Back to the line"/);
});

test('useMatchLink follows the app lifecycle and starts clean for a new park', () => {
  const src = read('src/hooks/useMatchLink.ts');
  assert.match(src, /const appActive = useAppActive\(\);/);
  assert.match(src, /controller\.current\?\.setActive\(appActive && enabled\);/, 'off-screen pauses retries like the background');
  assert.match(src, /controller\.current\?\.reset\(\);\s*\}, \[key\]\);/);
  assert.match(src, /controller\.current\?\.dispose\(\)/);
});
