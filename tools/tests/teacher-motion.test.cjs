const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');
const reveal = require('./helpers/ts-module.cjs').loadTs('src/components/Tutorial/teacherReveal.ts');

function finn(initialReduced = false) {
  let reduced = initialReduced, next = 0;
  const app = runtime('src/components/Tutorial/TeacherShark.tsx', {
    '../../ui/useUiReducedMotion': { default: () => reduced },
    '../../ui': { BRAND: { navy: '#05346e', white: '#fff', blue: '#0768b9', blueBright: '#0879ca', sky: '#bfe5ff', gold: '#ffcf3b', navySoft: '#3d5f8c', shadow: '#05346e' }, GameButton: 'GameButton' },
    './teacherReveal': reveal,
  }, { title: 'Your first adventure', text: 'Match four pairs', mood: 'waving', position: 'bottom-center',
    stepIndex: 0, totalSteps: 2, onNext: () => next++, onSkip() {}, showSkip: true });
  return { app, setReduced(value) { reduced = value; }, get next() { return next; } };
}

const words = app => app.find(n => n.type === 'Text' && Array.isArray(n.props.children) && n.props.children.length === 5);
const visible = app => words(app).props.children.filter(child => !child.props.style).length;

test('Finn stops decorative loops when motion preference changes and keeps the primary action available', () => {
  const run = finn();
  const { app } = run;
  assert.ok(app.motions.length > 0); const before = app.cancelled.length;
  run.setReduced(true); app.render(); assert.ok(app.cancelled.length >= before + 6);
  assert.equal(app.tree.props.entering, undefined); assert.equal(app.tree.props.exiting, undefined);
  const primary = app.find(n => n.type === 'GameButton' && n.props.onPress === app.props.onNext);
  assert.ok(primary); primary.props.onPress(); assert.equal(run.next, 1);
  const count = app.cancelled.length; app.unmount(); assert.ok(app.cancelled.length >= count + 3);
});

test('Finn springs in and talks word by word; a tap on the bubble shows the whole line', () => {
  const { app } = finn(false);
  assert.ok(app.motions.includes('spring'), 'entrance overshoots then springs to rest');
  assert.equal(visible(app), 0, 'every word is laid out but hidden before he talks');
  const bubble = app.find(n => n.type === 'Pressable' && typeof n.props.onPress === 'function');
  bubble.props.onPress(); app.render();
  assert.equal(visible(app), 5, 'tap to skip reveals the full line');
  assert.ok(app.find(n => n.type === 'GameButton' && n.props.onPress === app.props.onNext), 'Next is never blocked');
});

test('reduced motion shows the whole line at once with no entrance', () => {
  const { app } = finn(true);
  assert.equal(visible(app), 5);
  assert.equal(app.tree.props.entering, undefined);
});

test('word timing: steady beat, a pause after punctuation, spaces arrive with the next word', () => {
  const parts = reveal.splitWords('Nice catch! Go on');
  assert.deepEqual([...parts], ['Nice', ' ', 'catch!', ' ', 'Go', ' ', 'on']);
  const times = [...reveal.revealSchedule(parts)];
  assert.equal(times[0], 0);
  assert.equal(times[2], reveal.WORD_BEAT_MS);
  assert.equal(times[4] - times[2], reveal.WORD_BEAT_MS + reveal.PUNCTUATION_PAUSE_MS);
  assert.equal(times[1], times[2]);
  assert.equal(reveal.visibleParts(parts, 0), 1);
  assert.equal(reveal.visibleParts(parts, 10_000), parts.length);
  assert.ok(reveal.revealDuration('one two three four five six seven eight') < 500, 'a line lands in under half a second');
});
