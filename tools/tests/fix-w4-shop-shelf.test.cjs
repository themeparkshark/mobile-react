// Fix pass w4, lane shop-shelf. Each test fails on 11f2e5f8 (the merged w3 build).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ---------- N05: Finn's first-visit tip never opens with a blank body ----------
const reveal = loadTs('src/components/Tutorial/teacherReveal.ts');
const layout = loadTs('src/components/Tutorial/tutorialLayout.ts');

function finnAt(clock) {
  const FakeDate = { now: () => clock.now };
  const app = runtime('src/components/Tutorial/TeacherShark.tsx', {
    '../../ui/useUiReducedMotion': { default: () => false },
    '../../ui': { BRAND: { navy: '#05346e', white: '#fff', blue: '#0768b9', blueBright: '#0879ca', sky: '#bfe5ff', gold: '#ffcf3b', navySoft: '#3d5f8c', shadow: '#05346e' }, GameButton: 'GameButton' },
    './teacherReveal': reveal,
  }, { text: 'Welcome to the Shark Shop! Use Shark Coins.', subtitle: 'Supplies cost real money.', mood: 'happy', position: 'bottom-center',
    stepIndex: 0, totalSteps: 1, onNext() {} }, { Date: FakeDate });
  return app;
}
const lineNode = app => app.find(n => n.type === 'Text' && Array.isArray(n.props.children) && n.props.children.length > 5);
const shownWords = app => lineNode(app).props.children.filter(child => !child.props.style).length;
const fireNext = (app, clock, advance) => {
  const [id, fn] = [...app.timers.entries()].at(-1);
  clock.now += advance ?? app.delays.get(id);
  app.timers.delete(id); fn(); app.render();
};

test('N05: a late reveal tick (busy JS thread) shows the whole line at once', () => {
  const parts = reveal.splitWords('Welcome to the Shark Shop!');
  assert.deepEqual({ ...reveal.revealTick(parts, 0, 0) }, { shown: 1, nextAt: reveal.revealSchedule(parts)[1] });
  assert.equal(reveal.revealTick(parts, 2000, 42).shown, parts.length, 'two seconds late: everything shows');
  assert.equal(reveal.revealTick(parts, 2000, 42).nextAt, null);
  assert.equal(reveal.revealTick(parts, 50, 42).shown < parts.length, true, 'on time: still word by word');
});

test('N05: the bubble pops with the first word, and a start that comes late shows the full line', () => {
  const clock = { now: 1000 };
  const app = finnAt(clock);
  const parts = reveal.splitWords('Welcome to the Shark Shop! Use Shark Coins.');
  assert.equal(shownWords(app), 0);
  const springsBefore = app.motions.filter(m => m === 'spring').length;
  // The JS thread was busy for 3 s before Finn's first tick (a shop rendering its shelves).
  fireNext(app, clock, reveal.REVEAL_START_MS + 3000);
  assert.equal(shownWords(app), parts.length, 'the whole line, never one word over a blank bubble');
  assert.ok(app.motions.filter(m => m === 'spring').length > springsBefore, 'the bubble pops in the same tick as the words');
});

test('N05: on time, Finn still talks word by word, and a stall mid-line catches up at once', () => {
  const clock = { now: 1000 };
  const app = finnAt(clock);
  fireNext(app, clock);
  const first = shownWords(app);
  assert.ok(first >= 1 && first < 5, 'word by word when the thread is free');
  fireNext(app, clock, 1500);
  assert.equal(shownWords(app), reveal.splitWords('Welcome to the Shark Shop! Use Shark Coins.').length);
});

test('N05: the bubble does not pop on its own UI timer before any word can show', () => {
  const src = read('src/components/Tutorial/TeacherShark.tsx');
  assert.doesNotMatch(src, /bubbleValue\.value = withDelay\(/, 'no bubble pop scheduled apart from the words');
});

test('N05: map guides wait while another screen is on top of the map', () => {
  assert.equal(layout.guideShowsOn(true, 'Explore'), true);
  assert.equal(layout.guideShowsOn(true, 'Store'), false, "Finn's home hello never draws over the Shark Shop");
  assert.equal(layout.guideShowsOn(true, 'SharkPass'), false);
  assert.equal(layout.guideShowsOn(true, undefined), true, 'before navigation is ready');
  assert.equal(layout.guideShowsOn(false, 'Store'), true, "the shop's own tip shows on the shop");
  const provider = read('src/components/Tutorial/TutorialProvider.tsx');
  assert.match(provider, /guideShowsOn\(MAP_SEQUENCES\.has/);
  assert.match(provider, /!firstPlayOpen && guideOnScreen &&/);
});

test('N05: the Shark Shop tip waits for a loaded, painted shop (no fixed 800 ms timer)', () => {
  const store = read('src/screens/StoreScreen.tsx');
  assert.doesNotMatch(store, /startTutorial\('store'\), 800/);
  assert.match(store, /useTutorialWhenReady\('store', status === 'ready'\)/);
});
