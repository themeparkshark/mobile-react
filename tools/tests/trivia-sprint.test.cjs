'use strict';
/**
 * Line Party "Trivia Sprint" (Trivia Duel live): integer sim, golden vectors
 * for the server's PHP port, bots, ghost fill, walk-safe tap rules.
 * Regenerate the vectors only on a deliberate version bump:
 *   TRIVIA_SPRINT_WRITE=1 node --test tools/tests/trivia-sprint.test.cjs
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const sim = loadTs('src/games/trivia-duel/party/triviaSprint.ts');
const { OPENING_FACTS } = loadTs('src/games/trivia-duel/engine/facts.ts');
const FIXTURE = path.join(__dirname, 'fixtures/party/trivia_sprint_vectors.json');

function vectors() {
  const out = [];
  for (let i = 0; i < 24; i++) {
    const seed = (i * 2654435761 + 12345) >>> 0;
    const qs = sim.buildQuestions(seed);
    const cases = [];
    for (const profile of ['rookie', 'regular', 'ace']) {
      const taps = sim.botTaps(qs, seed, i % 4, profile);
      cases.push({ profile, taps, hash: sim.resultHash(sim.resolve(qs, taps)), score: sim.resolve(qs, taps).score });
    }
    const mash = [[qs[0].unlockAt + 50, 0], [qs[0].unlockAt + 130, 1], [qs[0].unlockAt + 140, 0], [qs[1].unlockAt + 3000, 1], [qs[2].closeAt, 0]];
    cases.push({ profile: 'mash', taps: mash, hash: sim.resultHash(sim.resolve(qs, mash)), score: sim.resolve(qs, mash).score });
    out.push({ seed, questions: qs.map((q) => [q.kind, q.facts.join('.'), q.shift, q.correct, q.unlockAt, q.closeAt]), cases });
  }
  return plain(out);
}

test('sprint facts mirror the verified fact table', () => {
  const byId = new Map(OPENING_FACTS.map((f) => [f.id, f]));
  for (const [id, name, year] of sim.SPRINT_FACTS) {
    assert.equal(byId.get(id).name, name);
    assert.equal(byId.get(id).year, year);
  }
});

test('golden vectors (shared with the PHP port) are stable', () => {
  const v = vectors();
  if (process.env.TRIVIA_SPRINT_WRITE === '1' || !fs.existsSync(FIXTURE)) {
    fs.writeFileSync(FIXTURE, JSON.stringify({ version: sim.TRIVIA_SPRINT_VERSION, vectors: v }, null, 1));
  }
  const file = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  assert.equal(file.version, sim.TRIVIA_SPRINT_VERSION);
  assert.deepEqual(v, file.vectors);
});

test('questions: correct answers are right, timeline fits the round', () => {
  for (let seed = 0; seed < 500; seed++) {
    const qs = sim.buildQuestions(seed);
    assert.equal(qs.length, 3);
    for (const q of qs) {
      assert.ok(q.closeAt <= sim.ROUND_MS);
      assert.ok(q.unlockAt - q.showAt >= sim.READ_MS && q.unlockAt - q.showAt <= sim.READ_MS + 250);
      if (q.kind === 'truetale') assert.equal(q.correct, q.shift === 0 ? 0 : 1);
      else {
        const years = q.facts.map((k) => sim.SPRINT_FACTS[k][2]);
        assert.equal(years[q.correct], Math.min(...years));
        assert.equal(new Set(q.facts).size, q.facts.length);
      }
      const t = sim.questionText(q);
      assert.equal(t.choices.length, q.choices);
    }
  }
});

test('scoring: first lock is final, early taps are free, speed and streak apply', () => {
  const qs = sim.buildQuestions(99);
  const taps = [
    [qs[0].unlockAt + 60, (qs[0].correct + 1) % 2], // inside the guard: ignored
    [qs[0].unlockAt + 400, qs[0].correct],
    [qs[0].unlockAt + 900, (qs[0].correct + 1) % 2], // after the lock: ignored
    [qs[1].unlockAt + 600, qs[1].correct],
    [qs[2].unlockAt + 2800, qs[2].correct],
  ];
  const r = sim.resolve(qs, taps);
  assert.equal(r.hits, 3);
  assert.equal(r.points[0], 200);
  assert.equal(r.points[1], Math.floor(200 * 12 / 10));
  assert.equal(r.points[2], Math.floor((100 + sim.sprintSpeed(2800)) * 15 / 10));
  assert.equal(r.maxStreak, 3);
  assert.equal(sim.validTaps(taps), true);
  assert.equal(sim.validTaps([[5, 0], [4, 0]]), false);
  assert.equal(sim.validTaps([[5, 4]]), false);
});

test('bots rank rookie < ace on average; ghost fill keeps own taps then plays on', () => {
  let rookie = 0; let ace = 0;
  for (let s = 0; s < 400; s++) {
    const qs = sim.buildQuestions(s);
    rookie += sim.resolve(qs, sim.botTaps(qs, s, 1, 'rookie')).score;
    ace += sim.resolve(qs, sim.botTaps(qs, s, 1, 'ace')).score;
  }
  assert.ok(ace > rookie * 1.3, `${ace} vs ${rookie}`);
  const qs = sim.buildQuestions(7);
  const own = [[qs[0].unlockAt + 500, qs[0].correct]];
  const filled = sim.ghostFill(qs, 7, 2, own, qs[1].showAt, 'regular');
  assert.deepEqual(plain(filled[0]), plain(own[0]));
  assert.ok(filled.every((t, i) => i === 0 || t[0] >= filled[i - 1][0]));
  assert.ok(filled.slice(1).every(([t]) => t >= qs[1].showAt));
});
