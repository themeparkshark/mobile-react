// wow-sound wave 5 round 2 (Oct 24 2026): the beam's slam buzz before the burst, the loop hooks' feel (notes that
// climb, a flame that grows with the streak, a chest that never stacks on its rows) and their release-like capture.
// Real engine on the silent TraceBackend, virtual clock. Nothing here can make a sound.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { traceEngine } = require('./helpers/studio-trace-harness.cjs');
const { wowMapCatch } = require('../audio/wowmap-catch-beats.cjs');

const root = path.resolve(__dirname, '../..');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');

async function engine(opts = {}) {
  const e = traceEngine(opts);
  e.Catch.resetCatchSoundForTests();
  e.Loop.resetLoopSoundForTests();
  e.Power.resetBatterySaver();
  await e.GameAudio.init();
  return e;
}
const rel = (e, t0) => e.haptics.filter((h) => h.t >= t0).map((h) => `${h.intent}@${h.t - t0}`);
const starts = (e, t0, prefix) => e.Trace.traceEvents().filter((x) => x.kind === 'sound' && x.t >= t0 && x.name.startsWith(prefix)).map((x) => ({ t: x.t - t0, name: x.name, detail: x.detail }));
async function run(e, ms) { for (let i = 0; i < ms / 20; i++) { e.clock.advance(20); await flush(); } }

test('fix 4: the beam catch: slam rigid on the beam\'s fall, the heavy ON the burst frame, a full beat apart; a late slam is dropped, never pushed into the heavy', async () => {
  const e = await engine();
  const r = await wowMapCatch(e, { n: 10 });
  const hs = e.haptics.filter((h) => h.t >= r.t0).map((h) => ({ t: h.t - r.clock0, intent: h.intent }));
  const slam = hs.find((h) => h.intent === 'hitRigid');
  const heavy = hs.find((h) => h.intent === 'comboHeavy');
  assert.equal(slam.t, 550);
  assert.equal(heavy.t, 670, 'the brightest frame has its buzz');
  assert.ok(heavy.t - slam.t >= 90);
  assert.ok(!hs.some((h) => h.intent === 'hitMedium' && h.t > 400 && h.t < 600), 'the last wobble gave its buzz to the slam');
  // A slam beat 50 ms late (a stalled JS turn): dropped, the heavy alone on the burst.
  const e2 = await engine();
  const r2 = await wowMapCatch(e2, { n: 10, stalls: [{ at: 540, ms: 60 }] });
  const hs2 = e2.haptics.filter((h) => h.t >= r2.t0).map((h) => ({ t: h.t - r2.clock0, intent: h.intent }));
  const h2 = hs2.find((h) => h.intent === 'comboHeavy');
  assert.ok(!hs2.some((h) => h.intent === 'hitRigid' && h.t < h2.t), `no late slam (${hs2.map((h) => `${h.intent}@${h.t}`).join(' ')})`);
  for (let i = 1; i < hs2.length; i++) assert.ok(hs2[i].t - hs2[i - 1].t >= 90, 'never a flam');
  // A miss never slams (the boing has its own soft buzz).
  const e3 = await engine();
  e3.Catch.catchMark('tap'); e3.Catch.catchMark('beam-due'); e3.Catch.catchMark('miss');
  const t3 = e3.clock.now;
  e3.Catch.catchMark('slam');
  assert.deepEqual(rel(e3, t3), []);
});

test('fix 2: the Daily 3 notes climb (do, re, mi) and the third leads into the all-done chord 160 ms later (da-DAA), the swell peaking on the chord', async () => {
  const e = await engine();
  const L = e.Loop;
  assert.deepEqual(JSON.parse(JSON.stringify(L.daily3Plan(1, 3).map((s) => [s.moment, s.at, s.pitch]))), [['loop.daily3Check', 0, 0]]);
  assert.deepEqual(JSON.parse(JSON.stringify(L.daily3Plan(2, 3).map((s) => [s.moment, s.at, s.pitch]))), [['loop.daily3Check', 0, 2]]);
  assert.deepEqual(JSON.parse(JSON.stringify(L.daily3Plan(3, 3).map((s) => [s.moment, s.at]))), [['loop.daily3Check', 0], ['loop.daily3Done', 160]]);
  assert.equal(L.daily3Plan(3, 3)[0].pitch, 4, 'the third note is the highest');
  // Real engine: three check-offs on three reads.
  for (const n of [1, 2, 3]) {
    const t0 = e.clock.now;
    assert.equal(L.playDaily3(n, 3), true);
    await run(e, 1000);
    const checks = starts(e, t0, 'moment:loop.daily3Check:primary');
    assert.equal(checks.length, 1, `check ${n}`);
    if (n === 3) {
      const chord = starts(e, t0, 'moment:loop.daily3Done:primary')[0];
      assert.ok(chord && Math.abs(chord.t - checks[0].t - 160) <= 20, `the chord follows the third note (${JSON.stringify(starts(e, t0, 'moment:'))})`);
      const buzz = rel(e, t0);
      assert.deepEqual(buzz, ['tapLight@20', 'comboHeavy@180', 'hitMedium@320', 'tapLight@440', 'tickSelection@560'], buzz.join(' '));
    } else {
      assert.deepEqual(rel(e, t0), ['tapLight@20', 'hitMedium@140'], 'the note on the pip\'s first pop frame, the check on its peak');
    }
  }
  const lines = e.Moments.momentTraceBuffer.filter((l) => /loop\.daily3Check/.test(l) && /studio/.test(l));
  assert.deepEqual([...lines.map((l) => (l.match(/pitch=(\d+)/) || [0, '0'])[1])], ['0', '2', '4'], lines.join('\n'));
});

test('fix 2: the flame grows with the streak: day 7 rings brighter than day 2, capped at +4, and every 7th day is the ignite with its chord', async () => {
  const e = await engine();
  const L = e.Loop;
  const semis = [1, 2, 3, 4, 5, 6, 7, 8, 30].map((d) => L.flameSemis(d));
  assert.deepEqual(semis, [0, 0.67, 1.33, 2, 2.67, 3.33, 4, 4, 4]);
  for (let d = 2; d <= 7; d++) assert.ok(L.flameSemis(d) > L.flameSemis(d - 1), `day ${d} brighter than day ${d - 1}`);
  assert.ok(Math.max(...semis) <= 4.4, 'never past the no-chipmunk cap');
  assert.deepEqual([6, 7, 13, 14, 21].map((d) => L.flameMilestoneDay(d)), [false, true, false, true, true]);
  assert.equal(L.daily3Plan(3, 7)[1].moment, 'loop.flameMilestone');
  assert.equal(L.daily3Plan(3, 7)[1].pitch, undefined, 'the rare sting is never re-pitched');
  assert.equal(L.daily3Plan(3, 7, { milestoneReady: false })[1].moment, 'loop.daily3Done');
  assert.equal(L.flameDay({ days: 4, counted_today: true }), 4);
  assert.equal(L.flameDay({ days: 4, counted_today: false }), 5, 'today not counted yet: the flame shows tomorrow\'s number');
  assert.equal(L.flameDay(null), 1);
  // Real engine: day 2 and day 6 chords really play at their pitch.
  for (const [day, want] of [[2, '0.67'], [6, '3.33']]) {
    const t0 = e.clock.now;
    L.playDaily3(3, day);
    await run(e, 1200);
    const line = e.Moments.momentTraceBuffer.filter((l) => /studio loop\.daily3Done/.test(l)).pop();
    assert.match(line, new RegExp(`pitch=${want.replace('.', '\\.')}`), line);
    assert.ok(t0 >= 0);
  }
  // Day 7: the ignite (and its rising chord layer), not the plain chord.
  const t7 = e.clock.now;
  L.playDaily3(3, 7);
  await run(e, 1200);
  assert.equal(starts(e, t7, 'moment:loop.flameMilestone:primary').length, 1);
  assert.equal(starts(e, t7, 'moment:loop.daily3Done:primary').length, 0);
});

test('fix 1: Battery Saver: one moment and one pulse for the all-done; the check keeps one pulse too', async () => {
  const e = await engine();
  e.Power.setBatterySaver(true);
  const t0 = e.clock.now;
  e.Loop.playDaily3(3, 4);
  await run(e, 1200);
  assert.deepEqual([...rel(e, t0)], ['comboHeavy@180'], 'one pulse, the swell\'s peak, still on the pip\'s pop peak');
  assert.equal(starts(e, t0, 'moment:loop.daily3Check:').length, 0, 'no lead-in note');
  assert.equal(starts(e, t0, 'moment:loop.daily3Done:primary').length, 1);
  assert.equal(starts(e, t0, 'moment:loop.daily3Done:layer').length, 0, 'no coin shower layer');
  const t1 = e.clock.now;
  e.Loop.playChestOpen();
  await run(e, 800);
  assert.deepEqual(rel(e, t1), ['hitRigid@0']);
});

test('fix 1: the chest pop: the daily chest keeps its five-step patter; the level chest takes the short form so its first reward row (420 ms) never stacks', async () => {
  const e = await engine();
  const t0 = e.clock.now;
  assert.equal(e.Loop.playChestOpen(), true);
  await run(e, 800);
  assert.deepEqual(rel(e, t0), ['hitRigid@0', 'comboHeavy@120', 'tapLight@260', 'tickSelection@380', 'tickSelection@500']);
  const t1 = e.clock.now;
  e.Loop.playChestOpen({ rowsFollow: true });
  await run(e, 800);
  const short = rel(e, t1);
  assert.deepEqual(short, ['hitRigid@0', 'comboHeavy@120']);
  // RewardReveal plays it at +120 and its first row at 420 (rowSchedule): 180 ms after the heavy.
  const R = require('./helpers/ts-module.cjs').loadTs('src/services/retention/logic.ts', {}, {});
  const first = R.rowSchedule([{ kind: 'coins' }])[0];
  assert.ok(first - (100 + 120) >= 120, `row at ${first}`);
  assert.match(src('src/components/retention/RewardReveal.tsx'), /playSfx\('fx\.reward'\); \} \}, 100\);/, 'the pop starts on the flash');
});

test('fix 2: the loop\'s cues are decoded before the first check or chest (a first-play load rang them late)', async () => {
  const e = await engine();
  const before = e.GameAudio.cue ? 0 : 0;
  e.Loop.preloadLoopMoments();
  await run(e, 400);
  const t0 = e.clock.now;
  e.Loop.playChestOpen();
  await run(e, 100);
  const s = starts(e, t0, 'moment:chest.open:primary')[0];
  assert.ok(s && s.t <= 30, `the pop starts on its call (${JSON.stringify(s)})`);
  assert.equal(before, 0);
  assert.match(src('src/components/retention/useRetention.tsx'), /preloadLoopMoments\(\);/);
  assert.match(src('src/components/DailyGiftModal.tsx'), /useEffect\(\(\) => \{ preloadLoopMoments\(\); \}, \[\]\);/);
});

test('studio off: the loop calls play nothing and say so (callers keep today\'s sound and buzz)', async () => {
  const e = await engine({ trace: false, dev: false, env: { EXPO_PUBLIC_STUDIO_MUTE: '1' } });
  assert.equal(e.Switch.isStudioSoundOn(), false);
  assert.equal(e.Loop.playDaily3(3, 5), false);
  assert.equal(e.Loop.playChestOpen(), false);
});

test('fix 1: the hook capture is its own release-like route, and its frame marks are an empty call in every other bundle', () => {
  const routes = src('src/devRoutes.tsx');
  assert.match(routes, /EXPO_PUBLIC_MOTION_CAPTURE === 'HookSoundPreview'\n\s+\? \[\{ name: 'HookSoundPreview'/);
  assert.match(routes, /if \(motion === 'HookSoundPreview'\) return motion;/);
  const mark = src('src/dev/captureMark.ts');
  assert.match(mark, /const ON = process\.env\.EXPO_PUBLIC_MOTION_CAPTURE === 'HookSoundPreview';/);
  assert.match(mark, /export const useCaptureMark: Mark = ON \? useMark : noMark;/);
  for (const f of ['src/components/retention/Daily3MapButton.tsx', 'src/components/retention/RewardReveal.tsx', 'src/components/DailyGiftModal.tsx']) {
    assert.match(src(f), /useCaptureMark\(/, f);
  }
  // The capture is muted (studio on only inside the mute, never in an audible run) and writes only to Documents.
  const screen = src('src/components/retention/HookSoundPreviewScreen.tsx');
  assert.match(screen, /hook-trace\.log/);
  assert.doesNotMatch(screen, /[\u2013\u2014]/, 'no dashes in copy');
  assert.match(src('src/gamekit/audio/studioSwitch.ts'), /if \(!studioMuted\(\)\) return null;/);
});
