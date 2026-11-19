'use strict';
/**
 * Fix round w3, hold-fix 3 (Nov 18, 2026): items checker 3 rejected on the merged build 32e3d788.
 * Each test fails on 32e3d788 (T ids and regression names in the titles).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const ROOT = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const strip = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const noStore = { '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => undefined } } };

test('regression: a server bank question plays exactly as written (no "The park company Studio")', () => {
  const trivia = loadTs('src/services/task-attempt/coinTrivia.ts', { ...noStore, '../../api/endpoints/lineplay/trivia': { default: async () => null } });
  const row = (id, extra = {}) => ({ id, park_id: 8, ride_id: 65, question: `Question ${id}?`, choices: ['A', 'B', 'C', 'D'],
    correct_index: 1, difficulty: 'easy', deck: 'history', fact: null, source: 'Disneyland', ...extra });
  const walt = row('dl-walt-3', {
    question: 'Walt first thought of building Disneyland on a strip of land across the street from what?',
    choices: ['Union Station', 'The Disney Studio', 'The Rose Bowl', 'The Hollywood Bowl'],
    fact: 'Walt Disney first pictured a small park beside the Disney Studio in Burbank.',
  });
  const round = trivia.dealtTriviaRound({ source: 'bank', questions: [row('a'), row('b'), walt] });
  assert.equal(round.pool[2].bank, true, 'server rows are marked as bank rows');
  const engine = loadTs('src/games/trivia-duel/engine/match.ts');
  const plan = engine.planFromIds('ride', 1304, ['a', 'b', 'dl-walt-3'], round.pool, 'deckhand', false);
  const q = plan.rounds[2].question;
  assert.equal(q.prompt, walt.question);
  assert.ok(q.choices.includes('The Disney Studio'), q.choices.join(' / '));
  assert.equal(q.choices[q.correctIndex], 'The Disney Studio', 'the right answer reads as the server wrote it');
  assert.equal(q.fact, walt.fact, 'Walt Disney stays Walt Disney');
  // The bundled pool (app copy) still goes through the labels: the IP rule for bundled lines is unchanged.
  const content = loadTs('src/games/trivia-duel/engine/content.ts');
  const bundled = content.materializeQuestion('x-1', [{ id: 'x-1', question: 'Which Universal ride is it?', choices: ['A', 'B', 'C', 'D'], correctIndex: 0, difficulty: 'easy' }], 1);
  assert.doesNotMatch(bundled.prompt, /Universal/);
});

test('regression: Gill\'s badge in Beat the Buzzer never shows a seconds readout', () => {
  const { LOCK_BADGE, lockBadge } = loadTs('src/games/trivia-duel/engine/lockBadge.ts');
  for (const kind of Object.keys(LOCK_BADGE)) assert.doesNotMatch(lockBadge(kind), /\d/, kind);
  const duel = strip(read('src/games/trivia-duel/TriviaDuel.tsx'));
  const lockLabel = duel.slice(duel.indexOf('const lockLabel = useCallback'), duel.indexOf('const resolveOppShown'));
  assert.doesNotMatch(lockLabel, /toFixed|\/ 1000/, 'the portrait chip is a word, not a time');
  assert.doesNotMatch(duel, /me: 'TIME'|BELL \$\{/, 'no clock words on the chip either');
});
